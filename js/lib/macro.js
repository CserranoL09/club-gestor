// Macrociclos (hoja MACROCICLO): plantillas, áreas, fases y cálculos por semana.
import { EXAMPLE_MACRO } from './methodology.js';
import { mondayOf } from './dates.js';

export const MACRO_AREAS = [['porteros', 'Porteros'], ['condicional', 'Condicional'], ['tecnica', 'Técnica'], ['tactica', 'Táctica'], ['general', 'General']];
export const PHASES = [
  { key: 'preparatorio', label: 'Preparatorio', color: '#f59e0b' },
  { key: 'competitivo', label: 'Competitivo', color: '#22c55e' },
  { key: 'transicion', label: 'Transición', color: '#3b82f6' }
];
export const areaName = (k) => (MACRO_AREAS.find(([x]) => x === k) || [k, k || 'General'])[1];

const items = (list) => list.map((name) => ({ name, marks: {} }));
export const BUILTIN_TEMPLATES = [
  { key: 'porteros', name: 'Porteros', area: 'porteros', groups: structuredClone(EXAMPLE_MACRO.groups) },
  {
    key: 'condicional', name: 'Condicional', area: 'condicional', groups: [
      { name: 'Fuerza', items: items(['Prevención', 'Fuerza máxima', 'Fuerza explosiva', 'Fuerza resistencia']) },
      { name: 'Resistencia', items: items(['Aeróbica', 'Intermitente', 'Anaeróbica láctica']) },
      { name: 'Velocidad', items: items(['Reacción', 'Aceleración', 'Velocidad máxima', 'Cambios de dirección']) },
      { name: 'Movilidad', items: items(['Movilidad articular', 'Flexibilidad']) }
    ]
  },
  { key: 'blanco', name: 'En blanco', area: 'general', groups: [{ name: 'Grupo 1', items: items(['Contenido 1', 'Contenido 2']) }] }
];

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Lunes de inicio por defecto (el de la temporada) y semanas hasta su fin (máx. 60). */
export function defaultSpan(season) {
  const start = mondayOf(new Date((season?.start_date || iso(new Date())) + 'T00:00:00'));
  const end = season?.end_date ? new Date(season.end_date + 'T00:00:00') : null;
  const weeks = end ? Math.min(60, Math.max(1, Math.round((mondayOf(end) - start) / (7 * 864e5)) + 1)) : 36;
  return { start_monday: iso(start), weeks };
}

/** Fases por defecto: 6 semanas de preparatorio, competitivo y 2 de transición al final. */
export function defaultPhases(weeks) {
  const pre = Math.min(6, weeks), tr = weeks > 12 ? 2 : 0;
  return [
    { from: 0, to: pre - 1, key: 'preparatorio' },
    ...(weeks - tr > pre ? [{ from: pre, to: weeks - tr - 1, key: 'competitivo' }] : []),
    ...(tr ? [{ from: weeks - tr, to: weeks - 1, key: 'transicion' }] : [])
  ];
}

/** Lunes de cada semana del macrociclo. */
export function macroWeeks(m) {
  const start = new Date(m.start_monday + 'T00:00:00');
  return Array.from({ length: m.weeks }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + 7 * i); return { i, monday: d }; });
}
/** Semanas marcadas de un ítem / de un grupo. */
export const itemTotal = (it, n) => Object.keys(it.marks || {}).filter((w) => +w < n).length;
export const groupWeek = (g, w) => (g.items || []).filter((it) => it.marks?.[w] != null).length;
export const groupTotal = (g, n) => (g.items || []).reduce((s, it) => s + itemTotal(it, n), 0);
