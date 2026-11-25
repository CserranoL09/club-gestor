// Asistente para dar de alta un club en 4 pasos: club → temporada → equipos → cuerpo técnico.
// Al terminar crea todo, deja los enlaces de invitación preparados y lleva al Panel del club.
import { esc, toast, busy, squareImage } from '../ui.js';
import { sb } from '../supabase.js';
import { refresh, ROLE_LABEL, SPECIALTIES } from '../session.js';
import { seasonDefaults } from './club-form.js';

const DRAFT = 'clubgestor:wizard';
export const NEW_INVITES = 'clubgestor:newInvites';

const STEPS = ['Club', 'Temporada', 'Equipos', 'Cuerpo técnico'];
const COLORS = [['#16a34a', '#0ea5e9'], ['#1d4ed8', '#facc15'], ['#dc2626', '#111827'], ['#9f1239', '#f59e0b'], ['#0ea5e9', '#1e3a8a'], ['#7c3aed', '#22d3ee']];
// Categorías típicas del fútbol base español y su modalidad habitual.
const CATEGORIES = [
  ['Prebenjamín', 'f7'], ['Benjamín', 'f7'], ['Alevín', 'f7'], ['Infantil', 'f11'],
  ['Cadete', 'f11'], ['Juvenil', 'f11'], ['Aficionado', 'f11']
];
const STAFF_ROLES = ['entrenador', 'ayudante', 'preparador', 'porteros'];
const MOD = { f11: 'Fútbol 11', f7: 'Fútbol 7' };

function loadDraft() {
  try { return JSON.parse(sessionStorage.getItem(DRAFT)) || null; } catch { return null; }
}
function saveDraft(st) {
  try { sessionStorage.setItem(DRAFT, JSON.stringify({ ...st, crest: null })); } catch { /* sin almacenamiento */ }
}
function clearDraft() { try { sessionStorage.removeItem(DRAFT); } catch { /* nada */ } }

function freshState() {
  const s = seasonDefaults();
  return {
    step: 0,
    club: { name: '', short_name: '', city: '', primary: COLORS[0][0], secondary: COLORS[0][1] },
    season: { name: s.name, start: s.start, end: s.end },
    teams: [{ name: '', category: '', modality: 'f11', staff: [{ role: 'entrenador', email: '', specialty: '' }] }],
    coord: [],
    crest: null
  };
}

