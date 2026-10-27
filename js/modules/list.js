// Catálogo de módulos: un botón por cada uno en la página de inicio.
// sheet = hoja del Excel de la que sale; prompt = prompt de docs/prompts.md que lo construye.
export const MODULES = [
  { key: 'sesiones', route: '#/sesiones', icon: '⚽', name: 'Sesiones', desc: 'Ficha de entrenamiento, tareas, material y asistencia', sheet: 'SESIÓN', prompt: 6, group: 'Entrenamiento' },
  { key: 'periodizacion', route: '#/periodizacion', icon: '🗓', name: 'Periodización', desc: 'Calendario de la temporada y ciclos', sheet: 'PERIORIZACIÓN', prompt: 7, group: 'Entrenamiento' },
  { key: 'macrociclo', route: '#/macrociclo', icon: '📈', name: 'Macrociclo', desc: 'Contenidos por semanas de un área', sheet: 'MACROCICLO', prompt: 8, group: 'Entrenamiento' },
  { key: 'morfociclo', route: '#/morfociclo', icon: '🔁', name: 'Morfociclo', desc: 'Semana tipo de lunes a domingo', sheet: 'MORFOCICLO', prompt: 9, group: 'Entrenamiento' },
  { key: 'prepartido', route: '#/partidos', icon: '📋', name: 'Prepartido', desc: 'Convocatoria, sistema y planteamiento', sheet: 'PREPARTIDO', prompt: 10, group: 'Competición' },
  { key: 'partido', route: '#/partidos', icon: '⏱', name: 'Partido', desc: 'Acta: goles, tarjetas y minutos', sheet: 'PARTIDO', prompt: 11, group: 'Competición' },
  { key: 'postpartido', route: '#/partidos', icon: '📝', name: 'Postpartido', desc: 'Informe y evaluación por jornada', sheet: 'POSTPARTIDO', prompt: 12, group: 'Competición' },
  { key: 'plantilla', route: '#/plantilla', icon: '👥', name: 'Plantilla', desc: 'Jugadores, dorsales y estado', prompt: 5, group: 'Club' },
  { key: 'estadisticas', route: '#/estadisticas', icon: '📊', name: 'Estadísticas', desc: 'Acumulados de la temporada', prompt: 13, group: 'Club' },
  { key: 'config', route: '#/config', icon: '⚙', name: 'Configuración', desc: 'Identidad, temporadas, equipos y personas', prompt: 4, group: 'Club' }
];
