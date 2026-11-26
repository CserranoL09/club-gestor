// Equipos del club (Dirección y Coordinación): tarjeta por equipo y entrada al equipo.
import { esc, busy } from '../ui.js';
import { S, isAdmin, selectTeam, ROLE_LABEL } from '../session.js';
import { loadClubOverview, personName } from '../lib/clubdata.js';

const MOD = { f11: 'Fútbol 11', f7: 'Fútbol 7' };

export async function render(el, ctx) {
  el.innerHTML = '<div class="card"><p class="hint">Cargando equipos…</p></div>';
  const d = await loadClubOverview({ withMetrics: false });
  const cats = [...new Set(d.teams.map((t) => t.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const filter = ctx.query.get('cat') || '';
  const teams = filter ? d.teams.filter((t) => t.category === filter) : d.teams;

  el.innerHTML = `
    <div class="page-head">
      <div><h1>🛡 Equipos</h1><p>Temporada ${esc(S.season?.name || '')} · ${d.teams.length} ${d.teams.length === 1 ? 'equipo' : 'equipos'}</p></div>
      ${isAdmin() ? '<a class="btn primary" href="#/config?tab=temporadas">+ Nuevo equipo</a>' : ''}
    </div>
    ${cats.length > 1 ? `
      <nav class="chips" aria-label="Filtrar por categoría">
        <a class="chip${filter ? '' : ' on'}" href="#/equipos">Todas</a>
        ${cats.map((c) => `<a class="chip${c === filter ? ' on' : ''}" href="#/equipos?cat=${encodeURIComponent(c)}">${esc(c)}</a>`).join('')}
      </nav>` : ''}
    ${teams.length ? `
      <div class="team-cards">
        ${teams.map((t) => {
          const staff = d.staffByTeam[t.id];
          const pl = d.playersByTeam[t.id];
          const head = staff.some((m) => m.role === 'entrenador');
          return `
          <article class="card team-card${t.id === S.team?.id ? ' current' : ''}">
            <header>
              <h2>${esc(t.name)}</h2>
              <p class="muted">${[t.category, MOD[t.modality]].filter(Boolean).map(esc).join(' · ')}</p>
            </header>
            ${staff.length ? `<ul class="plain-list staff">${staff.map((m) => `<li><span class="avatar sm" aria-hidden="true">${esc(personName(m).slice(0, 1).toUpperCase())}</span><span><strong>${esc(personName(m))}</strong><br><small class="muted">${esc(ROLE_LABEL[m.role])}${m.specialty ? ' · ' + esc(m.specialty) : ''}</small></span></li>`).join('')}</ul>`
              : '<p class="muted">Sin cuerpo técnico asignado.</p>'}
            <p class="team-meta">
              <span>👥 ${pl.total} jugadores</span>
              ${pl.injured ? `<span>🩹 ${pl.injured} lesionados</span>` : ''}
              ${head ? '' : '<span class="pill warn">Sin entrenador principal</span>'}
            </p>
            <div class="actions">
              <button class="btn primary small" type="button" data-enter="${esc(t.id)}">Entrar al equipo</button>
              ${head ? '' : '<a class="btn small" href="#/config?tab=personas">Invitar entrenador</a>'}
            </div>
          </article>`;
        }).join('')}
      </div>` : `<div class="card empty"><div class="big">🛡</div><h2>No hay equipos</h2><p>${isAdmin() ? 'Crea los equipos de la temporada en Configuración → Temporadas y equipos.' : 'No coordinas ningún equipo en esta temporada.'}</p></div>`}`;

  el.querySelectorAll('[data-enter]').forEach((b) => b.addEventListener('click', () => busy(b, async () => {
    selectTeam(b.dataset.enter);
    location.hash = '#/inicio';
  })));
}
