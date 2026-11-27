// Configuración del club. Cada apartado está en su archivo (config-*.js).
import { esc, permNote } from '../ui.js';
import { S, permission, canInvite, canManageFacilities } from '../session.js';

const TABS = [
  ['identidad', 'Club', () => import('./config-identidad.js')],
  ['inicio', 'Página inicial', () => import('./config-inicio.js')],
  ['temporadas', 'Temporadas y equipos', () => import('./config-temporadas.js')],
  ['personas', 'Personas', () => import('./config-personas.js')],
  ['instalaciones', 'Instalaciones', () => import('./config-instalaciones.js')],
  ['excel', 'Excel', () => import('./config-excel.js')]
];

export async function render(el, ctx) {
  if (!S.club) { el.innerHTML = '<div class="card empty"><p>Elige o crea un club primero.</p></div>'; return; }
  const perm = permission('admin');
  const wanted = ctx.query.get('tab') === 'club' ? 'identidad' : ctx.query.get('tab');
  const tab = TABS.find((t) => t[0] === wanted) || (perm.ok ? TABS[0] : TABS[3]);
  // En Personas, la Coordinación puede invitar: no se muestra el aviso general.
  const facilitiesTab = tab[0] === 'instalaciones';
  const note = tab[0] === 'excel' || (tab[0] === 'personas' && canInvite()) || (facilitiesTab && canManageFacilities()) ? ''
    : facilitiesTab ? permNote({ ok: false, reason: 'Las instalaciones las mantienen la Dirección y la Coordinación.' }) : permNote(perm);

  el.innerHTML = `
    <div class="page-head">
      <div><h1>⚙ Configuración</h1><p>${esc(S.club.name)}</p></div>
      <a class="btn" href="#/inicio">← Inicio</a>
    </div>
    ${note}
    <nav class="tabs page-tabs" aria-label="Apartados de la configuración">
      ${TABS.map(([k, label]) => `<a class="tab" href="#/config?tab=${k}" aria-current="${k === tab[0] ? 'page' : 'false'}">${label}</a>`).join('')}
    </nav>
    <div id="cfgBody"></div>`;
  const mod = await tab[2]();
  return mod.render(el.querySelector('#cfgBody'), { canEdit: facilitiesTab ? canManageFacilities() : perm.ok });
}
