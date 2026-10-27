# Prompts para crear Club Gestor (con Claude en el chat)

Biblioteca de prompts para construir **Club Gestor** hablando con Claude en claude.ai (web, escritorio o móvil) y publicarlo en GitHub Pages como proyecto nuevo (repositorio `club-gestor`). Claude escribe el código y te lo entrega en un ZIP; tú lo subes a GitHub desde la web. Club Gestor es una app para gestionar la temporada de un equipo de fútbol a partir de la plantilla de Excel «Control competición TEMPORADA». Es independiente de Táctica Lab.

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Datos | Nube compartida con **Supabase** (plan gratuito): base de datos, cuentas y archivos |
| Técnica | HTML + CSS + JavaScript **sin build** (módulos ES nativos) y librerías por CDN con versión fija |
| Cómo se construye | **Claude en el chat**: genera los archivos y los entrega en un ZIP |
| Publicación | GitHub Pages, repositorio público `club-gestor`. Los archivos se suben **desde la web de GitHub** |
| Usuarios | Cuerpo técnico y alumnos. Cada alumno crea su club y un **profesor** ve los clubes de sus alumnos para corregir |
| Roles en el club | Administrador · Entrenador · Preparador físico · Entrenador de porteros (más el profesor, solo lectura y comentarios) |
| Modalidades | Fútbol 11 y fútbol 7 |
| Estructura | Página inicial configurable del club, con un botón por cada hoja del Excel |
| Exportación | PDF e impresión · Excel con las mismas hojas · Importar desde el Excel actual · Copia JSON |

## Cómo usarla

**Preparación (una sola vez)**

1. En claude.ai crea un **Proyecto nuevo** llamado «Club Gestor». En sus **Instrucciones** pega el **Prompt 0** completo. Así Claude lo tiene en todos los chats del proyecto y no hace falta pegarlo cada vez.
2. Crea una cuenta gratuita en github.com si no la tienes.

**En cada chat**

1. Abre un chat nuevo **dentro del proyecto Club Gestor**.
2. Desde el Prompt 2, **adjunta la versión actual de la app**: en GitHub, en tu repositorio, pulsa **Code → Download ZIP** y adjunta ese ZIP al chat.
3. Pega **un único prompt** de esta biblioteca y rellena lo que va entre `[corchetes]`.
4. Claude te devuelve un **ZIP solo con los archivos nuevos o cambiados** (con sus carpetas) y la lista de cambios. Si hay SQL, te dice qué pegar en Supabase y en qué orden.
5. **Sube los cambios a GitHub** (ver «Subir archivos a GitHub» abajo), espera 1–2 minutos y prueba la web.
6. No pases al siguiente prompt hasta que el anterior funcione. Si algo falla, usa el **Prompt 19 · Corregir un error** en un chat nuevo.

**Subir archivos a GitHub desde la web**

1. Descomprime en tu ordenador el ZIP que te dio Claude.
2. En tu repositorio, pulsa **Add file → Upload files**.
3. Arrastra **el contenido** de la carpeta descomprimida (no la carpeta en sí, ni el ZIP). Las subcarpetas (`js/`, `css/`, `supabase/`…) se mantienen si arrastras desde Chrome o Edge.
4. Escribe un mensaje corto (p. ej. «Prompt 6 · Sesiones») y pulsa **Commit changes**. Los archivos con el mismo nombre se sustituyen.
5. Si Claude te dice que **borres** un archivo, ábrelo en GitHub, pulsa **⋯ → Delete file** y confirma.

**Consejos**

- **Un prompt por chat.** Los chats muy largos pierden precisión.
- Si Claude no puede terminar en una respuesta, escribe **«continúa»**. Si un prompt es muy grande, pídele que lo divida en partes.
- **`js/config.js` lleva tus claves de Supabase.** A partir del Prompt 2, Claude no debe incluirlo en el ZIP. Si alguna vez viene, no lo subas o vuelve a poner tus claves.
- Guarda los ZIP que te entrega Claude: son tu historial de versiones.

---

## Prompt 0 · Contexto (pégalo en las Instrucciones del proyecto de Claude)

