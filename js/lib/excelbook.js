// Hojas de Excel con la misma estructura que la plantilla «Control competición TEMPORADA».
// Cada función devuelve { name, rows, widths, freeze, merges } para exportBook() de xlsx.js.
import { MONTHS } from './dates.js';
import { MATERIAL, OBJECTIVES, STAFF, ROLES, BLOCK_KINDS, blockTime, blockShort, attStatus } from './sessions.js';
import { weeksOf, rangesToWeeks, microcycleAt, LEVELS } from './periodization.js';
import { PHASES, macroWeeks, itemTotal, groupWeek, groupTotal, areaName } from './macro.js';
import { DAYS, relLabel } from './morpho.js';
import { sides } from './matches.js';
import { EVENT_TYPES, STAT_FIELDS, sortEvents } from './acta.js';
import { COLLECTIVE, INDIVIDUAL, ORIGINS, ORIGIN_SHORT, playerRows } from './post.js';
import { POSITIONS, FEET } from './players.js';
import { played, playerTotals } from './seasonstats.js';

/** 'aaaa-mm-dd' → Date local (fecha real de Excel) o ''. */
export const xd = (s) => (s ? new Date(String(s).slice(0, 10) + 'T00:00:00') : '');
const hm = (t) => (t ? String(t).slice(0, 5) : '');
const posName = (k) => POSITIONS.find(([x]) => x === k)?.[1] || k || '';
const footName = (k) => FEET.find(([x]) => x === k)?.[1] || '';
const col = (n) => { let s = ''; n++; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const range = (r1, c1, r2, c2) => `${col(c1)}${r1 + 1}:${col(c2)}${r2 + 1}`;

// ======================================================================= SESIÓN
/** Una fila por sesión y bloque. */
export function sheetSesion(sessions, team, players = []) {
  const head = ['Fecha', 'Hora', 'Sesión', 'Microciclo', 'Periodo', 'Duración', ...STAFF.map(([, l]) => l), ...OBJECTIVES.map(([, l]) => `Obj. ${l}`),
    'Material', 'D', 'L', 'A', 'Bloque', 'Tipo', 'Título', 'Desarrollo', 'Variantes', 'Obj. ofensivos', 'Obj. defensivos',
    'Duración (min)', 'Series', 'Rec. (min)', 'Total bloque', 'Espacio', 'Nº jugadores', 'Porteros', ...ROLES.map(([, l]) => l), 'Observaciones'];
  const rows = [head];
  for (const s of [...sessions].sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))) {
    const mat = s.material || {};
    const matText = [...MATERIAL.filter((m) => mat[m] != null).map((m) => `${m}${mat[m] !== '' ? ' ' + mat[m] : ''}`), mat.otros ? `Otros: ${mat.otros}` : ''].filter(Boolean).join(', ');
    const c = { D: 0, L: 0, A: 0 };
    for (const p of players.filter((x) => x.active || s.attendance?.[x.id])) c[attStatus(s.attendance, p)]++;
    const base = [xd(s.date), hm(s.time), s.number ?? '', s.microcycle ?? '', s.period || '', s.duration_min ?? '', ...STAFF.map(([k]) => s.staff?.[k] || ''),
      ...OBJECTIVES.map(([k]) => s.objectives?.[k] || ''), matText, c.D, c.L, c.A];
    const blocks = s.blocks || [];
    if (!blocks.length) rows.push([...base, ...Array(head.length - base.length - 1).fill(''), s.notes || '']);
    blocks.forEach((b, i) => {
      const st = b.structure || {};
      rows.push([...base, blockShort(blocks, i), BLOCK_KINDS[b.kind] || '', b.title || '', b.description || '', (b.variants || []).filter(Boolean).map((v, j) => `${j + 1}- ${v}`).join('\n'),
        b.obj_off || '', b.obj_def || '', num(st.duration), num(st.series), num(st.rest), blockTime(b), st.space || '', st.players || '', st.goalkeepers || '',
        ...ROLES.map(([r]) => b.roles?.[r] || ''), i === 0 ? s.notes || '' : '']);
    });
  }
  return { name: 'SESIÓN', rows, freeze: { x: 1, y: 1 },
    widths: [11, 7, 7, 10, 14, 9, 18, 18, 18, 18, 28, 28, 28, 28, 30, 4, 4, 4, 7, 16, 24, 40, 28, 24, 24, 9, 7, 8, 9, 12, 12, 10, 18, 18, 18, 18, 30] };
}
const num = (v) => (v === '' || v == null || Number.isNaN(+v) ? '' : +v);

