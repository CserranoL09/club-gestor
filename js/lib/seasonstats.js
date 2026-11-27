// Estadísticas de temporada: acumulados por jugador y del equipo a partir de partidos, informes y sesiones.
import { playerRows, ORIGINS, COLLECTIVE, INDIVIDUAL } from './post.js';

export const played = (m) => m.goals_for != null && m.goals_against != null;
const ACTS = [...INDIVIDUAL.attack.actions, ...INDIVIDUAL.defense.actions].map(([k]) => k);

/** Partidos dentro del filtro (jornadas j1–j2 o fechas d1–d2). */
export function inRange(m, f) {
  if (f.j1 && (m.matchday ?? 0) < +f.j1) return false;
  if (f.j2 && (m.matchday ?? 999) > +f.j2) return false;
  if (f.d1 && (!m.date || m.date < f.d1)) return false;
  if (f.d2 && (!m.date || m.date > f.d2)) return false;
  return true;
}

/** Fila de cada jugador en cada partido (como la hoja POSTPARTIDO). */
export function perMatch(players, matches, total) {
  const out = new Map();
  for (const m of matches) out.set(m.id, new Map(playerRows(players, m, total).map((r) => [r.p.id, r])));
  return out;
}

export function playerTotals(players, matches, sessions, total, pm = perMatch(players, matches, total)) {
  const games = matches.filter(played);
  const possible = games.length * total;
  return players.map((p) => {
    const t = { p, called: 0, starter: 0, minutes: 0, gf: Object.fromEntries(ORIGINS.map((o) => [o, 0])), assists: 0, gc: Object.fromEntries(ORIGINS.map((o) => [o, 0])), yellow: 0, red: 0, scores: [], series: [] };
    for (const m of games) {
      const r = pm.get(m.id)?.get(p.id);
      const sc = Object.values(m.post?.individual?.scores?.[p.id] || {}).filter((v) => ACTS.length && +v);
      const avg = sc.length ? sc.reduce((a, b) => a + +b, 0) / sc.length : null;
      t.series.push({ m, minutes: r?.called ? r.minutes : 0, called: !!r?.called, avg, row: r });
      if (!r) continue;
      if (r.called) { t.called++; if (r.starter) t.starter++; }
      t.minutes += r.called ? r.minutes : 0;
      for (const o of ORIGINS) { t.gf[o] += r.gf[o] || 0; t.gc[o] += r.gc[o] || 0; }
      t.assists += r.assists || 0; t.yellow += r.yellow || 0; t.red += r.red || 0;
      if (avg != null) t.scores.push(avg);
    }
    t.goals = ORIGINS.reduce((s, o) => s + t.gf[o], 0);
    t.against = ORIGINS.reduce((s, o) => s + t.gc[o], 0);
    t.pct = possible ? Math.round((t.minutes / possible) * 100) : 0;
    t.avg = t.scores.length ? Math.round((t.scores.reduce((a, b) => a + b, 0) / t.scores.length) * 10) / 10 : null;
    t.att = { D: 0, L: 0, A: 0 };
    for (const s of sessions) { const st = s.attendance?.[p.id]?.status; if (st in t.att) t.att[st]++; }
    const n = t.att.D + t.att.L + t.att.A;
    t.attPct = n ? Math.round((t.att.D / n) * 100) : null;
    return t;
  });
}

/** Resumen del equipo: resultados, puntos, racha, goles por origen y por tramos de 15 min, notas colectivas. */
export function teamSummary(matches, total) {
  const games = matches.filter(played).sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.matchday ?? 0) - (b.matchday ?? 0));
  const res = games.map((m) => ({ m, r: m.goals_for > m.goals_against ? 'G' : m.goals_for < m.goals_against ? 'P' : 'E' }));
  const pts = res.reduce((s, x) => s + (x.r === 'G' ? 3 : x.r === 'E' ? 1 : 0), 0);
  let acc = 0;
  const cumulative = res.map((x) => (acc += x.r === 'G' ? 3 : x.r === 'E' ? 1 : 0));
  const bandsN = Math.ceil(total / 15);
  const bandLabels = Array.from({ length: bandsN }, (_, i) => `${i * 15}–${Math.min(total, (i + 1) * 15)}`);
  const bands = { for: Array(bandsN).fill(0), against: Array(bandsN).fill(0) };
  const byOrigin = { for: Object.fromEntries([...ORIGINS, 'Sin origen'].map((o) => [o, 0])), against: Object.fromEntries([...ORIGINS, 'Sin origen'].map((o) => [o, 0])) };
  for (const m of games) {
    const evs = m.events || [];
    // Partidos con resultado pero sin eventos: cuentan en los totales, no en orígenes ni tramos.
    for (const e of evs) {
      const side = e.type === 'goal' ? 'for' : e.type === 'goal_against' ? 'against' : null;
      if (!side) continue;
      byOrigin[side][ORIGINS.includes(e.origin) ? e.origin : 'Sin origen']++;
      if (e.minute != null) bands[side][Math.min(bandsN - 1, Math.max(0, Math.ceil(e.minute / 15) - 1))]++;
    }
  }
  const phases = Object.values(COLLECTIVE).flatMap((d) => d.phases).map(([k, l]) => {
    const v = games.map((m) => +m.post?.collective?.[k]?.score).filter(Boolean);
    return { key: k, label: l, avg: v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null, n: v.length };
  });
  return {
    games, res, pts, cumulative,
    w: res.filter((x) => x.r === 'G').length, d: res.filter((x) => x.r === 'E').length, l: res.filter((x) => x.r === 'P').length,
    gf: games.reduce((s, m) => s + m.goals_for, 0), ga: games.reduce((s, m) => s + m.goals_against, 0),
    streak: res.slice(-5).map((x) => x.r), byOrigin, bands, bandLabels, phases
  };
}
