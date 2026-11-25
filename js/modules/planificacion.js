// Planificación del equipo: acceso a Periodización, Macrociclo y Morfociclo.
import { esc } from '../ui.js';
import { S, permission } from '../session.js';
import { orderedModules } from '../lib/layout.js';

export async function render(el) {
  const mods = orderedModules(S.club?.home_layout).filter((m) => ['periodizacion', 'macrociclo', 'morfociclo'].includes(m.key) && !m.hidden);
  el.innerHTML = `
    <div class="page-head">
      <div><h1>🗓 Planificación</h1><p>${esc(S.team?.name || '')} · temporada ${esc(S.season?.name || '')}</p></div>
    </div>
    <nav class="modules">
      ${mods.map((m) => `
        <a class="module" href="${esc(m.route)}" data-module="${esc(m.key)}">
          <span class="ico" aria-hidden="true">${esc(m.icon)}</span>
          <span><strong>${esc(m.label)}</strong><span>${esc(m.desc)}</span>${permission(m.perm).ok ? '' : '<span class="lock">🔒 Solo ver</span>'}</span>
        </a>`).join('')}
    </nav>`;
}
