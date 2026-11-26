// Metodología → Modelo de juego: principios y subprincipios por fase y etapa.
import { esc, toast, busy, ask } from '../ui.js';
import { sb } from '../supabase.js';
import { S } from '../session.js';
import { autosaver } from '../store.js';
import { PHASES, STAGES, stageName, EXAMPLE_PRINCIPLES } from '../lib/methodology.js';
import { uploadClubImage, removeClubImage, signedUrls } from '../lib/images.js';

export async function render(el, { canEdit, query }) {
  const client = sb();
  const stage = query.get('etapa') || '';
  const { data, error } = await client.from('club_principles').select('*').eq('club_id', S.club.id).order('sort').order('created_at');
  if (error) throw error;
  const all = data || [];
  const visible = all.filter((p) => !stage || p.stage === 'todas' || p.stage === stage);
  const urls = await signedUrls(all.map((p) => p.image_path));
  const roots = (phase) => visible.filter((p) => p.phase === phase && !p.parent_id);
  const subs = (id) => visible.filter((p) => p.parent_id === id);

  const stageSel = (p) => `<select data-f="stage" aria-label="Etapa">${STAGES.map((s) => `<option value="${s.key}"${p.stage === s.key ? ' selected' : ''}>${s.name}</option>`).join('')}</select>`;
  const principle = (p, sub = false) => `
    <li class="principle${sub ? ' sub' : ''}" data-pid="${esc(p.id)}">
      ${canEdit ? `
        <div class="pr-row">
          <input class="pr-title" data-f="title" value="${esc(p.title)}" maxlength="120" aria-label="${sub ? 'Subprincipio' : 'Principio'}">
          ${sub ? '' : stageSel(p)}
          <span class="arrows">
            <button class="icon-btn small" type="button" data-move="-1" aria-label="Subir">↑</button>
            <button class="icon-btn small" type="button" data-move="1" aria-label="Bajar">↓</button>
            <button class="icon-btn small" type="button" data-del aria-label="Borrar">✕</button>
          </span>
        </div>
        <textarea data-f="description" rows="2" maxlength="2000" placeholder="Explicación, comportamientos esperados, ejemplos…">${esc(p.description)}</textarea>
        ${sub ? '' : `<div class="pr-img">
          ${p.image_path && urls[p.image_path] ? `<img src="${esc(urls[p.image_path])}" alt="Imagen de ${esc(p.title)}" loading="lazy"><button class="btn small danger" type="button" data-img-del>Quitar imagen</button>` : ''}
          <label class="btn small">${p.image_path ? 'Cambiar imagen' : '+ Imagen'}<input type="file" accept="image/*" class="sr-only" data-img></label>
        </div>`}`
      : `
        <h4>${esc(p.title)}${!sub && p.stage !== 'todas' ? ` <span class="badge">${esc(stageName(p.stage))}</span>` : ''}</h4>
        ${p.description ? `<p>${esc(p.description).replace(/\n/g, '<br>')}</p>` : ''}
        ${p.image_path && urls[p.image_path] ? `<img src="${esc(urls[p.image_path])}" alt="Imagen de ${esc(p.title)}" loading="lazy">` : ''}`}
      ${sub ? '' : `
        <ul class="subs">${subs(p.id).map((s) => principle(s, true)).join('')}</ul>
        ${canEdit ? '<button class="btn small" type="button" data-add-sub>+ Subprincipio</button>' : ''}`}
    </li>`;

  el.innerHTML = `
    <div class="filters">
      <span class="label">Etapa</span>
      <nav class="chips" aria-label="Filtrar por etapa">
        <a class="chip${stage ? '' : ' on'}" href="#/metodologia?tab=modelo">Todas</a>
        <a class="chip${stage === 'base' ? ' on' : ''}" href="#/metodologia?tab=modelo&etapa=base">Fútbol base</a>
        <a class="chip${stage === 'rendimiento' ? ' on' : ''}" href="#/metodologia?tab=modelo&etapa=rendimiento">Rendimiento</a>
      </nav>
    </div>
    ${!all.length ? `
      <div class="card empty">
        <div class="big">📘</div><h2>El modelo de juego está vacío</h2>
        <p>${canEdit ? 'Escribe los principios del club por fases o empieza con un ejemplo basado en las fases de tu Excel (conservación, progresión, finalización; recuperación, contención, protección) y adáptalo.' : 'La Dirección o la Coordinación aún no han definido el modelo de juego.'}</p>
        ${canEdit ? '<button class="btn primary" type="button" data-example>Empezar con el ejemplo</button>' : ''}
      </div>` : ''}
    <div class="phases">
      ${PHASES.map((ph) => `
        <section class="card phase" data-phase="${ph.key}">
          <h2><span aria-hidden="true">${ph.icon}</span> ${ph.name} <span class="count">${roots(ph.key).length}</span></h2>
          <ul class="principles">${roots(ph.key).map((p) => principle(p)).join('') || (canEdit ? '' : '<li class="hint">Sin principios en esta fase.</li>')}</ul>
          ${canEdit ? '<button class="btn small" type="button" data-add>+ Principio</button>' : ''}
        </section>`).join('')}
    </div>`;

  const savers = [];
  // Antes de volver a pintar, se guarda lo pendiente (si no, se leería una versión antigua).
  const again = async () => { await Promise.all(savers.map((x) => x.flush())); return render(el, { canEdit, query }); };
  el.querySelector('[data-example]')?.addEventListener('click', (ev) => busy(ev.currentTarget, async () => {
    let sort = 0;
    for (const [phase, title, description, children] of EXAMPLE_PRINCIPLES) {
      const { data: p, error: e } = await client.from('club_principles').insert({ club_id: S.club.id, phase, title, description, sort: sort++ }).select('id').single();
      if (e) throw e;
      if (children.length) {
        const { error: e2 } = await client.from('club_principles').insert(children.map((t, i) => ({ club_id: S.club.id, phase, parent_id: p.id, title: t, sort: i })));
        if (e2) throw e2;
      }
    }
    toast('Modelo de ejemplo creado. Adáptalo a tu club.');
    again();
  }));
  if (!canEdit) return;

  const byId = (node) => all.find((p) => p.id === node.closest('[data-pid]').dataset.pid);
  const nextSort = (list) => (list.length ? Math.max(...list.map((x) => x.sort)) + 1 : 0);

  el.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => busy(b, async () => {
    const phase = b.closest('[data-phase]').dataset.phase;
    const { error: e } = await client.from('club_principles').insert({
      club_id: S.club.id, phase, title: 'Nuevo principio', stage: stage || 'todas', sort: nextSort(all.filter((p) => p.phase === phase && !p.parent_id))
    });
    if (e) throw e;
    await again();
    const inputs = el.querySelectorAll(`[data-phase="${phase}"] .principle:not(.sub) .pr-title`);
    inputs[inputs.length - 1]?.select();
  })));
  el.querySelectorAll('[data-add-sub]').forEach((b) => b.addEventListener('click', () => busy(b, async () => {
    const parent = byId(b);
    const { error: e } = await client.from('club_principles').insert({
      club_id: S.club.id, phase: parent.phase, parent_id: parent.id, title: 'Nuevo subprincipio', sort: nextSort(all.filter((p) => p.parent_id === parent.id))
    });
    if (e) throw e;
    await again();
    const inputs = el.querySelectorAll(`[data-pid="${parent.id}"] .sub .pr-title`);
    inputs[inputs.length - 1]?.select();
  })));

  // Edición con guardado automático
  el.querySelectorAll('[data-pid]').forEach((li) => {
    const p = all.find((x) => x.id === li.dataset.pid);
    const saver = autosaver({ table: 'club_principles', id: p.id, updatedAt: p.updated_at, onSaved: (row) => Object.assign(p, row) });
    savers.push(saver);
    li.querySelectorAll(':scope > .pr-row [data-f], :scope > textarea[data-f]').forEach((inp) => inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', () => {
      const v = inp.value.trim();
      if (inp.dataset.f === 'title' && !v) { inp.setAttribute('aria-invalid', 'true'); return; }
      inp.removeAttribute('aria-invalid');
      saver.set({ [inp.dataset.f]: inp.tagName === 'TEXTAREA' ? inp.value : v });
    }));
  });

  el.querySelectorAll('[data-move]').forEach((b) => b.addEventListener('click', () => busy(b, async () => {
    const p = byId(b);
    const siblings = all.filter((x) => x.phase === p.phase && x.parent_id === p.parent_id).sort((a, c) => a.sort - c.sort);
    const i = siblings.indexOf(p);
    const j = i + +b.dataset.move;
    if (j < 0 || j >= siblings.length) return;
    [siblings[i], siblings[j]] = [siblings[j], siblings[i]];
    await Promise.all(siblings.map((x, k) => x.sort === k ? null : client.from('club_principles').update({ sort: k }).eq('id', x.id)));
    again();
  })));
  el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    const p = byId(b);
    const n = all.filter((x) => x.parent_id === p.id).length;
    if (!(await ask(`Se borrará «${p.title}»${n ? ` y sus ${n} subprincipios` : ''}.`, { title: '¿Borrar?', yes: 'Borrar', danger: true }))) return;
    await busy(b, async () => {
      const { error: e } = await client.from('club_principles').delete().eq('id', p.id);
      if (e) throw e;
      await removeClubImage(p.image_path);
      again();
    });
  }));
  el.querySelectorAll('[data-img]').forEach((inp) => inp.addEventListener('change', () => busy(inp.closest('label'), async () => {
    const p = byId(inp);
    const file = inp.files[0];
    if (!file) return;
    const path = await uploadClubImage('principles', file);
    const { error: e } = await client.from('club_principles').update({ image_path: path }).eq('id', p.id);
    if (e) throw e;
    await removeClubImage(p.image_path);
    toast('Imagen guardada.');
    again();
  })));
  el.querySelectorAll('[data-img-del]').forEach((b) => b.addEventListener('click', () => busy(b, async () => {
    const p = byId(b);
    const { error: e } = await client.from('club_principles').update({ image_path: null }).eq('id', p.id);
    if (e) throw e;
    await removeClubImage(p.image_path);
    again();
  })));
}
