// Página provisional para los módulos que aún no están construidos.
import { esc } from '../ui.js';

export async function render(el, ctx) {
  const m = ctx.module || {};
  const title = ctx.route?.title || m.name || 'Módulo';
  const prompt = m.prompt || ctx.route?.prompt;
  el.innerHTML = `
    <div class="page-head">
      <div>
        <h1>${esc(m.icon || '')} ${esc(title)}</h1>
        <p>${esc(m.desc || '')}</p>
      </div>
      <a class="btn" href="#/inicio">← Inicio</a>
    </div>
    <div class="card empty">
      <div class="big">🚧</div>
      <h2>En construcción</h2>
      <p>
        ${m.sheet ? `Este módulo reproducirá la hoja <strong>${esc(m.sheet)}</strong> del Excel. ` : ''}
        ${prompt ? `Se construye con el <strong>Prompt ${esc(prompt)}</strong> de la biblioteca de prompts.` : ''}
      </p>
    </div>`;
}
