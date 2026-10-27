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
const BANNERS = {
  'sin-configurar': '<strong>Falta configurar Supabase.</strong> La app funciona en modo de prueba: rellena <code>js/config.js</code> con la Project URL y la clave anon de tu proyecto.',
  'falta-sql': '<strong>Falta instalar la base de datos.</strong> Pega <code>supabase/instalar.sql</code> en el SQL Editor de Supabase y pulsa Run.',
  error: '<strong>No se puede conectar con Supabase.</strong> Revisa tu conexión a internet. Si el proyecto lleva días sin usarse, reactívalo desde el panel de Supabase.'
};
const STATUS = {
  ok: ['on', 'Conectado a Supabase'],
  'falta-sql': ['off', 'Supabase responde, pero falta instalar la base de datos'],
  error: ['off', 'Sin conexión con Supabase'],
  'sin-configurar': ['', 'Supabase sin configurar']
};
(async () => {
  const state = await checkConnection();
  const conn = $('connStatus');
  conn.className = 'conn ' + STATUS[state][0];
  conn.title = STATUS[state][1];
  conn.setAttribute('aria-label', STATUS[state][1]);
  const banner = $('setupBanner');
  banner.hidden = !BANNERS[state];
  if (BANNERS[state]) banner.innerHTML = BANNERS[state];
})();
$('setupBanner').hidden = isConfigured;

startRouter($('main'), getCtx);
