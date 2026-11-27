// Estadísticas de temporada (#/estadisticas): acumulado por jugador, vista «como el Excel» por jornadas
// y resumen del equipo con gráficos SVG. Filtros por jornadas o por fechas.
import { esc, busy } from '../ui.js';
import { sb } from '../supabase.js';
import { S } from '../session.js';
import { fmt } from '../lib/dates.js';
import { mountThread } from '../lib/comments.js';
import { exportSheet } from '../lib/xlsx.js';
import { sides, score } from '../lib/matches.js';
import { ORIGINS, ORIGIN_SHORT } from '../lib/post.js';
import { played, inRange, perMatch, playerTotals, teamSummary } from '../lib/seasonstats.js';
import { bars, donut, line, CAT } from '../lib/charts.js';
import { printButton, wirePrint, printHead, bar, chunk } from '../lib/print.js';

const VIEWS = [['jugadores', 'Jugadores'], ['excel', 'Por jornadas'], ['equipo', 'Equipo']];
const COLS = [
  ['n', 'Nº', (t) => t.p.number ?? 999], ['name', 'Jugador', (t) => t.p.name],
  ['called', 'Conv.', (t) => t.called], ['starter', 'Tit.', (t) => t.starter], ['minutes', 'Min', (t) => t.minutes], ['pct', '% min', (t) => t.pct],
  ...ORIGINS.map((o) => [`gf_${o}`, `G ${ORIGIN_SHORT[o]}`, (t) => t.gf[o]]), ['goals', 'Goles', (t) => t.goals], ['assists', 'Asis', (t) => t.assists],
  ['against', 'GC campo', (t) => t.against], ['yellow', 'TA', (t) => t.yellow], ['red', 'TR', (t) => t.red],
  ['att', '% entreno', (t) => t.attPct ?? -1], ['avg', 'Nota', (t) => t.avg ?? -1]
];

