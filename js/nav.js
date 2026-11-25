// Navegación: barra lateral (escritorio), barra inferior con «Más» (móvil)
// y franja «Viendo <equipo> · volver al club» para Dirección y Coordinación.
import { esc } from './ui.js';
import { S, isClubManager, isTeacher, permission } from './session.js';
import { normalizeLayout, moduleLabel } from './lib/layout.js';

const CLUB_ITEMS = [
  { key: 'club', href: '#/club', icon: '🏟', label: 'Panel del club', match: (p) => p === '/club' },
  { key: 'equipos', href: '#/equipos', icon: '🛡', label: 'Equipos', match: (p) => p === '/equipos' },
  { key: 'calendario', href: '#/calendario', icon: '📅', label: 'Calendario', match: (p) => p === '/calendario' },
  { key: 'metodologia', href: '#/metodologia', icon: '📘', label: 'Metodología', match: (p) => p === '/metodologia' },
  { key: 'personas', href: '#/config?tab=personas', icon: '🧑‍🤝‍🧑', label: 'Personas', match: (p, q) => p === '/config' && q?.get('tab') === 'personas' },
  { key: 'config', href: '#/config', icon: '⚙', label: 'Configuración', match: (p, q) => p === '/config' && q?.get('tab') !== 'personas' }
];

function teamItems() {
  const layout = normalizeLayout(S.club?.home_layout);
  const hidden = new Set(layout.hidden);
  const label = (k) => moduleLabel(layout, k);
  const items = [
    { key: 'inicio', href: '#/inicio', icon: '🏠', label: 'Mi equipo', match: (p) => p === '/inicio' },
    { key: 'sesiones', href: '#/sesiones', icon: '⚽', label: label('sesiones'), match: (p) => p.startsWith('/sesiones'), hide: hidden.has('sesiones') },
    { key: 'planificacion', href: '#/planificacion', icon: '🗓', label: 'Planificación',
      match: (p) => ['/planificacion', '/periodizacion', '/morfociclo'].includes(p) || p.startsWith('/macrociclo'),
      hide: ['periodizacion', 'macrociclo', 'morfociclo'].every((k) => hidden.has(k)) },
    { key: 'partidos', href: '#/partidos', icon: '📋', label: 'Partidos', match: (p) => p.startsWith('/partidos'),
      hide: ['prepartido', 'partido', 'postpartido'].every((k) => hidden.has(k)) },
    { key: 'plantilla', href: '#/plantilla', icon: '👥', label: label('plantilla'), match: (p) => p === '/plantilla', hide: hidden.has('plantilla') },
    { key: 'estadisticas', href: '#/estadisticas', icon: '📊', label: label('estadisticas'), match: (p) => p === '/estadisticas' || p.startsWith('/jugador'), hide: hidden.has('estadisticas') }
  ];
  return items.filter((i) => !i.hide);
}

/** Configuración para quien no gestiona el club (club personal o cuerpo técnico). */
const OWN_CONFIG = { key: 'config', href: '#/config', icon: '⚙', label: 'Configuración', match: (p) => p === '/config' };

let current = { path: '', query: null, route: null };

const link = (i, cls = '') => {
  const active = i.match(current.path, current.query);
  return `<a class="${cls}${active ? ' active' : ''}" href="${esc(i.href)}" data-nav="${esc(i.key)}"${active ? ' aria-current="page"' : ''}>
    <span class="nav-ico" aria-hidden="true">${i.icon}</span><span class="nav-label">${esc(i.label)}</span></a>`;
};

function groups() {
  const out = [];
  if (isClubManager()) out.push({ title: S.club.short_name || 'Club', items: CLUB_ITEMS });
  if (S.team) out.push({ title: S.team.name, items: teamItems(), team: true });
  if (!isClubManager()) out.push({ title: '', items: [OWN_CONFIG] });
  return out;
}

export function renderNav() {
  const side = document.getElementById('sidebar');
  const bottom = document.getElementById('bottomNav');
  const banner = document.getElementById('teamBanner');
  const show = !!(S.user && S.club) && current.route?.area !== 'account';
  document.body.classList.toggle('has-nav', show);
  side.hidden = bottom.hidden = !show;
  if (!show) { banner.hidden = true; return; }

  const gs = groups();
  side.innerHTML = gs.map((g) => `
    <div class="nav-group">
      ${g.title ? `<p class="nav-title">${g.team ? '<span aria-hidden="true">⚑</span> ' : ''}${esc(g.title)}</p>` : '<hr>'}
      ${g.items.map((i) => link(i, 'nav-item')).join('')}
    </div>`).join('')
    + (isTeacher() ? `<div class="nav-group"><hr>${link({ key: 'profesor', href: '#/profesor', icon: '🎓', label: 'Panel del profesor', match: (p) => p === '/profesor' }, 'nav-item')}</div>` : '');

  // Barra inferior: 4 accesos del área en la que se está + «Más».
  const inClub = isClubManager() && current.route?.area !== 'team';
  const main = inClub ? CLUB_ITEMS : teamItems();
  bottom.innerHTML = main.slice(0, 4).map((i) => link(i, 'bn-item')).join('')
    + `<button type="button" class="bn-item" data-more aria-haspopup="dialog"><span class="nav-ico" aria-hidden="true">☰</span><span class="nav-label">Más</span></button>`;

  // Franja para Dirección y Coordinación cuando trabajan dentro de un equipo.
  const inTeam = isClubManager() && current.route?.area === 'team' && S.team;
  banner.hidden = !inTeam;
  if (inTeam) {
    const ro = !permission('edit').ok ? ' · <span class="muted">solo ver y comentar</span>' : '';
    banner.innerHTML = `<span>Viendo <strong>${esc(S.team.name)}</strong>${S.team.category ? ' · ' + esc(S.team.category) : ''}${ro}</span>
      <a href="#/club" class="btn small">← Volver al club</a>`;
  }
}

function openMore() {
  const dlg = document.getElementById('moreDlg');
  const body = document.getElementById('moreBody');
  body.innerHTML = groups().map((g) => `
    <div class="nav-group">
      ${g.title ? `<p class="nav-title">${esc(g.title)}</p>` : ''}
      <div class="more-grid">${g.items.map((i) => link(i, 'more-item')).join('')}</div>
    </div>`).join('') + `
    <div class="nav-group"><p class="nav-title">Mi cuenta</p>
      <div class="more-grid">
        <a class="more-item" href="#/perfil"><span class="nav-ico" aria-hidden="true">👤</span><span class="nav-label">Mi perfil</span></a>
        ${isTeacher() ? '<a class="more-item" href="#/profesor"><span class="nav-ico" aria-hidden="true">🎓</span><span class="nav-label">Panel del profesor</span></a>' : ''}
      </div>
    </div>`;
  dlg.showModal();
}

export function initNav() {
  window.addEventListener('clubgestor:route', (ev) => { current = ev.detail; renderNav(); });
  document.getElementById('bottomNav').addEventListener('click', (ev) => { if (ev.target.closest('[data-more]')) openMore(); });
  const dlg = document.getElementById('moreDlg');
  dlg.addEventListener('click', (ev) => {
    if (ev.target === dlg || ev.target.closest('a, [data-close]')) dlg.close();
  });
}
