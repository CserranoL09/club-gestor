// Metodología → Plantillas del club: sesión tipo, morfociclo y macrociclo por etapa.
// La predeterminada de cada tipo y etapa se copia a los equipos nuevos; se puede aplicar a los actuales.
import { esc, toast, busy, ask } from '../ui.js';
import { sb } from '../supabase.js';
import { S } from '../session.js';
import { autosaver } from '../store.js';
import { TEMPLATE_KINDS, STAGES, stageName, EXAMPLE_SESSION, EXAMPLE_MACRO, DAYS } from '../lib/methodology.js';

const BLOCK_KINDS = [['warmup', 'Calentamiento'], ['task', 'Tarea'], ['cooldown', 'Vuelta a la calma']];
const MATCH_DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export async function render(el, { canEdit, query }) {
  const client = sb();
  const { data, error } = await client.from('club_templates').select('*').eq('club_id', S.club.id).order('kind').order('stage').order('name');
  if (error) throw error;
  const all = data || [];
  const editId = query.get('editar');
  const editing = all.find((t) => t.id === editId);
  if (editing) return renderEditor(el, editing, all, canEdit);

  el.innerHTML = TEMPLATE_KINDS.map((k) => {
    const list = all.filter((t) => t.kind === k.key);
    return `
      <section class="card tpl-kind" data-kind="${k.key}">
        <div class="section-head">
          <div><h2><span aria-hidden="true">${k.icon}</span> ${k.name} <span class="count">${list.length}</span></h2><p class="hint">${esc(k.help)}</p></div>
          ${canEdit ? `<button class="btn small" type="button" data-new="${k.key}">+ Nueva plantilla</button>` : ''}
        </div>
        ${list.length ? `<ul class="list">${list.map((t) => `
          <li data-id="${esc(t.id)}">
            <div><strong>${esc(t.name)}</strong> ${t.is_default ? '<span class="badge">Predeterminada</span>' : ''}<br><small class="muted">${esc(stageName(t.stage))} · ${esc(summary(t))}</small></div>
            <div class="actions"><a class="btn small" href="#/metodologia?tab=plantillas&editar=${esc(t.id)}">${canEdit ? 'Editar' : 'Ver'}</a></div>
          </li>`).join('')}</ul>` : `<p class="muted">Sin plantillas.${canEdit ? ' Crea una a partir del ejemplo de tu Excel y adáptala.' : ''}</p>`}
      </section>`;
  }).join('');

  el.querySelectorAll('[data-new]').forEach((b) => b.addEventListener('click', () => busy(b, async () => {
    const kind = b.dataset.new;
    let dataJson;
    if (kind === 'sesion') dataJson = EXAMPLE_SESSION;
    else if (kind === 'macrociclo') dataJson = EXAMPLE_MACRO;
    else {
      const { data: rows } = await client.rpc('default_morphocycle_rows');
      dataJson = { match_day: 6, rows: rows || [] };
    }
    const name = { sesion: 'Sesión tipo', morfociclo: 'Morfociclo del club', macrociclo: 'Macrociclo de porteros' }[kind];
    const hasDefault = all.some((t) => t.kind === kind && t.stage === 'todas' && t.is_default);
    const { data: row, error: e } = await client.from('club_templates').insert({ club_id: S.club.id, kind, stage: 'todas', name, data: dataJson, is_default: !hasDefault }).select('id').single();
    if (e) throw e;
    location.hash = `#/metodologia?tab=plantillas&editar=${row.id}`;
  })));
}

function summary(t) {
  const d = t.data || {};
  if (t.kind === 'sesion') return `${(d.blocks || []).length} bloques · ${(d.blocks || []).reduce((n, b) => n + (+b.minutes || 0), 0)} min`;
  if (t.kind === 'morfociclo') return `${(d.rows || []).length} filas · partido el ${MATCH_DAYS[(d.match_day ?? 6)]?.toLowerCase()}`;
  return `${(d.groups || []).length} grupos · ${d.weeks || 36} semanas`;
}