// ======================================================================= PERIODIZACIÓN
/** Semanas en columnas (como la hoja), con periodo, macro, meso, microciclo y contenidos. */
export function sheetPeriodizacion(p) {
  if (!p) return { name: 'PERIODIZACIÓN', rows: [['Sin periodización']] };
  const weeks = weeksOf(p);
  const n = weeks.length;
  const per = rangesToWeeks(p.periods || [], n, 'key');
  const mac = rangesToWeeks(p.macro || [], n, 'label');
  const mes = rangesToWeeks(p.meso || [], n, 'label');
  const legend = (k) => (p.legend || []).find((l) => l.key === k)?.label || '';
  const rows = [
    ['PERIODIZACIÓN'],
    ['Mes', ...weeks.map((w) => MONTHS[w.monday.getMonth()].toUpperCase())],
    ['Lunes', ...weeks.map((w) => new Date(w.monday))],
    ['Periodo', ...per.map(legend)],
    ['Macrociclo', ...mac.map((v) => (v ? +v || v : ''))],
    ['Mesociclo', ...mes.map((v) => (v ? +v || v : ''))],
    ['Microciclo', ...weeks.map((w) => { const m = microcycleAt(p, new Date(w.monday.getTime() + 864e5)); return m?.number ?? ''; })],
    ...(p.contents || []).map((c, i) => [c.name || `Contenido ${i + 1}`, ...weeks.map((w) => (c.marks?.[w.i] != null ? (c.marks[w.i] === 'x' ? '✖' : +c.marks[w.i]) : ''))])
  ];
  return { name: 'PERIODIZACIÓN', rows, freeze: { x: 1, y: 3 }, widths: [26, ...weeks.map(() => 11)] };
}

// ======================================================================= MACROCICLO
export function sheetMacrociclo(list) {
  const rows = [], merges = [];
  let maxW = 0;
  for (const m of list) {
    const weeks = macroWeeks(m);
    maxW = Math.max(maxW, weeks.length);
    const ph = rangesToWeeks(m.phases || [], m.weeks, 'key');
    if (rows.length) rows.push([]);
    rows.push([`${m.name} · ${areaName(m.area)}`]);
    merges.push(range(rows.length - 1, 0, rows.length - 1, Math.min(10, weeks.length)));
    rows.push(['Semana', ...weeks.map((w) => w.i + 1), 'Total']);
    rows.push(['Lunes', ...weeks.map((w) => new Date(w.monday))]);
    rows.push(['Mes', ...weeks.map((w) => MONTHS[w.monday.getMonth()])]);
    rows.push(['Periodo', ...ph.map((k) => PHASES.find((x) => x.key === k)?.label || '')]);
    for (const g of m.groups || []) {
      rows.push([g.name.toUpperCase(), ...weeks.map((w) => groupWeek(g, w.i) || ''), groupTotal(g, m.weeks)]);
      for (const it of g.items || []) rows.push([it.name, ...weeks.map((w) => { const v = it.marks?.[w.i]; return v == null ? '' : v === 'x' ? 'X' : +v; }), itemTotal(it, m.weeks)]);
    }
  }
  if (!rows.length) rows.push(['Sin macrociclos']);
  return { name: 'MACROCICLO', rows, merges, freeze: { x: 1, y: 0 }, widths: [32, ...Array(maxW).fill(11), 7] };
}