```
Eres un desarrollador full-stack experto en aplicaciones web sin build, en Supabase (Postgres, Auth, Storage, RLS) y en GitHub Pages. Vamos a crear "Club Gestor", una app gratuita para gestionar la temporada de equipos de fútbol 11 y fútbol 7, pensada para cuerpos técnicos y para alumnos de un curso de entrenador. Se basa en la plantilla de Excel «Control competicion TEMPORADA.xlsx», cuya estructura está resumida en docs/estructura-excel.md. Cada hoja del Excel es un módulo de la app.

CÓMO TRABAJAMOS
- Trabajo contigo en el chat de claude.ai, no en un terminal. Yo subo los archivos a GitHub desde la web y pego el SQL en el SQL Editor de Supabase.
- En cada chat te adjunto el ZIP actual del repositorio (descargado de GitHub). Léelo antes de cambiar nada y parte siempre de esos archivos, no de memoria.
- Entrégame un ZIP descargable con SOLO los archivos nuevos o modificados, COMPLETOS (nunca fragmentos), con su ruta de carpetas desde la raíz del repositorio. Incluye dentro CAMBIOS.txt con: archivos nuevos, modificados y los que debo BORRAR a mano en GitHub.
- No incluyas nunca js/config.js en el ZIP (lleva mis claves), salvo que te lo pida.
- Si la tarea no cabe en una respuesta, divídela en partes, entrega la primera y dime qué escribir para la siguiente.

MÓDULOS (un botón por cada uno en la página inicial del club)
- Sesión (hoja SESIÓN): ficha de entrenamiento con datos generales, cuerpo técnico, objetivos, material, asistencia y tareas.
- Periodización (hoja PERIORIZACIÓN): calendario de la temporada por semanas con periodo, macro/meso/microciclo y contenidos.
- Macrociclo (hoja MACROCICLO): planificación por semanas de contenidos de un área (p. ej. porteros).
- Morfociclo (hoja MORFOCICLO): semana tipo de lunes a domingo.
- Prepartido (hoja PREPARTIDO): convocatoria, sistema, planteamiento y ABP.
- Partido (hoja PARTIDO): acta con goles, asistencias, tarjetas, minutos y anotaciones.
- Postpartido (hoja POSTPARTIDO): informe por jornada, evaluación colectiva e individual y captación.
- Además: Plantilla de jugadores, Estadísticas de temporada, Configuración del club y Panel del profesor.

USUARIOS Y PERMISOS
- Cuentas de Supabase Auth (email y contraseña o enlace mágico). Un usuario puede pertenecer a varios clubes.
- Club > temporadas > equipos. Roles por club en club_members: 'admin' | 'entrenador' | 'preparador' | 'porteros'.
  · admin: todo en su club (configuración, personas, temporadas, equipos).
  · entrenador: crea y edita todo en los equipos de su team_ids (vacío = todos los del club).
  · preparador / porteros: leen todo el club. Editan sesiones, macrociclos y morfociclos de sus equipos (en la ficha de sesión, la interfaz solo les deja editar sus apartados: objetivo condicional, rol del preparador o del entrenador de porteros, y las tareas que creen ellos). No editan partidos, plantilla ni configuración.
- Profesor (profiles.is_teacher): crea clases con un código de 6 caracteres. Cada alumno se une con el código y su club queda vinculado a esa clase (clubs.class_id). El profesor ve en solo lectura los clubes de sus clases y deja comentarios (tabla comments). Nunca edita los datos del alumno.

ARQUITECTURA (respétala)
- Sin build y sin frameworks: módulos ES nativos (<script type="module">). Librerías solo por CDN y con versión fija: @supabase/supabase-js v2 (jsDelivr, +esm) y SheetJS 0.18.5 (cdnjs con respaldo en jsDelivr, cargada solo al exportar o importar Excel). Fuentes de Google Fonts.
- Archivos:
  index.html · 404.html (redirige a index) · .nojekyll
  css/app.css (tokens en :root, tema oscuro y claro, color del club en --accent y --accent-2)
  js/config.js (SUPABASE_URL y SUPABASE_ANON_KEY, que son públicas; NUNCA la service_role ni la secret key) · js/config.example.js
  js/version.js (APP_VERSION y CHANGELOG para el diálogo «Novedades»)
  js/supabase.js (cliente único) · js/app.js (arranque y sesión) · js/router.js (rutas por hash)
  js/store.js (todas las lecturas y escrituras pasan por aquí: caché en memoria, autoguardado, cola sin conexión)
  js/ui.js (esc(), toast(), ask() como diálogo de confirmación propio y nunca confirm(), modales, tablas, formularios, selector de jugadores, mini-campo SVG)
  js/modules/<modulo>.js, cada uno con export async function render(el, ctx)
  js/lib/print.js · js/lib/xlsx.js · js/lib/backup.js · js/lib/dates.js (semanas, lunes, meses en español)
  supabase/schema.sql · supabase/policies.sql · supabase/storage.sql · supabase/functions.sql · supabase/migrations/NNN_descripcion.sql · supabase/tests.sql
  docs/estructura-excel.md · README.md · CHANGELOG.md
- Rutas: #/login, #/inicio, #/config, #/plantilla, #/sesiones, #/sesiones/:id, #/periodizacion, #/macrociclo, #/macrociclo/:id, #/morfociclo, #/partidos, #/partidos/:id/prepartido, #/partidos/:id/acta, #/partidos/:id/postpartido, #/estadisticas, #/jugador/:id, #/profesor, #/invitacion/:token, #/unirse.
- Contexto activo: club > temporada > equipo, elegido en la cabecera y recordado en localStorage ('clubgestor:ctx'). Al cambiarlo se recarga el módulo abierto.
- Publicación: GitHub Pages desde la rama main (raíz) del repositorio público club-gestor. Todas las rutas de archivos son relativas (la web vive en /club-gestor/).

MODELO DE DATOS (Postgres; todas las tablas con id uuid default gen_random_uuid(), created_at, updated_at y updated_by, que rellenan triggers)
- profiles(id = auth.users.id, full_name, is_teacher bool)
- classes(id, teacher_id, name, join_code único)
- clubs(id, name, short_name, crest_path, primary_color, secondary_color, theme 'dark'|'light', font, home_layout jsonb {order:[módulo], hidden:[módulo], labels:{módulo:texto}, widgets:[…]}, class_id null, created_by)
- club_members(club_id, user_id, role, team_ids uuid[], primary key (club_id, user_id))
- invitations(id, club_id, email, role, team_ids, token único, expires_at, accepted_by, accepted_at)
- seasons(id, club_id, name '2026/27', start_date, end_date, is_current)
- teams(id, club_id, season_id, name, category, modality 'f11'|'f7', periods 2, period_minutes, squad_max (18 en F11 y 14 en F7 por defecto), archived)
- players(id, team_id, number, name, position, foot 'diestro'|'zurdo'|'ambas', birth_year, status 'D'|'L'|'A', active)
- sessions(id, team_id, date, time, duration_min, period, microcycle, number, staff jsonb {entrenador, segundo, preparador, porteros}, objectives jsonb {general, condicional, tectac, psicologico}, material jsonb {elemento: cantidad, otros}, attendance jsonb {player_id: {status, tasks:[bool×6], note}}, blocks jsonb [{id, kind 'warmup'|'task'|'cooldown', title, description, variants:[texto], obj_off, obj_def, roles {entrenador, segundo, preparador, porteros}, structure {duration, series, rest, space, players, goalkeepers}, image_path, author_id}], notes)
- task_library(id, club_id, block jsonb, tags text[], author_id)
- periodizations(id, team_id, season_id, start_monday, end_date, legend [{key, label, color}], periods [{from, to, key}], macro [{from, to, label}], meso [...], micro_start, micro_skip [índices de semana], contents [{name, area, marks:{índice_semana: 1|2|3}}])
- macrocycles(id, team_id, season_id, name, area, start_monday, weeks, phases [{from, to, label}], groups [{name, items:[{name, marks:{semana: 1|2|3}}]}])
- morphocycles(id, team_id, name, match_day 0–6, rows [{label, values:{lun, mar, mie, jue, vie, sab, dom}}], is_default)
- matches(id, team_id, season_id, matchday, date, time, call_time, venue, is_home, rival, system, positions jsonb {player_id:[x, y]}, plan {ataque, defensa, rival}, abp_for, abp_against, pre_notes, squad [{player_id, called, starter, order}], goals_for, goals_against, events [{id, period, min, type 'gol'|'gol_rival'|'amarilla'|'roja'|'cambio', player_id, player_out_id, assist_id, origin 'combinativo'|'directo'|'transicion'|'abp', note}], counters {recuperaciones, perdidas, faltas, ocasiones, …}, annotations, notes, player_stats {player_id: {available, called, starter, minutes, gf:{comb, dir, trans, abp}, assists, gc:{comb, dir, trans, abp}, yellow, red, manual:bool}}, post {colectiva:{ataque:{conservacion, progresion, finalizacion}, defensa:{recuperacion, contencion, proteccion}} (cada una {nota 1–5, texto}), individual:{ataque:{control, pase, conduccion, regate, tiro, remate, desmarque}, defensa:{interceptacion, entrada, despeje, marcaje}} (cada una {texto, notas:{player_id: 1–5}}), captacion:[{number, name, position, foot, level, notes}]})
- comments(id, club_id, entity, entity_id, section, author_id, text, resolved)
- Storage: bucket privado 'club-files' con rutas <club_id>/crest.png y <club_id>/tasks/<uuid>.jpg. Se muestran con URL firmada y las imágenes se comprimen en el navegador antes de subir (escudo ≤ 200 KB, tareas ≤ 400 KB).
- Los campos jsonb se leen siempre con valores por defecto (función normalize<Entidad>), para que los datos antiguos sigan funcionando cuando se añadan campos.

SEGURIDAD
- RLS activado en TODAS las tablas. Funciones SQL security definer con search_path fijo: is_member(club), role_in(club), can_edit_team(team), can_plan_team(team) (incluye preparador y porteros), is_teacher_of(club).
- Operaciones con varios pasos como RPC: create_club, accept_invitation, join_class, leave_club, transfer_admin. Un club nunca puede quedarse sin admin.
- En el front: nunca innerHTML con datos de usuario sin pasar por esc(). La interfaz oculta o desactiva lo que el rol no puede hacer, pero la seguridad real la da RLS.

REGLAS PARA CUALQUIER CAMBIO
1. No rompas ni elimines funciones existentes. Si un cambio afecta a otra función, avísame antes.
2. Los cambios de base de datos van siempre en una migración nueva (supabase/migrations/NNN_descripcion.sql, numeración consecutiva a la última que haya en el ZIP), idempotente (if not exists, create or replace). Dime exactamente qué pegar en el SQL Editor de Supabase y en qué orden, y qué resultado debo ver.
3. Gratis, sin servidor propio, sin build y sin librerías nuevas salvo que sea imprescindible. En ese caso usa una versión fija por CDN y explica por qué.
4. Textos en español claro, para entrenadores y alumnos. Fechas dd/mm/aaaa, semanas de lunes a domingo, zona Europe/Madrid.
5. Debe funcionar en Chrome, Edge y Safari actualizados, adaptarse a 400 px de ancho sin scroll horizontal de la página (las tablas anchas hacen scroll dentro de su contenedor, con la primera columna fija) y tener botones de al menos 44 px en el móvil.
6. Autoguardado con espera de 1 s e indicador «Guardando… / Guardado / Sin conexión». Si falla la red, guarda en una cola en localStorage y reintenta. Si updated_at cambió en el servidor, avisa y ofrece «Recargar» o «Sobrescribir».
7. Diseño: tokens CSS, color del club en var(--accent) y nunca colores fijos para el acento; tema oscuro y claro.
8. Versión: sube APP_VERSION en js/version.js y añade la entrada en CHANGELOG (js/version.js y CHANGELOG.md).
9. Antes de entregar: si puedes ejecutar código, pasa node --check a cada .js y comprueba que los imports entre módulos existen y que los id del HTML coinciden con el JS. Si no puedes ejecutarlo, revísalo con cuidado y dímelo.
10. Termina siempre con un resumen breve: qué cambió, qué archivos subir y cuáles borrar en GitHub, SQL que pegar (o «no hay SQL») y qué debo probar en la web.
```

