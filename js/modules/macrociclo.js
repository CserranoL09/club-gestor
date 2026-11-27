// Macrociclos del equipo (hoja MACROCICLO): varios por equipo (Porteros, Condicional, General…).
// Lista (#/macrociclo) y tabla por semanas (#/macrociclo/:id) con fases, grupos e ítems marcados con ✖ o nivel 1–3.
import { esc, toast, busy, ask, permNote } from '../ui.js';
import { sb } from '../supabase.js';
import { S, canPlanTeam, canMatchTeam, canEditTeam } from '../session.js';
import { autosaver } from '../store.js';
import { MONTHS, fmt } from '../lib/dates.js';
import { mountThread } from '../lib/comments.js';
import { rangesToWeeks, weeksToRanges, LEVELS } from '../lib/periodization.js';
import { printButton, wirePrint, printHead } from '../lib/print.js';
import { MACRO_AREAS, PHASES, BUILTIN_TEMPLATES, areaName, defaultSpan, defaultPhases, macroWeeks, itemTotal, groupWeek, groupTotal } from '../lib/macro.js';

const brush = { phase: 'preparatorio', mark: 'x' };
let endPaint = () => {};
let settingsOpen = false;
const lv = (v) => (v === 'x' ? 'x' : +v);
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Quién edita un macrociclo: Dirección, entrenador principal y 2.º; preparador (condicional) y porteros (porteros). */
function canEditMacro(team, m) {
  if (canMatchTeam(team.id)) return true;
  if (!canPlanTeam(team.id)) return false;
  const r = S.member?.role;
  return (r === 'preparador' && m.area === 'condicional') || (r === 'porteros' && m.area === 'porteros');
}
/** Áreas en las que puede crear quien no es del cuerpo técnico principal. */
function allowedAreas(team) {
  if (canMatchTeam(team.id)) return MACRO_AREAS;
  const r = S.member?.role;
  return MACRO_AREAS.filter(([k]) => (r === 'preparador' && k === 'condicional') || (r === 'porteros' && k === 'porteros'));
}

