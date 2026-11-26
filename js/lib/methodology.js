// Metodología del club: constantes, ejemplos de partida y utilidades compartidas.
import { sb } from '../supabase.js';
import { S, isAdmin, isCoordinator } from '../session.js';

export const PHASES = [
  { key: 'ataque', name: 'Ataque', icon: '⚔' },
  { key: 'defensa', name: 'Defensa', icon: '🛡' },
  { key: 'trans_ofensiva', name: 'Transición ofensiva', icon: '↗' },
  { key: 'trans_defensiva', name: 'Transición defensiva', icon: '↙' },
  { key: 'abp', name: 'Acciones a balón parado', icon: '⚑' }
];
export const STAGES = [
  { key: 'todas', name: 'Todo el club' },
  { key: 'base', name: 'Fútbol base' },
  { key: 'rendimiento', name: 'Rendimiento' }
];
export const AREAS = [
  { key: 'tecnico', name: 'Técnicos' },
  { key: 'tactico', name: 'Tácticos' },
  { key: 'condicional', name: 'Condicionales' },
  { key: 'psicologico', name: 'Psicológicos' }
];
export const TYPICAL_CATEGORIES = ['Prebenjamín', 'Benjamín', 'Alevín', 'Infantil', 'Cadete', 'Juvenil', 'Aficionado'];
export const TEMPLATE_KINDS = [
  { key: 'sesion', name: 'Sesión tipo', icon: '⚽', help: 'Estructura de una sesión (bloques y minutos). Se propondrá al crear sesiones.' },
  { key: 'morfociclo', name: 'Morfociclo', icon: '🔁', help: 'Semana tipo. Se copia a cada equipo nuevo de su etapa y se puede aplicar a los actuales.' },
  { key: 'macrociclo', name: 'Macrociclo', icon: '📈', help: 'Contenidos por semanas (p. ej. porteros). Se copia a cada equipo nuevo de su etapa.' }
];

export const phaseName = (k) => PHASES.find((p) => p.key === k)?.name || k;
export const stageName = (k) => STAGES.find((s) => s.key === k)?.name || k;

/** Dirección y Coordinación editan la metodología (RLS: can_edit_methodology). */
export function canEditMethodology() { return isAdmin() || isCoordinator(); }

/** Etapa de una categoría (igual que stage_of_category en SQL). */
export function stageOf(category) {
  return /(juvenil|aficionad|senior|sénior|regional|preferente|tercera|segunda|primera|veteran|amateur)/i.test(category || '') ? 'rendimiento' : 'base';
}

/** Categorías a mostrar: las de los equipos del club y las típicas. */
export function clubCategories(extra = []) {
  const own = S.teams.map((t) => (t.category || '').trim()).filter(Boolean);
  const all = [...new Set([...own, ...extra, ...TYPICAL_CATEGORIES])];
  const idx = (c) => { const i = TYPICAL_CATEGORIES.findIndex((t) => c.toLowerCase().startsWith(t.toLowerCase())); return i < 0 ? 99 : i; };
  return all.sort((a, b) => idx(a) - idx(b) || a.localeCompare(b, 'es'));
}

/** Objetivos del club para la categoría de un equipo (null si no hay). */
export async function objectivesFor(category) {
  if (!S.club || !category) return null;
  const { data } = await sb().from('category_objectives').select('category, objectives, notes').eq('club_id', S.club.id);
  const list = data || [];
  const exact = list.find((r) => r.category.toLowerCase() === category.toLowerCase());
  if (exact) return exact;
  // «Infantil A · 2.ª» → «Infantil»
  return list.find((r) => category.toLowerCase().startsWith(r.category.toLowerCase())) || null;
}

// ---------------------------------------------------------------------
// Ejemplos de partida (el club los adapta)
// ---------------------------------------------------------------------
export const EXAMPLE_PRINCIPLES = [
  ['ataque', 'Conservación', 'Tener el balón para atraer al rival y encontrar ventajas.', ['Superioridad numérica cerca del balón', 'Amplitud y profundidad para dar líneas de pase']],
  ['ataque', 'Progresión', 'Avanzar con criterio hacia la portería rival.', ['Atraer para liberar', 'Recibir entre líneas orientado']],
  ['ataque', 'Finalización', 'Llegar al área con número y crear ocasiones claras.', ['Ocupar el área con tres jugadores', 'Llegada de segunda línea']],
  ['defensa', 'Recuperación', 'Recuperar el balón lo antes y lo más arriba posible.', ['Presión tras pérdida en los primeros 5 segundos']],
  ['defensa', 'Contención', 'Evitar que el rival progrese por dentro.', ['Bloque compacto, distancias cortas entre líneas']],
  ['defensa', 'Protección', 'Proteger el área y el espacio a la espalda.', ['Vigilancias y coberturas permanentes']],
  ['trans_ofensiva', 'Salir de la zona de presión', 'Primer pase hacia fuera o hacia delante tras recuperar.', []],
  ['trans_defensiva', 'Reacción inmediata a la pérdida', 'Presionar al poseedor y cerrar líneas de pase cercanas.', []],
  ['abp', 'Roles definidos', 'Cada jugador conoce su función en córners y faltas a favor y en contra.', []]
];

