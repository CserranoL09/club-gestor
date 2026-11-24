// Rutas por hash (#/modulo/:id). Cada módulo exporta render(el, ctx).
import { MODULES } from './modules/list.js';

const ROUTES = [
  { path: '/login', load: () => import('./modules/login.js'), public: true },
  { path: '/nueva-clave', load: () => import('./modules/login.js'), public: true },
  { path: '/bienvenida', load: () => import('./modules/bienvenida.js'), noClub: true },
  { path: '/perfil', load: () => import('./modules/perfil.js'), noClub: true },
  { path: '/invitacion/:token', load: () => import('./modules/invitacion.js'), public: true, noClub: true },
  { path: '/unirse', load: () => import('./modules/unirse.js'), noClub: true },
  { path: '/inicio', load: () => import('./modules/inicio.js') },
  { path: '/config', load: () => import('./modules/config.js'), key: 'config' },
  { path: '/plantilla', key: 'plantilla' },
  { path: '/sesiones', key: 'sesiones' },
  { path: '/sesiones/:id', key: 'sesiones' },
  { path: '/periodizacion', key: 'periodizacion' },
  { path: '/macrociclo', key: 'macrociclo' },
  { path: '/macrociclo/:id', key: 'macrociclo' },
  { path: '/morfociclo', key: 'morfociclo' },
  { path: '/partidos', key: 'prepartido', title: 'Partidos' },
  { path: '/partidos/:id/prepartido', key: 'prepartido' },
  { path: '/partidos/:id/acta', key: 'partido' },
  { path: '/partidos/:id/postpartido', key: 'postpartido' },
  { path: '/estadisticas', key: 'estadisticas' },
  { path: '/jugador/:id', key: 'estadisticas', title: 'Ficha del jugador' },
  { path: '/profesor', title: 'Panel del profesor', prompt: 17, noClub: true }
];

function match(hash) {
  const [path, query = ''] = (hash.replace(/^#/, '') || '/inicio').split('?');
  const parts = path.split('/').filter(Boolean);
  for (const r of ROUTES) {
    const rp = r.path.split('/').filter(Boolean);
    if (rp.length !== parts.length) continue;
    const params = {};
    const ok = rp.every((seg, i) => {
      if (seg.startsWith(':')) { params[seg.slice(1)] = decodeURIComponent(parts[i]); return true; }
      return seg === parts[i];
    });
    if (ok) return { route: r, params, query: new URLSearchParams(query), path };
  }
  return null;
}

let rerenderFn = () => {};
/** Vuelve a pintar la página abierta (p. ej. al cambiar de equipo). */
export function rerender() { rerenderFn(); }

/**
 * @param main   contenedor de la página
 * @param guard  (route, path) => ruta a la que redirigir, o null para seguir
 */
export function startRouter(main, { guard = () => null } = {}) {
  let seq = 0;
  async function go() {
    const found = match(location.hash);
    if (!found) { location.replace('#/inicio'); return; }
    const redirect = guard(found.route, found.path);
    if (redirect && redirect !== found.path) { location.replace('#' + redirect); return; }

    const { route, params, query, path } = found;
    const mod = MODULES.find((m) => m.key === route.key);
    const loader = route.load || (() => import('./modules/placeholder.js'));
    const mine = ++seq;
    main.setAttribute('aria-busy', 'true');
    try {
      const view = await loader();
      if (mine !== seq) return;              // se ha cambiado de página mientras cargaba
      main.innerHTML = '';
      await view.render(main, { params, query, path, module: mod, route });
    } catch (err) {
      console.error(err);
      if (mine !== seq) return;
      main.innerHTML = '<div class="card empty"><div class="big">⚠</div><h2>No se ha podido abrir esta página</h2><p>Recarga la página. Si sigue fallando, copia el error de la consola (F12).</p></div>';
    }
    main.removeAttribute('aria-busy');
  }
  rerenderFn = go;
  window.addEventListener('hashchange', () => { go(); main.focus({ preventScroll: true }); window.scrollTo(0, 0); });
  go();
}
