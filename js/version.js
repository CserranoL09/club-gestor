// Sube APP_VERSION y añade la entrada al principio de CHANGELOG en cada versión nueva.
export const APP_VERSION = '0.9.0';

export const CHANGELOG = [
  {
    version: '0.9.0',
    date: '26/11/2026',
    items: [
      'Calendario del club: sesiones, partidos y reservas de todos los equipos en vista semana y mes, con colores por equipo y filtros por equipo y categoría.',
      'Instalaciones (Configuración → Instalaciones): campos que se reservan completos, por mitades o por cuartos, vestuarios y otras salas.',
      'Reservas de campo desde el calendario para sesiones, partidos (con calentamiento y descanso) o usos sueltos, con aviso cuando no caben a la vez.',
      'Horario base de cada equipo (días, horas y campo) que crea de una vez las sesiones vacías de la semana sin duplicar ni pisar días de partido.',
      'Exportar el calendario a PDF (imprimir) y a .ics para Google Calendar, Outlook o el móvil.',
      'Migración SQL 006_calendario.sql.'
    ]
  },
  {
    version: '0.8.0',
    date: '26/11/2026',
    items: [
      'Metodología del club (Dirección y Coordinación la mantienen; todo el club la consulta).',
      'Modelo de juego: principios y subprincipios por fase (ataque, defensa, transiciones y ABP) y etapa, con texto e imagen. Ejemplo listo a partir del Excel.',
      'Objetivos por categoría (técnicos, tácticos, condicionales y psicológicos); Sesiones muestra los de la categoría del equipo.',
      'Biblioteca de tareas del club: tareas oficiales con fase, principio, categorías, jugadores y espacio; los entrenadores proponen y la Coordinación aprueba o rechaza con motivo.',
      'Plantillas del club: sesión tipo, morfociclo y macrociclo por etapa. Los equipos nuevos reciben las predeterminadas y se pueden aplicar a los actuales.',
      'Migración SQL 005_metodologia.sql.'
    ]
  },
  {
    version: '0.7.0',
    date: '26/11/2026',
    items: [
      'Panel del club completo: una tarjeta por equipo con sesiones de la semana, asistencia, próximo partido, último resultado, informes pendientes, lesionados y comentarios.',
      'Alertas del club configurables (sin entrenador, sin sesiones, informes atrasados, asistencia baja, convocatoria sin hacer).',
      'Filtros del panel por categoría, modalidad y «solo con alertas».',
      'Exportar el panel a PDF (imprimir) y a Excel.',
      'Comentarios de supervisión en «Mi equipo» y en cada apartado: responder, resolver y borrar.',
      'Bandeja de comentarios para la Dirección, la Coordinación y los entrenadores.'
    ]
  },
  {
    version: '0.6.0',
    date: '26/11/2026',
    items: [
      'Nueva navegación: barra lateral en el ordenador y barra inferior con «Más» en el móvil.',
      'Dirección y Coordinación entran en el Panel del club; los entrenadores, directamente en «Mi equipo».',
      'Alta del club en 4 pasos: datos y escudo, temporada, equipos (con categorías típicas) y cuerpo técnico con un enlace de invitación por persona.',
      'Página Equipos con el cuerpo técnico de cada uno y botón «Entrar al equipo»; franja «Viendo equipo · volver al club».',
      'Quien acepta una invitación entra directamente en su equipo.',
      'Bienvenida con tres caminos (club, invitación, por mi cuenta) y modo formación para profesores y alumnos.'
    ]
  },
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
