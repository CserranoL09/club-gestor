# Novedades de Club Gestor

## v0.3.0 · 24/11/2026

- Cuentas: entrar con contraseña, crear cuenta, enlace por email y recuperar la contraseña.
- Bienvenida para empezar: crear tu club (con temporada, primer equipo y escudo), aceptar una invitación o unirte a la clase de tu profesor.
- Configuración → Personas: cambiar roles, asignar equipos, quitar personas, pasar la administración e invitar con un enlace (WhatsApp o email).
- Mi perfil: nombre, «soy profesor», cambiar contraseña y salir de un club.
- Si perteneces a varios clubes, cámbialos desde el menú. La cabecera muestra temporada, equipo y tu rol, con los colores del club.
- Los módulos indican «Solo ver» cuando tu rol no puede editarlos.
- Base de datos: migración `001_perfil_email.sql` (email en el perfil).

## v0.2.0 · 27/10/2026

- Base de datos en Supabase con clubes, temporadas, equipos, jugadores, sesiones, planificación, partidos y comentarios.
- Seguridad por roles: administrador, entrenador, preparador físico, entrenador de porteros y profesor (solo lectura y comentarios).
- La cabecera indica si la conexión con Supabase funciona y si falta instalar la base de datos.

## v0.1.0 · 27/10/2026

- Primera versión: esqueleto de la app con página de inicio y un botón por cada hoja del Excel.
- Tema oscuro y claro.
- Aviso «Falta configurar Supabase» mientras no haya base de datos conectada.