export function render(el, { onCancel } = {}) {
  const st = loadDraft() || freshState();
  st.crest = null;

  function draw() {
    saveDraft(st);
    el.innerHTML = `
      <div class="page-head">
        <div><p class="eyebrow">Alta del club</p><h1>${esc(STEPS[st.step])}</h1></div>
        <button class="btn" type="button" data-cancel>Cancelar</button>
      </div>
      <ol class="stepper" aria-label="Pasos">
        ${STEPS.map((n, i) => `<li class="${i < st.step ? 'done' : i === st.step ? 'now' : ''}"${i === st.step ? ' aria-current="step"' : ''}><span>${i < st.step ? '✓' : i + 1}</span> ${n}</li>`).join('')}
      </ol>
      <form class="card wizard" novalidate>
        ${[stepClub, stepSeason, stepTeams, stepStaff][st.step]()}
        <div class="wizard-nav">
          ${st.step ? '<button class="btn" type="button" data-back>← Atrás</button>' : '<span></span>'}
          <button class="btn primary" type="submit">${st.step === 3 ? 'Crear el club' : 'Siguiente →'}</button>
        </div>
      </form>`;
    wire();
    el.querySelector('form input:not([type=hidden]):not([type=file])')?.focus();
  }

  // ----- Paso 1: club
  const stepClub = () => `
    <p class="hint">Así aparecerá el club en la app. Podrás cambiarlo después en Configuración → Club.</p>
    <div class="row">
      <div class="grow"><label for="w_name">Nombre del club</label><input id="w_name" data-c="name" value="${esc(st.club.name)}" maxlength="120" required placeholder="p. ej. CD Las Rozas"></div>
      <div><label for="w_short">Nombre corto</label><input id="w_short" data-c="short_name" value="${esc(st.club.short_name)}" maxlength="20" placeholder="CDLR"></div>
      <div><label for="w_city">Localidad</label><input id="w_city" data-c="city" value="${esc(st.club.city)}" maxlength="80"></div>
    </div>
    <span class="label">Colores del club</span>
    <div class="swatches">
      ${COLORS.map(([a, b]) => `<button type="button" class="swatch${st.club.primary === a ? ' on' : ''}" data-c1="${a}" data-c2="${b}" aria-label="Colores ${a} y ${b}" aria-pressed="${st.club.primary === a}"><span style="background:${a}"></span><span style="background:${b}"></span></button>`).join('')}
    </div>
    <label for="w_crest">Escudo (opcional)</label>
    <input id="w_crest" type="file" accept="image/png,image/jpeg,image/webp">`;

  // ----- Paso 2: temporada
  const stepSeason = () => `
    <p class="hint">La primera temporada del club en la app. Las siguientes podrás crearlas copiando esta.</p>
    <div class="row">
      <div><label for="w_sname">Nombre</label><input id="w_sname" data-s="name" value="${esc(st.season.name)}" maxlength="40" required></div>
      <div><label for="w_sstart">Empieza</label><input id="w_sstart" data-s="start" type="date" value="${esc(st.season.start)}" required></div>
      <div><label for="w_send">Termina</label><input id="w_send" data-s="end" type="date" value="${esc(st.season.end)}" required></div>
    </div>`;

  // ----- Paso 3: equipos
  const stepTeams = () => `
    <p class="hint">Añade los equipos de esta temporada. Puedes añadir más cuando quieras.</p>
    <span class="label">Añadir categorías típicas</span>
    <div class="chips">${CATEGORIES.map(([c, m]) => `<button type="button" class="chip" data-cat="${c}" data-mod="${m}">+ ${c}</button>`).join('')}</div>
    <div class="team-rows">
      <div class="team-row head" aria-hidden="true"><span>Nombre del equipo</span><span>Categoría</span><span>Modalidad</span><span></span></div>
      ${st.teams.map((t, i) => `
        <div class="team-row" data-i="${i}">
          <label class="sr-only" for="tn${i}">Nombre del equipo ${i + 1}</label>
          <input id="tn${i}" data-t="name" value="${esc(t.name)}" maxlength="80" placeholder="p. ej. Infantil A">
          <label class="sr-only" for="tc${i}">Categoría del equipo ${i + 1}</label>
          <input id="tc${i}" data-t="category" value="${esc(t.category)}" maxlength="60" placeholder="Categoría">
          <label class="sr-only" for="tm${i}">Modalidad del equipo ${i + 1}</label>
          <select id="tm${i}" data-t="modality">${Object.entries(MOD).map(([k, v]) => `<option value="${k}"${t.modality === k ? ' selected' : ''}>${v}</option>`).join('')}</select>
          <button type="button" class="icon-btn small" data-del-team aria-label="Quitar el equipo ${i + 1}"${st.teams.length === 1 ? ' disabled' : ''}>✕</button>
        </div>`).join('')}
    </div>
    <button type="button" class="btn small" data-add-team>+ Añadir equipo</button>`;

  // ----- Paso 4: cuerpo técnico
  const staffRow = (p, ti, pi) => `
    <div class="staff-row" data-ti="${ti}" data-pi="${pi}">
      <label class="sr-only" for="sr${ti}_${pi}">Perfil</label>
      <select id="sr${ti}_${pi}" data-p="role">${STAFF_ROLES.map((r) => `<option value="${r}"${p.role === r ? ' selected' : ''}>${ROLE_LABEL[r]}</option>`).join('')}</select>
      <label class="sr-only" for="se${ti}_${pi}">Email (opcional)</label>
      <input id="se${ti}_${pi}" data-p="email" type="email" value="${esc(p.email)}" placeholder="Email (opcional)">
      <label class="sr-only" for="ss${ti}_${pi}">Especialidad (opcional)</label>
      <input id="ss${ti}_${pi}" data-p="specialty" list="wspec" value="${esc(p.specialty)}" placeholder="Especialidad (opcional)" maxlength="40">
      <button type="button" class="icon-btn small" data-del-staff aria-label="Quitar esta persona">✕</button>
    </div>`;
  const stepStaff = () => `
    <p class="hint">Por cada persona se creará un enlace de invitación ligado a su equipo y perfil. Al terminar podrás enviarlos por WhatsApp o copiarlos. El email es opcional: si lo pones, solo esa cuenta podrá usar el enlace.</p>
    <datalist id="wspec">${SPECIALTIES.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
    ${st.teams.map((t, ti) => `
      <fieldset class="staff-team">
        <legend>${esc(t.name || 'Equipo ' + (ti + 1))} <small class="muted">${esc([t.category, MOD[t.modality]].filter(Boolean).join(' · '))}</small></legend>
        ${t.staff.length ? t.staff.map((p, pi) => staffRow(p, ti, pi)).join('') : '<p class="hint">Sin invitaciones para este equipo.</p>'}
        <button type="button" class="btn small" data-add-staff="${ti}">+ Añadir persona</button>
      </fieldset>`).join('')}
    <fieldset class="staff-team">
      <legend>Coordinación <small class="muted">(opcional, todos los equipos)</small></legend>
      ${st.coord.map((c, ci) => `
        <div class="staff-row coord-row" data-ci="${ci}">
          <label class="sr-only" for="ce${ci}">Email de coordinación</label>
          <input id="ce${ci}" data-cc="email" type="email" value="${esc(c.email)}" placeholder="Email (opcional)">
          <label class="sr-only" for="cs${ci}">Especialidad</label>
          <input id="cs${ci}" data-cc="specialty" list="wspec" value="${esc(c.specialty)}" placeholder="p. ej. Coordinador de fútbol base" maxlength="40">
          <button type="button" class="icon-btn small" data-del-coord aria-label="Quitar">✕</button>
        </div>`).join('')}
      <button type="button" class="btn small" data-add-coord>+ Añadir coordinación</button>
    </fieldset>`;

  function wire() {
    const f = el.querySelector('form');
    el.querySelector('[data-cancel]').addEventListener('click', () => { clearDraft(); onCancel?.(); });
    el.querySelector('[data-back]')?.addEventListener('click', () => { st.step--; draw(); });

    // Paso 1
    f.querySelectorAll('[data-c]').forEach((i) => i.addEventListener('input', () => { st.club[i.dataset.c] = i.value; saveDraft(st); }));
    f.querySelectorAll('.swatch').forEach((b) => b.addEventListener('click', () => {
      st.club.primary = b.dataset.c1; st.club.secondary = b.dataset.c2;
      f.querySelectorAll('.swatch').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); });
      saveDraft(st);
    }));
    f.querySelector('#w_crest')?.addEventListener('change', (ev) => { st.crest = ev.target.files[0] || null; });
    // Paso 2
    f.querySelectorAll('[data-s]').forEach((i) => i.addEventListener('input', () => { st.season[i.dataset.s] = i.value; saveDraft(st); }));
    // Paso 3
    f.querySelectorAll('[data-t]').forEach((i) => i.addEventListener('input', () => {
      st.teams[+i.closest('[data-i]').dataset.i][i.dataset.t] = i.value; saveDraft(st);
    }));
    f.querySelectorAll('[data-del-team]').forEach((b) => b.addEventListener('click', () => { st.teams.splice(+b.closest('[data-i]').dataset.i, 1); draw(); }));
    f.querySelector('[data-add-team]')?.addEventListener('click', () => { st.teams.push(newTeam('', '', 'f11')); draw(); el.querySelector('.team-row:last-child input')?.focus(); });
    f.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => {
      const cat = b.dataset.cat;
      const used = st.teams.filter((t) => t.category === cat).length;
      const name = `${cat} ${String.fromCharCode(65 + used)}`;
      const empty = st.teams.findIndex((t) => !t.name.trim() && !t.category.trim());
      const team = newTeam(name, cat, b.dataset.mod);
      if (empty >= 0) st.teams[empty] = team; else st.teams.push(team);
      draw();
    }));
    // Paso 4
    f.querySelectorAll('[data-p]').forEach((i) => i.addEventListener('input', () => {
      const row = i.closest('[data-ti]');
      st.teams[+row.dataset.ti].staff[+row.dataset.pi][i.dataset.p] = i.value; saveDraft(st);
    }));
    f.querySelectorAll('[data-del-staff]').forEach((b) => b.addEventListener('click', () => {
      const row = b.closest('[data-ti]');
      st.teams[+row.dataset.ti].staff.splice(+row.dataset.pi, 1); draw();
    }));
    f.querySelectorAll('[data-add-staff]').forEach((b) => b.addEventListener('click', () => {
      st.teams[+b.dataset.addStaff].staff.push({ role: st.teams[+b.dataset.addStaff].staff.length ? 'ayudante' : 'entrenador', email: '', specialty: '' }); draw();
    }));
    f.querySelectorAll('[data-cc]').forEach((i) => i.addEventListener('input', () => { st.coord[+i.closest('[data-ci]').dataset.ci][i.dataset.cc] = i.value; saveDraft(st); }));
    f.querySelectorAll('[data-del-coord]').forEach((b) => b.addEventListener('click', () => { st.coord.splice(+b.closest('[data-ci]').dataset.ci, 1); draw(); }));
    f.querySelector('[data-add-coord]')?.addEventListener('click', () => { st.coord.push({ email: '', specialty: '' }); draw(); });

    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const err = validate();
      if (err) { toast(err, 'err'); return; }
      if (st.step < 3) { st.step++; draw(); return; }
      await busy(f.querySelector('[type=submit]'), create);
    });
  }

  function validate() {
    if (st.step === 0 && !st.club.name.trim()) return 'Escribe el nombre del club.';
    if (st.step === 1) {
      if (!st.season.name.trim()) return 'Escribe el nombre de la temporada.';
      if (!st.season.start || !st.season.end || st.season.end <= st.season.start) return 'La temporada debe terminar después de empezar.';
    }
    if (st.step === 2) {
      st.teams = st.teams.filter((t, i) => t.name.trim() || t.category.trim() || i === 0);
      if (!st.teams.some((t) => t.name.trim())) return 'Añade al menos un equipo con nombre.';
      if (st.teams.some((t) => !t.name.trim())) return 'Pon nombre a todos los equipos o quita los vacíos.';
      const names = st.teams.map((t) => t.name.trim().toLowerCase());
      if (new Set(names).size !== names.length) return 'Hay dos equipos con el mismo nombre.';
    }
    if (st.step === 3) {
      const bad = [...st.teams.flatMap((t) => t.staff), ...st.coord].find((p) => p.email && !/^\S+@\S+\.\S+$/.test(p.email.trim()));
      if (bad) return `Revisa el email «${bad.email}» o déjalo vacío.`;
    }
    return '';
  }

  async function create() {
    const client = sb();
    const warn = [];
    const [first, ...rest] = st.teams.map((t) => ({ ...t, name: t.name.trim(), category: t.category.trim() }));

    // 1. Club, temporada, primer equipo y Dirección (una sola operación)
    const { data: clubId, error } = await client.rpc('create_club', {
      p_name: st.club.name.trim(), p_short_name: st.club.short_name.trim(),
      p_season_name: st.season.name.trim(), p_start_date: st.season.start, p_end_date: st.season.end,
      p_team_name: first.name, p_category: first.category, p_modality: first.modality,
      p_periods: 2, p_period_minutes: first.modality === 'f7' ? 35 : 45
    });
    if (error) throw error;

    // 2. Datos y colores
    const upd = await client.from('clubs').update({
      city: st.club.city.trim(), primary_color: st.club.primary, secondary_color: st.club.secondary, settings: { mode: 'club' }
    }).eq('id', clubId);
    if (upd.error) warn.push('los colores y la localidad');

    // 3. Escudo
    if (st.crest) {
      try {
        const blob = await squareImage(st.crest);
        const ext = { 'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg' }[blob.type] || 'png';
        const path = `${clubId}/crest.${ext}`;
        const up = await client.storage.from('club-files').upload(path, blob, { upsert: true, contentType: blob.type });
        if (up.error) throw up.error;
        const u2 = await client.from('clubs').update({ crest_path: path }).eq('id', clubId);
        if (u2.error) throw u2.error;
      } catch (e) { console.error(e); warn.push('el escudo'); }
    }

    // 4. Resto de equipos
    const [{ data: season }, { data: team0 }] = await Promise.all([
      client.from('seasons').select('id').eq('club_id', clubId).single(),
      client.from('teams').select('id').eq('club_id', clubId).single()
    ]);
    const teamIds = [team0?.id];
    for (const t of rest) {
      const { data: tid, error: e } = await client.rpc('create_team', { p_club: clubId, p_season: season.id, p_name: t.name, p_category: t.category, p_modality: t.modality });
      if (e) { warn.push(`el equipo ${t.name}`); teamIds.push(null); } else teamIds.push(tid);
    }

    // 5. Invitaciones del cuerpo técnico y de la coordinación
    const all = [first, ...rest];
    const rows = [];
    all.forEach((t, i) => {
      if (!teamIds[i]) return;
      t.staff.forEach((p) => rows.push({ club_id: clubId, role: p.role, email: p.email.trim() || null, specialty: p.specialty.trim(), team_ids: [teamIds[i]], _team: t.name }));
    });
    st.coord.forEach((c) => rows.push({ club_id: clubId, role: 'coordinador', email: c.email.trim() || null, specialty: c.specialty.trim(), team_ids: [], _team: 'Todos los equipos' }));
    let invites = [];
    if (rows.length) {
      const { data, error: e } = await client.from('invitations').insert(rows.map(({ _team, ...r }) => r)).select('token, role, email, specialty, team_ids');
      if (e) warn.push('las invitaciones');
      else invites = data.map((d, i) => ({ ...d, team: rows[i]._team }));
    }

    try { sessionStorage.setItem(NEW_INVITES, JSON.stringify({ club: st.club.name.trim(), invites })); } catch { /* nada */ }
    clearDraft();
    await refresh(clubId, team0?.id || null);
    if (warn.length) toast(`El club se ha creado, pero no se ha podido guardar: ${warn.join(', ')}. Puedes completarlo en Configuración.`, 'err', 9000);
    else toast('¡Club creado!');
    location.hash = '#/club';
  }

  draw();
}

function newTeam(name, category, modality) {
  return { name, category, modality, staff: [{ role: 'entrenador', email: '', specialty: '' }] };
}
