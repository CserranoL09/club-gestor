// Página provisional para los módulos que aún no están construidos.
import { esc, permNote } from '../ui.js';
import { S, permission } from '../session.js';
import { mountThread } from '../lib/comments.js';

export async function render(el, ctx) {
  const m = ctx.module || { icon: ctx.route?.icon, desc: ctx.route?.desc };
  const title = ctx.route?.title || m.name || 'Módulo';
  const prompt = m.prompt || ctx.route?.prompt;
  const phase = ctx.route?.phase;
  const perm = permission(m.perm);
  el.innerHTML = `
    <div class="page-head">
      <div>
        <h1>${esc(m.icon || '')} ${esc(title)}</h1>
        <p>${esc(m.desc || '')}</p>
      </div>
      <a class="btn" href="#/inicio">← Inicio</a>
    </div>
    ${permNote(perm)}
    <div class="card empty">
      <div class="big">🚧</div>
      <h2>En construcción</h2>
      <p>
        ${m.sheet ? `Este módulo reproducirá la hoja <strong>${esc(m.sheet)}</strong> del Excel. ` : ''}
        ${phase ? `Llega con la fase <strong>${esc(phase)}</strong> del rediseño para clubes.` : prompt ? `Se construye con el <strong>Prompt ${esc(prompt)}</strong> de la biblioteca de prompts.` : ''}
      </p>
    </div>
    <div id="thread"></div>`;
  // Comentarios de supervisión de este apartado (ya se pueden usar aunque el módulo esté en construcción).
  if (ctx.route?.area === 'team' && ctx.module && S.team) {
    await mountThread(el.querySelector('#thread'), { teamId: S.team.id, entity: ctx.module.key, title: `Comentarios sobre ${m.name}` });
  }
}
