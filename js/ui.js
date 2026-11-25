// Utilidades de interfaz compartidas por todos los módulos.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapa texto antes de meterlo en innerHTML. Úsalo SIEMPRE con datos de usuario. */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
}

/** Aviso breve en la parte inferior. */
export function toast(message, type = 'ok', ms = 3600) {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast' + (type === 'err' ? ' err' : '');
  el.setAttribute('role', type === 'err' ? 'alert' : 'status');
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

/** Confirmación propia (nunca confirm()). Devuelve una promesa con true / false. */
export function ask(text, { title = '¿Seguro?', yes = 'Aceptar', no = 'Cancelar', danger = false } = {}) {
  const dlg = document.getElementById('askDlg');
  document.getElementById('askTitle').textContent = title;
  document.getElementById('askText').textContent = text;
  const yesBtn = document.getElementById('askYes');
  yesBtn.textContent = yes;
  yesBtn.classList.toggle('danger-fill', danger);
  document.getElementById('askNo').textContent = no;
  return new Promise((resolve) => {
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'yes'), { once: true });
    dlg.returnValue = '';
    dlg.showModal();
  });
}

/** Traduce los errores de Supabase a mensajes claros. */
export function errMsg(err) {
  const raw = String(err?.message || err?.error_description || err || '');
  const code = err?.code || '';
  const map = [
    [/invalid login credentials|invalid_credentials/i, 'Email o contraseña incorrectos.'],
    [/email not confirmed/i, 'Todavía no has confirmado tu email. Abre el enlace que te hemos enviado.'],
    [/user already registered|already been registered/i, 'Ya existe una cuenta con ese email. Entra con tu contraseña.'],
    [/password should be at least|weak.?password/i, 'La contraseña debe tener al menos 6 caracteres.'],
    [/email address not authorized|not authorized/i, 'Supabase no puede enviar emails a esta dirección todavía: falta configurar el correo propio (SMTP) del proyecto. Pide ayuda al administrador de la app.'],
    [/error sending .*email|smtp/i, 'No se ha podido enviar el email. Revisa la configuración del correo (SMTP) en Supabase.'],
        [/rate limit|too many requests|over_email_send_rate_limit/i, 'Se ha superado el límite de emails o intentos. Espera unos minutos y vuelve a probar.'],
    [/signups not allowed for otp|otp_disabled/i, 'No hay ninguna cuenta con ese email. Crea una cuenta primero.'],
    [/unable to validate email|invalid format|validation_failed/i, 'Revisa el email: no parece válido.'],
    [/row-level security|permission denied|42501/i, 'No tienes permiso para hacer esto.'],
    [/players_number_unique/i, 'Ese dorsal ya lo tiene otro jugador del equipo.'],
    [/duplicate key/i, 'Ya existe un registro igual.'],
    [/failed to fetch|networkerror|load failed/i, 'Sin conexión con Supabase. Revisa internet o si el proyecto está en pausa.'],
    [/jwt expired/i, 'La sesión ha caducado. Vuelve a entrar.']
  ];
  for (const [re, msg] of map) if (re.test(raw) || re.test(code)) return msg;
  return raw || 'Ha ocurrido un error. Vuelve a intentarlo.';
}

/** Desactiva un botón mientras dura una tarea y muestra los errores. */
export async function busy(btn, fn) {
  const isButton = btn?.tagName === 'BUTTON';
  const label = isButton ? btn.textContent : '';
  if (btn) btn.disabled = true;
  if (isButton) btn.textContent = 'Un momento…';
  try {
    return await fn();
  } catch (err) {
    console.error(err);
    toast(errMsg(err), 'err', 6000);
    return undefined;
  } finally {
    if (btn) btn.disabled = false;
    if (isButton) btn.textContent = label;
  }
}

/** Copia un texto al portapapeles. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copiado.');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast('Copiado.'); } catch { toast('No se ha podido copiar. Selecciónalo y cópialo a mano.', 'err'); }
    ta.remove();
  }
}

/**
 * Valores de un formulario como objeto.
 * Casilla sin value → true/false. Casillas con value (p. ej. equipos) → lista de los marcados,
 * aunque solo haya una.
 */
export function formValues(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') {
      if (el.hasAttribute('value')) {
        out[el.name] = out[el.name] || [];
        if (el.checked) out[el.name].push(el.value);
      } else out[el.name] = el.checked;
    } else if (el.type === 'radio') {
      if (el.checked) out[el.name] = el.value;
    } else out[el.name] = el.value.trim();
  }
  return out;
}

/** Aviso de permisos para la cabecera de un módulo. */
export function permNote(perm) {
  if (perm.ok) return '';
  return `<p class="note" role="note">🔒 ${esc(perm.reason)}</p>`;
}

/** Comprime una imagen a un cuadrado (escudo) y devuelve un Blob. */
export async function squareImage(file, size = 256, maxBytes = 200 * 1024) {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  const toBlob = (type, q) => new Promise((r) => canvas.toBlob(r, type, q));
  let blob = await toBlob('image/png');
  if (blob.size > maxBytes) blob = await toBlob('image/webp', 0.85);
  // Safari antiguo no genera webp (devuelve png): entonces jpeg.
  if (blob.size > maxBytes || blob.type !== 'image/webp' && blob.type !== 'image/png') blob = await toBlob('image/jpeg', 0.8);
  return blob;
}
