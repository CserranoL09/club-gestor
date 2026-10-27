// Sube APP_VERSION y añade la entrada al principio de CHANGELOG en cada versión nueva.
export const APP_VERSION = '0.2.0';

export const CHANGELOG = [
  {
    version: '0.2.0',
    date: '27/10/2026',
    items: [
      'Base de datos en Supabase con clubes, temporadas, equipos, jugadores, sesiones, planificación, partidos y comentarios.',
      'Seguridad por roles: administrador, entrenador, preparador físico, entrenador de porteros y profesor (solo lectura y comentarios).',
      'La cabecera indica si la conexión con Supabase funciona y si falta instalar la base de datos.'
    ]
  },
  {
    version: '0.1.0',
    date: '27/10/2026',
    items: [
      'Primera versión: esqueleto de la app con página de inicio y un botón por cada hoja del Excel.',
      'Tema oscuro y claro.',
      'Aviso «Falta configurar Supabase» mientras no haya base de datos conectada.'
    ]
  }
];
