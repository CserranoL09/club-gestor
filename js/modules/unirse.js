// Unirse a la clase de un profesor con su código (#/unirse).
import { esc, toast, busy, ask, formValues } from '../ui.js';
import { sb } from '../supabase.js';
import { S, refresh } from '../session.js';
import { clubFormHTML, wireClubForm, createClubFromForm } from './club-form.js';

const CODE_RE = /^[A-Z0-9]{6}$/;
const normCode = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export async function render(el) {
  const adminClubs = S.memberships.filter((m) => m.role === 'admin').map((m) => m.club);
  const head = `
    <div class="page-head">
      <div><h1>Unirme a una clase</h1><p>Escribe el código de 6 caracteres que te ha dado tu profesor. Él podrá ver tu club (sin cambiar nada) y dejarte comentarios.</p></div>
      <a class="btn" href="${S.memberships.length ? '#/inicio' : '#/bienvenida'}">← Volver</a>
    </div>`;
  const codeField = `
    <label for="code">Código de la clase</label>
    <input id="code" name="code" class="code-input" maxlength="7" autocomplete="off" autocapitalize="characters" placeholder="ABC123" required>`;

  // Sin club propio: se crea el club y se vincula a la clase en el mismo paso.
  if (!adminClubs.length) {
    el.innerHTML = `${head}
      <div class="card narrow">
        ${S.memberships.length ? '<p class="note">Para unir un club a una clase tienes que ser su administrador. Crea tu propio club aquí.</p>' : ''}
        <form id="codeForm" novalidate>${codeField}</form>
        <h2 class="mt">Tu club</h2>
        ${clubFormHTML({ submitLabel: 'Crear club y unirme a la clase' })}
      </div>`;
    const codeForm = el.querySelector('#codeForm');
    codeForm.addEventListener('submit', (ev) => ev.preventDefault());
    const form = el.querySelector('.club-form');
    wireClubForm(form);
    el.querySelector('#code').focus();
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const code = normCode(codeForm.code.value);
      if (!CODE_RE.test(code)) { toast('El código tiene 6 letras o números.', 'err'); codeForm.code.focus(); return; }
      await busy(form.querySelector('[type=submit]'), async () => {
        const clubId = await createClubFromForm(form);
        if (!clubId) return;
        const { data: className, error } = await sb().rpc('join_class', { p_code: code, p_club: clubId });
        await refresh(clubId);
        if (error) {
          toast('El club se ha creado, pero el código no es válido. Pruébalo otra vez aquí.', 'err', 7000);
          location.hash = '#/unirse';
          return;
        }
        toast(`Club creado y unido a la clase «${className}».`);
        location.hash = '#/inicio';
      });
    });
    return;
  }

  // Con club propio: elegir cuál se une.
  const current = adminClubs.find((c) => c.id === S.club?.id) || adminClubs[0];
  const classIds = [...new Set(adminClubs.map((c) => c.class_id).filter(Boolean))];
  let classNames = {};
  if (classIds.length) {
    const { data } = await sb().from('classes').select('id, name').in('id', classIds);
    classNames = Object.fromEntries((data || []).map((c) => [c.id, c.name]));
  }
  const status = (c) => c.class_id ? `En la clase «${esc(classNames[c.class_id] || 'sin nombre')}»` : 'Sin clase';

  el.innerHTML = `${head}
    <div class="card narrow">
      <form novalidate>
        ${adminClubs.length > 1 ? `
          <label for="club">Club</label>
          <select id="club" name="club">${adminClubs.map((c) => `<option value="${esc(c.id)}"${c.id === current.id ? ' selected' : ''}>${esc(c.name)} · ${status(c)}</option>`).join('')}</select>`
        : `<p><strong>${esc(current.name)}</strong> · ${status(current)}</p><input type="hidden" name="club" value="${esc(current.id)}">`}
        ${codeField}
        <button class="btn primary" type="submit">Unirme a la clase</button>
      </form>
      ${adminClubs.some((c) => c.class_id) ? `
        <hr>
        <p class="hint">¿Te has equivocado de clase? Puedes desvincular el club; el profesor dejará de verlo.</p>
        <button class="btn danger" type="button" data-leave>Salir de la clase</button>` : ''}
    </div>`;
  const form = el.querySelector('form');
  el.querySelector('#code').focus();
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const v = formValues(form);
    const code = normCode(v.code);
    if (!CODE_RE.test(code)) { toast('El código tiene 6 letras o números.', 'err'); return; }
    const club = adminClubs.find((c) => c.id === v.club);
    if (club?.class_id && !(await ask(`«${club.name}» ya está en una clase. Si continúas, pasará a la clase nueva.`, { yes: 'Cambiar de clase' }))) return;
    await busy(form.querySelector('[type=submit]'), async () => {
      const { data: className, error } = await sb().rpc('join_class', { p_code: code, p_club: v.club });
      if (error) throw error;
      await refresh(v.club);
      toast(`Club unido a la clase «${className}».`);
      location.hash = '#/inicio';
    });
  });
  el.querySelector('[data-leave]')?.addEventListener('click', async (ev) => {
    const clubId = form.club.value;
    const club = adminClubs.find((c) => c.id === clubId);
    if (!club?.class_id) { toast('Ese club no está en ninguna clase.', 'err'); return; }
    if (!(await ask(`El profesor dejará de ver «${club.name}» y sus comentarios se quedarán guardados.`, { title: '¿Salir de la clase?', yes: 'Salir de la clase', danger: true }))) return;
    await busy(ev.currentTarget, async () => {
      const { error } = await sb().rpc('leave_class', { p_club: clubId });
      if (error) throw error;
      await refresh(clubId);
      toast('El club ya no está en la clase.');   // refresh() vuelve a pintar esta página
    });
  });
}
