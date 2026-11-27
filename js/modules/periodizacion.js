// Periodización del equipo (hoja PERIORIZACIÓN): calendario por semanas con periodo, macro, meso y microciclo
// y filas de contenidos. Fechas y números se calculan solos. Escritorio: tabla con scroll; móvil: vista por mes.
import { esc, toast, busy, ask, permNote } from '../ui.js';
import { sb } from '../supabase.js';
import { S, permission } from '../session.js';
import { autosaver } from '../store.js';
import { MONTHS, DAYS, fmt } from '../lib/dates.js';
import { mountThread } from '../lib/comments.js';
import {
  weeksOf, rangesToWeeks, weeksToRanges, skippedWeeks, microcycleAt, defaultPeriodization, AREAS, LEVELS, DEFAULT_LEGEND
} from '../lib/periodization.js';
import { printButton, wirePrint, printHead } from '../lib/print.js';
import { sheetPeriodizacion } from '../lib/excelbook.js';
import { exportBook } from '../lib/xlsx.js';

const brush = { key: 'temp', macro: '1', meso: '1', content: 'x' };
let endPaint = () => {};
let settingsOpen = false;
/** Marca de contenido: '✖' o nivel 1–3 (número). */
const lv = (v) => (v === 'x' ? 'x' : +v);
const SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

