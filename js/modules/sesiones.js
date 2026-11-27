// Sesiones del equipo (#/sesiones): lista por microciclo, filtros, nueva, duplicar y borrar.
// La ficha (#/sesiones/:id) está en sesion.js.
import { esc, toast, busy, ask, permNote } from '../ui.js';
import { sb } from '../supabase.js';
import { S, permission, canEditTeam } from '../session.js';
import { MONTHS, fmt } from '../lib/dates.js';
import { iso } from '../lib/calendar.js';
import { mountThread } from '../lib/comments.js';
import { objectivesFor, stageOf, AREAS } from '../lib/methodology.js';
import { dayGuide, guideHTML } from '../lib/morpho.js';
import { defaultBlocks, totalTime, taskCount, periodOf, dayKey, MEMBER_STAFF } from '../lib/sessions.js';

export async function render(el, ctx) {
  if (ctx.params?.id) return (await import('./sesion.js')).render(el, ctx);
  if (!S.team) { el.innerHTML = '<div class="card empty"><p>Elige un equipo en la cabecera.</p></div>'; return; }
  const team = S.team;
  const client = sb();
  const perm = permission('plan');
  const canCreate = perm.ok;
  const canDelete = canEditTeam(team.id);
  const q = ctx.query;
  const month = q.get('mes') || '';
  const micro = q.get('micro') || '';

  const [{ data, error }, { data: players }] = await Promise.all([
    client.from('sessions').select('id, date, time, duration_min, number, microcycle, period, blocks, attendance, objectives').eq('team_id', team.id).order('date', { ascending: false }).order('time', { ascending: false }),
    client.from('players').select('id, status').eq('team_id', team.id).eq('active', true)
  ]);
  if (error) throw error;
  const all = data || [];
  const months = [...new Set(all.map((s) => s.date.slice(0, 7)))].sort().reverse();
  const micros = [...new Set(all.map((s) => s.microcycle).filter((m) => m != null))].sort((a, b) => b - a);
  const list = all.filter((s) => (!month || s.date.startsWith(month)) && (!micro || String(s.microcycle) === micro));
  const groups = new Map();
  for (const s of list) {
    const k = s.microcycle != null ? `Microciclo ${s.microcycle}` : 'Sin microciclo';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s);
  }
  const today = iso(new Date());
  const monthName = (ym) => `${MONTHS[+ym.slice(5) - 1]} ${ym.slice(0, 4)}`;
  const attOf = (s) => {
    const ids = Object.keys(s.attendance || {});
    if (!ids.length) return '—';
    const d = Object.values(s.attendance).filter((a) => a?.status === 'D').length;
    return `${d}/${ids.length}`;
  };

  el.innerHTML = `
    <div class="page-head">
      <div><h1>⚽ Sesiones</h1><p>${esc(team.name)} · ${esc(S.season?.name || '')} · ${all.length} ${all.length === 1 ? 'sesión' : 'sesiones'}</p></div>
      ${canCreate ? '<button class="btn primary" type="button" data-new>+ Nueva sesión</button>' : ''}
    </div>
    ${permNote(perm)}
    <div class="filters no-print">
      <label class="sr-only" for="sesMes">Mes</label>
      <select id="sesMes" data-f="mes"><option value="">Todos los meses</option>${months.map((m) => `<option value="${m}"${m === month ? ' selected' : ''}>${monthName(m)}</option>`).join('')}</select>
      <label class="sr-only" for="sesMicro">Microciclo</label>
      <select id="sesMicro" data-f="micro"><option value="">Todos los microciclos</option>${micros.map((m) => `<option value="${m}"${String(m) === micro ? ' selected' : ''}>Microciclo ${m}</option>`).join('')}</select>
    </div>
    ${list.length ? [...groups].map(([g, items]) => `
      <section class="card ses-group">
        <h2>${esc(g)} <span class="count">${items.length}</span>${items[0].period ? ` <small class="muted">${esc(items[0].period)}</small>` : ''}</h2>
        <ul class="ses-list">${items.map((s) => `
          <li data-id="${esc(s.id)}" class="${s.date === today ? 'today' : s.date > today ? 'future' : ''}">
            <a class="ses-main" href="#/sesiones/${esc(s.id)}">
              <span class="ses-date"><strong>${esc(fmt(s.date + 'T00:00:00'))}</strong>${s.time ? ` · ${esc(s.time.slice(0, 5))}` : ''}</span>
              <span class="ses-title">${s.number ? `Sesión ${s.number}` : 'Sesión'}${s.objectives?.general ? ` · ${esc(s.objectives.general)}` : ''}</span>
              <span class="ses-meta">
                <span title="Duración prevista">⏱ ${s.duration_min ?? '—'} min${totalTime(s.blocks) && s.duration_min && totalTime(s.blocks) > s.duration_min ? ' <span class="warn-text">⚠</span>' : ''}</span>
                <span title="Tareas">🧩 ${taskCount(s.blocks)} ${taskCount(s.blocks) === 1 ? 'tarea' : 'tareas'}</span>
                <span title="Asistencia (disponibles / registrados)">👥 ${attOf(s)}</span>
              </span>
            </a>
            ${canCreate || canDelete ? `<span class="actions">
              ${canCreate ? '<button class="btn small" type="button" data-dup>Duplicar</button>' : ''}
              ${canDelete ? '<button class="icon-btn small" type="button" data-del aria-label="Borrar la sesión">✕</button>' : ''}
            </span>` : ''}
          </li>`).join('')}</ul>
      </section>`).join('') : `<div class="card empty"><div class="big">⚽</div><h2>${all.length ? 'No hay sesiones con esos filtros' : 'Todavía no hay sesiones'}</h2>
        <p>${canCreate ? 'Crea la primera con «Nueva sesión» o genéralas desde el horario en el <a href="#/calendario">Calendario</a>.' : ''}</p></div>`}
    <div id="thread" class="no-print"></div>`;

  const nav = (patch) => {
    const p = new URLSearchParams({ mes: month, micro, ...patch });
    for (const [k, v] of [...p]) if (!v) p.delete(k);
    location.hash = `#/sesiones${p.toString() ? '?' + p : ''}`;
  };
  el.querySelectorAll('[data-f]').forEach((s) => s.addEventListener('change', () => nav({ [s.dataset.f]: s.value })));

  // ---------- Nueva y duplicar
  async function context() {
    const [per, morpho, tpl, members] = await Promise.all([
      client.from('periodizations').select('*').eq('team_id', team.id).eq('season_id', team.season_id).maybeSingle(),
      client.from('morphocycles').select('*').eq('team_id', team.id).order('is_default', { ascending: false }).limit(1).maybeSingle(),
      client.from('club_templates').select('*').eq('club_id', S.club.id).eq('kind', 'sesion').eq('is_default', true),
      client.from('club_members').select('user_id, role, team_ids, profile:profiles(full_name)').eq('club_id', S.club.id)
    ]);
    const stage = stageOf(team.category);
    const templates = tpl.data || [];
    const template = templates.find((t) => t.stage === stage) || templates.find((t) => t.stage === 'todas') || null;
    const staff = {};
    for (const m of members.data || []) {
      const key = MEMBER_STAFF[m.role];
      if (key && !staff[key] && (!m.team_ids?.length || m.team_ids.includes(team.id))) staff[key] = m.profile?.full_name || '';
    }
    return { per: per.data, morpho: morpho.data, template, staff };
  }
  const season = S.seasons.find((s) => s.id === team.season_id);

  let morpho = null;
  async function loadMorpho() {
    if (morpho) return morpho;
    const { data: mo } = await client.from('morphocycles').select('name, rows, match_day').eq('team_id', team.id).order('is_default', { ascending: false }).limit(1).maybeSingle();
    morpho = mo;
    return morpho;
  }
  function dateDialog({ title, date, time, duration, ok }) {
    return new Promise((resolve) => {
      let dlg = document.getElementById('sesDlg');
      if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'sesDlg'; document.body.appendChild(dlg); }
      dlg.innerHTML = `
        <form method="dialog" data-f>
          <h2>${esc(title)}</h2>
          <div class="row">
            <div><label for="sd_date">Fecha</label><input id="sd_date" name="date" type="date" value="${esc(date)}" required></div>
            <div><label for="sd_time">Hora</label><input id="sd_time" name="time" type="time" value="${esc(time || '')}"></div>
            <div><label for="sd_dur">Duración (min)</label><input id="sd_dur" name="duration" type="number" min="15" max="300" step="5" value="${esc(duration || 90)}"></div>
          </div>
          <p class="hint" id="sd_hint"></p>
          <div id="sd_guide"></div>
          <div class="dlg-actions"><button class="btn" value="no" formnovalidate>Cancelar</button><button class="btn primary" value="yes">${esc(ok)}</button></div>
        </form>`;
      const f = dlg.querySelector('form');
      const hint = () => {
        const p = periodOf(f.date.value, season, null);
        dlg.querySelector('#sd_hint').textContent = f.date.value ? `Microciclo y periodo se rellenan solos${p.microcycle ? ` (semana ${p.microcycle} de la temporada si no hay periodización)` : ''}.` : '';
      };
      const guide = () => { dlg.querySelector('#sd_guide').innerHTML = guideHTML(dayGuide(morpho, f.date.value), esc); };
      f.date.addEventListener('input', hint); hint();
      f.date.addEventListener('input', guide); guide();
      dlg.addEventListener('close', () => resolve(dlg.returnValue === 'yes' && f.date.value ? { date: f.date.value, time: f.time.value || null, duration: +f.duration.value || 90 } : null), { once: true });
      dlg.returnValue = '';
      dlg.showModal();
    });
  }

  async function create(base) {
    await loadMorpho();
    const v = await dateDialog(base
      ? { title: 'Duplicar sesión', date: nextWeek(base.date), time: base.time?.slice(0, 5), duration: base.duration_min, ok: 'Duplicar' }
      : { title: 'Nueva sesión', date: today, time: '18:00', duration: 90, ok: 'Crear' });
    if (!v) return;
    const c = await context();
    const { period, microcycle } = periodOf(v.date, season, c.per);
    const before = all.filter((s) => s.date < v.date || (s.date === v.date && (s.time || '') <= (v.time || ''))).length;
    let row;
    if (base) {
      const { data: full, error: e } = await client.from('sessions').select('*').eq('id', base.id).single();
      if (e) throw e;
      row = { staff: full.staff, objectives: full.objectives, material: full.material, notes: full.notes,
        blocks: (full.blocks || []).map((b) => ({ ...b, id: crypto.randomUUID().slice(0, 8) })) };
    } else {
      // Objetivo general sugerido por el morfociclo para ese día (fila de principios o temática).
      const objectives = {};
      const rows = (c.morpho?.rows || []).filter((r) => r.values?.[dayKey(v.date)]);
      const main = rows.find((r) => /principio|tem[aá]tica|contenido/i.test(r.label)) || rows[0];
      if (main) objectives.general = main.values[dayKey(v.date)];
      row = { staff: c.staff, objectives, material: {}, blocks: defaultBlocks(c.template), notes: '' };
    }
    const { data: ins, error } = await client.from('sessions').insert({
      team_id: team.id, date: v.date, time: v.time, duration_min: v.duration, period, microcycle, number: before + 1, ...row
    }).select('id').single();
    if (error) throw error;
    toast(base ? 'Sesión duplicada.' : 'Sesión creada.');
    location.hash = `#/sesiones/${ins.id}`;
  }
  const nextWeek = (d) => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + 7); return iso(x); };

  el.querySelector('[data-new]')?.addEventListener('click', (ev) => busy(ev.currentTarget, () => create(null)));
  el.querySelectorAll('[data-dup]').forEach((b) => b.addEventListener('click', () => busy(b, () => create(all.find((s) => s.id === b.closest('[data-id]').dataset.id)))));
  el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    const s = all.find((x) => x.id === b.closest('[data-id]').dataset.id);
    if (!(await ask(`Se borra la sesión del ${fmt(s.date + 'T00:00:00')} con sus tareas, asistencia y reservas de campo.`, { title: '¿Borrar la sesión?', yes: 'Borrar', danger: true }))) return;
    await busy(b, async () => {
      const { error: e } = await client.from('sessions').delete().eq('id', s.id);
      if (e) throw e;
      toast('Sesión borrada.');
      render(el, ctx);
    });
  }));

  // Objetivos del club para la categoría (guía al planificar).
  if (team.category) {
    const o = await objectivesFor(team.category);
    if (o && (AREAS.some((a) => (o.objectives?.[a.key] || []).length))) {
      const box = document.createElement('section');
      box.className = 'card club-objectives no-print';
      box.innerHTML = `<details><summary><strong>🎯 Objetivos del club para ${esc(o.category)}</strong></summary>
        <div class="obj-grid read mt">${AREAS.map((a) => `<div><h3>${a.name}</h3>${(o.objectives?.[a.key] || []).length ? `<ul>${o.objectives[a.key].map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="muted">—</p>'}</div>`).join('')}</div></details>`;
      el.querySelector('#thread').before(box);
    }
  }
  await mountThread(el.querySelector('#thread'), { teamId: team.id, entity: 'sesiones', title: 'Comentarios sobre las sesiones' });
}
