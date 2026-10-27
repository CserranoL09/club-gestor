// Página inicial del club: botonera de módulos agrupada.
// En el Prompt 4 se hará configurable (orden, módulos ocultos, nombres y tarjetas resumen).
import { esc } from '../ui.js';
import { MODULES } from './list.js';
import { isConfigured } from '../supabase.js';

export async function render(el) {
  const groups = [...new Set(MODULES.map((m) => m.group))];
  el.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Inicio</h1>
        <p>Elige qué quieres hacer. Cada botón corresponde a una hoja de tu plantilla de control de temporada.</p>
      </div>
      ${isConfigured ? '' : '<a class="btn" href="#/login">Entrar</a>'}
    </div>
    ${groups.map((g) => `
      <h2 class="section-title">${esc(g)}</h2>
      <nav class="modules" aria-label="${esc(g)}">
        ${MODULES.filter((m) => m.group === g).map((m) => `
          <a class="module" href="${esc(m.route)}">
            <span class="ico" aria-hidden="true">${esc(m.icon)}</span>
            <span><strong>${esc(m.name)}</strong><span>${esc(m.desc)}</span></span>
          </a>`).join('')}
      </nav>`).join('')}`;
}
