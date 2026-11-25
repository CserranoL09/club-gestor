// Abrir un enlace de invitación (#/invitacion/:token) y aceptarlo.
import { esc, toast, busy, errMsg } from '../ui.js';
import { sb } from '../supabase.js';
import { S, refresh, setPendingInvite, roleLabel } from '../session.js';
import { fmt } from '../lib/dates.js';

export async function render(el, ctx) {
  const token = ctx.params.token;

  if (!S.user) {
    setPendingInvite(token);
    el.innerHTML = `
      <div class="auth card">
        <h1>Te han invitado a un club</h1>
        <p>Para aceptar la invitación, entra con tu cuenta o crea una. Después volverás aquí.</p>
        <a class="btn primary" href="#/login">Entrar</a>
        <a class="btn" href="#/login?modo=registro">Crear cuenta</a>
      </div>`;
    return;
  }

  el.innerHTML = '<div class="card empty"><p>Comprobando la invitación…</p></div>';
  const { data, error } = await sb().rpc('get_invitation', { p_token: token });
  if (error) {
    el.innerHTML = `<div class="card empty"><div class="big">⚠</div><h2>No se ha podido comprobar la invitación</h2><p>${esc(errMsg(error))}</p><a class="btn" href="#/inicio">Ir al inicio</a></div>`;
    return;
  }
  const inv = Array.isArray(data) ? data[0] : data;
  if (!inv) {
    el.innerHTML = `<div class="card empty"><div class="big">✉</div><h2>Esta invitación no existe</h2><p>Revisa que has copiado el enlace completo o pide uno nuevo a tu club.</p><a class="btn" href="#/inicio">Ir al inicio</a></div>`;
    return;
  }
  if (!inv.valid) {
    el.innerHTML = `<div class="card empty"><div class="big">⌛</div><h2>La invitación ya no es válida</h2><p>Ha caducado, ya se ha usado o se ha anulado. Pide una nueva a <strong>${esc(inv.club_name)}</strong>.</p><a class="btn" href="#/inicio">Ir al inicio</a></div>`;
    return;
  }

  el.innerHTML = `
    <div class="auth card">
      <h1>Unirte a ${esc(inv.club_name)}</h1>
      <p>Te han invitado como <strong>${esc(roleLabel(inv.role))}</strong>.</p>
      <p class="hint">Entrarás con tu cuenta ${esc(S.user.email)}. La invitación caduca el ${esc(fmt(inv.expires_at))}.</p>
      <button class="btn primary" type="button" data-accept>Aceptar la invitación</button>
      <a class="btn" href="#/inicio">Ahora no</a>
    </div>`;
  el.querySelector('[data-accept]').addEventListener('click', (ev) => busy(ev.currentTarget, async () => {
    const res = await sb().rpc('accept_invitation', { p_token: token });
    if (res.error) throw res.error;
    await refresh(res.data);
    toast(`Ya formas parte de ${inv.club_name}.`);
    location.hash = '#/inicio';
  }));
}
