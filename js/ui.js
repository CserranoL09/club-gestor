// Utilidades de interfaz compartidas por todos los módulos.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapa texto antes de meterlo en innerHTML. Úsalo SIEMPRE con datos de usuario. */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
}

/** Aviso breve en la parte inferior. */
export function toast(message, type = 'ok', ms = 3200) {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast' + (type === 'err' ? ' err' : '');
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
  yesBtn.classList.toggle('danger', danger);
  document.getElementById('askNo').textContent = no;
  return new Promise((resolve) => {
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'yes'), { once: true });
    dlg.returnValue = '';
    dlg.showModal();
  });
}

/** Crea un elemento a partir de HTML ya escapado. */
export function html(strings, ...values) {
  return strings.reduce((out, s, i) => out + s + (i < values.length ? values[i] : ''), '');
}
