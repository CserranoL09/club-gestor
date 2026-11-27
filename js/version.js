// Sube APP_VERSION y añade la entrada al principio de CHANGELOG en cada versión nueva.
export const APP_VERSION = '0.16.0';

export const CHANGELOG = [
  {
    version: '0.16.0',
    date: '27/11/2026',
    items: [
      'Acta del partido (hoja PARTIDO), pensada para el banquillo en el móvil o la tableta: marcador fijo arriba y resultado calculado con los eventos.',
      'Cronómetro por partes (partes × minutos del equipo) con pausa, siguiente parte y ajuste manual; la pantalla no se apaga mientras corre.',
      'Botones grandes de Gol, Gol rival, Amarilla, Roja y Cambio: jugador (y asistente), origen (combinativo, directo, transición, ABP), nota y minuto del cronómetro o escrito.',
      'Lista de eventos ordenada por minuto, editable, con «Deshacer el último».',
      'Tabla de convocados (Nº, Jugador, Gol, Asis, TA, TR, Min) calculada sola: titulares desde el 0, los cambios suman y restan y la roja corta; cada celda se corrige a mano (queda marcada) y ↺ vuelve al cálculo.',
      'Contadores rápidos +/− configurables (recuperaciones, pérdidas, faltas, ocasiones…), anotaciones y observaciones.',
      'Sin conexión los eventos se guardan en el dispositivo y se sincronizan al volver la conexión.'
    ]
  },
  {
    version: '0.15.1',
    date: '27/11/2026',
    items: [
      'Cada versión nueva se carga entera al momento: los archivos de la app van marcados con su versión, así el navegador (también Safari) no mezcla archivos viejos y nuevos.',
      'Si se publica una versión mientras la app está abierta, aparece el aviso «Hay una versión nueva» con el botón «Actualizar».'
    ]
  },
  {
    version: '0.15.0',
    date: '27/11/2026',
    items: [
      'Partidos: lista con jornada, fecha, local y visitante (el equipo se pone solo), resultado y estado (pendiente, convocado, jugado, con informe), con filtros.',
      '«Nuevo partido» y «Pegar calendario» (líneas «1;12/09/2026;Rival;casa;11:00» con vista previa y revisión).',
      'Prepartido: jornada, fecha, hora, citación, lugar, rival y local/visitante.',
      'Convocatoria hasta el máximo del equipo (18 en F11, 14 en F7), con aviso de lesionados, orden y titulares (11 o 7, avisando si no cuadra), «Convocar disponibles» y «Copiar del partido anterior».',
      'Sistema en un mini-campo (F11: 1-4-3-3, 1-4-4-2, 1-4-2-3-1, 1-3-5-2, 1-5-3-2; F7: 1-3-3, 1-2-3-1, 1-3-2-1) con fichas que se arrastran con el ratón o el dedo.',
      'Planteamiento (ataque, defensa, rival), ABP a favor y en contra, observaciones e «Imprimir convocatoria».'
    ]
  },
  {
    version: '0.14.0',
    date: '27/11/2026',
    items: [
      'Morfociclo (hoja MORFOCICLO): tabla de filas × días con las filas y valores del Excel (principios, grupos, táctica, temática, intensidad, espacio, volumen, intervalos, recuperación, periodos, rivales y estrategia).',
      'Día de partido configurable y opción «Ver como días respecto al partido» (P+1, P+2, P−4 … P−1, Partido).',
      'Varios morfociclos por equipo («Semana estándar», «Semana con dos partidos», en blanco o duplicado) y uno predeterminado.',
      'Celdas editables con guardado automático, filas y secciones añadibles y reordenables, y días coloreados por intensidad (baja, media, alta).',
      'En el móvil, vista por día.',
      'Sesiones: al crear una sesión y en su ficha se muestra como guía la columna del día del morfociclo predeterminado.'
    ]
  },
  {
    version: '0.13.1',
    date: '27/11/2026',
    items: [
      'Los periodos de la Periodización y las fases del Macrociclo se pintan con el color exacto de su leyenda (Preparatorio naranja, Competitivo verde, Transición azul).'
    ]
  },
  {
    version: '0.13.0',
    date: '27/11/2026',
    items: [
      'Macrociclos (hoja MACROCICLO): varios por equipo (porteros, condicional, general…) con lista y resumen.',
      'Nuevo a partir de plantilla: «Porteros» con los grupos e ítems del Excel, «Condicional», «En blanco» o las plantillas del club.',
      'Semanas con las fechas reales de la temporada, cabecera de meses y fases (Preparatorio, Competitivo, Transición) pintables.',
      'Marcas ✖ o nivel 1–3 tocando o arrastrando, total de semanas por contenido y resumen por grupo.',
      'Grupos y contenidos editables y reordenables.',
      'Editan Dirección, entrenador principal y 2.º entrenador; el preparador físico, los del área condicional, y el de porteros, los de porteros (también lo impide la base de datos).',
      'En pantallas táctiles las tablas de Periodización y Macrociclo se marcan con un toque y se desplazan con el dedo.',
      'Migración SQL 010_macrociclo.sql.'
    ]
  },
  {
    version: '0.12.0',
    date: '26/11/2026',
    items: [
      'Periodización (hoja PERIORIZACIÓN): calendario de la temporada por semanas con meses y días calculados solos.',
      'Se crea ya hecha: pretemporada, temporada, vacaciones de Navidad y Semana Santa, dos macrociclos, cuatro mesociclos y microciclos numerados.',
      'Periodos, macrociclos y mesociclos se pintan tocando o arrastrando sobre las semanas, con leyenda editable (nombre y color).',
      'Microciclo con número de inicio y opción de no contar las semanas de vacaciones.',
      'Contenidos con nombre y área, marcados con ✖ o nivel 1–3 de intensidad.',
      'Puntos de sesión y partido en cada día (se abren con un toque), semana actual resaltada e «Ir a hoy». En el móvil, vista por mes.',
      'Sesiones e inicio toman el periodo y el microciclo de la periodización.',
      'Migración SQL 009_periodizacion.sql (también ajustes de seguridad que recomienda Supabase).'
    ]
  },
  {
    version: '0.11.0',
    date: '26/11/2026',
    items: [
      'Sesiones de entrenamiento (hoja SESIÓN): lista por microciclo con filtros por mes y microciclo, duración, nº de tareas y asistencia.',
      'Nueva sesión con número, periodo y microciclo automáticos, cuerpo técnico del club, sesión tipo del club y objetivo sugerido por el morfociclo. Duplicar y borrar.',
      'Ficha en secciones plegables: datos generales con distribución de tareas, cuerpo técnico, objetivos con sugerencias del morfociclo y del club, material del Excel con cantidades y observaciones.',
      'Asistencia: estado con un toque, participación en cada tarea, notas, contadores y «Todos disponibles».',
      'Tareas: calentamiento, tareas y vuelta a la calma con desarrollo, variantes, objetivos, roles, estructura e imagen; tiempo = series × duración + recuperaciones y aviso si se supera la duración.',
      'Biblioteca: insertar tareas del club y guardar las propias (las de los entrenadores llegan como propuesta).',
      'El preparador físico y el entrenador de porteros editan solo su objetivo, su rol y sus tareas (también lo impide la base de datos). Migración SQL 008_sesiones.sql.'
    ]
  },
  {
    version: '0.10.0',
    date: '26/11/2026',
    items: [
      'Plantilla de jugadores: dorsal, nombre, posición, pie, año, estado y activo, con edición en línea y guardado automático.',
      'Estado con un toque (disponible → lesionado → ausente) y contadores como en la hoja SESIÓN.',
      'Dorsal único entre los jugadores activos, con aviso claro.',
      '«Pegar lista» desde el Excel con vista previa y revisión línea a línea, y «Copiar de otro equipo o temporada».',
      'Quitar a un jugador con datos propone marcarlo como inactivo para conservar sus estadísticas.',
      'Ficha del jugador con sus datos y su asistencia, preparada para las estadísticas.',
      'Exportar la plantilla a Excel e imprimirla; comentarios de la Coordinación en la plantilla y en cada jugador.',
      'Migración SQL 007_plantilla.sql.'
    ]
  },
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
