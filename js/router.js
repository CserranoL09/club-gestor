// Rutas por hash (#/modulo/:id). Cada módulo exporta render(el, ctx).
import { MODULES } from './modules/list.js';

const ROUTES = [
  { path: '/login', load: () => import('./modules/login.js') },
  { path: '/inicio', load: () => import('./modules/inicio.js') },
  { path: '/config', key: 'config' },
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
  { path: '/profesor', title: 'Panel del profesor', prompt: 17 },
  { path: '/invitacion/:token', title: 'Invitación', prompt: 3 },
  { path: '/unirse', title: 'Unirme a una clase', prompt: 3 }
];

function match(hash) {
  const path = (hash.replace(/^#/, '') || '/inicio').split('?')[0];
  const parts = path.split('/').filter(Boolean);
  for (const r of ROUTES) {
    const rp = r.path.split('/').filter(Boolean);
    if (rp.length !== parts.length) continue;
    const params = {};
    const ok = rp.every((seg, i) => {
      if (seg.startsWith(':')) { params[seg.slice(1)] = decodeURIComponent(parts[i]); return true; }
      return seg === parts[i];
    });
    if (ok) return { route: r, params };
  }
  return null;
}

export function startRouter(main, getCtx) {
  async function go() {
    const found = match(location.hash);
    if (!found) { location.replace('#/inicio'); return; }
    const { route, params } = found;
    const mod = MODULES.find((m) => m.key === route.key);
    const loader = route.load || (() => import('./modules/placeholder.js'));
    main.setAttribute('aria-busy', 'true');
    try {
      const view = await loader();
      main.innerHTML = '';
      await view.render(main, { ...getCtx(), params, module: mod, route });
    } catch (err) {
      console.error(err);
      main.innerHTML = '<div class="card empty"><div class="big">⚠</div><h2>No se ha podido abrir esta página</h2><p>Recarga la página. Si sigue fallando, copia el error de la consola (F12).</p></div>';
    }
    main.removeAttribute('aria-busy');
    main.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', go);
  go();
}
