// Acta del partido (hoja PARTIDO): eventos, resultado y estadísticas por jugador calculadas solas.

export const EVENT_TYPES = {
  goal: { label: 'Gol', icon: '⚽', cls: 'ev-goal' },
  goal_against: { label: 'Gol rival', icon: '🥅', cls: 'ev-against' },
  yellow: { label: 'Amarilla', icon: '🟨', cls: 'ev-yellow' },
  red: { label: 'Roja', icon: '🟥', cls: 'ev-red' },
  sub: { label: 'Cambio', icon: '🔁', cls: 'ev-sub' }
};
export const ORIGINS = ['Combinativo', 'Directo', 'Transición', 'ABP'];
export const DEFAULT_COUNTERS = ['Recuperaciones', 'Pérdidas', 'Faltas', 'Ocasiones'];
export const STAT_FIELDS = [['goals', 'Gol'], ['assists', 'Asis'], ['yellow', 'TA'], ['red', 'TR'], ['minutes', 'Min']];

/** Eventos ordenados por minuto (y por orden de entrada si coinciden). */
export const sortEvents = (events) => [...(events || [])].sort((a, b) => (a.minute ?? 999) - (b.minute ?? 999) || (a.seq ?? 0) - (b.seq ?? 0));

/** Resultado propio y rival a partir de los eventos. */
export function scoreOf(events) {
  return {
    for: (events || []).filter((e) => e.type === 'goal').length,
    against: (events || []).filter((e) => e.type === 'goal_against').length
  };
}

/**
 * Estadísticas de cada convocado: goles, asistencias, tarjetas y minutos.
 * Titulares desde el minuto 0; los cambios suman y restan; la roja (o la 2.ª amarilla) corta los minutos.
 * Los valores marcados como manuales en `stored` se respetan.
 */
export function computeStats(events, squad, total, stored = {}) {
  const out = {};
  const on = new Map();                         // player_id → minuto en que entró
  for (const s of squad || []) {
    out[s.player_id] = { goals: 0, assists: 0, yellow: 0, red: 0, minutes: 0 };
    if (s.starter) on.set(s.player_id, 0);
  }
  const off = (id, minute) => {
    if (!on.has(id)) return;
    out[id].minutes += Math.max(0, Math.min(total, minute) - on.get(id));
    on.delete(id);
  };
  for (const e of sortEvents(events)) {
    const m = Math.max(0, Math.min(total, e.minute ?? total));
    const p = out[e.player_id];
    if (e.type === 'goal') { if (p) p.goals++; if (out[e.assist_id]) out[e.assist_id].assists++; }
    if (e.type === 'yellow' && p) { p.yellow++; if (p.yellow >= 2) off(e.player_id, m); }
    if (e.type === 'red' && p) { p.red++; off(e.player_id, m); }
    if (e.type === 'sub') {
      off(e.player_out_id, m);
      if (out[e.player_id] && !on.has(e.player_id) && !(out[e.player_id].red)) on.set(e.player_id, m);
    }
  }
  for (const id of [...on.keys()]) off(id, total);
  for (const [id, st] of Object.entries(stored || {})) {
    if (!out[id] || !st?.manual) continue;
    for (const k of Object.keys(st.manual)) if (st.manual[k] && st[k] != null) out[id][k] = st[k];
    out[id].manual = { ...st.manual };
  }
  return out;
}

/** Quién está en el campo en un minuto (para elegir jugador en cambios y tarjetas). */
export function onField(events, squad, minute = Infinity) {
  const on = new Set((squad || []).filter((s) => s.starter).map((s) => s.player_id));
  for (const e of sortEvents(events)) {
    if ((e.minute ?? 0) > minute) break;
    if (e.type === 'sub') { on.delete(e.player_out_id); on.add(e.player_id); }
    if (e.type === 'red') on.delete(e.player_id);
  }
  return on;
}

/** Minuto de partido a partir del cronómetro: parte en curso y segundos transcurridos en ella. */
export const clockMinute = (period, seconds, periodMinutes) => (period - 1) * periodMinutes + Math.floor(seconds / 60) + 1;
