// Morfociclo (hoja MORFOCICLO): semana tipo de lunes a domingo.
import { DAYS } from './methodology.js';

export { DAYS };
/** Índice 0 (lunes) … 6 (domingo) de una fecha 'aaaa-mm-dd'. */
export const dayIndex = (dateStr) => (new Date(dateStr + 'T00:00:00').getDay() + 6) % 7;

/** Rótulo respecto al partido: P+1, P+2 tras el partido; P−4 … P−1 antes; «Partido» el día del partido. */
export function relLabel(day, matchDay) {
  const after = (day - matchDay + 7) % 7;
  if (after === 0) return 'Partido';
  if (after <= 2) return `P+${after}`;
  return `P−${7 - after}`;
}

/** Intensidad del día (1 baja, 2 media, 3 alta) a partir de la fila de complejidad/intensidad. */
export function intensityOf(rows, key) {
  const r = (rows || []).find((x) => !x.section && /intens/i.test(x.label || ''));
  const v = String(r?.values?.[key] || '').toLowerCase();
  if (!v) return 0;
  if (v.includes('alta')) return 3;
  if (v.includes('media')) return 2;
  if (v.includes('baja')) return 1;
  return 0;
}
export const INTENSITY = { 1: 'Baja', 2: 'Media', 3: 'Alta' };

/** Guía del día: filas con valor en esa columna. */
export function dayGuide(m, dateStr) {
  if (!m?.rows?.length || !dateStr) return null;
  const i = dayIndex(dateStr);
  const key = DAYS[i][0];
  const rows = m.rows.filter((r) => !r.section && r.values?.[key]).map((r) => ({ label: r.label, value: r.values[key] }));
  return { day: DAYS[i][1], rel: relLabel(i, m.match_day ?? 6), rows, name: m.name, intensity: intensityOf(m.rows, key) };
}

export function guideHTML(g, esc) {
  if (!g) return '';
  return `<div class="mf-guide"><p class="mf-guide-h">🧭 Guía del morfociclo · <strong>${esc(g.day)}</strong> (${esc(g.rel)})${g.intensity ? ` · <span class="int-pill int-${g.intensity}">Intensidad ${INTENSITY[g.intensity].toLowerCase()}</span>` : ''}</p>
    ${g.rows.length ? `<dl>${g.rows.map((r) => `<div><dt>${esc(r.label)}</dt><dd>${esc(r.value)}</dd></div>`).join('')}</dl>` : '<p class="muted">El morfociclo no tiene nada para este día.</p>'}</div>`;
}
