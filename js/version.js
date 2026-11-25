// Sube APP_VERSION y añade la entrada al principio de CHANGELOG en cada versión nueva.
export const APP_VERSION = '0.5.0';

export const CHANGELOG = [
  {
    version: '0.5.0',
    date: '25/11/2026',
    items: [
      'Nuevos perfiles de club: Dirección, Coordinación, Entrenador principal, 2.º entrenador / delegado, Preparador físico y Entrenador de porteros, con especialidad.',
      'Cada persona del cuerpo técnico ve solo sus equipos. La Dirección puede abrirlo a todos en Configuración → Club.',
      'Personas: vista del cuerpo técnico por equipo, aviso de equipos sin entrenador principal e invitación directa a un equipo.',
      'La Coordinación invita al cuerpo técnico de sus equipos; lo ve todo y lo comenta, pero no edita el trabajo diario.',
      'Configuración → Club: datos del club (localidad, fundación, contacto, presentación).'
    ]
  },
  {
    version: '0.4.1',
    date: '25/11/2026',
    items: ['Mensajes claros cuando Supabase no puede enviar un email (falta configurar el correo propio).']
  },
  {
    version: '0.4.0',
    date: '25/11/2026',
    items: [
      'Inicio con tarjetas resumen: próximo partido con cuenta atrás, última y próxima sesión, microciclo actual, lesionados, asistencia de las últimas 4 semanas y comentarios del profesor.',
      'Prepartido y Partido abren el próximo partido; Postpartido, el último jugado.',
      'Configuración → Identidad: nombre, escudo, colores, tema y tipografía, con vista previa al momento.',
      'Configuración → Página inicial: ordena (arrastrando o con flechas), oculta o renombra los botones y elige las tarjetas.',
      'Configuración → Temporadas y equipos: nueva temporada a partir de la anterior (equipos, plantilla y morfociclos), temporada actual, archivar, y crear o editar equipos.',
      'Guardado automático con indicador; si no hay conexión, se guarda al volver. Aviso si otra persona cambió lo mismo.'
    ]
  },
  {
    version: '0.3.0',
    date: '24/11/2026',
    items: [
      'Cuentas: entrar con contraseña, crear cuenta, enlace por email y recuperar la contraseña.',
      'Bienvenida para empezar: crear tu club (con temporada, primer equipo y escudo), aceptar una invitación o unirte a la clase de tu profesor.',
      'Configuración → Personas: cambiar roles, asignar equipos, quitar personas, pasar la administración e invitar con un enlace (WhatsApp o email).',
      'Mi perfil: nombre, «soy profesor», cambiar contraseña y salir de un club.',
      'Si perteneces a varios clubes, cámbialos desde el menú. La cabecera muestra temporada, equipo y tu rol, con los colores del club.',
      'Los módulos indican «Solo ver» cuando tu rol no puede editarlos.'
    ]
  },
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
