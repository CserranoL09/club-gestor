// Acceso: entrar, crear cuenta, enlace mágico, recuperar contraseña y poner una contraseña nueva.
import { esc, toast, busy, formValues } from '../ui.js';
import { isConfigured, sb } from '../supabase.js';
import { S, appBaseUrl, refresh } from '../session.js';

// Contraseñas: al menos 8 caracteres y que no sean de las más usadas ni el propio email.
const COMMON = ['12345678', '123456789', '1234567890', 'password', 'contraseña', 'contrasena', 'qwertyui', 'qwerty123', 'futbol123', 'football', 'iloveyou',
  'abcd1234', '11111111', '00000000', '87654321', 'password1', 'admin123', 'clubgestor', 'entrenador', 'barcelona', 'realmadrid', 'atletico'];
export function passwordProblem(pw, email = '') {
  const p = String(pw || '');
  if (p.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
  const low = p.toLowerCase();
  if (COMMON.includes(low) || /^(.)\1+$/.test(p) || /^(0123456789|123456789|abcdefgh)/.test(low)) return 'Esa contraseña es de las más usadas: elige otra.';
  const user = String(email).split('@')[0].toLowerCase();
  if (user.length >= 4 && low.includes(user)) return 'La contraseña no puede contener tu email.';
  return '';
}

const TABS = [
  ['entrar', 'Entrar'],
  ['registro', 'Crear cuenta'],
  ['enlace', 'Enlace por email'],
  ['recuperar', 'Olvidé la contraseña']
];

export async function render(el, ctx) {
  if (!isConfigured) {
    el.innerHTML = `
      <div class="auth card">
        <h1>Entrar</h1>
        <p class="hint">Todavía no hay base de datos conectada. Puedes explorar la app en modo de prueba.</p>
        <a class="btn primary" href="#/inicio">Seguir en modo de prueba</a>
      </div>`;
    return;
  }
  if (ctx.path === '/nueva-clave') return renderNewPassword(el);

  let tab = ctx.query.get('modo') || 'entrar';
  const notice = S.authNotice;
  S.authNotice = '';

  function draw(message = '') {
    el.innerHTML = `
      <div class="auth">
        <div class="auth-head">
          <h1>Club Gestor</h1>
          <p class="hint">Planifica la temporada, prepara los partidos y comparte el trabajo con tu cuerpo técnico.</p>
        </div>
        <div class="card">
          <div class="tabs" role="tablist" aria-label="Forma de entrar">
            ${TABS.map(([k, label]) => `<button type="button" role="tab" class="tab" data-tab="${k}" aria-selected="${k === tab}">${label}</button>`).join('')}
          </div>
          ${notice ? `<p class="note">${esc(notice)}</p>` : ''}
          ${message ? `<div class="success" role="status">${message}</div>` : form()}
        </div>
      </div>`;
    el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; draw(); }));
    const f = el.querySelector('form');
    if (f) f.addEventListener('submit', (ev) => { ev.preventDefault(); submit(f); });
    el.querySelector('[data-again]')?.addEventListener('click', () => draw());
    el.querySelector('input')?.focus();
  }

  function form() {
    const email = '<label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required>';
    if (tab === 'entrar') return `
      <form novalidate>
        ${email}
        <label for="password">Contraseña</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required>
        <button class="btn primary" type="submit">Entrar</button>
      </form>`;
    if (tab === 'registro') return `
      <form novalidate>
        <label for="full_name">Nombre y apellidos</label>
        <input id="full_name" name="full_name" autocomplete="name" required maxlength="80">
        ${email}
        <label for="password">Contraseña</label>
        <input id="password" name="password" type="password" autocomplete="new-password" required minlength="8" aria-describedby="pwHelp">
        <p class="hint" id="pwHelp">Mínimo 8 caracteres. Apúntala bien: si la olvidas, puede que no te llegue el correo para recuperarla.</p>
        <label class="check"><input type="checkbox" name="is_teacher"> Soy profesor/a y quiero crear clases para mis alumnos</label>
        <button class="btn primary" type="submit">Crear cuenta</button>
      </form>`;
    if (tab === 'enlace') return `
      <form novalidate>
        <p class="hint">Te enviamos un enlace para entrar sin contraseña. Ábrelo en este mismo dispositivo.</p>
        ${email}
        <button class="btn primary" type="submit">Enviar enlace</button>
      </form>`;
    return `
      <form novalidate>
        <p class="hint">Te enviamos un enlace para poner una contraseña nueva.</p>
        ${email}
        <button class="btn primary" type="submit">Enviar enlace</button>
      </form>`;
  }

  async function submit(f) {
    const v = formValues(f);
    if (!/^\S+@\S+\.\S+$/.test(v.email || '')) { toast('Escribe un email válido.', 'err'); return; }
    const btn = f.querySelector('[type=submit]');
    const auth = sb().auth;
    const redirect = appBaseUrl();

    await busy(btn, async () => {
      if (tab === 'entrar') {
        if (!v.password) { toast('Escribe tu contraseña.', 'err'); return; }
        const { error } = await auth.signInWithPassword({ email: v.email, password: v.password });
        if (error) throw error;
        // La sesión avisa al resto de la app y se va al inicio.
      } else if (tab === 'registro') {
        if (!v.full_name) { toast('Escribe tu nombre.', 'err'); return; }
        const bad = passwordProblem(v.password, v.email);
        if (bad) { toast(bad, 'err', 5000); return; }
        const { data, error } = await auth.signUp({
          email: v.email,
          password: v.password,
          options: { data: { full_name: v.full_name, is_teacher: !!v.is_teacher }, emailRedirectTo: redirect }
        });
        if (error) throw error;
        if (!data.session) {
          if (data.user && !data.user.identities?.length) throw new Error('User already registered');
          draw(`<h2>Revisa tu email</h2><p>Te hemos enviado un enlace a <strong>${esc(v.email)}</strong> para confirmar la cuenta. Ábrelo y volverás aquí con la sesión iniciada.</p>
                <p class="hint">¿No llega? Mira en «spam». Si sigue sin llegar, pide al responsable de la app que revise los emails de Supabase.</p>
                <button class="btn" type="button" data-again>Volver</button>`);
        }
      } else if (tab === 'enlace') {
        const { error } = await auth.signInWithOtp({ email: v.email, options: { shouldCreateUser: false, emailRedirectTo: redirect } });
        if (error) throw error;
        draw(`<h2>Revisa tu email</h2><p>Si hay una cuenta con <strong>${esc(v.email)}</strong>, te llegará un enlace para entrar. Ábrelo en este dispositivo.</p><button class="btn" type="button" data-again>Volver</button>`);
      } else {
        const { error } = await auth.resetPasswordForEmail(v.email, { redirectTo: redirect });
        if (error) throw error;
        draw(`<h2>Revisa tu email</h2><p>Si hay una cuenta con <strong>${esc(v.email)}</strong>, te llegará un enlace para poner una contraseña nueva.</p><button class="btn" type="button" data-again>Volver</button>`);
      }
    });
  }

  draw();
}