---

## A · Puesta en marcha

### Prompt 1 · Crear el esqueleto de la app

Adjunta tu Excel `Control competicion TEMPORADA.xlsx` a este primer chat (todavía no hay ZIP del repositorio).

```
Empezamos Club Gestor desde cero. Te adjunto el Excel de referencia.
1. Lee el Excel y crea docs/estructura-excel.md con un resumen de cada hoja: secciones, campos, listas fijas (material, acciones, fases, morfociclo completo) y textos de ayuda. Lo usaremos en todos los módulos. No incluyas datos personales.
2. Crea la estructura de archivos del contexto con un esqueleto que funcione:
   - Cabecera con hueco para el escudo, el nombre del club, el selector de temporada y equipo, y el menú del usuario.
   - Pantalla de acceso provisional.
   - Router con una página «En construcción» por módulo.
   - Página de inicio con los botones de los módulos.
   - Tema oscuro y claro.
   - Diálogo «Novedades» que lee js/version.js.
3. README.md (qué es, cómo configurar Supabase, cómo publicar con la web de GitHub), CHANGELOG.md con la v0.1.0, .nojekyll y 404.html.
4. js/config.js con valores de ejemplo: la app muestra «Falta configurar Supabase» en vez de fallar. (En este primer ZIP sí incluye js/config.js.)
5. Entrégame el ZIP con TODOS los archivos y, aparte, los pasos exactos para crear el repositorio público club-gestor en github.com, subirlos desde la web y activar GitHub Pages (Settings → Pages → Deploy from a branch → main / root). Dime cuál será mi URL.
```

