// Arranque: tema, sesión, cabecera, novedades, estado de la conexión y router.
import { APP_VERSION, CHANGELOG } from './version.js';
import { isConfigured, checkConnection } from './supabase.js';
import { esc, toast, errMsg } from './ui.js';
import { startRouter, rerender } from './router.js';
import {
  S, initAuth, onChange, signOut, selectClub, selectSeason, selectTeam, teamsOfSeason,
  roleLabel, isTeacher, takePendingInvite
} from './session.js';

const $ = (id) => document.getElementById(id);
const THEME_KEY = 'clubgestor:theme';
const SEEN_KEY = 'clubgestor:seenVersion';

function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch { return null; }
  return value;
}

// ---------------------------------------------------------------------
// Tema oscuro / claro
// ---------------------------------------------------------------------
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]').content = theme === 'light' ? '#f3f5f7' : '#0f1419';
}
applyTheme(store(THEME_KEY) || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
$('themeBtn').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  applyTheme(next);
  store(THEME_KEY, next);
});

// ---------------------------------------------------------------------
// Versión y novedades
// ---------------------------------------------------------------------
$('appVersion').textContent = 'v' + APP_VERSION;
if (store(SEEN_KEY) !== APP_VERSION) $('newsDot').hidden = false;
$('newsBtn').addEventListener('click', () => {
  $('newsBody').innerHTML = CHANGELOG.map((e) => `
    <div class="news-entry">
      <h3>v${esc(e.version)} · ${esc(e.date)}</h3>
      <ul>${e.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
    </div>`).join('');
  $('newsDlg').showModal();
  store(SEEN_KEY, APP_VERSION);
  $('newsDot').hidden = true;
});

// ---------------------------------------------------------------------
// Cabecera: club, temporada, equipo y menú del usuario
// ---------------------------------------------------------------------
function readableInk(hex) {
  const n = parseInt((hex || '#22c55e').slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#0b1410' : '#ffffff';
}

function renderHeader() {
  const root = document.documentElement.style;
  const club = S.club;
  if (club) {
    root.setProperty('--accent', club.primary_color);
    root.setProperty('--accent-2', club.secondary_color);
    root.setProperty('--accent-ink', readableInk(club.primary_color));
    document.documentElement.dataset.font = club.font || 'saira';
  } else {
    ['--accent', '--accent-2', '--accent-ink'].forEach((p) => root.removeProperty(p));
    delete document.documentElement.dataset.font;
  }

  $('clubName').textContent = club?.name || 'Club Gestor';
  const sub = [S.season?.name && 'Temporada ' + S.season.name, S.team?.name, roleLabel()].filter(Boolean);
  $('clubSub').textContent = sub.length ? sub.join(' · ') : (S.user ? 'Sin club' : 'Gestión de la temporada');
  const crest = $('crest');
  // Si la imagen no carga, se ve el degradado con los colores del club.
  crest.style.backgroundImage = S.crestUrl ? `url("${S.crestUrl}"), linear-gradient(135deg, var(--accent), var(--accent-2))` : '';
  crest.textContent = !S.crestUrl && club ? (club.short_name || club.name).slice(0, 3).toUpperCase() : '';
  document.title = club ? `${club.short_name || club.name} · Club Gestor` : 'Club Gestor';

  // Temporada y equipo
  const seasonSel = $('seasonSel');
  const teamSel = $('teamSel');
  seasonSel.innerHTML = S.seasons.length
    ? S.seasons.map((s) => `<option value="${esc(s.id)}"${s.id === S.season?.id ? ' selected' : ''}>${esc(s.name)}</option>`).join('')
    : '<option>Temporada</option>';
  seasonSel.disabled = S.seasons.length < 2;
  const teams = teamsOfSeason();
  teamSel.innerHTML = teams.length
    ? teams.map((t) => `<option value="${esc(t.id)}"${t.id === S.team?.id ? ' selected' : ''}>${esc(t.name)}</option>`).join('')
    : '<option>Sin equipos</option>';
  teamSel.disabled = teams.length < 2;
  $('ctxBar').hidden = !S.club;

  renderMenu();
}

function renderMenu() {
  const menu = $('userMenu');
  if (!S.user) {
    menu.innerHTML = isConfigured
      ? '<p class="menu-user">Sin sesión</p><a role="menuitem" href="#/login">Entrar o crear cuenta</a>'
      : '<p class="menu-user">Modo de prueba</p><a role="menuitem" href="#/inicio">Inicio</a>';
    return;
  }
  const name = S.profile?.full_name || S.user.email;
  const clubs = S.memberships.length > 1 ? `
    <p class="menu-label">Mis clubes</p>
    ${S.memberships.map((m) => `
      <button role="menuitemradio" type="button" data-club="${esc(m.club.id)}" aria-checked="${m.club.id === S.club?.id}">
        ${m.club.id === S.club?.id ? '✓ ' : ''}${esc(m.club.name)} <small>${esc(roleLabel(m.role))}</small>
      </button>`).join('')}
    <hr>` : '';
  menu.innerHTML = `
    <p class="menu-user"><strong>${esc(name)}</strong><br><small>${esc(S.user.email || '')}</small></p>
    ${clubs}
    <a role="menuitem" href="#/perfil">Mi perfil</a>
    ${S.club ? '<a role="menuitem" href="#/config">Configuración del club</a>' : ''}
    ${isTeacher() ? '<a role="menuitem" href="#/profesor">Panel del profesor</a>' : ''}
    <a role="menuitem" href="#/unirse">Unirme a una clase</a>
    <a role="menuitem" href="#/bienvenida?nuevo=1">Crear otro club</a>
    <hr>
    <button role="menuitem" type="button" data-action="logout">Cerrar sesión</button>`;
}

const menu = $('userMenu');
function closeMenu() { menu.hidden = true; $('userBtn').setAttribute('aria-expanded', 'false'); }
$('userBtn').addEventListener('click', (ev) => {
  ev.stopPropagation();
  menu.hidden = !menu.hidden;
  $('userBtn').setAttribute('aria-expanded', String(!menu.hidden));
});
document.addEventListener('click', (ev) => { if (!menu.hidden && !menu.contains(ev.target)) closeMenu(); });
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !menu.hidden) { closeMenu(); $('userBtn').focus(); } });
menu.addEventListener('click', async (ev) => {
  const el = ev.target.closest('a, button');
  if (!el) return;
  closeMenu();
  if (el.dataset.club && el.dataset.club !== S.club?.id) {
    try { await selectClub(el.dataset.club); location.hash = '#/inicio'; } catch (err) { toast(errMsg(err), 'err'); }
  }
  if (el.dataset.action === 'logout') {
    await signOut();
    toast('Has cerrado la sesión.');
    location.hash = '#/login';
  }
});