function renderNewPassword(el) {
  if (!S.user) {
    el.innerHTML = `
      <div class="auth card">
        <h1>Contraseña nueva</h1>
        <p class="hint">El enlace ha caducado o ya se ha usado. Pide otro desde «Olvidé la contraseña».</p>
        <a class="btn primary" href="#/login?modo=recuperar">Pedir otro enlace</a>
      </div>`;
    return;
  }
  el.innerHTML = `
    <div class="auth card">
      <h1>Contraseña nueva</h1>
      <p class="hint">Para ${esc(S.user.email)}</p>
      <form novalidate>
        <label for="p1">Contraseña nueva (mínimo 8 caracteres)</label>
        <input id="p1" name="p1" type="password" autocomplete="new-password" minlength="8" required>
        <label for="p2">Repite la contraseña</label>
        <input id="p2" name="p2" type="password" autocomplete="new-password" minlength="8" required>
        <button class="btn primary" type="submit">Guardar contraseña</button>
      </form>
    </div>`;
  const f = el.querySelector('form');
  f.querySelector('input').focus();
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const v = formValues(f);
    const bad = passwordProblem(v.p1, S.user?.email);
    if (bad) { toast(bad, 'err', 5000); return; }
    if (v.p1 !== v.p2) { toast('Las dos contraseñas no coinciden.', 'err'); return; }
    await busy(f.querySelector('[type=submit]'), async () => {
      const { error } = await sb().auth.updateUser({ password: v.p1 });
      if (error) throw error;
      S.recovery = false;
      toast('Contraseña cambiada.');
      await refresh();
      location.hash = S.memberships.length ? '#/inicio' : '#/bienvenida';
    });
  });
}
