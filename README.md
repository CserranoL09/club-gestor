# Club Gestor

App web gratuita para gestionar la temporada de equipos de fútbol 11 y fútbol 7: sesiones de entrenamiento, periodización, macrociclo, morfociclo, prepartido, acta, postpartido y estadísticas. Pensada para cuerpos técnicos y para alumnos de cursos de entrenador, con un panel para el profesor.

Se basa en la plantilla de Excel «Control competición TEMPORADA» (estructura en [`docs/estructura-excel.md`](docs/estructura-excel.md)).

## Cómo funciona

- **Sin instalar nada:** HTML, CSS y JavaScript sin build, publicados en GitHub Pages.
- **Datos en la nube:** [Supabase](https://supabase.com) (plan gratuito) para cuentas, base de datos y archivos.
- **Desarrollo con Claude:** cada mejora se pide con un prompt de [`docs/prompts.md`](docs/prompts.md). El contexto del proyecto está en [`docs/contexto.md`](docs/contexto.md).

## Configurar Supabase

1. Crea un proyecto en supabase.com (región de Europa).
2. Copia la **Project URL** y la clave **anon / publishable** (Project Settings → API).
3. Escríbelas en `js/config.js`. Nunca pongas la clave `service_role` / secret.
4. En Supabase → SQL Editor → New query, pega todo `supabase/instalar.sql` y pulsa **Run**. Después pega `supabase/tests.sql` y pulsa **Run**: todas las filas deben decir «OK».
   Los cambios posteriores irán en `supabase/migrations/` (en orden).
5. En Authentication → URL Configuration, pon como Site URL la dirección de GitHub Pages.

Mientras `js/config.js` tenga los valores de ejemplo, la app se abre en modo de prueba con el aviso «Falta configurar Supabase».

## Publicar

GitHub Pages: Settings → Pages → Deploy from a branch → `main` / `(root)`.

## Estructura

```
index.html · 404.html · .nojekyll
css/app.css
js/app.js · js/router.js · js/ui.js · js/store.js · js/supabase.js · js/config.js · js/version.js
js/modules/   (un archivo por módulo)
js/lib/       (fechas, impresión, Excel, copias)
supabase/     (SQL: esquema, funciones, políticas, migraciones)
docs/         (estructura del Excel, contexto y prompts)
```
