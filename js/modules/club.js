// Panel del club (Dirección y Coordinación). Versión inicial de la fase R2:
// la tarjeta completa por equipo y las alertas configurables llegan en la fase R3.
import { esc, copyText } from '../ui.js';
import { S, isAdmin, roleLabel, ROLE_LABEL, appBaseUrl } from '../session.js';
import { NEW_INVITES } from './asistente-club.js';
import { loadClubOverview, personName } from '../lib/clubdata.js';

export async function render(el) {
  el.innerHTML = '<div class="card"><p class="hint">Cargando el panel del club…</p></div>';
  const d = await loadClubOverview();
  const admin = isAdmin();
  const totalPlayers = d.teams.reduce((n, t) => n + d.playersByTeam[t.id].total, 0);
  const staffIds = new Set(d.members.filter((m) => m.role !== 'admin' && (m.team_ids?.length ? m.team_ids.some((id) => d.teams.some((t) => t.id === id)) : true)).map((m) => m.user_id));

  const alerts = [];
  for (const t of d.teams) {
    if (!d.staffByTeam[t.id].some((m) => m.role === 'entrenador')) alerts.push({ team: t, text: 'Sin entrenador principal', action: ['#/config?tab=personas', 'Invitar'] });
    if (!d.playersByTeam[t.id].total) alerts.push({ team: t, text: 'Sin jugadores en la plantilla', action: null });
  }

  const crest = S.crestUrl
    ? `style="background-image:url('${esc(S.crestUrl)}'), linear-gradient(135deg, var(--accent), var(--accent-2))"`
    : '';
  const crestText = S.crestUrl ? '' : esc((S.club.short_name || S.club.name).slice(0, 3).toUpperCase());

  let fresh = null;
  try { fresh = JSON.parse(sessionStorage.getItem(NEW_INVITES)); } catch { /* nada */ }
  const link = (t) => appBaseUrl() + '#/invitacion/' + t;
  const waText = (i) => `Te invito a ${S.club.name} en Club Gestor como ${ROLE_LABEL[i.role].toLowerCase()} (${i.team}). Abre este enlace para unirte (caduca en 7 días): ${link(i.token)}`;

  el.innerHTML = `
    ${fresh?.invites?.length ? `
    <section class="card success-card" id="newInvites">
      <div class="section-head"><h2>✉ Envía las invitaciones a tu cuerpo técnico</h2><button class="btn small" type="button" data-hide-invites>Hecho, ocultar</button></div>
      <p class="hint">Cada enlace es para una persona, lleva su equipo y su perfil, y caduca en 7 días. También los tienes en Configuración → Personas.</p>
      <ul class="list">${fresh.invites.map((i) => `
        <li data-token="${esc(i.token)}">
          <div><strong>${esc(i.team)}</strong> · ${esc(ROLE_LABEL[i.role])}${i.specialty ? ' · ' + esc(i.specialty) : ''}<br><small class="muted">${esc(i.email || 'Sin email: cualquiera con el enlace')}</small></div>
          <div class="actions">
            <button class="btn small" type="button" data-copy>Copiar enlace</button>
            <a class="btn small" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(waText(i))}">WhatsApp</a>
          </div>
        </li>`).join('')}</ul>
    </section>` : ''}

    <section class="hero card">
      <span class="crest big-crest" ${crest} aria-hidden="true">${crestText}</span>
      <div class="hero-text">
        <p class="eyebrow">Panel del club · ${esc(roleLabel())}</p>
        <h1>${esc(S.club.name)}</h1>
        <p class="muted">${[S.season && 'Temporada ' + S.season.name, S.club.city].filter(Boolean).map(esc).join(' · ')}</p>
      </div>
      <div class="hero-actions">
        ${admin ? '<a class="btn" href="#/config?tab=temporadas">+ Nuevo equipo</a>' : ''}
        <a class="btn primary" href="#/config?tab=personas">Invitar al cuerpo técnico</a>
      </div>
    </section>

    <section class="stats" aria-label="El club en cifras">
      <a class="stat card" href="#/equipos"><strong>${d.teams.length}</strong><span>${d.teams.length === 1 ? 'equipo' : 'equipos'}</span></a>
      <div class="stat card"><strong>${totalPlayers}</strong><span>jugadores</span></div>
      <a class="stat card" href="#/config?tab=personas"><strong>${staffIds.size}</strong><span>cuerpo técnico</span></a>
      <a class="stat card" href="#/config?tab=personas"><strong>${d.pendingInvites.length}</strong><span>invitaciones pendientes</span></a>
    </section>

    <div class="grid two">
      <section class="card">
        <h2>Pendiente <span class="count">${alerts.length}</span></h2>
        ${alerts.length ? `<ul class="alerts">${alerts.map((a) => `
          <li><span class="pill warn">${esc(a.text)}</span> <strong>${esc(a.team.name)}</strong>
          ${a.action ? `<a href="${esc(a.action[0])}">${esc(a.action[1])}</a>` : ''}</li>`).join('')}</ul>`
          : '<p class="big-line">Todo en orden ✓</p><p class="hint">Todos los equipos tienen entrenador principal y jugadores.</p>'}
      </section>
      <section class="card">
        <h2>Equipos</h2>
        ${d.teams.length ? `<ul class="list">${d.teams.map((t) => {
          const head = d.staffByTeam[t.id].filter((m) => m.role === 'entrenador').map(personName);
          return `<li><div><strong>${esc(t.name)}</strong> <small class="muted">${esc(t.category || '')}</small><br>
            <small class="muted">${head.length ? esc(head.join(', ')) : 'Sin entrenador principal'} · ${d.playersByTeam[t.id].total} jugadores</small></div>
            <a class="btn small" href="#/equipos">Ver</a></li>`;
        }).join('')}</ul>` : `<p class="hint">Aún no hay equipos en esta temporada.${admin ? ' <a href="#/config?tab=temporadas">Crea el primero</a>.' : ''}</p>`}
      </section>
    </div>

    <p class="note soon">🚧 Próximamente (fase R3): una tarjeta por equipo con las sesiones de la semana, asistencia, partidos e informes pendientes, alertas configurables y comentarios a los entrenadores.</p>`;

  el.querySelectorAll('#newInvites [data-copy]').forEach((b) => b.addEventListener('click', () => copyText(link(b.closest('[data-token]').dataset.token))));
  el.querySelector('[data-hide-invites]')?.addEventListener('click', () => {
    try { sessionStorage.removeItem(NEW_INVITES); } catch { /* nada */ }
    el.querySelector('#newInvites').remove();
  });
}