### Paso manual · Crear el repositorio y publicar (no es un prompt)

1. En github.com pulsa **+ → New repository**. Nombre: `club-gestor`. Marca **Public** y **Add a README file** (así puedes subir archivos desde la web). Pulsa **Create repository**.
2. Sube el contenido del ZIP con **Add file → Upload files** y **Commit changes** (ver «Subir archivos a GitHub» arriba). Acepta sustituir el README.
3. Ve a **Settings → Pages**. En «Build and deployment» elige **Deploy from a branch**, rama **main** y carpeta **/ (root)**. Pulsa **Save**.
4. En 1–2 minutos la web estará en `https://<tu-usuario>.github.io/club-gestor/`. Debe mostrar «Falta configurar Supabase».

### Paso manual · Crear el proyecto en Supabase (no es un prompt)

1. Entra en supabase.com, crea una cuenta gratuita y pulsa **New project**. Ponle de nombre `club-gestor`, elige una región de Europa y guarda la contraseña de la base de datos.
2. En la configuración del proyecto, en la sección **API**, copia la **Project URL** y la clave **anon / publishable**. No copies ni compartas nunca la **service_role / secret**.
3. En **Authentication → URL Configuration**, pon como Site URL `https://<tu-usuario>.github.io/club-gestor/` y añade esa misma URL a Redirect URLs.
4. En **Authentication → Providers → Email**: el correo integrado de Supabase envía pocos correos por hora. Para clases con muchos alumnos, valora desactivar «Confirm email» o configurar un SMTP propio.
5. Los proyectos gratuitos se pausan tras un tiempo sin uso. Se reactivan desde el panel.

### Prompt 2 · Base de datos y seguridad

```
Te adjunto el ZIP actual del repositorio. Crea la base de datos de Club Gestor según el modelo y la seguridad del contexto:
- supabase/schema.sql: tablas, claves foráneas con on delete cascade donde tenga sentido, índices (team_id, club_id, date), restricciones (dorsal único por equipo, roles válidos, modality 'f11'|'f7') y triggers de updated_at y updated_by.
- supabase/functions.sql: is_member, role_in, can_edit_team, can_plan_team, is_teacher_of. Trigger que crea profiles al registrarse. RPC create_club(name, short_name, season_name, start_date, end_date, team_name, category, modality, periods, period_minutes), que crea el club, la temporada actual, el primer equipo, la membresía admin y un morfociclo estándar en una transacción. RPC accept_invitation(token), join_class(code), leave_club(club) y transfer_admin(club, user).
- supabase/policies.sql: RLS en todas las tablas según los roles (admin, entrenador, preparador, porteros, profesor de solo lectura con comentarios).
- supabase/storage.sql: bucket privado club-files y políticas por carpeta <club_id>/.
- supabase/tests.sql: consultas que simulen dos usuarios de clubes distintos y un profesor (set local role authenticated y request.jwt.claims) y comprueben que nadie ve ni edita lo que no le toca.
Explícame paso a paso cómo pegar cada archivo en el SQL Editor de Supabase (en qué orden, qué botón pulsar) y qué resultado debo ver en tests.sql.
Conecta js/supabase.js y muestra en la cabecera si la conexión funciona.
Mis datos de Supabase (son públicos):
SUPABASE_URL = [pega la Project URL]
SUPABASE_ANON_KEY = [pega la clave anon/publishable]
Esta vez sí incluye js/config.js en el ZIP con estos valores.
```

### Prompt 3 · Cuentas, clubes, invitaciones y roles

```
Te adjunto el ZIP actual del repositorio. Implementa el acceso y la gestión de personas:
- Pantalla de acceso: entrar con email y contraseña, crear cuenta, enlace mágico y recuperar contraseña. Perfil con el nombre y la casilla «Soy profesor».
- Al entrar sin club, un asistente con tres opciones:
  a) «Crear mi club»: nombre, nombre corto, escudo opcional, temporada (2026/27 por defecto, del 03/08/2026 al 30/06/2027) y primer equipo (nombre, categoría, F11 o F7, partes y minutos por parte). Usa la RPC create_club.
  b) «Tengo una invitación» (pegar el enlace o el código).
  c) «Unirme a una clase» (código del profesor). Si aún no tiene club, crea primero el club y lo vincula.
- Si el usuario tiene varios clubes, selector de club en el menú del usuario.
- Configuración > Personas (solo admin): lista de miembros con su rol y sus equipos, cambiar el rol, quitar a alguien (con ask()) y transferir la administración. «Invitar»: email, rol y equipos. Genera el enlace #/invitacion/<token> para copiarlo o compartirlo (WhatsApp o email del propio usuario): la app no envía correos. Las invitaciones caducan a los 7 días y se pueden revocar.
- La interfaz se adapta al rol: botones ocultos o desactivados con el motivo («Solo el entrenador puede editar partidos»).
- Cerrar sesión limpia la caché y el contexto.
Explícame cómo probarlo con dos cuentas distintas (p. ej. una en Chrome y otra en una ventana de incógnito).
```

