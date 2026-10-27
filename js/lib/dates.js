// Fechas en español: semanas de lunes a domingo, formato dd/mm/aaaa.

export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

/** Date → 'dd/mm/aaaa' */
export function fmt(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/** Lunes de la semana de una fecha (hora local, 00:00). */
export function mondayOf(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const shift = (d.getDay() + 6) % 7; // lunes = 0
  d.setDate(d.getDate() - shift);
  return d;
}

/** Suma días sin problemas con el cambio de hora. */
export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/** Lista de lunes entre dos fechas (ambas incluidas). */
export function weeksBetween(start, end) {
  const out = [];
  for (let d = mondayOf(start); d <= new Date(end); d = addDays(d, 7)) out.push(d);
  return out;
}

/** Nombre de la temporada para una fecha: agosto en adelante empieza la siguiente. */
export function seasonName(date = new Date()) {
  const d = new Date(date);
  const y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}/${String((y + 1) % 100).padStart(2, '0')}`;
}
