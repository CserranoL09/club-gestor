// Arranque: tema, cabecera, novedades, estado de la conexión y router.
import { APP_VERSION, CHANGELOG } from './version.js';
import { isConfigured, checkConnection } from './supabase.js';
import { esc } from './ui.js';
import { getCtx, clearCtx } from './store.js';
import { startRouter } from './router.js';

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

// Tema oscuro / claro
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

// Versión y novedades
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

// Menú del usuario
const menu = $('userMenu');
$('userBtn').addEventListener('click', (ev) => {
  ev.stopPropagation();
  menu.hidden = !menu.hidden;
  $('userBtn').setAttribute('aria-expanded', String(!menu.hidden));
});
document.addEventListener('click', (ev) => {
  if (!menu.hidden && !menu.contains(ev.target)) { menu.hidden = true; $('userBtn').setAttribute('aria-expanded', 'false'); }
});
menu.addEventListener('click', (ev) => { if (ev.target.closest('a')) menu.hidden = true; });
$('logoutBtn').addEventListener('click', () => {
  clearCtx();
  menu.hidden = true;
  location.hash = '#/login';
});

// Supabase
$('setupBanner').hidden = isConfigured;
(async () => {
  const conn = $('connStatus');
  const state = await checkConnection();
  conn.classList.toggle('on', state === 'ok');
  conn.classList.toggle('off', state === 'error');
  conn.title = { ok: 'Conectado a Supabase', error: 'Sin conexión con Supabase', 'sin-configurar': 'Supabase sin configurar' }[state];
})();

startRouter($('main'), getCtx);