---

## B · Club y plantilla

### Prompt 4 · Página inicial del club (configurable)

```
Te adjunto el ZIP actual del repositorio. Crea la página de inicio (#/inicio) y la Configuración del club (#/config):
INICIO
- Cabecera con el escudo, el nombre del club, la temporada y el equipo activo, en los colores del club.
- Botonera de módulos con botones grandes (icono, nombre y una línea de descripción): Sesiones, Periodización, Macrociclo, Morfociclo, Prepartido, Partido, Postpartido, Plantilla, Estadísticas y Configuración. Prepartido, Partido y Postpartido abren el partido más próximo o la lista de partidos.
- Tarjetas resumen: próximo partido (con cuenta atrás y convocatoria hecha o pendiente), última y próxima sesión, microciclo actual (sale de la periodización), jugadores lesionados, asistencia media de las últimas 4 semanas y comentarios del profesor sin resolver.
- 3 columnas en escritorio, 2 en tableta y 1 en el móvil.
CONFIGURACIÓN (solo admin)
- Identidad: nombre, nombre corto, escudo (subir, recortar a cuadrado y comprimir a ≤ 200 KB en Storage), color principal y secundario, tema oscuro o claro y tipografía de títulos (3 opciones de Google Fonts). Vista previa al momento.
- Página inicial: ordenar los botones (arrastrar o ↑/↓), ocultar módulos, renombrarlos y elegir qué tarjetas resumen se ven. Se guarda en clubs.home_layout.
- Temporadas: crear, marcar la actual y archivar. «Nueva temporada a partir de la anterior»: copia los equipos, la plantilla (opcional), los morfociclos y las plantillas de macrociclo.
- Equipos: crear, editar (categoría, F11/F7, partes, minutos por parte, máximo de convocados) y archivar.
- Personas: lo del Prompt 3.
Todo con autoguardado e indicador de estado.
```

### Prompt 5 · Plantilla de jugadores

```
Te adjunto el ZIP actual del repositorio. Crea el módulo Plantilla (#/plantilla) para el equipo activo:
- Tabla con dorsal, nombre, posición (POR, DEF, LAT, MC, EXT, DEL), pie, año de nacimiento, estado (D disponible, L lesionado, A ausente; un toque cambia de estado) y activo. Ordenar por dorsal, nombre o posición.
- Añadir y editar en línea. Dorsal único con aviso claro. Borrar con ask(): si el jugador tiene datos, se ofrece marcarlo como inactivo en lugar de borrarlo.
- «Pegar lista»: textarea con líneas del tipo «7 Pedro» o «7;Pedro;DEL;zurdo», con vista previa antes de guardar.
- «Copiar de otro equipo o temporada».
- Contador de disponibles, lesionados y ausentes como en la hoja SESIÓN.
- La ficha del jugador (#/jugador/:id) queda preparada para las estadísticas del Prompt 13.
```

---

## C · Entrenamiento y planificación

### Prompt 6 · Sesión de entrenamiento (hoja SESIÓN)

Es el módulo más grande. Si Claude lo divide en partes, pide cada una con «continúa» en el mismo chat y sube a GitHub el ZIP de la última parte.

```
Te adjunto el ZIP actual del repositorio. Crea el módulo Sesiones según la hoja SESIÓN (consulta docs/estructura-excel.md para copiar campos y listas exactas):
LISTA (#/sesiones)
- Sesiones del equipo activo por fecha, agrupadas por microciclo, con filtros por mes y microciclo. Muestra duración, nº de tareas y asistencia.
- «Nueva sesión»: fecha, hora y duración. Periodo y microciclo se rellenan solos a partir de la periodización, si existe. Los objetivos del día se sugieren a partir del morfociclo por defecto.
- «Duplicar» y «Borrar» (con ask()).
FICHA (#/sesiones/:id), en secciones plegables:
1. Datos generales: equipo, categoría, periodo, microciclo, nº de sesión, fecha, hora y duración.
2. Cuerpo técnico: entrenador, 2.º entrenador, preparador físico y entrenador de porteros. Se rellenan con los miembros del club y se pueden editar.
3. Objetivos: general, condicional, técnico-táctico y psicológico.
4. Material: la lista exacta del Excel (balones, miniporterías, vallas, conos, picas/bases, setas, petos, aros, escaleras, bosus, TRX, elásticos, minibands, discos, steps, fitball, mancuernas, barras y otros), con casilla y cantidad.
5. Asistencia: jugadores activos con estado D/L/A (un toque cambia de estado), casillas T1–T6 de participación en cada tarea y nota. Contadores automáticos de Disponibles, Lesionados y Ausentes. Botón «Todos disponibles».
6. Tareas: Calentamiento, Tarea 1–4 (se pueden añadir, quitar y reordenar) y Vuelta a la calma. Cada bloque tiene título, desarrollo, variantes (lista), objetivos ofensivos y defensivos, roles del cuerpo técnico (1.er entrenador, 2.º entrenador, preparador físico, porteros) y estructura (duración, series, recuperación, espacio, nº de jugadores, porteros). Imagen del ejercicio opcional (foto o captura, comprimida a ≤ 400 KB).
   · Tiempo del bloque = series × duración + (series − 1) × recuperación. Tiempo total de la sesión = suma de los bloques. Aviso si supera la duración prevista.
7. Observaciones.
BIBLIOTECA DE TAREAS
- «Guardar en la biblioteca» desde cualquier bloque e «Insertar desde la biblioteca», con búsqueda por título y etiquetas (tabla task_library, en una migración nueva si hace falta).
PERMISOS
- El preparador y el entrenador de porteros solo editan su objetivo, su rol en cada tarea y las tareas creadas por ellos. El resto lo ven en solo lectura.
Deja preparado el botón «Imprimir» para el Prompt 14.
```