export async function render(el, ctx) {
  if (!S.team) { el.innerHTML = '<div class="card empty"><p>Elige un equipo en la cabecera.</p></div>'; return; }
  const team = S.team;
  const client = sb();
  const q = ctx.query;
  const view = VIEWS.find(([k]) => k === q.get('vista'))?.[0] || 'jugadores';
  const f = { j1: q.get('j1') || '', j2: q.get('j2') || '', d1: q.get('d1') || '', d2: q.get('d2') || '' };
  const sort = q.get('orden') || 'minutes';
  const dir = q.get('dir') === 'asc' ? 1 : -1;
  const total = (team.periods || 2) * (team.period_minutes || 35);
  const link = (patch) => {
    const p = new URLSearchParams({ vista: view, ...f, orden: sort, dir: dir === 1 ? 'asc' : '', ...patch });
    for (const [k, v] of [...p]) if (!v || (k === 'vista' && v === 'jugadores') || (k === 'orden' && v === 'minutes')) p.delete(k);
    return `#/estadisticas${p.toString() ? '?' + p : ''}`;
  };

  const [mt, pl, se] = await Promise.all([
    client.from('matches').select('id, matchday, date, rival, is_home, goals_for, goals_against, squad, events, player_stats, post, report_done').eq('team_id', team.id).eq('season_id', team.season_id).order('date', { nullsFirst: false }),
    client.from('players').select('id, number, name, position, status, active').eq('team_id', team.id).order('number', { nullsFirst: false }),
    client.from('sessions').select('id, date, attendance').eq('team_id', team.id)
  ]);
  for (const r of [mt, pl, se]) if (r.error) throw r.error;
  const allMatches = mt.data || [];
  const matches = allMatches.filter((m) => inRange(m, f));
  const sessions = (se.data || []).filter((s) => (!f.d1 || s.date >= f.d1) && (!f.d2 || s.date <= f.d2) && (!f.j1 && !f.j2 ? true : rangeDates(matches, s.date)));
  const players = pl.data || [];
  const pm = perMatch(players, matches.filter(played), total);
  const totals = playerTotals(players, matches, sessions, total, pm).filter((t) => t.p.active || t.called);
  const col = COLS.find(([k]) => k === sort) || COLS[4];
  totals.sort((a, b) => { const x = col[2](a), y = col[2](b); return (typeof x === 'string' ? x.localeCompare(y, 'es') : x - y) * (col[0] === 'name' || col[0] === 'n' ? -dir : dir); });
  const games = matches.filter(played).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const filtered = Object.values(f).some(Boolean);

  el.innerHTML = `
    <div class="page-head">
      <div><h1>📊 Estadísticas</h1><p>${esc(team.name)} · ${esc(S.season?.name || '')} · ${games.length} ${games.length === 1 ? 'partido jugado' : 'partidos jugados'}${filtered ? ' (filtrado)' : ''}</p></div>
      <div class="actions no-print"><button class="btn" type="button" data-excel${totals.length ? '' : ' disabled'}>Excel</button>${printButton()}</div>
    </div>
    <nav class="tabs page-tabs no-print" aria-label="Vistas">${VIEWS.map(([k, l]) => `<a class="tab" href="${link({ vista: k })}" aria-current="${k === view ? 'page' : 'false'}">${l}</a>`).join('')}</nav>
    <form class="stat-filters no-print" data-filters>
      <div><label for="sf_j1">Jornada desde</label><input id="sf_j1" name="j1" type="number" min="0" max="99" value="${esc(f.j1)}"></div>
      <div><label for="sf_j2">hasta</label><input id="sf_j2" name="j2" type="number" min="0" max="99" value="${esc(f.j2)}"></div>
      <div><label for="sf_d1">Fecha desde</label><input id="sf_d1" name="d1" type="date" value="${esc(f.d1)}"></div>
      <div><label for="sf_d2">hasta</label><input id="sf_d2" name="d2" type="date" value="${esc(f.d2)}"></div>
      <div class="sf-btns"><button class="btn small primary" type="submit">Filtrar</button>${filtered ? `<a class="btn small" href="${link({ j1: '', j2: '', d1: '', d2: '' })}">Toda la temporada</a>` : ''}</div>
    </form>
    <div id="statBody"></div>
    <div id="thread" class="no-print"></div>`;
  const body = el.querySelector('#statBody');

  if (!games.length) body.innerHTML = `<div class="card empty"><div class="big">📊</div><h2>Todavía no hay partidos jugados${filtered ? ' en ese periodo' : ''}</h2><p>Las estadísticas salen de las actas y los informes de los <a href="#/partidos">partidos</a> y de la asistencia de las <a href="#/sesiones">sesiones</a>.</p></div>`;
  else if (view === 'jugadores') body.innerHTML = playersView();
  else if (view === 'excel') body.innerHTML = excelView();
  else body.innerHTML = teamView();

  // ---------------------------------------------------------------- vistas
  function playersView() {
    const head = COLS.map(([k, l]) => `<th scope="col"${k === 'name' ? ' class="lbl"' : ''}><a href="${link({ orden: k, dir: sort === k && dir === -1 ? 'asc' : '' })}" aria-sort="${sort === k ? (dir === 1 ? 'ascending' : 'descending') : 'none'}">${l}${sort === k ? (dir === 1 ? ' ▲' : ' ▼') : ''}</a></th>`).join('');
    const sum = (fn) => totals.reduce((s, t) => s + fn(t), 0);
    return `
      <div class="per-scroll"><table class="stat-table">
        <thead><tr>${head}</tr></thead>
        <tbody>${totals.map((t) => `<tr>
          <td>${t.p.number ?? ''}</td><th class="lbl" scope="row"><a href="#/jugador/${esc(t.p.id)}">${esc(t.p.name)}</a></th>
          <td>${t.called}</td><td>${t.starter}</td><td><b>${t.minutes}</b></td><td><span class="pctbar" style="--p:${t.pct}%">${t.pct}%</span></td>
          ${ORIGINS.map((o) => `<td>${t.gf[o] || ''}</td>`).join('')}<td><b>${t.goals || ''}</b></td><td>${t.assists || ''}</td>
          <td>${t.against || ''}</td><td>${t.yellow || ''}</td><td>${t.red || ''}</td>
          <td title="D ${t.att.D} · L ${t.att.L} · A ${t.att.A}">${t.attPct != null ? `${t.attPct}% <small>${t.att.D}/${t.att.L}/${t.att.A}</small>` : '—'}</td>
          <td>${t.avg != null ? t.avg.toFixed(1) : '—'}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td></td><th class="lbl" scope="row">Equipo</th><td></td><td></td><td></td><td></td>
          ${ORIGINS.map((o) => `<td>${sum((t) => t.gf[o])}</td>`).join('')}<td>${sum((t) => t.goals)}</td><td>${sum((t) => t.assists)}</td><td></td><td>${sum((t) => t.yellow)}</td><td>${sum((t) => t.red)}</td><td></td><td></td></tr></tfoot>
      </table></div>
      <p class="hint">% min: minutos jugados sobre los posibles (${games.length} × ${total}). GC campo: goles en contra estando en el campo. % entreno: disponibles / sesiones registradas (D/L/A). Nota: media de la evaluación individual del postpartido. Toca un encabezado para ordenar.</p>`;
  }

  function excelView() {
    const sub = [['D', (r) => (r.available ? 'D' : 'No')], ['C', (r) => (r.called ? 'C' : 'No')], ['T', (r) => (r.called ? (r.starter ? 'T' : 'S') : '')], ['Min', (r) => (r.called ? r.minutes : '')],
      ...ORIGINS.map((o) => [`GF ${ORIGIN_SHORT[o]}`, (r) => r.gf[o] || '']), ['As', (r) => r.assists || ''],
      ...ORIGINS.map((o) => [`GC ${ORIGIN_SHORT[o]}`, (r) => r.gc[o] || '']), ['TA', (r) => r.yellow || ''], ['TR', (r) => r.red || '']];
    const list = totals.slice().sort((a, b) => (a.p.number ?? 99) - (b.p.number ?? 99));
    return `
      <div class="per-scroll excel-scroll"><table class="stat-table excel">
        <thead>
          <tr><th class="lbl" rowspan="3" scope="col">Jugador</th>${games.map((m) => { const [h, a] = sides(m, team.name); return `<th colspan="${sub.length}" class="jor" scope="colgroup"><a href="#/partidos/${esc(m.id)}/postpartido">J${m.matchday ?? '–'}</a> · ${m.date ? esc(fmt(new Date(m.date + 'T00:00:00'))) : ''}<br><small>${esc(h)} ${esc(score(m))} ${esc(a)} · ${total}′</small></th>`; }).join('')}</tr>
          <tr>${games.map(() => `<th colspan="4" class="grp first">Convocatoria</th><th colspan="5" class="grp">Goles a favor</th><th colspan="4" class="grp">Goles en contra</th><th colspan="2" class="grp">Tarjetas</th>`).join('')}</tr>
          <tr>${games.map(() => sub.map(([l], i) => `<th class="${i === 0 ? 'first' : ''}">${l}</th>`).join('')).join('')}</tr>
        </thead>
        <tbody>${list.map((t) => `<tr><th class="lbl" scope="row"><b>${t.p.number ?? '–'}</b> ${esc(t.p.name)}</th>
          ${games.map((m) => { const r = pm.get(m.id)?.get(t.p.id); return sub.map(([, fn], i) => `<td class="${i === 0 ? 'first' : ''}${r && !r.called ? ' nc' : ''}">${r ? esc(fn(r)) : ''}</td>`).join(''); }).join('')}</tr>`).join('')}</tbody>
      </table></div>
      <p class="hint">Como la hoja POSTPARTIDO: una columna por jornada con convocatoria, goles a favor y en contra por origen y tarjetas. Desliza para ver todas las jornadas.</p>`;
  }

  function teamView() {
    const t = teamSummary(matches, total);
    const colorFor = 'var(--accent)', colorAg = 'var(--against)';
    const originData = (side) => [...ORIGINS, 'Sin origen'].map((o, i) => ({ label: o, value: t.byOrigin[side][o], color: i < 4 ? CAT[i] : 'var(--c0)' })).filter((d) => d.label !== 'Sin origen' || d.value);
    return `
      <div class="team-tiles">
        <div class="card stat"><strong>${t.pts}</strong><span>Puntos</span></div>
        <div class="card stat"><strong>${t.w}-${t.d}-${t.l}</strong><span>Ganados · empatados · perdidos</span></div>
        <div class="card stat"><strong>${t.gf}:${t.ga}</strong><span>Goles a favor y en contra</span></div>
        <div class="card stat"><span class="streak">${t.streak.map((r) => `<i class="r-${r}" title="${{ G: 'Ganado', E: 'Empatado', P: 'Perdido' }[r]}">${r}</i>`).join('')}</span><span>Racha (últimos 5)</span></div>
      </div>
      <div class="chart-grid">
        <section class="card"><h2>Resultados</h2>
          <ul class="results">${t.res.slice().reverse().map(({ m, r }) => { const [h, a] = sides(m, team.name); return `<li><i class="r-${r}">${r}</i><span>J${m.matchday ?? '–'} · ${esc(h)} <b>${esc(score(m))}</b> ${esc(a)}</span></li>`; }).join('')}</ul></section>
        <section class="card"><h2>Puntos acumulados</h2>${line({ labels: t.res.map(({ m }) => `J${m.matchday ?? ''}`), series: [{ name: 'Puntos', color: colorFor, values: t.cumulative }], title: 'Puntos acumulados' })}</section>
        <section class="card"><h2>Goles a favor por origen</h2>${donut({ data: originData('for'), title: 'a favor' })}</section>
        <section class="card"><h2>Goles en contra por origen</h2>${donut({ data: originData('against'), title: 'en contra' })}</section>
        <section class="card wide"><h2>Goles por tramos de 15 minutos</h2>${bars({ width: 640, height: 200, labels: t.bandLabels, series: [{ name: 'A favor', color: colorFor, values: t.bands.for }, { name: 'En contra', color: colorAg, values: t.bands.against }], title: 'Goles por tramos' })}</section>
        <section class="card wide"><h2>Notas colectivas (media por fase)</h2>${t.phases.some((p) => p.avg != null)
          ? bars({ width: 640, height: 200, labels: t.phases.map((p) => p.label.slice(0, 7)), series: [{ name: 'Nota media', color: colorFor, values: t.phases.map((p) => p.avg ?? 0) }], title: 'Notas colectivas' })
            + `<p class="hint">${t.phases.map((p) => `${p.label}: ${p.avg ?? '—'}`).join(' · ')} (de 1 a 5, en los informes con nota)</p>`
          : '<p class="muted">Aún no hay notas colectivas en los informes postpartido.</p>'}</section>
      </div>`;
  }


  // ---------------------------------------------------------------- impresión de la vista actual
  function printView() {
    const range = [f.j1 || f.j2 ? `Jornadas ${f.j1 || '…'}–${f.j2 || '…'}` : '', f.d1 || f.d2 ? `Fechas ${f.d1 ? fmt(new Date(f.d1 + 'T00:00:00')) : '…'} – ${f.d2 ? fmt(new Date(f.d2 + 'T00:00:00')) : '…'}` : ''].filter(Boolean).join(' · ');
    const sub = `${VIEWS.find(([k]) => k === view)[1]} · ${games.length} ${games.length === 1 ? 'partido' : 'partidos'}${range ? ' · ' + esc(range) : ' · toda la temporada'}`;
    const head = printHead({ title: 'Estadísticas de temporada', team, sub });
    if (!games.length) return { title: `Estadísticas ${team.name}`, html: `${head}<p class="pr-empty">Todavía no hay partidos jugados.</p>` };
    let html = head, landscape = true;
    if (view === 'jugadores') {
      const sum = (fn) => totals.reduce((n, t) => n + fn(t), 0);
      html += `<table class="pr-t pr-stats"><thead><tr>${COLS.map(([k, l]) => `<th>${l}${sort === k ? (dir === 1 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead>
        <tbody>${totals.map((t) => `<tr><td class="n">${t.p.number ?? ''}</td><td>${esc(t.p.name)}</td><td class="n">${t.called}</td><td class="n">${t.starter}</td><td class="n"><b>${t.minutes}</b></td><td class="n">${t.pct}%</td>
          ${ORIGINS.map((o) => `<td class="n">${t.gf[o] || ''}</td>`).join('')}<td class="n"><b>${t.goals || ''}</b></td><td class="n">${t.assists || ''}</td><td class="n">${t.against || ''}</td><td class="n">${t.yellow || ''}</td><td class="n">${t.red || ''}</td>
          <td class="n">${t.attPct != null ? `${t.attPct}% <small>${t.att.D}/${t.att.L}/${t.att.A}</small>` : '—'}</td><td class="n">${t.avg != null ? t.avg.toFixed(1) : '—'}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td></td><th>Equipo</th><td></td><td></td><td></td><td></td>${ORIGINS.map((o) => `<td class="n">${sum((t) => t.gf[o])}</td>`).join('')}<td class="n">${sum((t) => t.goals)}</td><td class="n">${sum((t) => t.assists)}</td><td></td><td class="n">${sum((t) => t.yellow)}</td><td class="n">${sum((t) => t.red)}</td><td></td><td></td></tr></tfoot></table>
        <p class="pr-note">% min sobre ${games.length} × ${total} min posibles · GC campo: goles en contra estando en el campo · % entreno: disponible / sesiones registradas (D/L/A) · Nota: media del postpartido.</p>`;
    } else if (view === 'excel') {
      const sub2 = [['D', (r) => (r.available ? 'D' : 'No')], ['C', (r) => (r.called ? 'C' : 'No')], ['T', (r) => (r.called ? (r.starter ? 'T' : 'S') : '')], ['Min', (r) => (r.called ? r.minutes : '')],
        ...ORIGINS.map((o) => [ORIGIN_SHORT[o], (r) => r.gf[o] || '']), ['As', (r) => r.assists || ''], ...ORIGINS.map((o) => [ORIGIN_SHORT[o], (r) => r.gc[o] || '']), ['TA', (r) => r.yellow || ''], ['TR', (r) => r.red || '']];
      const list = totals.slice().sort((a, b) => (a.p.number ?? 99) - (b.p.number ?? 99));
      html += chunk(games, 3).map((part, pi) => `<table class="pr-t pr-wide pr-excel${pi ? ' pr-break' : ''}">
        <colgroup><col style="width:34mm">${part.map(() => sub2.map(() => '<col>').join('')).join('')}</colgroup>
        <thead><tr><th class="lbl" rowspan="3">Jugador</th>${part.map((m) => { const [h, a] = sides(m, team.name); return `<th colspan="${sub2.length}" class="first">J${m.matchday ?? '–'} · ${m.date ? esc(fmt(new Date(m.date + 'T00:00:00'))) : ''} · ${esc(h)} ${esc(score(m))} ${esc(a)}</th>`; }).join('')}</tr>
          <tr>${part.map(() => '<th colspan="4" class="first">Convocatoria</th><th colspan="5">Goles a favor</th><th colspan="4">Goles en contra</th><th colspan="2">Tarjetas</th>').join('')}</tr>
          <tr>${part.map(() => sub2.map(([l], i) => `<th class="${i ? '' : 'first'}">${l}</th>`).join('')).join('')}</tr></thead>
        <tbody>${list.map((t) => `<tr><th class="lbl">${t.p.number ?? '–'} ${esc(t.p.name)}</th>${part.map((m) => { const r = pm.get(m.id)?.get(t.p.id); return sub2.map(([, fn], i) => `<td class="${i ? '' : 'first'}">${r ? esc(fn(r)) : ''}</td>`).join(''); }).join('')}</tr>`).join('')}</tbody>
      </table>`).join('');
    } else {
      landscape = false;
      const t = teamSummary(matches, total);
      const originData = (side) => [...ORIGINS, 'Sin origen'].map((o, i) => ({ label: o, value: t.byOrigin[side][o], color: i < 4 ? CAT[i] : 'var(--c0)' })).filter((d) => d.label !== 'Sin origen' || d.value);
      html += `
        <div class="pr-tiles"><div><strong>${t.pts}</strong><span>Puntos</span></div><div><strong>${t.w}-${t.d}-${t.l}</strong><span>G · E · P</span></div><div><strong>${t.gf}:${t.ga}</strong><span>Goles a favor y en contra</span></div>
          <div><strong class="streak">${t.streak.map((r) => `<i class="r-${r}">${r}</i>`).join('')}</strong><span>Racha (últimos 5)</span></div></div>
        <div class="pr-charts">
          <div>${bar('Resultados')}<table class="pr-t"><tbody>${t.res.map(({ m, r }) => { const [h, a] = sides(m, team.name); return `<tr><td class="c"><i class="r-${r}">${r}</i></td><td>J${m.matchday ?? '–'}</td><td>${esc(h)} <b>${esc(score(m))}</b> ${esc(a)}</td></tr>`; }).join('')}</tbody></table></div>
          <div>${bar('Puntos acumulados')}${line({ labels: t.res.map(({ m }) => `J${m.matchday ?? ''}`), series: [{ name: 'Puntos', color: 'var(--accent)', values: t.cumulative }], title: 'Puntos acumulados' })}</div>
          <div>${bar('Goles a favor por origen')}${donut({ data: originData('for'), title: 'a favor' })}</div>
          <div>${bar('Goles en contra por origen')}${donut({ data: originData('against'), title: 'en contra' })}</div>
          <div class="wide pr-avoid">${bar('Goles por tramos de 15 minutos')}${bars({ width: 640, height: 170, labels: t.bandLabels, series: [{ name: 'A favor', color: 'var(--accent)', values: t.bands.for }, { name: 'En contra', color: 'var(--against)', values: t.bands.against }], title: 'Goles por tramos' })}</div>
          <div class="wide pr-avoid">${bar('Notas colectivas (media por fase, 1–5)')}<p>${t.phases.map((p) => `${esc(p.label)} <b>${p.avg ?? '—'}</b>`).join(' · ')}</p></div>
        </div>`;
    }
    return { title: `Estadísticas ${team.name} ${S.season?.name || ''}`, html, landscape };
  }

  // ---------------------------------------------------------------- eventos
  el.querySelector('[data-filters]').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const v = Object.fromEntries(new FormData(ev.target));
    location.hash = link(v);
  });
  wirePrint(el, () => printView());
  el.querySelector('[data-excel]').addEventListener('click', (ev) => busy(ev.currentTarget, () => exportSheet({
    name: `Estadísticas ${team.name}`, sheet: 'Jugadores',
    header: COLS.map(([, l]) => l).concat(['D', 'L', 'A']),
    rows: totals.map((t) => [t.p.number ?? '', t.p.name, t.called, t.starter, t.minutes, t.pct, ...ORIGINS.map((o) => t.gf[o]), t.goals, t.assists, t.against, t.yellow, t.red, t.attPct ?? '', t.avg ?? '', t.att.D, t.att.L, t.att.A]),
    widths: [6, 26, 7, 7, 7, 7, 6, 6, 6, 6, 7, 6, 9, 5, 5, 10, 7, 5, 5, 5]
  })));
  await mountThread(el.querySelector('#thread'), { teamId: team.id, entity: 'estadisticas', title: 'Comentarios sobre las estadísticas' });
}

/** Con filtro de jornadas, las sesiones cuentan entre la primera y la última fecha de esos partidos. */
function rangeDates(matches, date) {
  const ds = matches.map((m) => m.date).filter(Boolean).sort();
  if (!ds.length) return false;
  return date >= ds[0] && date <= ds[ds.length - 1];
}
