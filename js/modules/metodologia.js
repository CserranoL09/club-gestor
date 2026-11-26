// Metodología del club: modelo de juego, objetivos por categoría, tareas y plantillas.
// Editan Dirección y Coordinación; el resto del club la consulta (y propone tareas).
import { esc } from '../ui.js';
import { S } from '../session.js';
import { canEditMethodology } from '../lib/methodology.js';

const TABS = [
  ['modelo', 'Modelo de juego', () => import('./metodologia-modelo.js')],
  ['objetivos', 'Objetivos por categoría', () => import('./metodologia-objetivos.js')],
  ['tareas', 'Tareas del club', () => import('./metodologia-tareas.js')],
  ['plantillas', 'Plantillas', () => import('./metodologia-plantillas.js')]
];

export async function render(el, ctx) {
  const tab = TABS.find((t) => t[0] === ctx.query.get('tab')) || TABS[0];
  const canEdit = canEditMethodology();
  el.innerHTML = `
    <div class="page-head">
      <div><h1>📘 Metodología del club</h1><p>${esc(S.club.name)} · ${canEdit ? 'la Dirección y la Coordinación la mantienen; todo el club la consulta' : 'la forma de jugar y entrenar del club'}.</p></div>
    </div>
    ${canEdit ? '' : '<p class="note" role="note">📖 Puedes consultarla y proponer tareas. La editan la Dirección y la Coordinación.</p>'}
    <nav class="tabs page-tabs" aria-label="Apartados de la metodología">
      ${TABS.map(([k, label]) => `<a class="tab" href="#/metodologia?tab=${k}" aria-current="${k === tab[0] ? 'page' : 'false'}">${label}</a>`).join('')}
    </nav>
    <div id="metBody"></div>`;
  const mod = await tab[2]();
  await mod.render(el.querySelector('#metBody'), { canEdit, query: ctx.query });
}
