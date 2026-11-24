// Página inicial del club: saludo, rol y botonera de módulos agrupada.
// En el Prompt 4 se hará configurable (orden, módulos ocultos, nombres y tarjetas resumen).
import { esc } from '../ui.js';
import { MODULES } from './list.js';
import { isConfigured } from '../supabase.js';
import { S, permission, roleLabel } from '../session.js';

export async function render(el) {
  const groups = [...new Set(MODULES.map((m) => m.group))];
  const first = (S.profile?.full_name || '').split(' ')[0];
  const lockOf = (m) => {
    if (!isConfigured || m.perm === 'read') return '';
    return permission(m.perm).ok ? '' : '<span class="lock" title="Solo lectura con tu rol">🔒 Solo ver</span>';
  };
  el.innerHTML = `
    <div class="page-head">
      <div>
        <h1>${S.club ? esc(S.club.name) : 'Inicio'}</h1>
        <p>${S.user
          ? `Hola${first ? ', ' + esc(first) : ''}. Eres <strong>${esc(roleLabel())}</strong>${S.team ? ` · equipo <strong>${esc(S.team.name)}</strong>` : ''}.`
          : 'Elige qué quieres hacer. Cada botón corresponde a una hoja de tu plantilla de control de temporada.'}</p>
      </div>
      ${isConfigured && !S.user ? '<a class="btn primary" href="#/login">Entrar</a>' : ''}
    </div>
    ${S.club && !S.team ? '<p class="note">Este club aún no tiene equipos en esta temporada. El administrador puede crearlos en Configuración.</p>' : ''}
    ${groups.map((g) => `
      <h2 class="section-title">${esc(g)}</h2>
      <nav class="modules" aria-label="${esc(g)}">
        ${MODULES.filter((m) => m.group === g).map((m) => `
          <a class="module" href="${esc(m.route)}">
            <span class="ico" aria-hidden="true">${esc(m.icon)}</span>
            <span><strong>${esc(m.name)}</strong><span>${esc(m.desc)}</span>${lockOf(m)}</span>
          </a>`).join('')}
      </nav>`).join('')}`;
}
