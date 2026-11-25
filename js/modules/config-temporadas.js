// Configuración → Temporadas y equipos.
import { esc, toast, busy, ask, formValues } from '../ui.js';
import { sb } from '../supabase.js';
import { S, reloadClubData, patchTeam } from '../session.js';
import { autosaver, setCtx } from '../store.js';
import { fmt } from '../lib/dates.js';
import { seasonDefaults } from './club-form.js';

const MOD = { f11: 'Fútbol 11', f7: 'Fútbol 7' };
const SQUAD = { f11: 18, f7: 14 };
const MINUTES = { f11: 45, f7: 35 };

export async function render(el, { canEdit }, pickSeasonId) {
  const client = sb();
  const clubId = S.club.id;
  const { data: seasons, error } = await client.from('seasons').select('*').eq('club_id', clubId).order('start_date', { ascending: false });
  if (error) throw error;
  const active = seasons.filter((s) => !s.archived);
  const shownSeason = seasons.find((s) => s.id === pickSeasonId) || seasons.find((s) => s.id === S.season?.id) || active[0] || seasons[0];
  const { data: teams, error: tErr } = shownSeason
    ? await client.from('teams').select('*').eq('season_id', shownSeason.id).order('archived').order('name')
    : { data: [] };
  if (tErr) throw tErr;
  const next = nextSeasonDefaults(seasons);
  const lock = canEdit ? '' : 'disabled';
  const again = (seasonId) => render(el, { canEdit }, seasonId ?? shownSeason?.id);

  el.innerHTML = `
    <section class="card">
      <h2>Temporadas</h2>
      <ul class="list">
        ${seasons.map((s) => `
          <li data-season="${esc(s.id)}" class="${s.archived ? 'is-hidden' : ''}">
            <div>
              <strong>${esc(s.name)}</strong>
              ${s.is_current ? '<span class="badge">Actual</span>' : ''}${s.archived ? '<span class="badge muted-badge">Archivada</span>' : ''}<br>
              <small class="muted">Del ${esc(fmt(s.start_date + 'T00:00'))} al ${esc(fmt(s.end_date + 'T00:00'))}</small>
            </div>
            ${canEdit ? `
            <div class="actions">
              ${!s.is_current && !s.archived ? '<button class="btn small" type="button" data-current>Marcar como actual</button>' : ''}
              <button class="btn small" type="button" data-edit-season>Editar</button>
              ${s.archived ? '<button class="btn small" type="button" data-unarchive>Recuperar</button>'
                : !s.is_current ? '<button class="btn small danger" type="button" data-archive>Archivar</button>' : ''}
            </div>
            <form class="inline-form" data-season-form hidden novalidate>
              <div class="row">
                <div><label>Nombre<input name="name" value="${esc(s.name)}" maxlength="40" required></label></div>
                <div><label>Empieza<input name="start_date" type="date" value="${esc(s.start_date)}" required></label></div>
                <div><label>Termina<input name="end_date" type="date" value="${esc(s.end_date)}" required></label></div>
              </div>
              <button class="btn small primary" type="submit">Guardar</button>
              <button class="btn small" type="button" data-cancel>Cancelar</button>
            </form>` : ''}
          </li>`).join('')}
      </ul>
    </section>

    ${canEdit ? `
    <section class="card">
      <h2>Nueva temporada</h2>
      <form id="newSeason" novalidate>
        <div class="row">
          <div><label for="ns_name">Nombre</label><input id="ns_name" name="name" value="${esc(next.name)}" maxlength="40" required></div>
          <div><label for="ns_start">Empieza</label><input id="ns_start" name="start_date" type="date" value="${next.start}" required></div>
          <div><label for="ns_end">Termina</label><input id="ns_end" name="end_date" type="date" value="${next.end}" required></div>
        </div>
        <span class="label">¿Cómo empezar?</span>
        <div class="stack">
          <label class="check"><input type="radio" name="mode" value="copy"${active.length ? ' checked' : ' disabled'}> A partir de
            <select name="from" aria-label="Temporada de origen"${active.length ? '' : ' disabled'}>${active.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select>
            <small class="muted">(copia equipos, morfociclos y macrociclos sin marcas)</small></label>
          <label class="check indent"><input type="checkbox" name="copy_players" checked> Copiar también la plantilla de cada equipo</label>
          <label class="check"><input type="radio" name="mode" value="empty"${active.length ? '' : ' checked'}> Vacía (crearás los equipos después)</label>
        </div>
        <label class="check"><input type="checkbox" name="make_current" checked> Marcarla como temporada actual</label>
        <button class="btn primary" type="submit">Crear temporada</button>
      </form>
    </section>` : ''}

    <section class="card">
      <div class="section-head">
        <h2>Equipos</h2>
        ${seasons.length > 1 ? `
          <label class="inline-label">Temporada
            <select id="teamSeason">${seasons.map((s) => `<option value="${esc(s.id)}"${s.id === shownSeason?.id ? ' selected' : ''}>${esc(s.name)}${s.archived ? ' (archivada)' : ''}</option>`).join('')}</select>
          </label>` : ''}
      </div>
      ${teams.length ? `
        <ul class="team-list">
          ${teams.map((t) => `
            <li data-team="${esc(t.id)}" class="${t.archived ? 'is-hidden' : ''}">
              <details>
                <summary>
                  <span><strong data-tname>${esc(t.name)}</strong>${t.archived ? ' <span class="badge muted-badge">Archivado</span>' : ''}<br>
                  <small class="muted" data-tsum>${esc(teamSummary(t))}</small></span>
                  <span class="muted">${canEdit ? 'Editar' : 'Ver'}</span>
                </summary>
                <fieldset class="plain" ${lock}>
                  <div class="row">
                    <div class="grow"><label>Nombre<input data-f="name" value="${esc(t.name)}" maxlength="80" required></label></div>
                    <div class="grow"><label>Categoría<input data-f="category" value="${esc(t.category || '')}" maxlength="60"></label></div>
                  </div>
                  <div class="row">
                    <div><label>Modalidad<select data-f="modality">${Object.entries(MOD).map(([k, v]) => `<option value="${k}"${t.modality === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label></div>
                    <div><label>Partes<input data-f="periods" type="number" min="1" max="4" value="${t.periods}"></label></div>
                    <div><label>Minutos por parte<input data-f="period_minutes" type="number" min="5" max="60" value="${t.period_minutes}"></label></div>
                    <div><label>Máx. convocados<input data-f="squad_max" type="number" min="7" max="30" value="${t.squad_max}"></label></div>
                  </div>
                </fieldset>
                ${canEdit ? `<div class="actions">${t.archived
                  ? '<button class="btn small" type="button" data-team-unarchive>Recuperar equipo</button>'
                  : '<button class="btn small danger" type="button" data-team-archive>Archivar equipo</button>'}</div>` : ''}
              </details>
            </li>`).join('')}
        </ul>` : '<p class="hint">Esta temporada aún no tiene equipos.</p>'}

      ${canEdit && shownSeason ? `
        <details class="new-team">
          <summary class="btn">+ Nuevo equipo</summary>
          <form id="newTeam" novalidate>
            <div class="row">
              <div class="grow"><label for="nt_name">Nombre</label><input id="nt_name" name="name" maxlength="80" required placeholder="p. ej. Cadete B"></div>
              <div class="grow"><label for="nt_cat">Categoría</label><input id="nt_cat" name="category" maxlength="60"></div>
            </div>
            <div class="row">
              <div><label for="nt_mod">Modalidad</label><select id="nt_mod" name="modality"><option value="f11">Fútbol 11</option><option value="f7">Fútbol 7</option></select></div>
              <div><label for="nt_per">Partes</label><input id="nt_per" name="periods" type="number" min="1" max="4" value="2"></div>
              <div><label for="nt_min">Minutos por parte</label><input id="nt_min" name="period_minutes" type="number" min="5" max="60" value="45"></div>
              <div><label for="nt_sq">Máx. convocados</label><input id="nt_sq" name="squad_max" type="number" min="7" max="30" value="18"></div>
            </div>
            <button class="btn primary" type="submit">Crear equipo en ${esc(shownSeason.name)}</button>
          </form>
        </details>` : ''}
    </section>`;

  el.querySelector('#teamSeason')?.addEventListener('change', (ev) => again(ev.target.value));
  if (!canEdit) return;

  // ----- Temporadas
  const seasonRow = (node) => seasons.find((s) => s.id === node.closest('[data-season]').dataset.season);
  el.querySelectorAll('[data-current]').forEach((b) => b.addEventListener('click', () => busy(b, async () => {
    const s = seasonRow(b);
    const { error: e } = await client.from('seasons').update({ is_current: true }).eq('id', s.id);
    if (e) throw e;
    toast(`${s.name} es ahora la temporada actual.`);
    setCtx({ seasonId: s.id, teamId: null });
    await reloadClubData();
  })));
  el.querySelectorAll('[data-archive], [data-unarchive]').forEach((b) => b.addEventListener('click', async () => {
    const s = seasonRow(b);
    const archive = b.hasAttribute('data-archive');
    if (archive && !(await ask(`«${s.name}» y sus equipos dejarán de aparecer en el selector. Sus datos se conservan y puedes recuperarla cuando quieras.`, { title: '¿Archivar la temporada?', yes: 'Archivar' }))) return;
    await busy(b, async () => {
      const { error: e } = await client.from('seasons').update({ archived: archive }).eq('id', s.id);
      if (e) throw e;
      toast(archive ? 'Temporada archivada.' : 'Temporada recuperada.');
      await reloadClubData();
    });
  }));
  el.querySelectorAll('[data-edit-season]').forEach((b) => b.addEventListener('click', () => {
    const f = b.closest('li').querySelector('[data-season-form]');
    f.hidden = !f.hidden;
    if (!f.hidden) f.querySelector('input').focus();
  }));
  el.querySelectorAll('[data-season-form]').forEach((f) => {
    f.querySelector('[data-cancel]').addEventListener('click', () => { f.hidden = true; });
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const v = formValues(f);
      if (!v.name) { toast('Escribe el nombre de la temporada.', 'err'); return; }
      if (!v.start_date || !v.end_date || v.end_date <= v.start_date) { toast('La temporada debe terminar después de empezar.', 'err'); return; }
      await busy(f.querySelector('[type=submit]'), async () => {
        const { error: e } = await client.from('seasons').update({ name: v.name, start_date: v.start_date, end_date: v.end_date }).eq('id', seasonRow(f).id);
        if (e) throw e;
        toast('Temporada guardada.');
        await reloadClubData();
      });
    });
  });

  const ns = el.querySelector('#newSeason');
  const syncMode = () => { ns.copy_players.disabled = ns.querySelector('[name=mode]:checked')?.value !== 'copy'; };
  ns.querySelectorAll('[name=mode]').forEach((r) => r.addEventListener('change', syncMode));
  syncMode();
  ns.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const v = formValues(ns);
    if (!v.name) { toast('Escribe el nombre de la temporada.', 'err'); return; }
    if (!v.start_date || !v.end_date || v.end_date <= v.start_date) { toast('La temporada debe terminar después de empezar.', 'err'); return; }
    await busy(ns.querySelector('[type=submit]'), async () => {
      let newId;
      if (v.mode === 'copy') {
        const { data, error: e } = await client.rpc('copy_season', {
          p_from: v.from, p_name: v.name, p_start: v.start_date, p_end: v.end_date,
          p_copy_players: !!v.copy_players, p_make_current: !!v.make_current
        });
        if (e) throw e;
        newId = data;
      } else {
        const { data, error: e } = await client.from('seasons')
          .insert({ club_id: clubId, name: v.name, start_date: v.start_date, end_date: v.end_date, is_current: !!v.make_current })
          .select('id').single();
        if (e) throw e;
        newId = data.id;
      }
      toast(`Temporada ${v.name} creada.`);
      if (v.make_current) setCtx({ seasonId: newId, teamId: null });
      await reloadClubData();
      if (!v.make_current) again(newId);
    });
  });

  // ----- Equipos
  const teamRow = (node) => teams.find((t) => t.id === node.closest('[data-team]').dataset.team);
  el.querySelectorAll('[data-team]').forEach((li) => {
    const t = teamRow(li);
    const saver = autosaver({ table: 'teams', id: t.id, updatedAt: t.updated_at, onSaved: (row) => Object.assign(t, row) });
    li.querySelectorAll('[data-f]').forEach((inp) => inp.addEventListener('input', () => {
      const f = inp.dataset.f;
      let val = inp.value.trim();
      if (f === 'name' && !val) { inp.setAttribute('aria-invalid', 'true'); return; }
      inp.removeAttribute('aria-invalid');
      if (['periods', 'period_minutes', 'squad_max'].includes(f)) {
        val = parseInt(val, 10);
        const [min, max] = [+inp.min, +inp.max];
        if (!Number.isFinite(val) || val < min || val > max) { inp.setAttribute('aria-invalid', 'true'); return; }
      }
      const patch = { [f]: val };
      if (f === 'modality') {
        // Si los valores eran los de la otra modalidad, se ajustan.
        const other = val === 'f7' ? 'f11' : 'f7';
        const sq = li.querySelector('[data-f=squad_max]');
        const mn = li.querySelector('[data-f=period_minutes]');
        if (+sq.value === SQUAD[other]) { sq.value = SQUAD[val]; patch.squad_max = SQUAD[val]; }
        if (+mn.value === MINUTES[other]) { mn.value = MINUTES[val]; patch.period_minutes = MINUTES[val]; }
      }
      Object.assign(t, patch);
      li.querySelector('[data-tname]').textContent = t.name;
      li.querySelector('[data-tsum]').textContent = teamSummary(t);
      patchTeam(t.id, patch);
      saver.set(patch);
    }));
  });
  el.querySelectorAll('[data-team-archive], [data-team-unarchive]').forEach((b) => b.addEventListener('click', async () => {
    const t = teamRow(b);
    const archive = b.hasAttribute('data-team-archive');
    if (archive && !(await ask(`«${t.name}» dejará de aparecer en el selector de equipos. Sus datos se conservan y puedes recuperarlo cuando quieras.`, { title: '¿Archivar el equipo?', yes: 'Archivar' }))) return;
    await busy(b, async () => {
      const { error: e } = await client.from('teams').update({ archived: archive }).eq('id', t.id);
      if (e) throw e;
      toast(archive ? 'Equipo archivado.' : 'Equipo recuperado.');
      await reloadClubData();
    });
  }));

  const nt = el.querySelector('#newTeam');
  if (nt) {
    let touched = false;
    nt.querySelectorAll('[name=periods],[name=period_minutes],[name=squad_max]').forEach((i) => i.addEventListener('input', () => { touched = true; }));
    nt.modality.addEventListener('change', () => {
      if (touched) return;
      nt.period_minutes.value = MINUTES[nt.modality.value];
      nt.squad_max.value = SQUAD[nt.modality.value];
    });
    nt.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const v = formValues(nt);
      if (!v.name) { toast('Escribe el nombre del equipo.', 'err'); return; }
      await busy(nt.querySelector('[type=submit]'), async () => {
        const { data, error: e } = await client.rpc('create_team', {
          p_club: clubId, p_season: shownSeason.id, p_name: v.name, p_category: v.category || '', p_modality: v.modality,
          p_periods: parseInt(v.periods, 10) || 2, p_period_minutes: parseInt(v.period_minutes, 10) || MINUTES[v.modality],
          p_squad_max: parseInt(v.squad_max, 10) || SQUAD[v.modality]
        });
        if (e) throw e;
        toast(`Equipo ${v.name} creado.`);
        if (shownSeason.id === S.season?.id) setCtx({ teamId: data });
        await reloadClubData();
      });
    });
  }
}

function teamSummary(t) {
  return [t.category, MOD[t.modality], `${t.periods} × ${t.period_minutes}'`, `hasta ${t.squad_max} convocados`].filter(Boolean).join(' · ');
}

/** Propuesta para la temporada siguiente a la más reciente. */
function nextSeasonDefaults(seasons) {
  const last = seasons[0];
  if (!last) return seasonDefaults();
  const y = parseInt(String(last.start_date).slice(0, 4), 10) + 1;
  return seasonDefaults(new Date(y, 8, 1));
}
