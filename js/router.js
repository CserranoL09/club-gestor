// Rutas por hash (#/modulo/:id). Cada módulo exporta render(el, ctx).
import { MODULES } from './modules/list.js';
import { flushAll } from './store.js';

// area: 'account' (cuenta), 'club' (Dirección y Coordinación) o 'team' (trabajo de un equipo).
const ROUTES = [
  { path: '/login', load: () => import('./modules/login.js'), public: true, area: 'account' },
  { path: '/nueva-clave', load: () => import('./modules/login.js'), public: true, area: 'account' },
  { path: '/bienvenida', load: () => import('./modules/bienvenida.js'), noClub: true, area: 'account' },
  { path: '/perfil', load: () => import('./modules/perfil.js'), noClub: true, area: 'account' },
  { path: '/invitacion/:token', load: () => import('./modules/invitacion.js'), public: true, noClub: true, area: 'account' },
  { path: '/unirse', load: () => import('./modules/unirse.js'), noClub: true, area: 'account' },
  { path: '/profesor', title: 'Panel del profesor', prompt: 17, noClub: true, area: 'account' },

  { path: '/club', load: () => import('./modules/club.js'), area: 'club', managers: true },
  { path: '/equipos', load: () => import('./modules/equipos.js'), area: 'club', managers: true },
  { path: '/calendario', title: 'Calendario del club', icon: '📅', phase: 'R5', desc: 'Sesiones y partidos de todos los equipos, instalaciones y reservas de campo.', area: 'club' },
  { path: '/metodologia', load: () => import('./modules/metodologia.js'), area: 'inbox' },
  { path: '/config', load: () => import('./modules/config.js'), key: 'config', area: 'club' },
  { path: '/comentarios', load: () => import('./modules/comentarios.js'), area: 'inbox' },

  { path: '/inicio', load: () => import('./modules/inicio.js'), area: 'team' },
  { path: '/plantilla', key: 'plantilla', area: 'team' },
  { path: '/sesiones', key: 'sesiones', area: 'team' },
  { path: '/sesiones/:id', key: 'sesiones', area: 'team' },
  { path: '/planificacion', load: () => import('./modules/planificacion.js'), area: 'team' },
  { path: '/periodizacion', key: 'periodizacion', area: 'team' },
  { path: '/macrociclo', key: 'macrociclo', area: 'team' },
  { path: '/macrociclo/:id', key: 'macrociclo', area: 'team' },
  { path: '/morfociclo', key: 'morfociclo', area: 'team' },
  { path: '/partidos', key: 'prepartido', title: 'Partidos', area: 'team' },
  { path: '/partidos/:id/prepartido', key: 'prepartido', area: 'team' },
  { path: '/partidos/:id/acta', key: 'partido', area: 'team' },
  { path: '/partidos/:id/postpartido', key: 'postpartido', area: 'team' },
  { path: '/estadisticas', key: 'estadisticas', area: 'team' },
  { path: '/jugador/:id', key: 'estadisticas', title: 'Ficha del jugador', area: 'team' }
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
      await flushAll();                        // guardar lo pendiente de la página anterior
      const view = await loader();
      if (mine !== seq) return;              // se ha cambiado de página mientras cargaba
      main.innerHTML = '';
      window.dispatchEvent(new CustomEvent('clubgestor:route', { detail: { path, query, route } }));
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
