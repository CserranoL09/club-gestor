// Configuración del club: identidad, página inicial, temporadas y equipos, y personas.
// Cada apartado está en su archivo (config-*.js); Personas está aquí.
import { esc, toast, busy, ask, copyText, formValues, permNote } from '../ui.js';
import { sb } from '../supabase.js';
import { S, ROLES, ROLE_LABEL, refresh, permission, appBaseUrl } from '../session.js';
import { fmt } from '../lib/dates.js';

const TABS = [
  ['identidad', 'Identidad', () => import('./config-identidad.js')],
  ['inicio', 'Página inicial', () => import('./config-inicio.js')],
  ['temporadas', 'Temporadas y equipos', () => import('./config-temporadas.js')],
  ['personas', 'Personas', null]
];

export async function render(el, ctx) {
  if (!S.club) { el.innerHTML = '<div class="card empty"><p>Elige o crea un club primero.</p></div>'; return; }
  const perm = permission('admin');
  const wanted = ctx.query.get('tab');
  const tab = TABS.find((t) => t[0] === wanted) || (perm.ok ? TABS[0] : TABS[3]);

  el.innerHTML = `
    <div class="page-head">
      <div><h1>⚙ Configuración</h1><p>${esc(S.club.name)}</p></div>
      <a class="btn" href="#/inicio">← Inicio</a>
    </div>
    ${permNote(perm)}
    <nav class="tabs page-tabs" aria-label="Apartados de la configuración">
      ${TABS.map(([k, label]) => `<a class="tab" href="#/config?tab=${k}" aria-current="${k === tab[0] ? 'page' : 'false'}">${label}</a>`).join('')}
    </nav>
    <div id="cfgBody"></div>`;
  const body = el.querySelector('#cfgBody');
  if (!tab[2]) return renderPeople(body, perm.ok);
  const mod = await tab[2]();
  return mod.render(body, { canEdit: perm.ok });
}