function renderEditor(el, t, all, canEdit) {
  const client = sb();
  const d = structuredClone(t.data || {});
  const lock = canEdit ? '' : 'disabled';
  const saver = canEdit ? autosaver({ table: 'club_templates', id: t.id, updatedAt: t.updated_at, onSaved: (row) => Object.assign(t, row) }) : null;
  const kind = t.kind;

  function body() {
    if (kind === 'sesion') {
      const total = (d.blocks || []).reduce((n, b) => n + (+b.minutes || 0), 0);
      return `
        <div class="tpl-blocks">
          <div class="tpl-block head" aria-hidden="true"><span>Tipo</span><span>Título</span><span>Min</span><span>Objetivo</span><span></span></div>
          ${(d.blocks || []).map((b, i) => `
            <div class="tpl-block" data-i="${i}">
              <select data-b="kind" aria-label="Tipo de bloque ${i + 1}" ${lock}>${BLOCK_KINDS.map(([k, n]) => `<option value="${k}"${b.kind === k ? ' selected' : ''}>${n}</option>`).join('')}</select>
              <input data-b="title" value="${esc(b.title)}" maxlength="60" aria-label="Título del bloque ${i + 1}" ${lock}>
              <input data-b="minutes" type="number" min="0" max="120" value="${esc(b.minutes ?? '')}" aria-label="Minutos del bloque ${i + 1}" ${lock}>
              <input data-b="objective" value="${esc(b.objective || '')}" maxlength="200" placeholder="Objetivo" aria-label="Objetivo del bloque ${i + 1}" ${lock}>
              ${canEdit ? `<span class="arrows"><button class="icon-btn small" type="button" data-bmove="-1" aria-label="Subir">↑</button><button class="icon-btn small" type="button" data-bdel aria-label="Quitar">✕</button></span>` : '<span></span>'}
            </div>`).join('')}
        </div>
        ${canEdit ? '<button class="btn small" type="button" data-badd>+ Añadir bloque</button>' : ''}
        <p class="big-line mt">Total: <span id="tplTotal">${total}</span> minutos</p>`;
    }
    if (kind === 'morfociclo') {
      return `
        <label for="tp_md">Día de partido</label>
        <select id="tp_md" data-md ${lock}>${MATCH_DAYS.map((n, i) => `<option value="${i}"${(d.match_day ?? 6) === i ? ' selected' : ''}>${n}</option>`).join('')}</select>
        <div class="table-scroll mt">
          <table class="grid-table">
            <thead><tr><th scope="col">Fila</th>${DAYS.map(([, n]) => `<th scope="col">${n}</th>`).join('')}${canEdit ? '<th></th>' : ''}</tr></thead>
            <tbody>${(d.rows || []).map((r, i) => `
              <tr data-r="${i}">
                <th scope="row"><input data-rl value="${esc(r.label)}" maxlength="60" aria-label="Nombre de la fila ${i + 1}" ${lock}></th>
                ${DAYS.map(([k, n]) => `<td><textarea data-rv="${k}" rows="2" aria-label="${esc(r.label)} · ${n}" ${lock}>${esc(r.values?.[k] || '')}</textarea></td>`).join('')}
                ${canEdit ? '<td><button class="icon-btn small" type="button" data-rdel aria-label="Quitar fila">✕</button></td>' : ''}
              </tr>`).join('')}</tbody>
          </table>
        </div>
        ${canEdit ? '<button class="btn small" type="button" data-radd>+ Añadir fila</button>' : ''}`;
    }
    return `
      <div class="row">
        <div><label for="tp_area">Área</label><input id="tp_area" data-area value="${esc(d.area || '')}" maxlength="40" placeholder="p. ej. porteros" ${lock}></div>
        <div><label for="tp_weeks">Semanas</label><input id="tp_weeks" data-weeks type="number" min="1" max="60" value="${esc(d.weeks || 36)}" ${lock}></div>
      </div>
      <div class="macro-groups">${(d.groups || []).map((g, i) => `
        <fieldset class="macro-group" data-g="${i}">
          <legend><input data-gname value="${esc(g.name)}" maxlength="40" aria-label="Nombre del grupo ${i + 1}" ${lock}></legend>
          <textarea data-gitems rows="${Math.max(3, (g.items || []).length)}" aria-label="Contenidos de ${esc(g.name)} (uno por línea)" ${lock}>${esc((g.items || []).map((x) => x.name).join('\n'))}</textarea>
          ${canEdit ? '<button class="btn small danger" type="button" data-gdel>Quitar grupo</button>' : ''}
        </fieldset>`).join('')}</div>
      ${canEdit ? '<button class="btn small" type="button" data-gadd>+ Añadir grupo</button>' : ''}
      <p class="hint">Contenidos uno por línea. Las semanas en las que se trabaja cada contenido se marcan en el macrociclo de cada equipo.</p>`;
  }

  function draw() {
    el.innerHTML = `
      <div class="page-head">
        <div><p class="eyebrow">${esc(TEMPLATE_KINDS.find((k) => k.key === kind).name)}</p><h2>${esc(t.name)}</h2></div>
        <a class="btn" href="#/metodologia?tab=plantillas">← Plantillas</a>
      </div>
      <section class="card">
        <div class="row">
          <div class="grow"><label for="tp_name">Nombre</label><input id="tp_name" data-name value="${esc(t.name)}" maxlength="80" ${lock}></div>
          <div><label for="tp_stage">Etapa</label><select id="tp_stage" data-stage ${lock}>${STAGES.map((s) => `<option value="${s.key}"${t.stage === s.key ? ' selected' : ''}>${s.name}</option>`).join('')}</select></div>
        </div>
        <label class="check switch"><input type="checkbox" data-default${t.is_default ? ' checked' : ''} ${lock}>
          <span><strong>Predeterminada para su etapa</strong><br><small class="muted">${kind === 'sesion' ? 'Se propondrá al crear sesiones.' : 'Se copia a cada equipo nuevo de esta etapa.'}</small></span></label>
      </section>
      <section class="card">${body()}</section>
      ${canEdit ? `<div class="actions mt">
        ${kind !== 'sesion' ? `<button class="btn primary" type="button" data-apply>Aplicar a los equipos de ${esc(S.season?.name || 'la temporada')}</button>` : ''}
        <button class="btn danger" type="button" data-tdel>Borrar plantilla</button>
      </div>` : ''}`;
    if (canEdit) wire();
  }

  const save = () => saver.set({ data: structuredClone(d) });
  const redraw = (focusSel) => { draw(); if (focusSel) el.querySelector(focusSel)?.focus(); };

  function wire() {
    el.querySelector('[data-name]').addEventListener('input', (ev) => {
      const v = ev.target.value.trim();
      if (!v) { ev.target.setAttribute('aria-invalid', 'true'); return; }
      ev.target.removeAttribute('aria-invalid');
      t.name = v;
      saver.set({ name: v });
    });
    el.querySelector('[data-stage]').addEventListener('change', (ev) => { t.stage = ev.target.value; saver.set({ stage: t.stage }); });
    el.querySelector('[data-default]').addEventListener('change', (ev) => busy(ev.target, async () => {
      await saver.flush();
      if (ev.target.checked) {
        // Solo una predeterminada por tipo y etapa.
        const others = all.filter((x) => x.kind === kind && x.stage === t.stage && x.id !== t.id && x.is_default);
        for (const o of others) await client.from('club_templates').update({ is_default: false }).eq('id', o.id);
      }
      const { data: row, error: e } = await client.from('club_templates').update({ is_default: ev.target.checked }).eq('id', t.id).select().single();
      if (e) throw e;
      Object.assign(t, row);
      saver.setVersion(row.updated_at);
      toast(ev.target.checked ? 'Plantilla predeterminada.' : 'Ya no es la predeterminada.');
    }));

    if (kind === 'sesion') {
      el.querySelectorAll('[data-b]').forEach((inp) => inp.addEventListener('input', () => {
        const b = d.blocks[+inp.closest('[data-i]').dataset.i];
        b[inp.dataset.b] = inp.dataset.b === 'minutes' ? (+inp.value || 0) : inp.value;
        el.querySelector('#tplTotal').textContent = d.blocks.reduce((n, x) => n + (+x.minutes || 0), 0);
        save();
      }));
      el.querySelector('[data-badd]').addEventListener('click', () => { d.blocks.push({ kind: 'task', title: `Tarea ${d.blocks.filter((b) => b.kind === 'task').length + 1}`, minutes: 15, objective: '' }); save(); redraw('.tpl-block:last-child [data-b=title]'); });
      el.querySelectorAll('[data-bdel]').forEach((b) => b.addEventListener('click', () => { d.blocks.splice(+b.closest('[data-i]').dataset.i, 1); save(); redraw(); }));
      el.querySelectorAll('[data-bmove]').forEach((b) => b.addEventListener('click', () => {
        const i = +b.closest('[data-i]').dataset.i;
        if (i > 0) { [d.blocks[i - 1], d.blocks[i]] = [d.blocks[i], d.blocks[i - 1]]; save(); redraw(); }
      }));
    } else if (kind === 'morfociclo') {
      el.querySelector('[data-md]').addEventListener('change', (ev) => { d.match_day = +ev.target.value; save(); });
      el.querySelectorAll('[data-rl]').forEach((inp) => inp.addEventListener('input', () => { d.rows[+inp.closest('[data-r]').dataset.r].label = inp.value; save(); }));
      el.querySelectorAll('[data-rv]').forEach((inp) => inp.addEventListener('input', () => {
        const r = d.rows[+inp.closest('[data-r]').dataset.r];
        r.values = { ...(r.values || {}), [inp.dataset.rv]: inp.value };
        save();
      }));
      el.querySelector('[data-radd]').addEventListener('click', () => { d.rows.push({ label: 'Nueva fila', values: {} }); save(); redraw('tbody tr:last-child [data-rl]'); });
      el.querySelectorAll('[data-rdel]').forEach((b) => b.addEventListener('click', () => { d.rows.splice(+b.closest('[data-r]').dataset.r, 1); save(); redraw(); }));
    } else {
      el.querySelector('[data-area]').addEventListener('input', (ev) => { d.area = ev.target.value.trim(); save(); });
      el.querySelector('[data-weeks]').addEventListener('input', (ev) => { const v = +ev.target.value; if (v >= 1 && v <= 60) { d.weeks = v; save(); } });
      el.querySelectorAll('[data-gname]').forEach((inp) => inp.addEventListener('input', () => { d.groups[+inp.closest('[data-g]').dataset.g].name = inp.value; save(); }));
      el.querySelectorAll('[data-gitems]').forEach((inp) => inp.addEventListener('input', () => {
        d.groups[+inp.closest('[data-g]').dataset.g].items = inp.value.split('\n').map((x) => x.trim()).filter(Boolean).map((name) => ({ name, marks: {} }));
        save();
      }));
      el.querySelector('[data-gadd]').addEventListener('click', () => { (d.groups ||= []).push({ name: 'Nuevo grupo', items: [] }); save(); redraw('.macro-group:last-child [data-gname]'); });
      el.querySelectorAll('[data-gdel]').forEach((b) => b.addEventListener('click', () => { d.groups.splice(+b.closest('[data-g]').dataset.g, 1); save(); redraw(); }));
    }

    el.querySelector('[data-apply]')?.addEventListener('click', async (ev) => {
      if (!S.season) { toast('Elige una temporada.', 'err'); return; }
      const what = kind === 'morfociclo' ? 'Cada equipo recibirá este morfociclo como predeterminado (el anterior se conserva).' : 'Cada equipo recibirá este macrociclo (los que ya tenga se conservan).';
      if (!(await ask(`${what} Se aplica a los equipos de ${S.season.name}${t.stage !== 'todas' ? ` de ${stageName(t.stage).toLowerCase()}` : ''} que puedas gestionar.`, { title: '¿Aplicar la plantilla?', yes: 'Aplicar' }))) return;
      await busy(ev.currentTarget, async () => {
        await saver.flush();
        const { data: n, error: e } = await client.rpc('apply_template', { p_template: t.id, p_season: S.season.id });
        if (e) throw e;
        toast(n ? `Aplicada a ${n} ${n === 1 ? 'equipo' : 'equipos'}.` : 'No hay equipos de esta etapa en la temporada.');
      });
    });
    el.querySelector('[data-tdel]').addEventListener('click', async (ev) => {
      if (!(await ask('Los equipos que ya la recibieron conservan su copia.', { title: '¿Borrar la plantilla?', yes: 'Borrar', danger: true }))) return;
      await busy(ev.currentTarget, async () => {
        const { error: e } = await client.from('club_templates').delete().eq('id', t.id);
        if (e) throw e;
        toast('Plantilla borrada.');
        location.hash = '#/metodologia?tab=plantillas';
      });
    });
  }
  draw();
}
