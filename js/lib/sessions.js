// Sesiones de entrenamiento (hoja SESIÓN): material, bloques, tiempos, periodo y microciclo.
import { mondayOf } from './dates.js';

export const MATERIAL = ['Balones', 'Miniporterías', 'Vallas', 'Conos', 'Picas / Bases', 'Setas', 'Petos', 'Aros', 'Escaleras', 'Bosus', 'TRX',
  'Elásticos', 'Minibands', 'Discos', 'Steps', 'Fitball', 'Mancuernas', 'Barras'];
export const OBJECTIVES = [['general', 'General'], ['condicional', 'Condicional'], ['tectac', 'Técnico-táctico'], ['psicologico', 'Psicológico']];
export const STAFF = [['entrenador', 'Entrenador'], ['segundo', '2.º entrenador'], ['preparador', 'Preparador físico'], ['porteros', 'Entrenador de porteros']];
export const ROLES = [['entrenador', '1.er entrenador'], ['segundo', '2.º entrenador'], ['preparador', 'Preparador físico'], ['porteros', 'Porteros']];
export const BLOCK_KINDS = { warmup: 'Calentamiento', task: 'Tarea', cooldown: 'Vuelta a la calma' };
/** Rol de cada perfil del club en la ficha (cuerpo técnico y roles de las tareas). */
export const MEMBER_STAFF = { entrenador: 'entrenador', ayudante: 'segundo', preparador: 'preparador', porteros: 'porteros' };

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())).slice(0, 8);
const num = (v) => (v === '' || v == null || Number.isNaN(+v) ? 0 : +v);

export function newBlock(kind = 'task', title = '', extra = {}) {
  return {
    id: uid(), kind, title, description: '', variants: [], obj_off: '', obj_def: '',
    roles: {}, structure: { duration: kind === 'task' ? 12 : 15, series: 1, rest: 0, space: '', players: '', goalkeepers: '' },
    image_path: null, ...extra
  };
}

/** Bloques por defecto: los de la sesión tipo del club (si hay) o Calentamiento, Tarea 1–4 y Vuelta a la calma. */
export function defaultBlocks(template) {
  const tb = template?.data?.blocks;
  if (Array.isArray(tb) && tb.length) {
    return tb.map((b) => newBlock(b.kind || 'task', b.title || BLOCK_KINDS[b.kind] || 'Tarea', {
      obj_off: b.objective || '', structure: { duration: num(b.minutes) || 10, series: 1, rest: 0, space: '', players: '', goalkeepers: '' }
    }));
  }
  return [newBlock('warmup', 'Calentamiento', { structure: { duration: 15, series: 1, rest: 0, space: '', players: '', goalkeepers: '' } }),
    ...[1, 2, 3, 4].map((n) => newBlock('task', `Tarea ${n}`)),
    newBlock('cooldown', 'Vuelta a la calma', { structure: { duration: 10, series: 1, rest: 0, space: '', players: '', goalkeepers: '' } })];
}

/** Tiempo del bloque = series × duración + (series − 1) × recuperación (minutos). */
export function blockTime(b) {
  const s = b?.structure || {};
  const series = Math.max(1, num(s.series) || 1);
  return Math.round((series * num(s.duration) + (series - 1) * num(s.rest)) * 10) / 10;
}
export const totalTime = (blocks) => Math.round((blocks || []).reduce((n, b) => n + blockTime(b), 0) * 10) / 10;
export const taskCount = (blocks) => (blocks || []).filter((b) => b.kind === 'task').length;

/** Nombre corto de un bloque para las casillas de asistencia: C, T1…, VC. */
export function blockShort(blocks, i) {
  const b = blocks[i];
  if (b.kind === 'warmup') return 'C';
  if (b.kind === 'cooldown') return 'VC';
  return 'T' + (blocks.slice(0, i + 1).filter((x) => x.kind === 'task').length);
}

/** Estado de asistencia que se muestra: el guardado o, si no hay, el de la plantilla. */
export const attStatus = (att, player) => att?.[player.id]?.status || player.status || 'D';
/** ¿Participa en el bloque? Por defecto sí, si está disponible. */
export const participates = (att, player, blockId) => attStatus(att, player) === 'D' && att?.[player.id]?.tasks?.[blockId] !== false;

/**
 * Periodo y microciclo de una fecha.
 * Con periodización: semana = lunes desde start_monday; periods [{from, to, key}] (índices de semana o fechas) y leyenda.
 * Sin periodización: microciclo = semana desde el inicio de la temporada.
 */
export function periodOf(dateStr, season, per) {
  const d = new Date(dateStr + 'T00:00:00');
  if (per?.start_monday) {
    const start = new Date(per.start_monday + 'T00:00:00');
    const week = Math.floor((mondayOf(d) - start) / (7 * 864e5));
    const inRange = (p) => (typeof p.from === 'number' ? week >= p.from && week <= p.to : dateStr >= p.from && dateStr <= p.to);
    const p = (per.periods || []).find(inRange);
    const label = p ? (per.legend || []).find((l) => l.key === p.key)?.label || p.key : '';
    const skipped = (per.micro_skip || []).filter((w) => w <= week).length;
    const skip = (per.micro_skip || []).includes(week);
    return { period: label, microcycle: week >= 0 && !skip ? (per.micro_start || 1) + week - skipped : null };
  }
  if (season?.start_date) {
    const week = Math.floor((mondayOf(d) - mondayOf(new Date(season.start_date + 'T00:00:00'))) / (7 * 864e5));
    return { period: '', microcycle: week >= 0 ? week + 1 : null };
  }
  return { period: '', microcycle: null };
}

/** Clave del día del morfociclo (lun…dom). */
export const dayKey = (dateStr) => ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'][new Date(dateStr + 'T00:00:00').getDay()];

/** Bloque de la biblioteca del club → bloque de sesión. */
export function fromLibrary(t, author) {
  const b = t.block || {};
  return newBlock('task', t.title || 'Tarea', {
    description: b.description || '', variants: b.variants || [], obj_off: b.obj_off || b.objective || '', obj_def: b.obj_def || '',
    structure: { duration: num(b.duration) || num(b.structure?.duration) || 12, series: num(b.structure?.series) || 1, rest: num(b.structure?.rest) || 0,
      space: b.space || b.structure?.space || '', players: b.players || b.structure?.players || '', goalkeepers: b.structure?.goalkeepers || '' },
    image_path: t.image_path || null, author_id: author, library_id: t.id
  });
}
/** Bloque de sesión → tarea de la biblioteca. */
export function toLibrary(b) {
  return {
    title: b.title || 'Tarea',
    image_path: b.image_path || null,
    block: { description: b.description || '', variants: b.variants || [], objective: b.obj_off || '', obj_off: b.obj_off || '', obj_def: b.obj_def || '',
      players: b.structure?.players || '', space: b.structure?.space || '', duration: num(b.structure?.duration) || null, structure: b.structure || {} }
  };
}
