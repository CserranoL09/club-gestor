// Mi perfil: nombre, profesor, contraseña y clubes a los que pertenezco.
import { esc, toast, busy, ask, formValues } from '../ui.js';
import { sb } from '../supabase.js';
import { S, refresh, roleLabel, selectClub, homePath } from '../session.js';

export async function render(el) {
  const p = S.profile || {};
  el.innerHTML = `
    <div class="page-head">
      <div><h1>Mi perfil</h1><p>${esc(S.user?.email || '')}</p></div>
      <a class="btn" href="#/inicio">← Inicio</a>
    </div>
    <div class="grid two">
      <section class="card">
        <h2>Mis datos</h2>
        <form novalidate>
          <label for="full_name">Nombre y apellidos</label>
          <input id="full_name" name="full_name" value="${esc(p.full_name || '')}" maxlength="80" required>
          <label class="check"><input type="checkbox" name="is_teacher"${p.is_teacher ? ' checked' : ''}> Soy profesor/a (puedo crear clases para mis alumnos)</label>
          <button class="btn primary" type="submit">Guardar</button>
        </form>
        <hr>
        <a class="btn" href="#/nueva-clave">Cambiar contraseña</a>
      </section>
      <section class="card">
        <h2>Mis clubes</h2>
        ${S.memberships.length ? `
          <ul class="list">
            ${S.memberships.map((m) => `
              <li>
                <div><strong>${esc(m.club.name)}</strong><br><small>${esc(roleLabel(m.role))}${m.club.id === S.club?.id ? ' · club activo' : ''}</small></div>
                <div class="actions">
                  ${m.club.id !== S.club?.id ? `<button class="btn small" type="button" data-open="${esc(m.club.id)}">Abrir</button>` : ''}
                  <button class="btn small danger" type="button" data-leave="${esc(m.club.id)}">Salir</button>
                </div>
              </li>`).join('')}
          </ul>` : '<p class="hint">Todavía no perteneces a ningún club.</p>'}
        <a class="btn" href="#/bienvenida?nuevo=1">Crear otro club</a>
        <a class="btn" href="#/unirse">Unirme a una clase</a>
      </section>
    </div>`;

  const form = el.querySelector('form');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const v = formValues(form);
    if (!v.full_name) { toast('Escribe tu nombre.', 'err'); return; }
    await busy(form.querySelector('[type=submit]'), async () => {
      const { error } = await sb().from('profiles').update({ full_name: v.full_name, is_teacher: v.is_teacher }).eq('id', S.user.id);
      if (error) throw error;
      await refresh();
      toast('Perfil guardado.');
    });
  });

  el.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => busy(b, async () => {
    await selectClub(b.dataset.open);
    location.hash = '#' + homePath();
  })));

  el.querySelectorAll('[data-leave]').forEach((b) => b.addEventListener('click', async () => {
    const m = S.memberships.find((x) => x.club.id === b.dataset.leave);
    const extra = m.role === 'admin' ? ' Si eres la única persona de la Dirección, antes tendrás que pasar la Dirección a otra persona (Configuración → Personas).' : '';
    if (!(await ask(`Dejarás de ver «${m.club.name}». Para volver necesitarás otra invitación.${extra}`, { title: '¿Salir del club?', yes: 'Salir del club', danger: true }))) return;
    await busy(b, async () => {
      const { error } = await sb().rpc('leave_club', { p_club: m.club.id });
      if (error) throw error;
      await refresh();
      toast(`Has salido de ${m.club.name}.`);
    });
  }));
}