// ======================================================================= MORFOCICLO
export function sheetMorfociclo(list) {
  const rows = [];
  for (const m of list) {
    if (rows.length) rows.push([]);
    rows.push([`${m.is_default ? 'MORFOCICLO ESTÁNDAR · ' : ''}${m.name}`]);
    rows.push(['', ...DAYS.map(([, n]) => n)]);
    rows.push(['', ...DAYS.map((_, i) => relLabel(i, m.match_day ?? 6))]);
    for (const r of m.rows || []) rows.push(r.section ? [r.label] : [r.label, ...DAYS.map(([k]) => r.values?.[k] || '')]);
  }
  if (!rows.length) rows.push(['Sin morfociclo']);
  return { name: 'MORFOCICLO', rows, freeze: { x: 1, y: 0 }, widths: [24, 24, 24, 24, 24, 24, 24, 24] };
}

// ======================================================================= PREPARTIDO
export function sheetPrepartido(matches, team, players) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const who = (s) => { const p = byId.get(s.player_id); return p ? `${p.number ?? ''} ${p.name}`.trim() : s.name || ''; };
  const rows = [['Jornada', 'Fecha', 'Hora', 'Citación', 'Lugar', 'Equipo local', 'Equipo visitante', 'Sistema', 'Convocados', 'Titulares', 'Suplentes',
    'Ataque', 'Defensa', 'Rival', 'ABP a favor', 'ABP en contra', 'Observaciones']];
  for (const m of matches) {
    const sq = (m.squad || []).filter((s) => s.called !== false);
    const [h, a] = sides(m, team.name);
    rows.push([m.matchday ?? '', xd(m.date), hm(m.time), hm(m.call_time), m.venue || '', h, a, m.system || '', sq.length,
      sq.filter((s) => s.starter).map(who).join('\n'), sq.filter((s) => !s.starter).map(who).join('\n'),
      m.plan?.attack || '', m.plan?.defense || '', m.plan?.rival || '', m.abp_for || '', m.abp_against || '', m.pre_notes || '']);
  }
  return { name: 'PREPARTIDO', rows, freeze: { x: 1, y: 1 }, widths: [8, 11, 7, 8, 22, 20, 20, 10, 10, 26, 26, 30, 30, 30, 26, 26, 30] };
}

// ======================================================================= PARTIDO
/** Una fila por evento (goles, tarjetas y cambios) con la cabecera del partido. */
export function sheetPartido(matches, team, players) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const nm = (id) => { const p = byId.get(id); return p ? `${p.number ?? ''} ${p.name}`.trim() : ''; };
  const rows = [['Jornada', 'Fecha', 'Local', 'Goles local', 'Goles visitante', 'Visitante', 'Min', 'Res/Tipo', 'Jugador', 'Asistencia / sale', 'Origen/Motivo', 'Nota', 'Anotaciones', 'Observaciones']];
  for (const m of matches) {
    const [h, a] = sides(m, team.name);
    const [gh, ga] = m.goals_for == null ? ['', ''] : m.is_home ? [m.goals_for, m.goals_against] : [m.goals_against, m.goals_for];
    const head = [m.matchday ?? '', xd(m.date), h, gh, ga, a];
    const ann = [(m.counters?.items || []).map((c) => `${c.name}: ${c.value || 0}`).join(', ') + (m.annotations ? `\n${m.annotations}` : ''), m.notes || ''];
    const evs = sortEvents(m.events);
    if (!evs.length) rows.push([...head, '', '', '', '', '', '', ...ann]);
    evs.forEach((e, i) => rows.push([...head, e.minute ?? '', EVENT_TYPES[e.type]?.label || e.type, e.type === 'goal_against' ? 'Rival' : nm(e.player_id),
      e.type === 'sub' ? nm(e.player_out_id) : e.type === 'goal' ? nm(e.assist_id) : '', e.origin || '', e.note || '', ...(i ? ['', ''] : ann)]));
  }
  // Tabla de convocados por partido (Nº · Jugador · Gol · Asis · TA · TR · Min)
  rows.push([], ['CONVOCADOS'], ['Jornada', 'Nº', 'Jugador', ...STAT_FIELDS.map(([, l]) => l)]);
  for (const m of matches) {
    for (const s of (m.squad || []).filter((x) => x.called !== false)) {
      const p = byId.get(s.player_id); const st = m.player_stats?.[s.player_id] || {};
      rows.push([m.matchday ?? '', p?.number ?? s.number ?? '', p?.name || s.name || '', ...STAT_FIELDS.map(([k]) => st[k] ?? 0)]);
    }
  }
  return { name: 'PARTIDO', rows, freeze: { x: 1, y: 1 }, widths: [8, 11, 20, 8, 8, 20, 6, 11, 22, 22, 14, 24, 30, 30] };
}