### Prompt 7 · Periodización (hoja PERIORIZACIÓN)

```
Te adjunto el ZIP actual del repositorio. Crea el módulo Periodización (#/periodizacion) para el equipo y la temporada activos:
- El calendario se genera solo desde el lunes de inicio hasta el fin de temporada (por defecto, del 03/08/2026 al 30/05/2027). Una columna por semana, cabecera con los meses y filas de Lunes a Domingo con el número del día calculado (nada se escribe a mano, así se evitan errores como los del Excel). Los días con partido o sesión se marcan con un punto de color; al hacer clic se abre ese partido o esa sesión.
- Filas de estructura:
  · Periodo: tramos arrastrables con leyenda editable (Pretemporada, Temporada, Vacaciones, con su color).
  · Macrociclo y Mesociclo: tramos numerados.
  · Microciclo: numeración automática consecutiva, con número de inicio editable y opción de no contar las semanas de vacaciones.
- Contenidos: filas con nombre y área (condicional, técnica, táctica, estratégica, psicológica). Al hacer clic en una celda se pone o se quita la marca ✖, o un nivel 1–3 de intensidad con color.
- Se resalta la semana actual. Botón «Ir a hoy».
- Tabla con scroll horizontal dentro de su contenedor y primera columna fija. En el móvil, vista alternativa por mes.
- Plantilla inicial con los contenidos de docs/estructura-excel.md (si tienen nombre) o con filas vacías.
- El microciclo actual se usa en Sesiones (Prompt 6) y en la página de inicio.
```

### Prompt 8 · Macrociclo (hoja MACROCICLO)

```
Te adjunto el ZIP actual del repositorio. Crea el módulo Macrociclo (#/macrociclo). Cada equipo puede tener varios (p. ej. Porteros, Condicional, General):
- Lista de macrociclos y «Nuevo» a partir de una plantilla:
  · «Porteros», con los grupos e ítems del Excel: Condicional (Preventivo, Fuerza, Velocidad, Coordinación), Técnica (Desplazamientos + posición corporal, Blocajes con/sin caída, Desvío + incorporación, Juego aéreo, Juego de pie), Táctica (Tiro lejano, Tiro cercano, 1x1, Centro-remate, Pase atrás) y Visual (Iniciación a conceptos técnicos, Iniciación a conceptos tácticos, Desarrollo de conceptos técnicos, Desarrollo de conceptos tácticos, Trabajo individualizado).
  · «Condicional» y «En blanco».
- Semanas desde una fecha de inicio (por defecto, la de la temporada; el Excel usaba 2021-22 y de enero a septiembre: aquí se usan las fechas reales), con cabecera de meses y fases (Preparatorio, Competitivo, Transición) como tramos editables.
- Al hacer clic en una celda: X o nivel 1–3. Total de semanas por fila y resumen por grupo.
- Grupos e ítems editables y reordenables.
- Edición permitida a admin, entrenador y, según el área, preparador o porteros.
- Misma tabla con scroll y primera columna fija que en Periodización.
```

### Prompt 9 · Morfociclo (hoja MORFOCICLO)

```
Te adjunto el ZIP actual del repositorio. Crea el módulo Morfociclo (#/morfociclo):
- Tabla de filas × días (Lunes a Domingo). La plantilla «Morfociclo estándar» copia exactamente las filas y los valores de la hoja MORFOCICLO (docs/estructura-excel.md): principios, grupos, táctica/estructura, temática, complejidad/intensidad, espacio, diseño del espacio, duración/volumen, intervalos, recuperación, periodos, número de rivales y estrategia de partido.
- Día de partido configurable (domingo por defecto). Con la opción «Ver como días respecto al partido», las columnas se rotulan como P+1, P−4… P−1, Partido.
- Varios morfociclos por equipo (p. ej. «Semana estándar» y «Semana con dos partidos»), uno marcado como predeterminado.
- Celdas editables, filas añadibles y reordenables, y colores por intensidad (baja, media, alta).
- Enlace con Sesiones: al crear una sesión, se muestra como guía la columna del día correspondiente del morfociclo predeterminado.
```

---

## D · Competición

### Prompt 10 · Partidos y Prepartido (hoja PREPARTIDO)

```
Te adjunto el ZIP actual del repositorio. Crea la lista de partidos y el Prepartido:
LISTA (#/partidos)
- Jornada, fecha, local y visitante (el propio equipo se pone solo según is_home), resultado y estado (pendiente, convocado, jugado, con informe).
- «Nuevo partido» y «Pegar calendario» (líneas «1;12/09/2026;Rival;casa» con vista previa).
PREPARTIDO (#/partidos/:id/prepartido)
- Datos: jornada, fecha, hora, citación, lugar, equipo local y visitante.
- Convocatoria: jugadores de la plantilla con su estado (los lesionados aparecen avisados). Elegir hasta squad_max (18 en F11 y 14 en F7, configurable), ordenar y marcar titulares (11 en F11 y 7 en F7, con aviso si no cuadra).
- Sistema: F11 (1-4-3-3, 1-4-4-2, 1-4-2-3-1, 1-3-5-2, 1-5-3-2) o F7 (1-3-3, 1-2-3-1, 1-3-2-1). Un mini-campo SVG coloca a los titulares en el sistema y se pueden arrastrar con el ratón o con el dedo.
- Planteamiento: ataque, defensa y rival. ABP a favor, ABP en contra y observaciones.
- Botón «Copiar del partido anterior» para la convocatoria y el sistema.
Deja preparado «Imprimir convocatoria» para el Prompt 14.
```

