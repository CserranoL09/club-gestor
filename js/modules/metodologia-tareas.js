// Metodología → Tareas del club: oficiales (Coordinación) y propuestas (cualquier miembro).
import { esc, toast, busy, ask, formValues } from '../ui.js';
import { sb } from '../supabase.js';
import { S } from '../session.js';
import { PHASES, phaseName, clubCategories } from '../lib/methodology.js';
import { uploadClubImage, removeClubImage, signedUrls } from '../lib/images.js';

const STATUS = { oficial: ['Oficial', 'ok'], propuesta: ['Propuesta', 'warn'], rechazada: ['Rechazada', ''] };
const lines = (t) => String(t || '').split('\n').map((x) => x.trim()).filter(Boolean);

export async function render(el, { canEdit, query }) {
  const client = sb();
  const me = S.user.id;
  const state = query.get('estado') || 'oficial';
  const phase = query.get('fase') || '';
  const cat = query.get('cat') || '';
  const text = (query.get('q') || '').toLowerCase();
  const editing = query.get('editar') || (query.get('nueva') === '1' ? 'new' : '');

  const [{ data: tasks, error }, { data: principles }, { data: authors }] = await Promise.all([
    client.from('task_library').select('*').eq('club_id', S.club.id).order('updated_at', { ascending: false }),
    client.from('club_principles').select('id, phase, title, parent_id').eq('club_id', S.club.id).order('sort'),
    client.from('club_members').select('user_id, profile:profiles(full_name)').eq('club_id', S.club.id)
  ]);
  if (error) throw error;
  const all = tasks || [];
  const nameOf = (id) => (authors || []).find((a) => a.user_id === id)?.profile?.full_name || 'Alguien';
  const prName = (id) => (principles || []).find((p) => p.id === id)?.title || '';
  const counts = {
    oficial: all.filter((t) => t.status === 'oficial').length,
    propuesta: all.filter((t) => t.status === 'propuesta').length,
    mias: all.filter((t) => t.author_id === me).length,
    rechazada: all.filter((t) => t.status === 'rechazada').length
  };
  const shown = all.filter((t) =>
    (state === 'mias' ? t.author_id === me : t.status === state) &&
    (!phase || t.phase === phase) &&
    (!cat || (t.categories || []).includes(cat)) &&
    (!text || `${t.title} ${t.block?.description || ''} ${(t.tags || []).join(' ')}`.toLowerCase().includes(text)));
  const urls = await signedUrls(shown.map((t) => t.image_path));
  const cats = clubCategories(all.flatMap((t) => t.categories || []));
  const link = (patch) => {
    const p = new URLSearchParams({ tab: 'tareas', estado: state, fase: phase, cat, q: query.get('q') || '', ...patch });
    [...p.keys()].forEach((k) => { if (!p.get(k)) p.delete(k); });
    return '#/metodologia?' + p;
  };

  const stateTabs = [['oficial', 'Oficiales'], ['propuesta', 'Propuestas'], ['mias', 'Mías'], ...(canEdit ? [['rechazada', 'Rechazadas']] : [])];

  el.innerHTML = `
    <div class="section-head">
      <nav class="chips" aria-label="Estado">
        ${stateTabs.map(([k, l]) => `<a class="chip${k === state ? ' on' : ''}" href="${link({ estado: k })}">${l} <span class="count">${counts[k]}</span></a>`).join('')}
      </nav>
      <a class="btn primary" href="${link({ nueva: '1' })}">${canEdit ? '+ Nueva tarea' : '+ Proponer tarea'}</a>
    </div>
    <form class="filters card" id="taskFilters">
      <label class="inline-label">Fase <select name="fase"><option value="">Todas</option>${PHASES.map((p) => `<option value="${p.key}"${p.key === phase ? ' selected' : ''}>${p.name}</option>`).join('')}</select></label>
      <label class="inline-label">Categoría <select name="cat"><option value="">Todas</option>${cats.map((c) => `<option${c === cat ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
      <label class="inline-label grow-label">Buscar <input name="q" type="search" value="${esc(query.get('q') || '')}" placeholder="Título, descripción, etiquetas"></label>
    </form>
    <div id="taskForm"></div>
    ${shown.length ? `<div class="task-grid">${shown.map(card).join('')}</div>`
      : `<div class="card empty"><div class="big">🧩</div><p>${state === 'oficial' ? 'Aún no hay tareas oficiales. ' + (canEdit ? 'Crea la primera o revisa las propuestas de los entrenadores.' : 'Puedes proponer las tuyas.') : 'No hay tareas con este filtro.'}</p></div>`}`;

  function card(t) {
    const b = t.block || {};
    const mine = t.author_id === me;
    const [label, cls] = STATUS[t.status] || ['', ''];
    const canChange = canEdit || (mine && t.status === 'propuesta');
    return `
      <article class="card task-card" data-tid="${esc(t.id)}">
        ${t.image_path && urls[t.image_path] ? `<img class="task-img" src="${esc(urls[t.image_path])}" alt="Imagen de la tarea ${esc(t.title)}" loading="lazy">` : ''}
        <header><h3>${esc(t.title || 'Sin título')}</h3><span class="pill ${cls}">${label}</span></header>
        <p class="muted task-meta">${[t.phase && phaseName(t.phase), t.principle_id && prName(t.principle_id)].filter(Boolean).map(esc).join(' · ') || 'Sin fase'}</p>
        ${(t.categories || []).length ? `<p class="mini-chips">${t.categories.map((c) => `<span>${esc(c)}</span>`).join('')}</p>` : ''}
        <p class="task-facts">${[b.players && `👥 ${b.players}`, b.space && `📐 ${b.space}`, b.duration && `⏱ ${b.duration}'`].filter(Boolean).map(esc).join(' · ')}</p>
        ${b.description ? `<p class="task-desc">${esc(b.description).replace(/\n/g, '<br>')}</p>` : ''}
        ${b.variants?.length ? `<details><summary>Variantes (${b.variants.length})</summary><ul>${b.variants.map((v) => `<li>${esc(v)}</li>`).join('')}</ul></details>` : ''}
        ${b.material ? `<p class="hint">Material: ${esc(b.material)}</p>` : ''}
        <p class="hint">${mine ? 'Tuya' : `De ${esc(nameOf(t.author_id))}`}${t.review_note ? ` · Nota de revisión: «${esc(t.review_note)}»` : ''}</p>
        <div class="actions">
          ${canEdit && t.status !== 'oficial' ? '<button class="btn small primary" type="button" data-approve>Aprobar</button>' : ''}
          ${canEdit && t.status === 'propuesta' ? '<button class="btn small" type="button" data-reject>Rechazar</button>' : ''}
          ${canChange ? '<button class="btn small" type="button" data-edit>Editar</button><button class="btn small danger" type="button" data-del>Borrar</button>' : ''}
        </div>
      </article>`;
  }

  // ----- Formulario nueva / editar
  function drawForm() {
    const box = el.querySelector('#taskForm');
    if (!editing) { box.innerHTML = ''; return; }
    const t = editing === 'new' ? { title: '', phase: '', categories: S.team?.category ? [cats.find((c) => S.team.category.toLowerCase().startsWith(c.toLowerCase())) || S.team.category] : [], block: {}, tags: [] } : all.find((x) => x.id === editing);
    if (!t) { box.innerHTML = ''; return; }
    const b = t.block || {};
    box.innerHTML = `
      <form class="card task-form" novalidate>
        <h2>${editing === 'new' ? (canEdit ? 'Nueva tarea oficial' : 'Proponer una tarea') : 'Editar tarea'}</h2>
        ${!canEdit && editing === 'new' ? '<p class="hint">La Coordinación la revisará y, si la aprueba, pasará a las tareas oficiales del club.</p>' : ''}
        <div class="row">
          <div class="grow"><label for="tk_title">Título</label><input id="tk_title" name="title" value="${esc(t.title)}" maxlength="120" required></div>
          <div><label for="tk_phase">Fase</label><select id="tk_phase" name="phase"><option value="">—</option>${PHASES.map((p) => `<option value="${p.key}"${t.phase === p.key ? ' selected' : ''}>${p.name}</option>`).join('')}</select></div>
          <div class="grow"><label for="tk_pr">Principio del modelo</label><select id="tk_pr" name="principle_id"><option value="">—</option>${(principles || []).map((p) => `<option value="${esc(p.id)}" data-phase="${p.phase}"${t.principle_id === p.id ? ' selected' : ''}>${p.parent_id ? '· ' : ''}${esc(p.title)}</option>`).join('')}</select></div>
        </div>
        <span class="label">Categorías</span>
        <div class="checks">${cats.map((c) => `<label class="check"><input type="checkbox" name="cats" value="${esc(c)}"${(t.categories || []).includes(c) ? ' checked' : ''}> ${esc(c)}</label>`).join('')}</div>
        <div class="row">
          <div><label for="tk_pl">Jugadores</label><input id="tk_pl" name="players" value="${esc(b.players || '')}" maxlength="30" placeholder="p. ej. 8x8+2"></div>
          <div><label for="tk_sp">Espacio</label><input id="tk_sp" name="space" value="${esc(b.space || '')}" maxlength="40" placeholder="p. ej. 40x30 m"></div>
          <div><label for="tk_du">Duración (min)</label><input id="tk_du" name="duration" type="number" min="1" max="120" value="${esc(b.duration || '')}"></div>
        </div>
        <label for="tk_desc">Desarrollo</label><textarea id="tk_desc" name="description" rows="4" maxlength="4000">${esc(b.description || '')}</textarea>
        <div class="row">
          <div class="grow"><label for="tk_var">Variantes (una por línea)</label><textarea id="tk_var" name="variants" rows="3">${esc((b.variants || []).join('\n'))}</textarea></div>
          <div class="grow"><label for="tk_obj">Objetivos</label><textarea id="tk_obj" name="objective" rows="3" maxlength="1000">${esc(b.objective || '')}</textarea></div>
        </div>
        <div class="row">
          <div class="grow"><label for="tk_mat">Material</label><input id="tk_mat" name="material" value="${esc(b.material || '')}" maxlength="200"></div>
          <div class="grow"><label for="tk_tags">Etiquetas (separadas por comas)</label><input id="tk_tags" name="tags" value="${esc((t.tags || []).join(', '))}" maxlength="200" placeholder="rondo, pressing, juego de posición"></div>
        </div>
        <label for="tk_img">Imagen o dibujo de la tarea (opcional)</label><input id="tk_img" name="img" type="file" accept="image/*">
        <div class="actions mt"><button class="btn primary" type="submit">${editing === 'new' ? (canEdit ? 'Crear tarea' : 'Enviar propuesta') : 'Guardar'}</button><a class="btn" href="${link({ nueva: '', editar: '' })}">Cancelar</a></div>
      </form>`;
    const f = box.querySelector('form');
    f.querySelector('input').focus();
    const syncPr = () => {
      const ph = f.phase.value;
      [...f.principle_id.options].forEach((o) => { o.hidden = !!(ph && o.dataset.phase && o.dataset.phase !== ph); });
    };
    f.phase.addEventListener('change', syncPr);
    syncPr();
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const v = formValues(f);
      if (!v.title) { toast('Escribe el título de la tarea.', 'err'); return; }
      await busy(f.querySelector('[type=submit]'), async () => {
        const file = f.img.files[0];
        const image_path = file ? await uploadClubImage('tasks', file) : t.image_path || null;
        const row = {
          title: v.title, phase: v.phase || '', principle_id: v.principle_id || null, categories: v.cats || [],
          tags: (v.tags || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 12), image_path,
          block: { ...b, description: v.description || '', variants: lines(v.variants), objective: v.objective || '', players: v.players || '', space: v.space || '', duration: v.duration ? +v.duration : null, material: v.material || '' }
        };
        let e;
        if (editing === 'new') ({ error: e } = await client.from('task_library').insert({ ...row, club_id: S.club.id, author_id: me, status: canEdit ? 'oficial' : 'propuesta' }));
        else ({ error: e } = await client.from('task_library').update(row).eq('id', t.id));
        if (e) throw e;
        if (file && t.image_path && t.image_path !== image_path) await removeClubImage(t.image_path);
        toast(editing === 'new' ? (canEdit ? 'Tarea creada.' : 'Propuesta enviada a la Coordinación.') : 'Tarea guardada.');
        location.hash = link({ nueva: '', editar: '', estado: editing === 'new' ? (canEdit ? 'oficial' : 'mias') : state });
      });
    });
  }
  drawForm();
  if (editing) el.querySelector('#taskForm').scrollIntoView({ block: 'start' });

  // ----- Filtros
  const ff = el.querySelector('#taskFilters');
  ff.addEventListener('change', () => { const v = formValues(ff); location.hash = link({ fase: v.fase, cat: v.cat, q: v.q }); });
  ff.addEventListener('submit', (ev) => { ev.preventDefault(); const v = formValues(ff); location.hash = link({ q: v.q }); });

  // ----- Acciones
  const byId = (n) => all.find((t) => t.id === n.closest('[data-tid]').dataset.tid);
  el.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => { location.hash = link({ editar: byId(b).id }); }));
  el.querySelectorAll('[data-approve]').forEach((b) => b.addEventListener('click', () => busy(b, async () => {
    const { error: e } = await client.from('task_library').update({ status: 'oficial' }).eq('id', byId(b).id);
    if (e) throw e;
    toast('Tarea aprobada: ya es oficial.');
    render(el, { canEdit, query });
  })));
  el.querySelectorAll('[data-reject]').forEach((b) => b.addEventListener('click', async () => {
    const t = byId(b);
    const card = b.closest('[data-tid]');
    if (card.querySelector('.reject-form')) return;
    card.insertAdjacentHTML('beforeend', `
      <form class="reject-form" novalidate>
        <label for="rj-${esc(t.id)}">Motivo (lo verá quien la propuso)</label>
        <textarea id="rj-${esc(t.id)}" rows="2" maxlength="500"></textarea>
        <div class="actions"><button class="btn small danger" type="submit">Rechazar</button><button class="btn small" type="button" data-cancel>Cancelar</button></div>
      </form>`);
    const f = card.querySelector('.reject-form');
    f.querySelector('textarea').focus();
    f.querySelector('[data-cancel]').addEventListener('click', () => f.remove());
    f.addEventListener('submit', (ev) => {
      ev.preventDefault();
      busy(f.querySelector('[type=submit]'), async () => {
        const { error: e } = await client.from('task_library').update({ status: 'rechazada', review_note: f.querySelector('textarea').value.trim() }).eq('id', t.id);
        if (e) throw e;
        toast('Propuesta rechazada.');
        render(el, { canEdit, query });
      });
    });
  }));
  el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    const t = byId(b);
    if (!(await ask(`Se borrará la tarea «${t.title}».`, { title: '¿Borrar la tarea?', yes: 'Borrar', danger: true }))) return;
    await busy(b, async () => {
      const { error: e } = await client.from('task_library').delete().eq('id', t.id);
      if (e) throw e;
      await removeClubImage(t.image_path);
      toast('Tarea borrada.');
      render(el, { canEdit, query });
    });
  }));
}