// ======================================================================= POSTPARTIDO
/**
 * Misma disposición que la hoja POSTPARTIDO: jornadas en columnas desde C (15 columnas cada una),
 * cabecera en las filas 8–13 y un jugador por fila desde la 14. Debajo, evaluación y captación.
 */
export function sheetPostpartido(matches, team, players, total) {
  const W = 15, C0 = 2;
  const rows = []; const merges = [];
  const set = (r, c, v) => { while (rows.length <= r) rows.push([]); rows[r][c] = v; };
  set(1, 2, 'Informe Postpartido');
  set(4, 0, 'Equipo'); set(4, 1, team.name);
  set(5, 0, 'Categoría'); set(5, 1, team.category || '');
  ['Jornada', 'Fecha', 'Duración', 'Resultado'].forEach((l, i) => set(7 + i, 1, l));
  set(11, 0, 'Jugadores'); set(12, 0, 'Dorsal'); set(12, 1, 'Nombre');
  const sub = ['Disponible/No D.', 'Convocado/No C.', 'Titular/Suplente', 'Minutos', ...ORIGINS.map((o) => `GF - ${o}`), 'Asistencias', ...ORIGINS.map((o) => `GC - ${o}`), 'Amarillas', 'Rojas'];
  const list = players.filter((p) => p.active || matches.some((m) => (m.squad || []).some((s) => s.player_id === p.id))).sort((a, b) => (a.number ?? 99) - (b.number ?? 99));
  list.forEach((p, i) => { set(13 + i, 0, p.number ?? ''); set(13 + i, 1, p.name); });
  const evalRow = 13 + Math.max(list.length, 1) + 1;
  matches.forEach((m, k) => {
    const c = C0 + k * W;
    const [h, a] = sides(m, team.name);
    const [gh, ga] = m.goals_for == null ? ['', ''] : m.is_home ? [m.goals_for, m.goals_against] : [m.goals_against, m.goals_for];
    set(7, c, m.matchday ?? k + 1); set(8, c, xd(m.date)); set(9, c, total);
    set(10, c, h); set(10, c + 6, gh); set(10, c + 7, '-'); set(10, c + 8, ga); set(10, c + 9, a);
    merges.push(range(7, c, 7, c + W - 1), range(8, c, 8, c + W - 1), range(9, c, 9, c + W - 1), range(10, c, 10, c + 5), range(10, c + 9, 10, c + W - 1));
    set(11, c, 'Convocatoria'); set(11, c + 4, 'Goles a Favor'); set(11, c + 9, 'Goles en Contra'); set(11, c + 13, 'Tarjetas');
    sub.forEach((l, j) => set(12, c + j, l));
    const pr = new Map(playerRows(players, m, total).map((r) => [r.p.id, r]));
    list.forEach((p, i) => {
      const r = pr.get(p.id); if (!r) return;
      const vals = [r.available ? 'D' : 'No D.', r.called ? 'C' : 'No C.', r.called ? (r.starter ? 'T' : 'S') : '', r.called ? r.minutes : '',
        ...ORIGINS.map((o) => r.gf[o] || ''), r.assists || '', ...ORIGINS.map((o) => r.gc[o] || ''), r.yellow || '', r.red || ''];
      vals.forEach((v, j) => set(13 + i, c + j, v));
    });
    // Evaluación colectiva: fase → «nota · texto» en su columna (5 columnas por fase)
    const post = m.post || {};
    Object.values(COLLECTIVE).forEach((d, di) => d.phases.forEach(([key, label], pi) => {
      const v = post.collective?.[key] || {};
      set(evalRow + di * 3, c + pi * 5, label);
      set(evalRow + di * 3 + 1, c + pi * 5, [v.score ? `Nota ${v.score}` : '', v.text || ''].filter(Boolean).join(' · '));
    }));
    const acts = [...INDIVIDUAL.attack.actions, ...INDIVIDUAL.defense.actions];
    acts.forEach(([key, label], ai) => { set(evalRow + 6 + Math.floor(ai / 4) * 2, c + (ai % 4) * 4, label); set(evalRow + 7 + Math.floor(ai / 4) * 2, c + (ai % 4) * 4, post.individual?.texts?.[key] || ''); });
    (post.scouting || []).forEach((sc, si) => {
      const r = evalRow + 13 + si;
      set(r, c, sc.number ?? ''); set(r, c + 2, sc.name || ''); set(r, c + 6, posName(sc.position)); set(r, c + 9, footName(sc.foot)); set(r, c + 12, sc.level ?? ''); set(r, c + 13, sc.notes || '');
    });
  });
  set(evalRow, 0, 'Evaluación Colectiva'); set(evalRow, 1, 'Ataque'); set(evalRow + 3, 1, 'Defensa');
  set(evalRow + 6, 0, 'Evaluación Individual');
  set(evalRow + 12, 0, 'Captación');
  matches.forEach((m, k) => { const c = C0 + k * W; ['Dorsal', '', 'Jugador', '', '', '', 'Posición', '', '', 'Pie', '', '', 'Nivel', 'Observaciones'].forEach((l, j) => l && set(evalRow + 12, c + j, l)); });
  for (const r of rows) for (let i = 0; i < r.length; i++) if (r[i] === undefined) r[i] = null;
  return { name: 'POSTPARTIDO', rows, merges, freeze: { x: 2, y: 13 }, widths: [8, 22, ...matches.flatMap(() => [9, 9, 9, 8, 7, 7, 7, 7, 7, 7, 7, 7, 7, 6, 6])] };
}