export const EXAMPLE_OBJECTIVES = {
  'Prebenjamín': { tecnico: ['Conducción', 'Golpeo con el interior'], tactico: ['Orientarse hacia la portería rival'], condicional: ['Coordinación y agilidad a través del juego'], psicologico: ['Disfrutar y compartir el balón'] },
  'Benjamín': { tecnico: ['Control orientado', 'Pase corto'], tactico: ['Ocupar espacios libres'], condicional: ['Coordinación y velocidad de reacción'], psicologico: ['Respeto a compañeros, rivales y árbitro'] },
  'Alevín': { tecnico: ['Pase y control a dos toques', 'Regate y protección del balón'], tactico: ['Amplitud y profundidad', 'Ayudas defensivas'], condicional: ['Velocidad y coordinación'], psicologico: ['Concentración y toma de decisiones'] },
  'Infantil': { tecnico: ['Pase largo', 'Remate de cabeza'], tactico: ['Juego entre líneas', 'Presión tras pérdida'], condicional: ['Iniciación a la fuerza con autocargas'], psicologico: ['Responsabilidad y trabajo en equipo'] },
  'Cadete': { tecnico: ['Precisión a alta velocidad'], tactico: ['Sistemas de juego y cambios de orientación'], condicional: ['Resistencia aeróbica y fuerza'], psicologico: ['Gestión del error y de la presión'] },
  'Juvenil': { tecnico: ['Ejecución en espacios reducidos y alta intensidad'], tactico: ['Modelo de juego completo del club', 'Acciones a balón parado'], condicional: ['Fuerza, potencia y prevención de lesiones'], psicologico: ['Liderazgo y competitividad'] },
  'Aficionado': { tecnico: ['Eficacia en la finalización'], tactico: ['Planteamiento según el rival'], condicional: ['Mantenimiento y gestión de cargas'], psicologico: ['Compromiso y cohesión del grupo'] }
};

/** Ejemplo de la hoja SESIÓN del Excel. */
export const EXAMPLE_SESSION = {
  duration: 85,
  blocks: [
    { kind: 'warmup', title: 'Calentamiento', minutes: 15, objective: '' },
    { kind: 'task', title: 'Tarea 1', minutes: 15, objective: '' },
    { kind: 'task', title: 'Tarea 2', minutes: 15, objective: '' },
    { kind: 'task', title: 'Tarea 3', minutes: 15, objective: '' },
    { kind: 'task', title: 'Tarea 4', minutes: 15, objective: '' },
    { kind: 'cooldown', title: 'Vuelta a la calma', minutes: 10, objective: '' }
  ]
};

/** Ejemplo de la hoja MACROCICLO del Excel (porteros). */
export const EXAMPLE_MACRO = {
  area: 'porteros',
  weeks: 36,
  groups: [
    { name: 'Condicional', items: ['Preventivo', 'Fuerza', 'Velocidad', 'Coordinación'] },
    { name: 'Técnica', items: ['Desplazamientos + posición corporal', 'Blocajes con/sin caída', 'Desvío + incorporación', 'Juego aéreo', 'Juego de pie'] },
    { name: 'Táctica', items: ['Tiro lejano', 'Tiro cercano', '1x1', 'Centro-remate', 'Pase atrás'] },
    { name: 'Visual', items: ['Iniciación a conceptos técnicos', 'Iniciación a conceptos tácticos', 'Desarrollo de conceptos técnicos', 'Desarrollo de conceptos tácticos', 'Trabajo individualizado'] }
  ].map((g) => ({ name: g.name, items: g.items.map((name) => ({ name, marks: {} })) }))
};

export const DAYS = [['lun', 'Lunes'], ['mar', 'Martes'], ['mie', 'Miércoles'], ['jue', 'Jueves'], ['vie', 'Viernes'], ['sab', 'Sábado'], ['dom', 'Domingo']];