// ---------------------------------------------------------------------
// Personas
// ---------------------------------------------------------------------
async function renderPeople(el, isAdminUser) {
  const client = sb();
  const clubId = S.club.id;
  el.innerHTML = '<div class="card"><p class="hint">Cargando personas…</p></div>';

  const [mem, inv] = await Promise.all([
    client.from('club_members').select('user_id, role, team_ids, created_at, profile:profiles(full_name, email)').eq('club_id', clubId),
    isAdminUser
      ? client.from('invitations').select('*').eq('club_id', clubId).is('accepted_at', null).eq('revoked', false)
          .gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false })
      : Promise.resolve({ data: [] })
  ]);
  if (mem.error) throw mem.error;
  if (inv.error) throw inv.error;

  const members = (mem.data || []).sort((a, b) =>
    (a.role === 'admin' ? 0 : 1) - (b.role === 'admin' ? 0 : 1) ||
    (a.profile?.full_name || '').localeCompare(b.profile?.full_name || '', 'es'));
  const teams = S.teams;
  const seasonName = (id) => S.seasons.find((s) => s.id === id)?.name || '';
  const teamName = (id) => { const t = teams.find((x) => x.id === id); return t ? t.name : 'equipo archivado'; };
  const teamsText = (m) => m.role === 'admin' ? 'Todos (administrador)'
    : !m.team_ids?.length ? 'Todos los equipos' : m.team_ids.map(teamName).join(', ');
  const me = S.user.id;

  const teamChecks = (selected, name) => teams.length ? `
    <div class="checks">
      ${teams.map((t) => `<label class="check"><input type="checkbox" name="${name}" value="${esc(t.id)}"${selected.includes(t.id) ? ' checked' : ''}> ${esc(t.name)} <small>${esc(seasonName(t.season_id))}</small></label>`).join('')}
    </div>
    <p class="hint">Sin marcar ninguno = todos los equipos del club.</p>` : '<p class="hint">El club aún no tiene equipos.</p>';

  el.innerHTML = `
    <section class="card">
      <div class="section-head">
        <h2>Personas del club <span class="count">${members.length}</span></h2>
      </div>
      <ul class="people">
        ${members.map((m) => {
          const name = m.profile?.full_name || 'Sin nombre';
          const self = m.user_id === me;
          return `
          <li data-user="${esc(m.user_id)}">
            <div class="who">
              <span class="avatar" aria-hidden="true">${esc(name.slice(0, 1).toUpperCase())}</span>
              <div><strong>${esc(name)}${self ? ' <small>(tú)</small>' : ''}</strong><br><small>${esc(m.profile?.email || '')}</small></div>
            </div>
            ${isAdminUser ? `
              <div class="role-edit">
                <label class="sr-only" for="role-${esc(m.user_id)}">Rol de ${esc(name)}</label>
                <select id="role-${esc(m.user_id)}" data-role>
                  ${ROLES.map((r) => `<option value="${r}"${r === m.role ? ' selected' : ''}>${ROLE_LABEL[r]}</option>`).join('')}
                </select>
                ${m.role !== 'admin' ? `
                  <details class="teams-pop">
                    <summary>Equipos: ${esc(teamsText(m))}</summary>
                    <form data-teams>${teamChecks(m.team_ids || [], 'team')}<button class="btn small primary" type="submit">Guardar equipos</button></form>
                  </details>` : '<small class="muted">Todos los equipos</small>'}
              </div>
              <div class="actions">
                ${!self && m.role !== 'admin' ? '<button class="btn small" type="button" data-transfer>Pasarle la administración</button>' : ''}
                ${!self ? '<button class="btn small danger" type="button" data-remove>Quitar</button>' : ''}
              </div>` : `
              <div><span class="badge">${esc(ROLE_LABEL[m.role])}</span><br><small class="muted">${esc(teamsText(m))}</small></div>`}
          </li>`;
        }).join('')}
      </ul>
    </section>

    ${isAdminUser ? `
    <section class="card">
      <h2>Invitar a alguien</h2>
      <p class="hint">Se crea un enlace que caduca en 7 días y sirve una sola vez. Envíalo por WhatsApp o email; la app no envía correos.</p>
      <form id="invForm" novalidate>
        <div class="row">
          <div class="grow"><label for="inv_email">Email (opcional)</label><input id="inv_email" name="email" type="email" placeholder="Si lo pones, solo esa cuenta podrá usar el enlace"></div>
          <div><label for="inv_role">Rol</label>
            <select id="inv_role" name="role">${ROLES.map((r) => `<option value="${r}"${r === 'entrenador' ? ' selected' : ''}>${ROLE_LABEL[r]}</option>`).join('')}</select></div>
        </div>
        <div id="invTeams"><span class="label">Equipos</span>${teamChecks([], 'team')}</div>
        <button class="btn primary" type="submit">Crear invitación</button>
      </form>
      <div id="invResult"></div>
    </section>

    <section class="card">
      <h2>Invitaciones pendientes <span class="count">${inv.data.length}</span></h2>
      ${inv.data.length ? `
        <ul class="list">
          ${inv.data.map((i) => `
            <li data-inv="${esc(i.id)}" data-token="${esc(i.token)}">
              <div><strong>${esc(ROLE_LABEL[i.role])}</strong>${i.email ? ' · ' + esc(i.email) : ''}<br>
                <small class="muted">${i.role === 'admin' || !i.team_ids?.length ? 'Todos los equipos' : esc(i.team_ids.map(teamName).join(', '))} · caduca el ${esc(fmt(i.expires_at))}</small></div>
              <div class="actions">
                <button class="btn small" type="button" data-copy>Copiar enlace</button>
                <button class="btn small danger" type="button" data-revoke>Anular</button>
              </div>
            </li>`).join('')}
        </ul>` : '<p class="hint">No hay invitaciones pendientes.</p>'}
    </section>` : ''}

    <section class="card">
      <h2>Qué puede hacer cada rol</h2>
      <table class="perm-table">
        <thead><tr><th scope="col">Rol</th><th scope="col">Puede</th></tr></thead>
        <tbody>
          <tr><th scope="row">Administrador</th><td>Todo: configuración, personas, temporadas, equipos y todos los módulos.</td></tr>
          <tr><th scope="row">Entrenador</th><td>Plantilla, sesiones, planificación y partidos de sus equipos.</td></tr>
          <tr><th scope="row">Preparador físico</th><td>Ve todo el club. Edita sesiones, macrociclos y morfociclos de sus equipos (su parte condicional).</td></tr>
          <tr><th scope="row">Entrenador de porteros</th><td>Ve todo el club. Edita sesiones, macrociclos y morfociclos de sus equipos (su parte de porteros).</td></tr>
          <tr><th scope="row">Profesor</th><td>Si el club está en su clase: lo ve todo sin poder cambiar nada y deja comentarios.</td></tr>
        </tbody>
      </table>
    </section>`;

  if (!isAdminUser) return;
  const reload = () => renderPeople(el, true);
  const rowOf = (node) => members.find((m) => m.user_id === node.closest('[data-user]').dataset.user);

  // Cambiar rol
  el.querySelectorAll('[data-role]').forEach((sel) => sel.addEventListener('change', async () => {
    const m = rowOf(sel);
    const role = sel.value;
    if (m.user_id === me && m.role === 'admin' && role !== 'admin') {
      const ok = await ask('Dejarás de ser administrador y no podrás cambiar la configuración ni las personas.', { title: '¿Quitarte la administración?', yes: 'Sí, cambiar mi rol', danger: true });
      if (!ok) { sel.value = m.role; return; }
    }
    await busy(sel, async () => {
      const patch = role === 'admin' ? { role, team_ids: [] } : { role };
      const { error } = await client.from('club_members').update(patch).eq('club_id', clubId).eq('user_id', m.user_id);
      if (error) { sel.value = m.role; throw error; }
      toast(`Rol cambiado a ${ROLE_LABEL[role]}.`);
      if (m.user_id === me) await refresh(); else reload();
    });
  }));

  // Equipos de cada persona
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

  // Pasar la administración
  el.querySelectorAll('[data-transfer]').forEach((b) => b.addEventListener('click', async () => {
    const m = rowOf(b);
    const name = m.profile?.full_name || 'esta persona';
    if (!(await ask(`${name} pasará a ser administrador y tú quedarás como entrenador (con acceso a todos los equipos).`, { title: '¿Pasar la administración?', yes: 'Pasar la administración' }))) return;
    await busy(b, async () => {
      const { error } = await client.rpc('transfer_admin', { p_club: clubId, p_user: m.user_id });
      if (error) throw error;
      toast(`${name} es ahora el administrador.`);
      await refresh();
    });
  }));

  // Quitar del club
  el.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', async () => {
    const m = rowOf(b);
    const name = m.profile?.full_name || 'esta persona';
    if (!(await ask(`${name} dejará de ver el club. Lo que haya creado se queda en el club.`, { title: '¿Quitar del club?', yes: 'Quitar', danger: true }))) return;
    await busy(b, async () => {
      const { error } = await client.from('club_members').delete().eq('club_id', clubId).eq('user_id', m.user_id);
      if (error) throw error;
      toast(`${name} ya no está en el club.`);
      reload();
    });
  }));

  // Invitar
  const invForm = el.querySelector('#invForm');
  const roleSel = invForm.querySelector('[name=role]');
  const syncTeams = () => { el.querySelector('#invTeams').hidden = roleSel.value === 'admin'; };
  roleSel.addEventListener('change', syncTeams);
  syncTeams();
  invForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const v = formValues(invForm);
    if (v.email && !/^\S+@\S+\.\S+$/.test(v.email)) { toast('Revisa el email o déjalo vacío.', 'err'); return; }
    await busy(invForm.querySelector('[type=submit]'), async () => {
      const row = { club_id: clubId, role: v.role, email: v.email || null, team_ids: v.role === 'admin' ? [] : (v.team || []) };
      const { data, error } = await client.from('invitations').insert(row).select('token').single();
      if (error) throw error;
      showInvite(data.token, v);
    });
  });

  function showInvite(token, v) {
    const link = inviteLink(token);
    const msg = `Te invito a ${S.club.name} en Club Gestor como ${ROLE_LABEL[v.role].toLowerCase()}. Abre este enlace para unirte (caduca en 7 días): ${link}`;
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
    el.querySelector('[data-done]').addEventListener('click', reload);
    el.querySelector('#invResult input').select();
  }

  el.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', () => copyText(inviteLink(b.closest('[data-token]').dataset.token))));
  el.querySelectorAll('[data-revoke]').forEach((b) => b.addEventListener('click', async () => {
    if (!(await ask('El enlace dejará de funcionar.', { title: '¿Anular la invitación?', yes: 'Anular', danger: true }))) return;
    await busy(b, async () => {
      const { error } = await client.from('invitations').update({ revoked: true }).eq('id', b.closest('[data-inv]').dataset.inv);
      if (error) throw error;
      toast('Invitación anulada.');
      reload();
    });
  }));
}

function inviteLink(token) { return appBaseUrl() + '#/invitacion/' + token; }
