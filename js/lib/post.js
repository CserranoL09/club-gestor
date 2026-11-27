// Informe postpartido (hoja POSTPARTIDO): bloques, textos de ayuda y cálculos desde el acta.
import { ORIGINS, onField } from './acta.js';

export { ORIGINS };
export const COLLECTIVE = {
  attack: { label: 'Ataque', phases: [['conservacion', 'Conservación'], ['progresion', 'Progresión'], ['finalizacion', 'Finalización']],
    help: 'Detallar la actuación del equipo (lo más relevante) en las distintas fases de ataque (conservación, progresión y finalización), señalando las posibles fortalezas y debilidades.' },
  defense: { label: 'Defensa', phases: [['recuperacion', 'Recuperación'], ['contencion', 'Contención'], ['proteccion', 'Protección']],
    help: 'Detallar la actuación del equipo (lo más relevante) en las distintas fases de defensa (recuperación, contención y protección), señalando las posibles fortalezas y debilidades.' }
};
export const INDIVIDUAL = {
  attack: { label: 'Ataque', actions: [['control', 'Control'], ['pase', 'Pase'], ['conduccion', 'Conducción'], ['regate', 'Regate'], ['tiro', 'Tiro'], ['remate', 'Remate'], ['desmarque', 'Desmarque']],
    help: 'Detallar la actuación de los jugadores (lo más relevante) en las acciones individuales ofensivas, señalando las posibles fortalezas y debilidades.' },
  defense: { label: 'Defensa', actions: [['interceptacion', 'Interceptación'], ['entrada', 'Entrada'], ['despeje', 'Despeje'], ['marcaje', 'Marcaje']],
    help: 'Detallar la actuación de los jugadores (lo más relevante) en las acciones individuales defensivas, señalando las posibles fortalezas y debilidades.' }
};
export const ORIGIN_SHORT = { Combinativo: 'C', Directo: 'D', 'Transición': 'T', ABP: 'ABP' };

/**
 * Fila de cada jugador calculada con plantilla, prepartido y acta (y corregida a mano en post.players).
 * GC: cada gol en contra se apunta a los que estaban en el campo en ese minuto, por origen.
 */
export function playerRows(players, m, total) {
  const squad = (m.squad || []).filter((s) => s.called !== false);
  const sq = new Map(squad.map((s) => [s.player_id, s]));
  const stats = m.player_stats || {};
  const over = m.post?.players || {};
  const ev = m.events || [];
  return players.filter((p) => p.active || sq.has(p.id)).map((p) => {
    const gf = Object.fromEntries(ORIGINS.map((o) => [o, ev.filter((e) => e.type === 'goal' && e.player_id === p.id && e.origin === o).length]));
    const gc = Object.fromEntries(ORIGINS.map((o) => [o, ev.filter((e) => e.type === 'goal_against' && e.origin === o && onField(ev, squad, (e.minute ?? total) - 0.5).has(p.id)).length]));
    const base = {
      available: p.status === 'D', called: sq.has(p.id), starter: !!sq.get(p.id)?.starter,
      minutes: stats[p.id]?.minutes ?? 0, gf, assists: stats[p.id]?.assists ?? 0, gc,
      yellow: stats[p.id]?.yellow ?? 0, red: stats[p.id]?.red ?? 0
    };
    const o = over[p.id] || {};
    return { p, ...base, ...Object.fromEntries(['available', 'called', 'starter', 'minutes'].filter((k) => o[k] != null).map((k) => [k, o[k]])),
      gc: { ...gc, ...(o.gc || {}) }, manual: { ...Object.fromEntries(['available', 'called', 'starter', 'minutes'].filter((k) => o[k] != null).map((k) => [k, true])), ...Object.fromEntries(Object.keys(o.gc || {}).map((k) => ['gc_' + k, true])) } };
  }).sort((a, b) => (b.called - a.called) || (a.p.number ?? 99) - (b.p.number ?? 99));
}