### Prompt 11 · Partido: el acta (hoja PARTIDO)

```
Te adjunto el ZIP actual del repositorio. Crea el acta del partido (#/partidos/:id/acta), pensada también para usarla en el banquillo desde el móvil o la tableta:
- Cabecera: jornada, fecha, local, resultado y visitante. El resultado sale solo de los eventos.
- Cronómetro opcional por partes (partes × minutos del equipo, p. ej. 2 × 35 = 70), con pausa y ajuste manual del minuto.
- Botones grandes de evento: Gol, Gol rival, Amarilla, Roja y Cambio. Tras pulsar uno se elige el jugador (y el asistente en los goles), el origen (combinativo, directo, transición o ABP) y una nota opcional. El minuto se toma del cronómetro o se escribe.
- Lista de eventos editable y ordenada por minuto. Deshacer el último evento.
- Tabla de convocados como en el Excel: Nº, Jugador, Gol, Asis, TA, TR y Min. Se calcula sola a partir de los eventos: los titulares juegan desde el minuto 0, los cambios suman y restan, y la roja corta los minutos. Cada celda se puede corregir a mano (queda marcada como «manual»).
- Anotaciones con contadores rápidos +/− (recuperaciones, pérdidas, faltas, ocasiones; la lista de contadores se configura) y un texto libre. Observaciones.
- Si se pierde la conexión, los eventos se guardan en la cola local y se sincronizan después. Mantén la pantalla encendida con Wake Lock si está disponible.
```

### Prompt 12 · Postpartido (hoja POSTPARTIDO)

```
Te adjunto el ZIP actual del repositorio. Crea el informe postpartido (#/partidos/:id/postpartido) con los bloques de la hoja POSTPARTIDO:
1. Convocatoria por jugador: Disponible / No disponible, Convocado / No convocado, Titular / Suplente y Minutos. Se rellena desde la plantilla, el prepartido y el acta, y se puede editar.
2. Goles a favor por origen (combinativo, directo, transición, ABP) y asistencias, desde el acta. Goles en contra por origen: se asignan a los jugadores que estaban en el campo en ese minuto (calculado y editable). Amarillas y rojas.
3. Evaluación colectiva: ataque (conservación, progresión, finalización) y defensa (recuperación, contención, protección). Cada fase lleva una nota 1–5 y un texto, con la ayuda del Excel como texto de guía: fortalezas y debilidades.
4. Evaluación individual: ataque (control, pase, conducción, regate, tiro, remate, desmarque) y defensa (interceptación, entrada, despeje, marcaje). Cada acción lleva un texto y, opcionalmente, una nota 1–5 por jugador, en una tabla de jugadores × acciones con scroll.
5. Captación: jugadores rivales de interés (dorsal, nombre, posición, pie, nivel 1–5 y observaciones).
- Botón «Marcar informe como terminado». La lista de partidos lo muestra.
```

### Prompt 13 · Estadísticas de temporada

```
Te adjunto el ZIP actual del repositorio. Crea Estadísticas (#/estadisticas) y la ficha del jugador (#/jugador/:id) con los datos de partidos y sesiones:
- Tabla acumulada por jugador: convocatorias, titularidades, minutos y % de los minutos posibles, goles por origen, asistencias, goles en contra estando en el campo, amarillas, rojas, asistencia a entrenamientos (% y recuento D/L/A) y nota media del postpartido. Se puede ordenar y filtrar por rango de jornadas o de fechas.
- Vista «como el Excel»: jornadas en columnas con los mismos subapartados que la hoja POSTPARTIDO, con scroll horizontal y primera columna fija.
- Equipo: resultados, puntos, racha, goles a favor y en contra por origen y por tramos de 15 min, y media de las notas colectivas por fase.
- Gráficos en SVG hechos a mano (barras, donut y línea), sin librerías, con los colores del club.
- Ficha del jugador: datos, evolución de minutos por jornada, asistencia y notas.
```

---

## E · Exportar, importar y profesor

### Prompt 14 · Imprimir y PDF

```
Te adjunto el ZIP actual del repositorio. Añade vistas de impresión limpias (window.print() con @media print, fondo blanco, A4 vertical salvo las tablas anchas, que van en apaisado), con el escudo y los colores del club:
- Ficha de sesión con un diseño parecido al Excel, que quepa en 1–2 páginas e incluya las imágenes de las tareas.
- Periodización y macrociclo (apaisado, ajustados al ancho).
- Morfociclo.
- Convocatoria (para colgar en el vestuario o enviar como PDF): datos del partido, citación y lista, con el sistema opcional.
- Acta del partido.
- Informe postpartido.
- Estadísticas de temporada.
Botón «Imprimir / Guardar PDF» en cada módulo. Explica en una línea cómo guardar como PDF en Chrome y en Safari.
```

### Prompt 15 · Excel: exportar con las mismas hojas e importar desde tu plantilla