// ======================================================================= PLANTILLA y ESTADÍSTICAS
export function sheetPlantilla(players) {
  return { name: 'PLANTILLA', freeze: { x: 0, y: 1 }, widths: [8, 28, 18, 10, 8, 8, 8],
    rows: [['Dorsal', 'Nombre', 'Posición', 'Pie', 'Año', 'Estado', 'Activo'],
      ...[...players].sort((a, b) => (a.number ?? 99) - (b.number ?? 99)).map((p) => [p.number ?? '', p.name, posName(p.position), footName(p.foot), p.birth_year ?? '', p.status, p.active ? 'Sí' : 'No'])] };
}

export function sheetEstadisticas(players, matches, sessions, total) {
  const games = matches.filter(played);
  const totals = playerTotals(players, games, sessions, total).filter((t) => t.p.active || t.called);
  return { name: 'ESTADÍSTICAS', freeze: { x: 2, y: 1 }, widths: [7, 26, 7, 7, 7, 7, 6, 6, 6, 6, 7, 6, 9, 5, 5, 10, 7, 5, 5, 5],
    rows: [['Nº', 'Jugador', 'Conv.', 'Tit.', 'Min', '% min', ...ORIGINS.map((o) => `G ${ORIGIN_SHORT[o]}`), 'Goles', 'Asis', 'GC campo', 'TA', 'TR', '% entreno', 'Nota', 'D', 'L', 'A'],
      ...totals.sort((a, b) => (a.p.number ?? 99) - (b.p.number ?? 99)).map((t) => [t.p.number ?? '', t.p.name, t.called, t.starter, t.minutes, t.pct, ...ORIGINS.map((o) => t.gf[o]), t.goals, t.assists, t.against, t.yellow, t.red,
        t.attPct ?? '', t.avg != null ? Math.round(t.avg * 10) / 10 : '', t.att.D, t.att.L, t.att.A])] };
}