$('seasonSel').addEventListener('change', (ev) => selectSeason(ev.target.value));
$('teamSel').addEventListener('change', (ev) => selectTeam(ev.target.value));

// ---------------------------------------------------------------------
// Conexión con Supabase
// ---------------------------------------------------------------------
const BANNERS = {
  'sin-configurar': '<strong>Falta configurar Supabase.</strong> La app funciona en modo de prueba: rellena <code>js/config.js</code> con la Project URL y la clave anon de tu proyecto.',
  'falta-sql': '<strong>Falta instalar la base de datos.</strong> Pega <code>supabase/instalar.sql</code> en el SQL Editor de Supabase y pulsa Run.',
  error: '<strong>No se puede conectar con Supabase.</strong> Revisa tu conexión a internet. Si el proyecto lleva días sin usarse, reactívalo desde el panel de Supabase (Restore project).'
};
const STATUS = {
  ok: ['on', 'Conectado a Supabase'],
  'falta-sql': ['off', 'Supabase responde, pero falta instalar la base de datos'],
  error: ['off', 'Sin conexión con Supabase'],
  'sin-configurar': ['', 'Supabase sin configurar']
};
async function showConnection() {
  const state = await checkConnection();
  const conn = $('connStatus');
  conn.className = 'conn ' + STATUS[state][0];
  conn.title = STATUS[state][1];
  conn.setAttribute('aria-label', STATUS[state][1]);
  const banner = $('setupBanner');
  banner.hidden = !BANNERS[state];
  if (BANNERS[state]) banner.innerHTML = BANNERS[state];
}

// ---------------------------------------------------------------------
// Protección de rutas
// ---------------------------------------------------------------------
function guard(route, path) {
  if (!isConfigured) return null;                         // modo de prueba: todo abierto
  if (S.recovery && S.user) return path === '/nueva-clave' ? null : '/nueva-clave';
  if (!S.user) return route.public ? null : '/login';
  if (path === '/login') return S.memberships.length ? '/inicio' : '/bienvenida';
  if (!S.memberships.length && !route.noClub) return '/bienvenida';
  return null;
}

// ---------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------
showConnection();

(async () => {
  try {
    await initAuth();
  } catch (err) {
    console.error(err);
    toast(errMsg(err), 'err', 8000);
  }
  renderHeader();

  let lastUser = S.user?.id || null;
  onChange(() => {
    renderHeader();
    const uid = S.user?.id || null;
    if (uid && uid !== lastUser) {
      // Acaba de entrar: primero una invitación pendiente, si la hay.
      const token = takePendingInvite();
      lastUser = uid;
      if (token) { location.hash = '#/invitacion/' + token; return; }
      if (location.hash.startsWith('#/login') || !location.hash) { location.hash = S.memberships.length ? '#/inicio' : '#/bienvenida'; return; }
    }
    lastUser = uid;
    rerender();
  });

  if (S.user) {
    const token = takePendingInvite();
    if (token) location.replace('#/invitacion/' + token);
  }
  startRouter($('main'), { guard });
})();