```
Te adjunto el ZIP actual del repositorio. Usa SheetJS 0.18.5 (cargada solo al pulsar, desde cdnjs con respaldo en jsDelivr; si falla, ofrece CSV) en js/lib/xlsx.js:
EXPORTAR
- «Exportar temporada a Excel»: un .xlsx con las hojas SESIÓN (una fila por sesión y bloque), PERIODIZACIÓN, MACROCICLO, MORFOCICLO, PREPARTIDO, PARTIDO y POSTPARTIDO (jornadas en columnas, como la plantilla), más PLANTILLA y ESTADÍSTICAS. Fechas reales de Excel, anchos de columna y cabeceras fijas.
- Exportar desde cada módulo solo lo que se ve.
IMPORTAR
- «Importar desde mi Excel»: lee la plantilla del club (la estructura de docs/estructura-excel.md). Detecta jugadores (dorsal y nombre de POSTPARTIDO o PREPARTIDO) y, si los hay, partidos, sesiones y contenidos de periodización.
- Pantalla de vista previa con lo detectado y casillas para elegir qué importar. Se ignoran los textos de ejemplo («Jugador 1», «AAA», «dd/mm/aaaa»). Aviso antes de sobrescribir.
- También acepta CSV. Todo lo importado se limpia y se valida antes de guardar.
```

### Prompt 16 · Copia de seguridad JSON

```
Te adjunto el ZIP actual del repositorio. Añade en Configuración «Copia de seguridad» (js/lib/backup.js):
- «Descargar copia»: un JSON con {app:'ClubGestor', format:1, appVersion, exportedAt, club, seasons, teams, players, sessions, task_library, periodizations, macrocycles, morphocycles, matches}. Sin datos de otros usuarios ni comentarios del profesor. Las imágenes se incluyen opcionalmente en base64, con aviso del tamaño.
- «Restaurar copia»: elegir entre «Crear un club nuevo con esta copia» o «Reemplazar la temporada o el equipo X» (con ask() y explicación clara). Valida el formato, regenera los id, mantiene las relaciones y sanea todos los campos.
- Exportar e importar un solo partido o una sola sesión para compartirlos con otro club.
```

### Prompt 17 · Panel del profesor

```
Te adjunto el ZIP actual del repositorio. Crea el Panel del profesor (#/profesor), visible solo para profiles.is_teacher:
- Clases: crear, renombrar y archivar. Cada clase muestra su código de 6 caracteres con botón de copiar y opción de regenerarlo.
- Alumnos de cada clase: su club, equipos, nº de sesiones, partidos, informes terminados y última actividad. Ordenar y buscar.
- Abrir el club de un alumno en modo solo lectura (aviso visible «Estás viendo el club de [alumno]»).
- Comentarios: en cada sección de cualquier módulo, el profesor añade un comentario (tabla comments con entity, entity_id y section). El alumno los ve marcados en la sección y en la página de inicio, responde y los marca como resueltos.
- «Exportar resumen de la clase» a Excel.
- Comprueba en las políticas RLS que el profesor no puede editar nada del alumno ni ver clubes que no están en sus clases, y dame una consulta para tests.sql que lo demuestre.
```

---

## F · Calidad y mantenimiento

### Prompt 18 · Auditoría de seguridad y calidad

```
Te adjunto el ZIP actual del repositorio. Revisa a fondo Club Gestor como si fuera a usarlo una clase de 40 alumnos:
- Seguridad: políticas RLS de cada tabla y de Storage, funciones security definer (search_path), RPC, claves en el front, XSS (innerHTML), tokens de invitación y códigos de clase.
- Datos: jsonb con datos antiguos o incompletos, borrados en cascada, conflictos de edición entre dos personas y cola sin conexión.
- Interfaz: 400 px, Safari en iPhone, teclado, contraste, etiquetas de los campos y rendimiento con 40 sesiones y 30 partidos.
- Límites del plan gratuito de Supabase (almacenamiento, correos, pausa por inactividad).
Dame una tabla priorizada (crítico / importante / menor) con la causa y la solución. NO cambies código ni me des ZIP: espera a que elija qué corregir.
```

### Prompt 19 · Corregir un error

```
Te adjunto el ZIP actual del repositorio. He encontrado un error en Club Gestor.
- Qué hice: [pasos exactos]
- Qué esperaba: [resultado esperado]
- Qué pasó: [lo que ocurrió y los mensajes en pantalla; puedes adjuntar una captura]
- Usuario y rol: [p. ej. alumno admin de su club / profesor]
- Navegador y sistema: [p. ej. Safari en iPhone 15]
- Errores de la consola (F12 > Console) o de Supabase, si los hay: [pegar aquí]
Encuentra la causa, explícamela en 2–3 frases y corrígela sin cambiar nada más. Si hace falta SQL, va en una migración nueva. Dime cómo comprobar que está resuelto.
```

### Prompt 20 · Publicar una versión nueva

```
Te adjunto el ZIP actual del repositorio. Prepara la versión [x.y.z]:
- Revisa que no haya claves secretas (service_role) en ningún archivo.
- Sube APP_VERSION y añade la entrada en js/version.js y en CHANGELOG.md (en lenguaje para entrenadores).
- Revisa la sintaxis de todos los .js.
- Entrégame el ZIP con los archivos cambiados y el texto de las notas de la versión, listo para pegar si creo una «Release» en GitHub (Releases → Draft a new release → etiqueta v[x.y.z]).
- Recuérdame las migraciones SQL pendientes de pegar en Supabase, si las hay, y cómo comprobar en la web que se ve la versión nueva (diálogo Novedades; si no cambia, recargar con Ctrl+Mayús+R).
```

---

## Prompt de cierre (al final de cada chat)

```
Antes de terminar: repasa que no has roto nada (acceso, selector de club/temporada/equipo, inicio, configuración, plantilla, sesiones, periodización, macrociclo, morfociclo, prepartido, acta, postpartido, estadísticas, impresión, Excel, copia JSON y panel del profesor), con los roles admin, entrenador, preparador y profesor, en Chrome y Safari. Dime en 5 líneas qué debo probar a mano, qué archivos subir y borrar en GitHub y si hay SQL pendiente.
```