export async function render(el, ctx) {
  if (!S.team) { el.innerHTML = '<div class="card empty"><p>Elige un equipo en la cabecera.</p></div>'; return; }
  if (ctx.params?.id) return editor(el, ctx);
  const team = S.team;
  const client = sb();
  const season = S.seasons.find((s) => s.id === team.season_id) || S.season;
  const [{ data, error }, { data: tpls }] = await Promise.all([
    client.from('macrocycles').select('*').eq('team_id', team.id).order('created_at'),
    client.from('club_templates').select('id, name, stage, data').eq('club_id', S.club.id).eq('kind', 'macrociclo').order('name')
  ]);
  if (error) throw error;
  const list = data || [];
  const areas = allowedAreas(team);
  const canCreate = canPlanTeam(team.id) && areas.length;
  const note = canCreate ? (canMatchTeam(team.id) ? '' : permNote({ ok: false, reason: `Puedes crear y editar macrociclos del área ${areas.map(([, l]) => l.toLowerCase()).join(' y ')}.` }))
    : permNote({ ok: false, reason: `Solo ver y comentar: los macrociclos los edita el cuerpo técnico de ${team.name}.` });

  el.innerHTML = `
    <div class="page-head">
      <div><h1>📈 Macrociclos</h1><p>${esc(team.name)} · ${esc(season?.name || '')}</p></div>
      <div class="actions"><a class="btn" href="#/planificacion">← Planificación</a>${canCreate ? '<button class="btn primary" type="button" data-new>+ Nuevo macrociclo</button>' : ''}</div>
    </div>
    ${note}
    ${list.length ? `<div class="macro-cards">${list.map((m) => {
      const total = (m.groups || []).reduce((s, g) => s + groupTotal(g, m.weeks), 0);
      const nItems = (m.groups || []).reduce((s, g) => s + (g.items || []).length, 0);
      const end = new Date(m.start_monday + 'T00:00:00'); end.setDate(end.getDate() + 7 * m.weeks - 1);
      return `<a class="card macro-card" href="#/macrociclo/${esc(m.id)}">
        <span class="pill">${esc(areaName(m.area))}</span>
        <h2>${esc(m.name)}</h2>
        <p class="muted">${fmt(new Date(m.start_monday + 'T00:00:00'))} – ${fmt(end)} · ${m.weeks} semanas</p>
        <p>${(m.groups || []).length} grupos · ${nItems} contenidos · <strong>${total}</strong> semanas marcadas</p>
        ${canEditMacro(team, m) ? '' : '<p class="hint">Solo lectura</p>'}
      </a>`;
    }).join('')}</div>` : `<div class="card empty"><div class="big">📈</div><h2>Todavía no hay macrociclos</h2>
      <p>Cada equipo puede tener varios: porteros, condicional, general… ${canCreate ? 'Crea el primero a partir de una plantilla.' : ''}</p></div>`}
    <div id="thread"></div>`;

  el.querySelector('[data-new]')?.addEventListener('click', () => newDialog());
  await mountThread(el.querySelector('#thread'), { teamId: team.id, entity: 'macrociclo', title: 'Comentarios sobre los macrociclos' });

  function newDialog() {
    const span = defaultSpan(season);
    const options = [...BUILTIN_TEMPLATES.map((t) => ({ id: 'b:' + t.key, name: t.name, area: t.area, groups: t.groups, weeks: null })),
      ...(tpls || []).map((t) => ({ id: 't:' + t.id, name: `${t.name} (club)`, area: t.data?.area || 'general', groups: t.data?.groups || [], weeks: t.data?.weeks || null }))]
      .filter((o) => areas.some(([k]) => k === o.area) || areas.length === MACRO_AREAS.length);
    let dlg = document.getElementById('macroDlg');
    if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'macroDlg'; document.body.appendChild(dlg); }
    dlg.innerHTML = `
      <form method="dialog" class="macro-new">
        <h2>Nuevo macrociclo</h2>
        <fieldset class="tpl-pick"><legend>Plantilla</legend>
          ${options.map((o, i) => `<label class="check"><input type="radio" name="tpl" value="${esc(o.id)}"${i ? '' : ' checked'}> <span><strong>${esc(o.name)}</strong><br><small class="muted">${esc(areaName(o.area))} · ${o.groups.length} grupos</small></span></label>`).join('') || '<p class="muted">No hay plantillas para tu área.</p>'}
        </fieldset>
        <div class="row">
          <div class="grow"><label for="mn_name">Nombre</label><input id="mn_name" name="name" maxlength="60" required value="${esc(options[0]?.name.replace(' (club)', '') || 'Macrociclo')}"></div>
          <div><label for="mn_area">Área</label><select id="mn_area" name="area">${areas.map(([k, l]) => `<option value="${k}"${options[0]?.area === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
        </div>
        <div class="row">
          <div><label for="mn_start">Inicio (lunes)</label><input id="mn_start" name="start" type="date" value="${span.start_monday}" required></div>
          <div><label for="mn_weeks">Semanas</label><input id="mn_weeks" name="weeks" type="number" min="1" max="60" value="${span.weeks}" required></div>
        </div>
        <div class="dlg-actions"><button class="btn" value="no" formnovalidate>Cancelar</button><button class="btn primary" value="yes"${options.length ? '' : ' disabled'}>Crear</button></div>
      </form>`;
    const f = dlg.querySelector('form');
    f.addEventListener('change', (ev) => {
      if (ev.target.name !== 'tpl') return;
      const o = options.find((x) => x.id === ev.target.value);
      f.name.value = o.name.replace(' (club)', '');
      if (areas.some(([k]) => k === o.area)) f.area.value = o.area;
      if (o.weeks) f.weeks.value = o.weeks;
    });
    dlg.onclose = () => {
      if (dlg.returnValue !== 'yes') return;
      const o = options.find((x) => x.id === f.tpl.value);
      const weeks = Math.max(1, Math.min(60, +f.weeks.value || 36));
      const start = new Date(f.start.value + 'T00:00:00');
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
      const groups = structuredClone(o.groups).map((g) => ({ name: g.name, items: (g.items || []).map((it) => ({ name: typeof it === 'string' ? it : it.name, marks: typeof it === 'string' ? {} : (it.marks || {}) })) }));
      busy(el.querySelector('[data-new]'), async () => {
        const { data: row, error: e } = await client.from('macrocycles').insert({
          team_id: team.id, season_id: team.season_id, name: f.name.value.trim() || o.name, area: f.area.value,
          start_monday: iso(start), weeks, phases: defaultPhases(weeks), groups
        }).select('id').single();
        if (e) throw e;
        toast('Macrociclo creado.');
        location.hash = `#/macrociclo/${row.id}`;
      });
    };
    dlg.returnValue = '';
    dlg.showModal();
  }
}

