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