export async function render(el, ctx) {
  if (!S.team) { el.innerHTML = '<div class="card empty"><p>Elige un equipo en la cabecera.</p></div>'; return; }
  const team = S.team;
  const season = S.seasons.find((s) => s.id === team.season_id) || S.season;
  const client = sb();
  const perm = permission('edit');
  const canEdit = perm.ok;
  const { data: row, error } = await client.from('periodizations').select('*').eq('team_id', team.id).eq('season_id', team.season_id).maybeSingle();
  if (error) throw error;

  const head = `
    <div class="page-head">
      <div><h1>🗓 Periodización</h1><p>${esc(team.name)} · temporada ${esc(season?.name || '')}</p></div>
      <div class="actions no-print"><a class="btn" href="#/planificacion">← Planificación</a></div>
    </div>`;

  if (!row) {
    el.innerHTML = `${head}${permNote(perm)}
      <div class="card empty"><div class="big">🗓</div><h2>Todavía no hay periodización</h2>
        <p>Se crea con el calendario de la temporada ya calculado: pretemporada, temporada y vacaciones de Navidad y Semana Santa, dos macrociclos, cuatro mesociclos y microciclos numerados. Después la ajustas a tu equipo.</p>
        ${canEdit ? '<button class="btn primary" type="button" data-create>Crear periodización</button>' : ''}</div>`;
    el.querySelector('[data-create]')?.addEventListener('click', (ev) => busy(ev.currentTarget, async () => {
      const { error: e } = await client.from('periodizations').insert({ team_id: team.id, season_id: team.season_id, ...defaultPeriodization(season) });
      if (e) throw e;
      toast('Periodización creada.');
      render(el, ctx);
    }));
    return;
  }

  const p = row;
  p.legend = p.legend?.length ? p.legend : structuredClone(DEFAULT_LEGEND);
  p.options = p.options || {};
  p.contents = p.contents || [];
  const saver = canEdit ? autosaver({ table: 'periodizations', id: p.id, updatedAt: p.updated_at, onSaved: (r) => { p.updated_at = r.updated_at; } }) : null;
  let weeks = weeksOf(p);
  const today = new Date();
  const nowWeek = microcycleAt(p, today)?.week ?? -1;

  const [{ data: ses }, { data: mat }] = await Promise.all([
    client.from('sessions').select('id, date, time').eq('team_id', team.id).gte('date', p.start_monday).lte('date', p.end_date),
    client.from('matches').select('id, date, rival, is_home').eq('team_id', team.id).gte('date', p.start_monday).lte('date', p.end_date)
  ]);
  const events = {};
  for (const s of ses || []) (events[s.date] ||= []).push({ kind: 'ses', href: `#/sesiones/${s.id}`, title: `Sesión${s.time ? ' ' + s.time.slice(0, 5) : ''}` });
  for (const m of mat || []) (events[m.date] ||= []).push({ kind: 'mat', href: `#/partidos/${m.id}/prepartido`, title: `Partido ${m.is_home ? 'vs' : 'en'} ${m.rival || ''}` });

  const month = ctx.query.get('mes') || (nowWeek >= 0 ? iso(today).slice(0, 7) : weeks[0]?.iso.slice(0, 7));

  // Valores por semana (se pintan y se vuelven a convertir en tramos al guardar).
  let per = rangesToWeeks(p.periods, weeks.length, 'key');
  let mac = rangesToWeeks(p.macro, weeks.length, 'label');
  let mes = rangesToWeeks(p.meso, weeks.length, 'label');
  const legendOf = (k) => p.legend.find((l) => l.key === k);
  const micro = (w) => microcycleAt(p, addDays(weeks[w].monday, 1));

  const saveStructure = () => {
    p.periods = weeksToRanges(per, 'key');
    p.macro = weeksToRanges(mac, 'label');
    p.meso = weeksToRanges(mes, 'label');
    p.micro_skip = skippedWeeks(p);
    saver?.set({ periods: p.periods, macro: p.macro, meso: p.meso, micro_skip: p.micro_skip });
  };
  const saveContents = () => saver?.set({ contents: structuredClone(p.contents) });

  // ---------------------------------------------------------------- pintar
  function cellPer(w) { const l = legendOf(per[w]); return l ? `style="--c:${esc(l.color)}" title="${esc(l.label)}"` : ''; }
  function nums(arr) { return Math.max(0, ...arr.filter(Boolean).map(Number).filter((n) => !Number.isNaN(n))); }

  function tableHTML() {
    const groups = [];
    for (const w of weeks) {
      const m = w.monday.getMonth();
      const last = groups[groups.length - 1];
      if (last && last.m === m) last.n++; else groups.push({ m, y: w.monday.getFullYear(), n: 1 });
    }
    const first = (arr, w) => w === 0 || arr[w] !== arr[w - 1];
    return `
      <div class="per-scroll" data-scroll>
        <table class="per-table">
          <thead>
            <tr><th class="lbl" scope="col">Mes</th>${groups.map((g) => `<th colspan="${g.n}" class="month">${MONTHS[g.m]} ${g.y}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${DAYS.map((d, di) => `<tr class="day-row"><th class="lbl" scope="row">${d}</th>${weeks.map((w) => {
              const date = addDays(w.monday, di);
              const ds = iso(date);
              const ev = events[ds] || [];
              const out = ds > p.end_date;
              return `<td class="${w.i === nowWeek ? 'now' : ''}${ds === iso(today) ? ' today' : ''}${out ? ' out' : ''}">${out ? '' : date.getDate()}${ev.map((e) => `<a class="dot ${e.kind}" href="${e.href}" title="${esc(e.title)}"></a>`).join('')}</td>`;
            }).join('')}</tr>`).join('')}
            <tr class="st-row" data-row="key"><th class="lbl" scope="row">Periodo</th>${weeks.map((w) => `<td data-w="${w.i}" class="paint${w.i === nowWeek ? ' now' : ''}${per[w.i] ? ' filled' : ''}" ${cellPer(w.i)}>${first(per, w.i) && legendOf(per[w.i]) ? `<span>${esc(legendOf(per[w.i]).label)}</span>` : ''}</td>`).join('')}</tr>
            <tr class="st-row cyc" data-row="macro"><th class="lbl" scope="row">Macrociclo</th>${weeks.map((w) => `<td data-w="${w.i}" class="paint${w.i === nowWeek ? ' now' : ''}${mac[w.i] ? ' filled odd' + (Number(mac[w.i]) % 2) : ''}">${first(mac, w.i) && mac[w.i] ? esc(mac[w.i]) : ''}</td>`).join('')}</tr>
            <tr class="st-row cyc" data-row="meso"><th class="lbl" scope="row">Mesociclo</th>${weeks.map((w) => `<td data-w="${w.i}" class="paint${w.i === nowWeek ? ' now' : ''}${mes[w.i] ? ' filled odd' + (Number(mes[w.i]) % 2) : ''}">${first(mes, w.i) && mes[w.i] ? esc(mes[w.i]) : ''}</td>`).join('')}</tr>
            <tr class="st-row micro"><th class="lbl" scope="row">Microciclo</th>${weeks.map((w) => { const m = micro(w.i); return `<td class="${w.i === nowWeek ? 'now' : ''}">${m?.number ?? '—'}</td>`; }).join('')}</tr>
            <tr class="sep"><th class="lbl" scope="row">Contenidos</th><td colspan="${weeks.length}"></td></tr>
            ${p.contents.map((c, ci) => `<tr class="ct-row" data-c="${ci}">
              <th class="lbl" scope="row">
                <input data-cname value="${esc(c.name)}" placeholder="Contenido ${ci + 1}" maxlength="60" aria-label="Nombre del contenido ${ci + 1}" ${canEdit ? '' : 'disabled'}>
                <select data-carea aria-label="Área del contenido ${ci + 1}" ${canEdit ? '' : 'disabled'}><option value="">Área</option>${AREAS.map(([k, l]) => `<option value="${k}"${c.area === k ? ' selected' : ''}>${l}</option>`).join('')}</select>
                ${canEdit ? `<button class="icon-btn small" type="button" data-cdel aria-label="Quitar el contenido ${ci + 1}">✕</button>` : ''}
              </th>
              ${weeks.map((w) => { const v = c.marks?.[w.i]; return `<td data-w="${w.i}" class="mark${w.i === nowWeek ? ' now' : ''}${v != null ? ' lv-' + v : ''}">${v != null ? LEVELS[v] : ''}</td>`; }).join('')}
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function monthHTML() {
    const months = [...new Set(weeks.flatMap((w) => [0, 6].map((d) => iso(addDays(w.monday, d)).slice(0, 7))))].filter((m) => m >= p.start_monday.slice(0, 7) && m <= p.end_date.slice(0, 7));
    const ws = weeks.filter((w) => iso(w.monday).slice(0, 7) === month || iso(addDays(w.monday, 6)).slice(0, 7) === month);
    return `
      <nav class="month-chips" aria-label="Meses">${months.map((m) => `<a class="chip${m === month ? ' on' : ''}" href="#/periodizacion?mes=${m}">${MONTHS[+m.slice(5) - 1].slice(0, 3)}</a>`).join('')}</nav>
      ${ws.map((w) => {
        const m = micro(w.i);
        const l = legendOf(per[w.i]);
        const named = p.contents.map((c, ci) => ({ c, ci })).filter((x) => x.c.name);
        return `<article class="card wk${w.i === nowWeek ? ' now' : ''}" data-week="${w.i}">
          <header><strong>${fmt(w.monday)} – ${fmt(addDays(w.monday, 6))}</strong>${l ? ` <span class="pill" style="--c:${esc(l.color)}">${esc(l.label)}</span>` : ''}</header>
          <p class="muted">Macro ${esc(mac[w.i] || '—')} · Meso ${esc(mes[w.i] || '—')} · <strong>Microciclo ${m?.number ?? '—'}</strong></p>
          <div class="wk-days">${[0, 1, 2, 3, 4, 5, 6].map((d) => { const date = addDays(w.monday, d); const ds = iso(date); const ev = events[ds] || [];
            return `<div class="${ds === iso(today) ? 'today' : ''}"><small>${SHORT[d]}</small><span>${date.getDate()}</span>${ev.map((e) => `<a class="dot ${e.kind}" href="${e.href}" aria-label="${esc(e.title)}"></a>`).join('')}</div>`; }).join('')}</div>
          ${named.length ? `<ul class="wk-ct">${named.map(({ c, ci }) => { const v = c.marks?.[w.i]; return `<li><span>${esc(c.name)}</span>
            <button type="button" class="lvl${v != null ? ' lv-' + v : ''}" data-cycle="${ci}" ${canEdit ? '' : 'disabled'} aria-label="${esc(c.name)}: ${v != null ? 'nivel ' + LEVELS[v] : 'sin marca'}">${v != null ? LEVELS[v] : '·'}</button></li>`; }).join('')}</ul>` : ''}
        </article>`;
      }).join('') || '<p class="muted">Ese mes queda fuera de la periodización.</p>'}`;
  }

  function paletteHTML() {
    if (!canEdit) return '';
    const maxMac = nums(mac), maxMes = nums(mes);
    const chip = (group, value, label, style = '') => `<button type="button" class="chip${brush[group] === value ? ' on' : ''}" data-brush="${group}" data-v="${esc(value)}" ${style}>${label}</button>`;
    return `
      <div class="palette no-print" aria-label="Pinceles">
        <div><span class="pal-lbl">Periodo</span>${p.legend.map((l) => chip('key', l.key, `<i style="background:${esc(l.color)}"></i>${esc(l.label)}`)).join('')}${chip('key', '', 'Borrar')}</div>
        <div><span class="pal-lbl">Macro</span>${Array.from({ length: maxMac + 1 }, (_, i) => chip('macro', String(i + 1), String(i + 1))).join('')}${chip('macro', '', 'Borrar')}</div>
        <div><span class="pal-lbl">Meso</span>${Array.from({ length: maxMes + 1 }, (_, i) => chip('meso', String(i + 1), String(i + 1))).join('')}${chip('meso', '', 'Borrar')}</div>
        <div><span class="pal-lbl">Contenidos</span>${Object.entries(LEVELS).map(([k, l]) => chip('content', k, k === 'x' ? '✖ Marca' : `Nivel ${l}`)).join('')}</div>
        <p class="hint">Elige un pincel y toca o arrastra sobre las semanas. En los contenidos, tocar otra vez la misma marca la quita.</p>
      </div>`;
  }

  function settingsHTML() {
    const dis = canEdit ? '' : 'disabled';
    return `
      <details class="card per-settings no-print"${settingsOpen ? ' open' : ''}>
        <summary><strong>Leyenda y opciones</strong></summary>
        <div class="row mt">
          <div><label for="pz_start">Lunes de inicio</label><input id="pz_start" type="date" data-opt="start_monday" value="${esc(p.start_monday)}" ${dis}></div>
          <div><label for="pz_end">Fin</label><input id="pz_end" type="date" data-opt="end_date" value="${esc(p.end_date)}" ${dis}></div>
          <div><label for="pz_micro">Primer microciclo</label><input id="pz_micro" type="number" min="0" max="99" data-opt="micro_start" value="${esc(p.micro_start ?? 1)}" ${dis}></div>
        </div>
        <label class="check"><input type="checkbox" data-skip${p.options.skip_holidays ? ' checked' : ''} ${dis}> No contar como microciclo las semanas de vacaciones</label>
        <h3>Leyenda de periodos</h3>
        <ul class="legend-list">${p.legend.map((l, i) => `<li data-l="${i}">
          <input type="color" data-lcolor value="${esc(l.color)}" aria-label="Color de ${esc(l.label)}" ${dis}>
          <input data-llabel value="${esc(l.label)}" maxlength="30" aria-label="Nombre del periodo" ${dis}>
          <label class="check"><input type="checkbox" data-lhol${l.holiday ? ' checked' : ''} ${dis}> Vacaciones</label>
          ${canEdit && p.legend.length > 1 ? '<button class="icon-btn small" type="button" data-ldel aria-label="Quitar este periodo">✕</button>' : ''}
        </li>`).join('')}</ul>
        ${canEdit ? '<button class="btn small" type="button" data-ladd>+ Periodo</button>' : ''}
      </details>`;
  }


  // ---------------------------------------------------------------- impresión (apaisado, ajustada al ancho)
  function printView() {
    const groups = [];
    for (const w of weeks) { const last = groups[groups.length - 1]; const mm = w.monday.getMonth(); if (last && last.m === mm) last.n++; else groups.push({ m: mm, y: w.monday.getFullYear(), n: 1 }); }
    const first = (arr, w) => w === 0 || arr[w] !== arr[w - 1];
    const span = (arr, w) => { let n = 1; while (w + n < arr.length && arr[w + n] === arr[w]) n++; return n; };
    const runs = (arr, cell) => { const out = []; for (let w = 0; w < weeks.length; w++) { if (!first(arr, w)) continue; const n = span(arr, w); out.push(cell(w, n)); } return out.join(''); };
    const count = (w, kind) => { let n = 0; for (let d = 0; d < 7; d++) n += (events[iso(addDays(w.monday, d))] || []).filter((e) => e.kind === kind).length; return n; };
    const named = p.contents.filter((c) => c.name);
    const html = `
      ${printHead({ title: 'Periodización', team, sub: `Temporada ${esc(season?.name || '')} · ${esc(fmt(weeks[0].monday))} – ${esc(fmt(new Date(p.end_date + 'T00:00:00')))} · ${weeks.length} semanas` })}
      <table class="pr-t pr-wide">
        <colgroup><col class="lbl" style="width:30mm">${weeks.map(() => '<col>').join('')}</colgroup>
        <thead>
          <tr><th class="lbl">Mes</th>${groups.map((g) => `<th colspan="${g.n}">${g.n > 2 ? MONTHS[g.m] : MONTHS[g.m].slice(0, 3)}${g.n > 3 ? ' ' + g.y : ''}</th>`).join('')}</tr>
          <tr><th class="lbl">Lunes</th>${weeks.map((w) => `<th>${w.monday.getDate()}</th>`).join('')}</tr>
        </thead>
        <tbody>
          <tr><th class="lbl">Periodo</th>${runs(per, (w, n) => { const l = legendOf(per[w]); return `<td colspan="${n}" class="fill" style="${l ? `background:${esc(l.color)}` : ''}">${l && n > 1 ? esc(l.label) : ''}</td>`; })}</tr>
          <tr><th class="lbl">Macrociclo</th>${runs(mac, (w, n) => `<td colspan="${n}" class="fill" style="background:${mac[w] ? (Number(mac[w]) % 2 ? '#dfe5ea' : '#c9d1d9') : 'transparent'}">${esc(mac[w] || '')}</td>`)}</tr>
          <tr><th class="lbl">Mesociclo</th>${runs(mes, (w, n) => `<td colspan="${n}" class="fill" style="background:${mes[w] ? (Number(mes[w]) % 2 ? '#eef1f4' : '#dfe5ea') : 'transparent'}">${esc(mes[w] || '')}</td>`)}</tr>
          <tr><th class="lbl">Microciclo</th>${weeks.map((w) => `<td>${micro(w.i)?.number ?? '—'}</td>`).join('')}</tr>
          <tr><th class="lbl">Sesiones</th>${weeks.map((w) => `<td>${count(w, 'ses') || ''}</td>`).join('')}</tr>
          <tr><th class="lbl">Partidos</th>${weeks.map((w) => `<td>${count(w, 'mat') ? '●'.repeat(count(w, 'mat')) : ''}</td>`).join('')}</tr>
          ${named.length ? `<tr class="grp"><th class="lbl">Contenidos</th><td colspan="${weeks.length}"></td></tr>` : ''}
          ${named.map((c) => `<tr><th class="lbl">${esc(c.name)}${c.area ? ` <small class="pr-muted">${esc(AREAS.find(([k]) => k === c.area)?.[1] || '')}</small>` : ''}</th>${weeks.map((w) => { const v = c.marks?.[w.i]; return `<td class="${v != null ? 'lv-' + v : ''}">${v != null ? LEVELS[v] : ''}</td>`; }).join('')}</tr>`).join('')}
        </tbody>
      </table>
      <div class="pr-legend">${p.legend.map((l) => `<span><i style="background:${esc(l.color)}"></i>${esc(l.label)}</span>`).join('')}<span>● Partido</span><span>Contenidos: ✖ marca · 1–3 nivel</span></div>`;
    return { title: `Periodización ${team.name} ${season?.name || ''}`, html, landscape: true };
  }

  function draw() {
    weeks = weeksOf(p);
    const mc = microcycleAt(p, today);
    el.innerHTML = `${head}${permNote(perm)}
      <div class="per-top no-print">
        <p>${mc ? `Hoy: <strong>${mc.number != null ? `microciclo ${mc.number}` : 'semana sin microciclo'}</strong>${mc.period ? ` · ${esc(mc.period)}` : ''}` : 'Hoy está fuera de la periodización.'}</p>
        <div class="actions">${nowWeek >= 0 ? '<button class="btn" type="button" data-today>Ir a hoy</button>' : ''}<button class="btn" type="button" data-xlsx>Excel</button>${printButton()}</div>
      </div>
      <div class="legend-inline">${p.legend.map((l) => `<span><i style="background:${esc(l.color)}"></i>${esc(l.label)}${l.holiday && p.options.skip_holidays ? ' (sin microciclo)' : ''}</span>`).join('')}<span><i class="dot ses"></i>Sesión</span><span><i class="dot mat"></i>Partido</span></div>
      ${paletteHTML()}
      <div class="per-desktop">${tableHTML()}
        ${canEdit ? '<button class="btn small mt no-print" type="button" data-cadd>+ Contenido</button>' : ''}</div>
      <div class="per-mobile">${monthHTML()}</div>
      ${settingsHTML()}
      <div id="thread" class="no-print"></div>`;
    wire();
    mountThread(el.querySelector('#thread'), { teamId: team.id, entity: 'periodizacion', title: 'Comentarios sobre la periodización' });
  }

  const redraw = () => {
    const sc = el.querySelector('[data-scroll]')?.scrollLeft || 0;
    const y = window.scrollY;
    draw();
    const s = el.querySelector('[data-scroll]');
    if (s) s.scrollLeft = sc;
    window.scrollTo(0, y);
  };

  // ---------------------------------------------------------------- eventos
  function wire() {
    wirePrint(el, () => printView());
    el.querySelector('[data-xlsx]').addEventListener('click', (ev) => busy(ev.currentTarget, () => exportBook(`Periodización ${team.name} ${season?.name || ''}`, [sheetPeriodizacion(p)])));
    el.querySelector('.per-settings').addEventListener('toggle', (ev) => { settingsOpen = ev.target.open; });
    el.querySelector('[data-today]')?.addEventListener('click', () => {
      const s = el.querySelector('[data-scroll]');
      const cell = s?.querySelector('td.now');
      if (s && cell) s.scrollTo({ left: Math.max(0, cell.offsetLeft - 160 - s.clientWidth / 3), behavior: 'smooth' });
      el.querySelector('.wk.now')?.scrollIntoView({ block: 'center' });
    });
    if (!canEdit) return;

    el.querySelectorAll('[data-brush]').forEach((b) => b.addEventListener('click', () => {
      brush[b.dataset.brush] = b.dataset.v;
      el.querySelectorAll(`[data-brush="${b.dataset.brush}"]`).forEach((x) => x.classList.toggle('on', x === b));
    }));

    // Pintar tramos y marcas arrastrando (ratón, dedo o lápiz).
    const table = el.querySelector('.per-table');
    let painting = null;
    const apply = (td) => {
      const w = +td.dataset.w;
      const tr = td.closest('tr');
      if (tr.dataset.row) {
        const arr = { key: per, macro: mac, meso: mes }[tr.dataset.row];
        const v = brush[tr.dataset.row] || null;
        if (arr[w] === v) return;
        arr[w] = v;
        painting.changed = 'structure';
        td.classList.toggle('filled', !!v);
        if (tr.dataset.row === 'key') { const l = legendOf(v); td.style.setProperty('--c', l?.color || 'transparent'); }
        else td.textContent = v || '';
      } else if (tr.dataset.c != null) {
        const c = p.contents[+tr.dataset.c];
        c.marks ||= {};
        const v = lv(brush.content);
        if (painting.mode == null) painting.mode = c.marks[w] === v ? 'erase' : 'set';
        if (painting.mode === 'erase') delete c.marks[w]; else c.marks[w] = v;
        painting.changed ||= 'contents';
        td.className = `mark${w === nowWeek ? ' now' : ''}${c.marks[w] != null ? ' lv-' + c.marks[w] : ''}`;
        td.textContent = c.marks[w] != null ? LEVELS[c.marks[w]] : '';
      }
    };
    // Con el dedo se marca al tocar (sin arrastrar), para poder desplazar la tabla.
    let touch = false;
    table.addEventListener('pointerdown', (ev) => {
      touch = ev.pointerType === 'touch';
      const td = ev.target.closest('td[data-w]');
      if (!td || touch) return;
      ev.preventDefault();
      painting = { row: td.closest('tr'), changed: null, mode: null, last: td };
      apply(td);
    });
    table.addEventListener('pointermove', (ev) => {
      if (!painting) return;
      const td = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('td[data-w]');
      if (td && td.closest('tr') === painting.row && td !== painting.last) { painting.last = td; apply(td); }
    });
    const end = () => {
      if (!painting) return;
      const ch = painting.changed;
      painting = null;
      if (ch === 'structure') { saveStructure(); redraw(); }
      if (ch === 'contents') saveContents();
    };
    table.addEventListener('click', (ev) => {
      const td = ev.target.closest('td[data-w]');
      if (!td || !touch) return;
      painting = { row: td.closest('tr'), changed: null, mode: null, last: td };
      apply(td);
      end();
    });
    window.removeEventListener('pointerup', endPaint);
    endPaint = end;
    window.addEventListener('pointerup', endPaint);

    // Contenidos
    el.querySelectorAll('tr.ct-row').forEach((tr) => {
      const c = p.contents[+tr.dataset.c];
      tr.querySelector('[data-cname]').addEventListener('input', (ev) => { c.name = ev.target.value; saveContents(); });
      tr.querySelector('[data-carea]').addEventListener('change', (ev) => { c.area = ev.target.value; saveContents(); });
      tr.querySelector('[data-cdel]')?.addEventListener('click', async () => {
        if (Object.keys(c.marks || {}).length && !(await ask(`Se quita «${c.name || 'este contenido'}» con sus marcas.`, { title: '¿Quitar el contenido?', yes: 'Quitar', danger: true }))) return;
        p.contents.splice(+tr.dataset.c, 1);
        saveContents(); redraw();
      });
    });
    el.querySelector('[data-cadd]')?.addEventListener('click', () => {
      p.contents.push({ name: '', area: '', marks: {} });
      saveContents(); redraw();
      el.querySelector('tr.ct-row:last-of-type [data-cname]')?.focus();
    });
    el.querySelectorAll('[data-cycle]').forEach((b) => b.addEventListener('click', () => {
      const c = p.contents[+b.dataset.cycle];
      const w = +b.closest('[data-week]').dataset.week;
      const order = [undefined, 'x', 1, 2, 3];
      c.marks ||= {};
      const next = order[(order.indexOf(c.marks[w]) + 1) % order.length];
      if (next === undefined) delete c.marks[w]; else c.marks[w] = next;
      b.className = `lvl${next !== undefined ? ' lv-' + next : ''}`;
      b.textContent = next !== undefined ? LEVELS[next] : '·';
      saveContents();
    }));

    // Leyenda y opciones
    el.querySelectorAll('[data-opt]').forEach((inp) => inp.addEventListener('change', () => {
      const k = inp.dataset.opt;
      let v = inp.value;
      if (k === 'micro_start') v = +v || 0;
      if (k === 'start_monday') {
        const d = new Date(v + 'T00:00:00');
        if (Number.isNaN(d.getTime())) return;
        d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
        v = iso(d);
      }
      if ((k === 'end_date' && v <= p.start_monday) || (k === 'start_monday' && v >= p.end_date)) { toast('El fin debe ser posterior al inicio.', 'err'); inp.value = p[k]; return; }
      p[k] = v;
      const n = weeksOf(p).length;
      per = rangesToWeeks(p.periods, n, 'key'); mac = rangesToWeeks(p.macro, n, 'label'); mes = rangesToWeeks(p.meso, n, 'label');
      saver.set({ [k]: v });
      saveStructure(); redraw();
      if (k === 'start_monday') toast(`Empieza el lunes ${fmt(new Date(v + 'T00:00:00'))}. Los tramos se mantienen por número de semana.`);
    }));
    el.querySelector('[data-skip]')?.addEventListener('change', (ev) => {
      p.options = { ...p.options, skip_holidays: ev.target.checked };
      saver.set({ options: p.options });
      saveStructure(); redraw();
    });
    el.querySelectorAll('[data-l]').forEach((li) => {
      const l = p.legend[+li.dataset.l];
      li.querySelector('[data-lcolor]').addEventListener('change', (ev) => { l.color = ev.target.value; saver.set({ legend: p.legend }); redraw(); });
      li.querySelector('[data-llabel]').addEventListener('change', (ev) => { l.label = ev.target.value.trim() || l.label; saver.set({ legend: p.legend }); redraw(); });
      li.querySelector('[data-lhol]').addEventListener('change', (ev) => { l.holiday = ev.target.checked; saver.set({ legend: p.legend }); saveStructure(); redraw(); });
      li.querySelector('[data-ldel]')?.addEventListener('click', async () => {
        if (per.includes(l.key) && !(await ask(`Las semanas marcadas como «${l.label}» se quedan sin periodo.`, { title: '¿Quitar este periodo?', yes: 'Quitar', danger: true }))) return;
        p.legend.splice(+li.dataset.l, 1);
        per = per.map((k) => (k === l.key ? null : k));
        saver.set({ legend: p.legend }); saveStructure(); redraw();
      });
    });
    el.querySelector('[data-ladd]')?.addEventListener('click', () => {
      const key = 'p' + Date.now().toString(36);
      p.legend.push({ key, label: 'Nuevo periodo', color: '#a855f7' });
      brush.key = key;
      settingsOpen = true;
      saver.set({ legend: p.legend }); redraw();
    });
  }

  draw();
  if (nowWeek >= 0) requestAnimationFrame(() => el.querySelector('[data-today]')?.click());
}