// ======================================================================= editor
async function editor(el, ctx) {
  const client = sb();
  const { data: m, error } = await client.from('macrocycles').select('*').eq('id', ctx.params.id).maybeSingle();
  if (error) throw error;
  if (!m) { el.innerHTML = '<div class="card empty"><div class="big">🔍</div><h2>Macrociclo no encontrado</h2><p><a href="#/macrociclo">Volver</a></p></div>'; return; }
  const team = S.teams.find((t) => t.id === m.team_id) || S.team;
  const canEdit = canEditMacro(team, m);
  const canDelete = canEditTeam(team.id);
  const saver = canEdit ? autosaver({ table: 'macrocycles', id: m.id, updatedAt: m.updated_at, onSaved: (r) => { m.updated_at = r.updated_at; } }) : null;
  m.groups ||= [];
  let weeks = macroWeeks(m);
  let ph = rangesToWeeks(m.phases, m.weeks, 'key');
  const phaseOf = (k) => PHASES.find((p) => p.key === k);
  const today = new Date();
  const nowWeek = weeks.findIndex((w) => { const e = new Date(w.monday); e.setDate(e.getDate() + 7); return today >= w.monday && today < e; });
  const saveGroups = () => saver?.set({ groups: structuredClone(m.groups) });
  const savePhases = () => { m.phases = weeksToRanges(ph, 'key'); saver?.set({ phases: m.phases }); };
  const dis = canEdit ? '' : 'disabled';

  function table() {
    const months = [];
    for (const w of weeks) { const last = months[months.length - 1]; const k = w.monday.getMonth(); if (last && last.m === k) last.n++; else months.push({ m: k, y: w.monday.getFullYear(), n: 1 }); }
    const first = (w) => w === 0 || ph[w] !== ph[w - 1];
    const now = (w) => (w === nowWeek ? ' now' : '');
    return `
      <div class="per-scroll macro-scroll" data-scroll>
        <table class="per-table macro-table">
          <thead>
            <tr><th class="lbl" scope="col">Mes</th>${months.map((g) => `<th colspan="${g.n}" class="month">${MONTHS[g.m]} ${g.y}</th>`).join('')}<th class="tot" rowspan="3">Total</th></tr>
            <tr><th class="lbl" scope="row">Semana</th>${weeks.map((w) => `<th class="wk-n${now(w.i)}">${w.i + 1}</th>`).join('')}</tr>
            <tr><th class="lbl" scope="row">Lunes</th>${weeks.map((w) => `<th class="wk-d${now(w.i)}">${w.monday.getDate()}/${w.monday.getMonth() + 1}</th>`).join('')}</tr>
          </thead>
          <tbody>
            <tr class="st-row" data-row="phase"><th class="lbl" scope="row">Fase</th>${weeks.map((w) => { const p = phaseOf(ph[w.i]);
              return `<td data-w="${w.i}" class="paint${now(w.i)}${p ? ' filled' : ''}" ${p ? `style="--c:${p.color}" title="${p.label}"` : ''}>${first(w.i) && p ? `<span>${p.label}</span>` : ''}</td>`; }).join('')}<td class="tot"></td></tr>
            ${m.groups.map((g, gi) => `
              <tr class="grp-row" data-g="${gi}">
                <th class="lbl" scope="row"><div class="lbl-in">
                  <input data-gname value="${esc(g.name)}" maxlength="40" aria-label="Nombre del grupo ${gi + 1}" ${dis}>
                  ${canEdit ? `<button class="icon-btn small" type="button" data-gmove="-1" aria-label="Subir el grupo"${gi ? '' : ' disabled'}>↑</button>
                    <button class="icon-btn small" type="button" data-iadd aria-label="Añadir contenido a ${esc(g.name)}">+</button>
                    <button class="icon-btn small" type="button" data-gdel aria-label="Quitar el grupo ${esc(g.name)}">✕</button>` : ''}
                </div></th>
                ${weeks.map((w) => { const n = groupWeek(g, w.i); return `<td class="sum${now(w.i)}">${n || ''}</td>`; }).join('')}
                <td class="tot">${groupTotal(g, m.weeks)}</td>
              </tr>
              ${(g.items || []).map((it, ii) => `
              <tr class="it-row" data-g="${gi}" data-i="${ii}">
                <th class="lbl" scope="row"><div class="lbl-in">
                  <input data-iname value="${esc(it.name)}" maxlength="60" aria-label="Contenido ${ii + 1} de ${esc(g.name)}" ${dis}>
                  ${canEdit ? `<button class="icon-btn small" type="button" data-imove="-1" aria-label="Subir"${ii ? '' : ' disabled'}>↑</button>
                    <button class="icon-btn small" type="button" data-idel aria-label="Quitar ${esc(it.name)}">✕</button>` : ''}
                </div></th>
                ${weeks.map((w) => { const v = it.marks?.[w.i]; return `<td data-w="${w.i}" class="mark${now(w.i)}${v != null ? ' lv-' + v : ''}">${v != null ? LEVELS[v] : ''}</td>`; }).join('')}
                <td class="tot" data-tot>${itemTotal(it, m.weeks)}</td>
              </tr>`).join('')}`).join('')}
          </tbody>
        </table>
      </div>`;
  }


  // ---------------------------------------------------------------- impresión (apaisado)
  function printView() {
    const months = [];
    for (const w of weeks) { const last = months[months.length - 1]; const k = w.monday.getMonth(); if (last && last.m === k) last.n++; else months.push({ m: k, y: w.monday.getFullYear(), n: 1 }); }
    const runs = []; for (let w = 0; w < weeks.length; w++) { if (w && ph[w] === ph[w - 1]) runs[runs.length - 1].n++; else runs.push({ k: ph[w], n: 1 }); }
    const end = new Date(weeks[weeks.length - 1].monday); end.setDate(end.getDate() + 6);
    const html = `
      ${printHead({ title: m.name, team, sub: `Macrociclo · ${esc(areaName(m.area))} · ${esc(fmt(weeks[0].monday))} – ${esc(fmt(end))} · ${m.weeks} semanas` })}
      <table class="pr-t pr-wide">
        <colgroup><col style="width:34mm">${weeks.map(() => '<col>').join('')}<col style="width:9mm"></colgroup>
        <thead>
          <tr><th class="lbl">Mes</th>${months.map((g) => `<th colspan="${g.n}">${g.n > 2 ? MONTHS[g.m] : MONTHS[g.m].slice(0, 3)}</th>`).join('')}<th class="tot" rowspan="3">Total</th></tr>
          <tr><th class="lbl">Semana</th>${weeks.map((w) => `<th>${w.i + 1}</th>`).join('')}</tr>
          <tr><th class="lbl">Lunes</th>${weeks.map((w) => `<th>${w.monday.getDate()}</th>`).join('')}</tr>
        </thead>
        <tbody>
          <tr><th class="lbl">Fase</th>${runs.map((r) => { const p = phaseOf(r.k); return `<td colspan="${r.n}" class="fill" style="${p ? `background:${p.color}` : ''}">${p && r.n > 2 ? p.label : ''}</td>`; }).join('')}<td class="tot"></td></tr>
          ${m.groups.map((g) => `
            <tr class="grp"><th class="lbl">${esc(g.name)}</th>${weeks.map((w) => `<td>${groupWeek(g, w.i) || ''}</td>`).join('')}<td class="tot">${groupTotal(g, m.weeks)}</td></tr>
            ${(g.items || []).map((it) => `<tr><th class="lbl">${esc(it.name)}</th>${weeks.map((w) => { const v = it.marks?.[w.i]; return `<td class="${v != null ? 'lv-' + v : ''}">${v != null ? LEVELS[v] : ''}</td>`; }).join('')}<td class="tot">${itemTotal(it, m.weeks)}</td></tr>`).join('')}`).join('')}
        </tbody>
      </table>
      <div class="pr-legend">${PHASES.map((p) => `<span><i style="background:${p.color}"></i>${p.label}</span>`).join('')}<span>✖ marca · 1–3 nivel · en los grupos, contenidos marcados por semana</span></div>`;
    return { title: `${m.name} ${team.name}`, html, landscape: true };
  }

  function draw() {
    weeks = macroWeeks(m);
    const end = new Date(weeks[weeks.length - 1].monday); end.setDate(end.getDate() + 6);
    const note = canEdit ? '' : permNote({ ok: false, reason: S.member?.role === 'preparador' || S.member?.role === 'porteros'
      ? `Este macrociclo es del área ${areaName(m.area).toLowerCase()}: lo editan el entrenador principal y el responsable de esa área.`
      : 'Solo ver y comentar.' });
    el.innerHTML = `
      <div class="page-head">
        <div><p class="eyebrow">${esc(team.name)} · ${esc(areaName(m.area))}</p><h1>📈 ${esc(m.name)}</h1>
          <p>${fmt(weeks[0].monday)} – ${fmt(end)} · ${m.weeks} semanas</p></div>
        <div class="actions no-print"><a class="btn" href="#/macrociclo">← Macrociclos</a>${nowWeek >= 0 ? '<button class="btn" type="button" data-today>Ir a hoy</button>' : ''}${printButton()}</div>
      </div>
      ${note}
      <div class="legend-inline">${PHASES.map((p) => `<span><i style="background:${p.color}"></i>${p.label}</span>`).join('')}<span><i class="lv-x"></i>✖ Trabajado</span><span><i class="lv-1"></i>Nivel 1</span><span><i class="lv-2"></i>Nivel 2</span><span><i class="lv-3"></i>Nivel 3</span></div>
      ${canEdit ? `<div class="palette no-print">
        <div><span class="pal-lbl">Fase</span>${PHASES.map((p) => `<button type="button" class="chip${brush.phase === p.key ? ' on' : ''}" data-brush="phase" data-v="${p.key}"><i style="background:${p.color}"></i>${p.label}</button>`).join('')}<button type="button" class="chip${brush.phase === '' ? ' on' : ''}" data-brush="phase" data-v="">Borrar</button></div>
        <div><span class="pal-lbl">Marca</span>${Object.entries(LEVELS).map(([k, l]) => `<button type="button" class="chip${brush.mark === k ? ' on' : ''}" data-brush="mark" data-v="${k}">${k === 'x' ? '✖ Trabajado' : 'Nivel ' + l}</button>`).join('')}</div>
        <p class="hint">Toca o arrastra sobre las semanas. Tocar otra vez la misma marca la quita.</p>
      </div>` : ''}
      ${table()}
      ${canEdit ? '<button class="btn small mt no-print" type="button" data-gadd>+ Grupo</button>' : ''}
      <details class="card per-settings no-print"${settingsOpen ? ' open' : ''}>
        <summary><strong>Datos del macrociclo</strong></summary>
        <div class="row mt">
          <div class="grow"><label for="mc_name">Nombre</label><input id="mc_name" data-f="name" value="${esc(m.name)}" maxlength="60" ${dis}></div>
          <div><label for="mc_area">Área</label><select id="mc_area" data-f="area" ${canMatchTeam(team.id) ? '' : 'disabled'}>${MACRO_AREAS.map(([k, l]) => `<option value="${k}"${m.area === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
          <div><label for="mc_start">Inicio (lunes)</label><input id="mc_start" data-f="start_monday" type="date" value="${esc(m.start_monday)}" ${dis}></div>
          <div><label for="mc_weeks">Semanas</label><input id="mc_weeks" data-f="weeks" type="number" min="1" max="60" value="${m.weeks}" ${dis}></div>
        </div>
        ${canDelete ? '<button class="btn danger mt" type="button" data-del>Borrar macrociclo</button>' : ''}
      </details>
      <div id="thread" class="no-print"></div>`;
    wire();
    mountThread(el.querySelector('#thread'), { teamId: team.id, entity: 'macrociclo', entityId: m.id, title: `Comentarios sobre ${m.name}` });
  }

  const redraw = () => {
    const sc = el.querySelector('[data-scroll]')?.scrollLeft || 0, y = window.scrollY;
    draw();
    const s = el.querySelector('[data-scroll]'); if (s) s.scrollLeft = sc;
    window.scrollTo(0, y);
  };

  function wire() {
    wirePrint(el, () => printView());
    el.querySelector('[data-today]')?.addEventListener('click', () => {
      const s = el.querySelector('[data-scroll]'); const c = s?.querySelector('th.wk-n.now');
      if (s && c) s.scrollTo({ left: Math.max(0, c.offsetLeft - 200 - s.clientWidth / 3), behavior: 'smooth' });
    });
    el.querySelector('.per-settings').addEventListener('toggle', (ev) => { settingsOpen = ev.target.open; });
    if (!canEdit) return;

    el.querySelectorAll('[data-brush]').forEach((b) => b.addEventListener('click', () => {
      brush[b.dataset.brush] = b.dataset.v;
      el.querySelectorAll(`[data-brush="${b.dataset.brush}"]`).forEach((x) => x.classList.toggle('on', x === b));
    }));

    // Pintar fases y marcas (ratón, dedo o lápiz).
    const tbl = el.querySelector('.macro-table');
    let painting = null;
    const apply = (td) => {
      const w = +td.dataset.w;
      const tr = td.closest('tr');
      if (tr.dataset.row === 'phase') {
        const v = brush.phase || null;
        if (ph[w] === v) return;
        ph[w] = v;
        painting.changed = 'phase';
        const p = phaseOf(v);
        td.classList.toggle('filled', !!p);
        td.style.setProperty('--c', p?.color || 'transparent');
      } else if (tr.classList.contains('it-row')) {
        const g = m.groups[+tr.dataset.g], it = g.items[+tr.dataset.i];
        it.marks ||= {};
        const v = lv(brush.mark);
        if (painting.mode == null) painting.mode = it.marks[w] === v ? 'erase' : 'set';
        if (painting.mode === 'erase') delete it.marks[w]; else it.marks[w] = v;
        painting.changed = 'groups';
        td.className = `mark${w === nowWeek ? ' now' : ''}${it.marks[w] != null ? ' lv-' + it.marks[w] : ''}`;
        td.textContent = it.marks[w] != null ? LEVELS[it.marks[w]] : '';
        tr.querySelector('[data-tot]').textContent = itemTotal(it, m.weeks);
        const gr = tbl.querySelector(`tr.grp-row[data-g="${tr.dataset.g}"]`);
        gr.children[w + 1].textContent = groupWeek(g, w) || '';
        gr.lastElementChild.textContent = groupTotal(g, m.weeks);
      }
    };
    // Con el dedo se marca al tocar (sin arrastrar), para poder desplazar la tabla.
    let touch = false;
    tbl.addEventListener('pointerdown', (ev) => {
      touch = ev.pointerType === 'touch';
      const td = ev.target.closest('td[data-w]');
      if (!td || touch) return;
      ev.preventDefault();
      painting = { row: td.closest('tr'), changed: null, mode: null, last: td };
      apply(td);
    });
    tbl.addEventListener('pointermove', (ev) => {
      if (!painting) return;
      const td = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('td[data-w]');
      if (td && td.closest('tr') === painting.row && td !== painting.last) { painting.last = td; apply(td); }
    });
    const end = () => {
      if (!painting) return;
      const ch = painting.changed;
      painting = null;
      if (ch === 'phase') { savePhases(); redraw(); }
      if (ch === 'groups') saveGroups();
    };
    tbl.addEventListener('click', (ev) => {
      const td = ev.target.closest('td[data-w]');
      if (!td || !touch) return;
      painting = { row: td.closest('tr'), changed: null, mode: null, last: td };
      apply(td);
      end();
    });
    window.removeEventListener('pointerup', endPaint);
    endPaint = end;
    window.addEventListener('pointerup', endPaint);

    // Grupos e ítems
    el.querySelectorAll('tr.grp-row').forEach((tr) => {
      const gi = +tr.dataset.g, g = m.groups[gi];
      tr.querySelector('[data-gname]').addEventListener('input', (ev) => { g.name = ev.target.value; saveGroups(); });
      tr.querySelector('[data-gmove]')?.addEventListener('click', () => { [m.groups[gi - 1], m.groups[gi]] = [m.groups[gi], m.groups[gi - 1]]; saveGroups(); redraw(); });
      tr.querySelector('[data-iadd]')?.addEventListener('click', () => {
        (g.items ||= []).push({ name: `Contenido ${g.items.length + 1}`, marks: {} });
        saveGroups(); redraw();
        el.querySelector(`tr.it-row[data-g="${gi}"][data-i="${g.items.length - 1}"] [data-iname]`)?.select();
      });
      tr.querySelector('[data-gdel]')?.addEventListener('click', async () => {
        if (groupTotal(g, m.weeks) && !(await ask(`Se quita «${g.name}» con sus ${g.items.length} contenidos y sus marcas.`, { title: '¿Quitar el grupo?', yes: 'Quitar', danger: true }))) return;
        m.groups.splice(gi, 1); saveGroups(); redraw();
      });
    });
    el.querySelectorAll('tr.it-row').forEach((tr) => {
      const g = m.groups[+tr.dataset.g], ii = +tr.dataset.i, it = g.items[ii];
      tr.querySelector('[data-iname]').addEventListener('input', (ev) => { it.name = ev.target.value; saveGroups(); });
      tr.querySelector('[data-imove]')?.addEventListener('click', () => { [g.items[ii - 1], g.items[ii]] = [g.items[ii], g.items[ii - 1]]; saveGroups(); redraw(); });
      tr.querySelector('[data-idel]')?.addEventListener('click', async () => {
        if (itemTotal(it, m.weeks) && !(await ask(`Se quita «${it.name}» con sus ${itemTotal(it, m.weeks)} semanas marcadas.`, { title: '¿Quitar el contenido?', yes: 'Quitar', danger: true }))) return;
        g.items.splice(ii, 1); saveGroups(); redraw();
      });
    });
    el.querySelector('[data-gadd]')?.addEventListener('click', () => {
      m.groups.push({ name: `Grupo ${m.groups.length + 1}`, items: [{ name: 'Contenido 1', marks: {} }] });
      saveGroups(); redraw();
      el.querySelector(`tr.grp-row[data-g="${m.groups.length - 1}"] [data-gname]`)?.select();
    });

    // Datos
    el.querySelectorAll('[data-f]').forEach((inp) => inp.addEventListener('change', () => {
      const k = inp.dataset.f;
      let v = inp.value;
      if (k === 'name') { v = v.trim(); if (!v) { inp.value = m.name; return; } }
      if (k === 'weeks') { v = Math.max(1, Math.min(60, +v || m.weeks)); inp.value = v; ph = rangesToWeeks(m.phases, v, 'key'); }
      if (k === 'start_monday') {
        const d = new Date(v + 'T00:00:00'); if (Number.isNaN(d.getTime())) { inp.value = m.start_monday; return; }
        d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); v = iso(d);
      }
      m[k] = v;
      saver.set({ [k]: v });
      if (k === 'weeks') savePhases();
      redraw();
    }));
    el.querySelector('[data-del]')?.addEventListener('click', async (ev) => {
      if (!(await ask(`Se borra «${m.name}» con todas sus marcas.`, { title: '¿Borrar el macrociclo?', yes: 'Borrar', danger: true }))) return;
      await busy(ev.currentTarget, async () => {
        saver.dispose?.();
        const { error: e } = await client.from('macrocycles').delete().eq('id', m.id);
        if (e) throw e;
        toast('Macrociclo borrado.');
        location.hash = '#/macrociclo';
      });
    });
  }

  draw();
  if (nowWeek >= 0) requestAnimationFrame(() => el.querySelector('[data-today]')?.click());
}
