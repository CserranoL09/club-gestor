// Configuración → Personas: cuerpo técnico por equipo, perfiles, especialidades e invitaciones.
// Dirección: todo. Coordinación: ve a todos e invita al cuerpo técnico de sus equipos. Resto: solo ver.
import { esc, toast, busy, ask, copyText, formValues } from '../ui.js';
import { sb } from '../supabase.js';
import {
  S, ROLES, ROLE_LABEL, ROLE_HELP, SPECIALTIES, refresh, appBaseUrl,
  isAdmin, isCoordinator, teamsOfSeason
} from '../session.js';
import { fmt } from '../lib/dates.js';

const STAFF_ROLES = ['entrenador', 'ayudante', 'preparador', 'porteros'];

export async function render(el, _opts, prefillTeam) {
  const client = sb();
  const clubId = S.club.id;
  const me = S.user.id;
  const admin = isAdmin();
  const coord = isCoordinator();
  const inviter = admin || coord;
  el.innerHTML = '<div class="card"><p class="hint">Cargando personas…</p></div>';

  const [mem, inv] = await Promise.all([
    client.from('club_members').select('user_id, role, team_ids, specialty, created_at, profile:profiles(full_name, email)').eq('club_id', clubId),
    inviter
      ? client.from('invitations').select('*').eq('club_id', clubId).is('accepted_at', null).eq('revoked', false)
          .gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false })
      : Promise.resolve({ data: [] })
  ]);
  if (mem.error) throw mem.error;
  if (inv.error) throw inv.error;

  const order = (r) => ROLES.indexOf(r);
  const members = (mem.data || []).sort((a, b) => order(a.role) - order(b.role) ||
    (a.profile?.full_name || '').localeCompare(b.profile?.full_name || '', 'es'));
  const allTeams = S.teams;
  const seasonTeams = teamsOfSeason();
  const seasonName = (id) => S.seasons.find((s) => s.id === id)?.name || '';
  const teamName = (id) => allTeams.find((x) => x.id === id)?.name || 'equipo archivado';
  const nameOf = (m) => m.profile?.full_name || 'Sin nombre';
  const allTeamsRole = (m) => m.role === 'admin' || !m.team_ids?.length;
  const teamsText = (m) => m.role === 'admin' ? 'Todo el club'
    : !m.team_ids?.length ? 'Todos los equipos' : m.team_ids.map(teamName).join(', ');

  // Equipos que puede usar en una invitación: Dirección, todos; Coordinación, los suyos.
  const myMember = members.find((m) => m.user_id === me);
  const inviteTeams = admin ? seasonTeams
    : seasonTeams.filter((t) => !myMember?.team_ids?.length || myMember.team_ids.includes(t.id));
  const inviteRoles = admin ? ROLES : STAFF_ROLES;

  const teamChecks = (selected, name, teams = allTeams, hint = 'Sin marcar ninguno = todos los equipos del club.') => teams.length ? `
    <div class="checks">
      ${teams.map((t) => `<label class="check"><input type="checkbox" name="${name}" value="${esc(t.id)}"${selected.includes(t.id) ? ' checked' : ''}> ${esc(t.name)} <small>${esc(seasonName(t.season_id))}</small></label>`).join('')}
    </div>
    ${hint ? `<p class="hint">${hint}</p>` : ''}` : '<p class="hint">El club aún no tiene equipos.</p>';

  const staffOf = (teamId) => members.filter((m) => m.role !== 'admin' && m.team_ids?.includes(teamId));
  const everywhere = members.filter((m) => allTeamsRole(m));

  el.innerHTML = `
    <section class="card">
      <h2>Cuerpo técnico por equipo <small class="muted">${esc(S.season?.name || '')}</small></h2>
      ${seasonTeams.length ? `
        <div class="staff-grid">
          ${seasonTeams.map((t) => {
            const staff = staffOf(t.id);
            const head = staff.some((m) => m.role === 'entrenador');
            const canHere = admin || inviteTeams.some((x) => x.id === t.id);
            return `
            <article class="staff-card${head ? '' : ' warn-card'}" data-team-card="${esc(t.id)}">
              <h3>${esc(t.name)} <small class="muted">${esc(t.category || '')}</small></h3>
              ${staff.length ? `<ul class="plain-list">${staff.map((m) => `<li><strong>${esc(nameOf(m))}</strong> <small class="muted">${esc(ROLE_LABEL[m.role])}${m.specialty ? ' · ' + esc(m.specialty) : ''}</small></li>`).join('')}</ul>`
                : '<p class="muted">Nadie asignado a este equipo.</p>'}
              ${head ? '' : '<p class="pill warn">Sin entrenador principal</p>'}
              ${canHere ? `<button class="btn small" type="button" data-invite-team="${esc(t.id)}">+ Invitar a este equipo</button>` : ''}
            </article>`;
          }).join('')}
        </div>
        ${everywhere.length ? `<p class="hint">Con acceso a todos los equipos: ${everywhere.map((m) => `${esc(nameOf(m))} (${esc(ROLE_LABEL[m.role])})`).join(', ')}.</p>` : ''}`
      : '<p class="hint">Esta temporada aún no tiene equipos. Créalos en «Temporadas y equipos».</p>'}
    </section>

    <section class="card">
      <h2>Personas del club <span class="count">${members.length}</span></h2>
      <ul class="people">
        ${members.map((m) => {
          const self = m.user_id === me;
          return `
          <li data-user="${esc(m.user_id)}">
            <div class="who">
              <span class="avatar" aria-hidden="true">${esc(nameOf(m).slice(0, 1).toUpperCase())}</span>
              <div><strong>${esc(nameOf(m))}${self ? ' <small>(tú)</small>' : ''}</strong><br><small>${esc(m.profile?.email || '')}</small></div>
            </div>
            ${admin ? `
              <div class="role-edit">
                <label class="sr-only" for="role-${esc(m.user_id)}">Perfil de ${esc(nameOf(m))}</label>
                <select id="role-${esc(m.user_id)}" data-role>
                  ${ROLES.map((r) => `<option value="${r}"${r === m.role ? ' selected' : ''}>${ROLE_LABEL[r]}</option>`).join('')}
                </select>
                ${m.role !== 'admin' ? `
                  <label class="sr-only" for="spec-${esc(m.user_id)}">Especialidad de ${esc(nameOf(m))}</label>
                  <input id="spec-${esc(m.user_id)}" data-specialty list="specialties" value="${esc(m.specialty || '')}" maxlength="40" placeholder="Especialidad (opcional)">
                  <details class="teams-pop">
                    <summary>Equipos: ${esc(teamsText(m))}</summary>
                    <form data-teams>${teamChecks(m.team_ids || [], 'team')}<button class="btn small primary" type="submit">Guardar equipos</button></form>
                  </details>` : '<small class="muted">Todo el club</small>'}
              </div>
              <div class="actions">
                ${!self && m.role !== 'admin' ? '<button class="btn small" type="button" data-transfer>Pasarle la Dirección</button>' : ''}
                ${!self ? '<button class="btn small danger" type="button" data-remove>Quitar</button>' : ''}
              </div>` : `
              <div><span class="badge">${esc(ROLE_LABEL[m.role])}</span>${m.specialty ? ` <small class="muted">${esc(m.specialty)}</small>` : ''}<br><small class="muted">${esc(teamsText(m))}</small></div>`}
          </li>`;
        }).join('')}
      </ul>
      <datalist id="specialties">${SPECIALTIES.map((s) => `<option value="${esc(s)}">`).join('')}</datalist>
    </section>

    ${inviter ? `
    <section class="card" id="inviteCard">
      <h2>Invitar a alguien</h2>
      <p class="hint">Se crea un enlace que caduca en 7 días y sirve una sola vez. Envíalo por WhatsApp o email; la app no envía correos.${coord ? ' Como Coordinación puedes invitar al cuerpo técnico de tus equipos.' : ''}</p>
      ${coord && !inviteTeams.length ? '<p class="note">No tienes equipos asignados en esta temporada.</p>' : `
      <form id="invForm" novalidate>
        <div class="row">
          <div class="grow"><label for="inv_email">Email (opcional)</label><input id="inv_email" name="email" type="email" placeholder="Si lo pones, solo esa cuenta podrá usar el enlace"></div>
          <div><label for="inv_role">Perfil</label>
            <select id="inv_role" name="role">${inviteRoles.map((r) => `<option value="${r}"${r === 'entrenador' ? ' selected' : ''}>${ROLE_LABEL[r]}</option>`).join('')}</select></div>
          <div><label for="inv_spec">Especialidad (opcional)</label><input id="inv_spec" name="specialty" list="specialties" maxlength="40"></div>
        </div>
        <p class="hint" id="roleHelp"></p>
        <div id="invTeams"><span class="label">Equipos</span>${teamChecks(prefillTeam ? [prefillTeam] : [], 'team', inviteTeams,
          admin ? 'Sin marcar ninguno = todos los equipos del club.' : 'Marca al menos un equipo.')}</div>
        <button class="btn primary" type="submit">Crear invitación</button>
      </form>`}
      <div id="invResult"></div>
    </section>

    <section class="card">
      <h2>Invitaciones pendientes <span class="count">${inv.data.length}</span></h2>
      ${inv.data.length ? `
        <ul class="list">
          ${inv.data.map((i) => `
            <li data-inv="${esc(i.id)}" data-token="${esc(i.token)}">
              <div><strong>${esc(ROLE_LABEL[i.role])}</strong>${i.specialty ? ' · ' + esc(i.specialty) : ''}${i.email ? ' · ' + esc(i.email) : ''}<br>
                <small class="muted">${i.role === 'admin' || !i.team_ids?.length ? 'Todos los equipos' : esc(i.team_ids.map(teamName).join(', '))} · caduca el ${esc(fmt(i.expires_at))}</small></div>
              <div class="actions">
                <button class="btn small" type="button" data-copy>Copiar enlace</button>
                <button class="btn small danger" type="button" data-revoke>Anular</button>
              </div>
            </li>`).join('')}
        </ul>` : '<p class="hint">No hay invitaciones pendientes.</p>'}
    </section>` : ''}

    <section class="card">
      <h2>Qué puede hacer cada perfil</h2>
      <table class="perm-table">
        <thead><tr><th scope="col">Perfil</th><th scope="col">Puede</th></tr></thead>
        <tbody>
          ${ROLES.map((r) => `<tr><th scope="row">${ROLE_LABEL[r]}</th><td>${esc(ROLE_HELP[r])}</td></tr>`).join('')}
          <tr><th scope="row">Profesor/a</th><td>Si el club está en su clase: lo ve todo sin poder cambiar nada y deja comentarios.</td></tr>
        </tbody>
      </table>
      <p class="hint">Por defecto, cada persona del cuerpo técnico solo ve sus equipos. La Dirección puede abrirlo a todos en Configuración → Club.</p>
    </section>`;

  const reload = (team) => render(el, _opts, team);

  // ----- Invitar (Dirección y Coordinación)
  el.querySelectorAll('[data-invite-team]').forEach((b) => b.addEventListener('click', () => {
    const f = el.querySelector('#invForm');
    if (!f) return;
    f.querySelectorAll('[name=team]').forEach((c) => { c.checked = c.value === b.dataset.inviteTeam; });
    el.querySelector('#inviteCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    f.querySelector('#inv_role').focus({ preventScroll: true });
  }));

  const invForm = el.querySelector('#invForm');
  if (invForm) {
    const roleSel = invForm.querySelector('[name=role]');
    const syncRole = () => {
      el.querySelector('#invTeams').hidden = roleSel.value === 'admin';
      el.querySelector('#roleHelp').textContent = ROLE_HELP[roleSel.value] || '';
    };
    roleSel.addEventListener('change', syncRole);
    syncRole();
    invForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const v = formValues(invForm);
      const teams = v.role === 'admin' ? [] : (v.team || []);
      if (v.email && !/^\S+@\S+\.\S+$/.test(v.email)) { toast('Revisa el email o déjalo vacío.', 'err'); return; }
      if (coord && !teams.length) { toast('Marca al menos uno de tus equipos.', 'err'); return; }
      await busy(invForm.querySelector('[type=submit]'), async () => {
        const row = { club_id: clubId, role: v.role, email: v.email || null, specialty: v.specialty || '', team_ids: teams };
        const { data, error } = await client.from('invitations').insert(row).select('token').single();
        if (error) throw error;
        showInvite(data.token, v, teams);
      });
    });
  }

  function showInvite(token, v, teams) {
    const link = appBaseUrl() + '#/invitacion/' + token;
    const where = v.role === 'admin' || !teams.length ? '' : ` (${teams.map(teamName).join(', ')})`;
    const msg = `Te invito a ${S.club.name} en Club Gestor como ${ROLE_LABEL[v.role].toLowerCase()}${where}. Abre este enlace para unirte (caduca en 7 días): ${link}`;
    el.querySelector('#invResult').innerHTML = `
      <div class="success">
        <strong>Invitación creada.</strong>
        <div class="linkbox"><input readonly value="${esc(link)}" aria-label="Enlace de invitación"><button class="btn small" type="button" data-copylink>Copiar</button></div>
        <div class="actions">
          <a class="btn small" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(msg)}">Enviar por WhatsApp</a>
          <a class="btn small" href="mailto:${encodeURIComponent(v.email || '')}?subject=${encodeURIComponent('Invitación a ' + S.club.name)}&body=${encodeURIComponent(msg)}">Enviar por email</a>
          <button class="btn small" type="button" data-done>Hecho</button>
        </div>
      </div>`;
    el.querySelector('[data-copylink]').addEventListener('click', () => copyText(link));
    el.querySelector('[data-done]').addEventListener('click', () => reload());
    el.querySelector('#invResult input').select();
  }

  el.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', () => copyText(appBaseUrl() + '#/invitacion/' + b.closest('[data-token]').dataset.token)));
  el.querySelectorAll('[data-revoke]').forEach((b) => b.addEventListener('click', async () => {
    if (!(await ask('El enlace dejará de funcionar.', { title: '¿Anular la invitación?', yes: 'Anular', danger: true }))) return;
    await busy(b, async () => {
      const { error } = await client.from('invitations').update({ revoked: true }).eq('id', b.closest('[data-inv]').dataset.inv);
      if (error) throw error;
      toast('Invitación anulada.');
      reload();
    });
  }));

  if (!admin) return;

  // ----- Gestión de personas (solo Dirección)
  const rowOf = (node) => members.find((m) => m.user_id === node.closest('[data-user]').dataset.user);

  el.querySelectorAll('[data-role]').forEach((sel) => sel.addEventListener('change', async () => {
    const m = rowOf(sel);
    const role = sel.value;
    if (m.user_id === me && m.role === 'admin' && role !== 'admin') {
      const ok = await ask('Dejarás la Dirección y no podrás cambiar la configuración ni las personas.', { title: '¿Dejar la Dirección?', yes: 'Sí, cambiar mi perfil', danger: true });
      if (!ok) { sel.value = m.role; return; }
    }
    await busy(sel, async () => {
      const patch = role === 'admin' ? { role, team_ids: [] } : { role };
      const { error } = await client.from('club_members').update(patch).eq('club_id', clubId).eq('user_id', m.user_id);
      if (error) { sel.value = m.role; throw error; }
      toast(`Perfil cambiado a ${ROLE_LABEL[role]}.`);
      if (m.user_id === me) await refresh(); else reload();
    });
  }));

  el.querySelectorAll('[data-specialty]').forEach((inp) => inp.addEventListener('change', async () => {
    const m = rowOf(inp);
    const value = inp.value.trim().slice(0, 40);
    await busy(inp, async () => {
      const { error } = await client.from('club_members').update({ specialty: value }).eq('club_id', clubId).eq('user_id', m.user_id);
      if (error) throw error;
      m.specialty = value;
      toast('Especialidad guardada.');
    });
  }));

  el.querySelectorAll('[data-teams]').forEach((f) => f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const m = rowOf(f);
    const ids = formValues(f).team || [];
    await busy(f.querySelector('[type=submit]'), async () => {
      const { error } = await client.from('club_members').update({ team_ids: Array.isArray(ids) ? ids : [] }).eq('club_id', clubId).eq('user_id', m.user_id);
      if (error) throw error;
      toast('Equipos guardados.');
      reload();
    });
  }));

  el.querySelectorAll('[data-transfer]').forEach((b) => b.addEventListener('click', async () => {
    const m = rowOf(b);
    const name = nameOf(m);
    if (!(await ask(`${name} pasará a la Dirección y tú quedarás como entrenador principal (con acceso a todos los equipos).`, { title: '¿Pasar la Dirección?', yes: 'Pasar la Dirección' }))) return;
    await busy(b, async () => {
      const { error } = await client.rpc('transfer_admin', { p_club: clubId, p_user: m.user_id });
      if (error) throw error;
      toast(`${name} está ahora en la Dirección.`);
      await refresh();
    });
  }));

  el.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', async () => {
    const m = rowOf(b);
    const name = nameOf(m);
    if (!(await ask(`${name} dejará de ver el club. Lo que haya creado se queda en el club.`, { title: '¿Quitar del club?', yes: 'Quitar', danger: true }))) return;
    await busy(b, async () => {
      const { error } = await client.from('club_members').delete().eq('club_id', clubId).eq('user_id', m.user_id);
      if (error) throw error;
      toast(`${name} ya no está en el club.`);
      reload();
    });
  }));
}
