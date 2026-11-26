// Cálculos de la periodización que usan varios módulos (inicio, sesiones, calendario).
import { mondayOf } from './dates.js';

const DAY = 86400000;

/** Índice de semana (0 = la del lunes de inicio) de una fecha. */
export function weekIndex(startMonday, date = new Date()) {
  const a = mondayOf(new Date(startMonday + 'T00:00:00'));
  const b = mondayOf(date);
  return Math.round((b - a) / (7 * DAY));
}

/**
 * Microciclo de una fecha según la periodización.
 * Devuelve { week, number, skipped, period } o null si la fecha queda fuera.
 */
export function microcycleAt(p, date = new Date()) {
  if (!p?.start_monday) return null;
  const week = weekIndex(p.start_monday, date);
  const end = p.end_date ? new Date(p.end_date + 'T23:59:59') : null;
  if (week < 0 || (end && date > end)) return null;
  const skip = new Set(p.micro_skip || []);
  const skipped = skip.has(week);
  let before = 0;
  skip.forEach((w) => { if (w < week) before++; });
  const range = (p.periods || []).find((r) => week >= r.from && week <= r.to);
  const legend = range && (p.legend || []).find((l) => l.key === range.key);
  return {
    week,
    number: skipped ? null : (p.micro_start ?? 1) + week - before,
    skipped,
    period: legend?.label || ''
  };
}

// ---------------------------------------------------------------------
// Edición de la periodización (módulo Periodización)
// ---------------------------------------------------------------------
export const AREAS = [['condicional', 'Condicional'], ['tecnica', 'Técnica'], ['tactica', 'Táctica'], ['estrategica', 'Estratégica'], ['psicologica', 'Psicológica']];
export const LEVELS = { x: '✖', 1: '1', 2: '2', 3: '3' };
export const DEFAULT_LEGEND = [
  { key: 'pre', label: 'Pretemporada', color: '#f59e0b' },
  { key: 'temp', label: 'Temporada', color: '#22c55e' },
  { key: 'vac', label: 'Vacaciones', color: '#3b82f6', holiday: true }
];

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Lunes de cada semana entre start_monday y end_date. */
export function weeksOf(p) {
  const out = [];
  const start = mondayOf(new Date(p.start_monday + 'T00:00:00'));
  const end = new Date((p.end_date || p.start_monday) + 'T00:00:00');
  for (let d = new Date(start), i = 0; d <= end && i < 80; d.setDate(d.getDate() + 7), i++) out.push({ i, monday: new Date(d), iso: iso(d) });
  return out;
}

/** Tramos [{from, to, …}] → un valor por semana (o null). */
export function rangesToWeeks(ranges, n, field) {
  const arr = Array(n).fill(null);
  for (const r of ranges || []) for (let w = Math.max(0, r.from); w <= Math.min(n - 1, r.to); w++) arr[w] = r[field];
  return arr;
}
/** Un valor por semana → tramos [{from, to, field}] seguidos. */
export function weeksToRanges(arr, field) {
  const out = [];
  arr.forEach((v, w) => {
    const last = out[out.length - 1];
    if (v == null || v === '') return;
    if (last && last[field] === v && last.to === w - 1) last.to = w;
    else out.push({ from: w, to: w, [field]: v });
  });
  return out;
}

/** Semanas que no cuentan como microciclo (vacaciones), si la opción está activada. */
export function skippedWeeks(p) {
  if (!p.options?.skip_holidays) return [];
  const hol = new Set((p.legend || []).filter((l) => l.holiday).map((l) => l.key));
  const out = [];
  for (const r of p.periods || []) if (hol.has(r.key)) for (let w = r.from; w <= r.to; w++) out.push(w);
  return [...new Set(out)].sort((a, b) => a - b);
}

/** Domingo de Pascua (algoritmo de Meeus). */
export function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}

/**
 * Periodización inicial de la temporada (como la hoja del Excel, pero calculada):
 * pretemporada en agosto y septiembre, vacaciones en Navidad y Semana Santa, macrociclo 2 tras Navidad,
 * cuatro mesociclos iguales y filas de contenidos vacías.
 */
export function defaultPeriodization(season) {
  const startDate = new Date((season?.start_date || `${new Date().getFullYear()}-08-03`) + 'T00:00:00');
  const start = mondayOf(startDate);
  const y = start.getMonth() >= 6 ? start.getFullYear() : start.getFullYear() - 1;
  const endIso = season?.end_date && season.end_date <= `${y + 1}-05-31` ? season.end_date : `${y + 1}-05-30`;
  const p = { start_monday: iso(start), end_date: endIso, legend: structuredClone(DEFAULT_LEGEND), micro_start: 1, options: { skip_holidays: false } };
  const weeks = weeksOf(p);
  const n = weeks.length;
  const wk = (date) => Math.max(0, Math.min(n - 1, Math.round((mondayOf(date) - start) / (7 * DAY))));
  const per = Array(n).fill('temp');
  for (let w = 0; w <= wk(new Date(y, 8, 14)); w++) per[w] = 'pre';                        // hasta mediados de septiembre
  const xmasA = wk(new Date(y, 11, 24)), xmasB = wk(new Date(y + 1, 0, 6));
  for (let w = xmasA; w <= xmasB; w++) per[w] = 'vac';
  const ea = easter(y + 1);
  per[wk(new Date(ea.getFullYear(), ea.getMonth(), ea.getDate() - 3))] = 'vac';
  p.periods = weeksToRanges(per, 'key');
  p.macro = [{ from: 0, to: xmasB, label: '1' }, { from: xmasB + 1, to: n - 1, label: '2' }].filter((r) => r.from <= r.to);
  const q = Math.ceil(n / 4);
  p.meso = [0, 1, 2, 3].map((i) => ({ from: i * q, to: Math.min(n - 1, (i + 1) * q - 1), label: String(i + 1) })).filter((r) => r.from <= r.to);
  p.contents = Array.from({ length: 8 }, () => ({ name: '', area: '', marks: {} }));
  p.micro_skip = [];
  return p;
}
