# Librerías copiadas en el repositorio

- `supabase-js-2.118.0.min.js`: @supabase/supabase-js 2.118.0 (licencia MIT, © Supabase) empaquetado con esbuild
  (`export { createClient } from '@supabase/supabase-js'`, formato ESM, minificado). Se sirve desde GitHub Pages
  en lugar de un CDN para que nadie pueda cambiar el código que maneja la sesión.
  Para actualizarlo: `npm i @supabase/supabase-js@X` y `npx esbuild entrada.mjs --bundle --format=esm --minify --outfile=js/vendor/supabase-js-X.min.js`.
