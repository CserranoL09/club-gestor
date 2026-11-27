// Ficha de sesión (#/sesiones/:id), hoja SESIÓN del Excel, en secciones plegables:
// datos generales, cuerpo técnico, objetivos, material, asistencia, tareas y observaciones.
// Dirección, entrenador principal y 2.º entrenador editan todo; el preparador físico y el de porteros,
// su objetivo, su rol en cada tarea y sus propias tareas (lo comprueba también la base de datos).
import { esc, toast, busy, ask, permNote } from '../ui.js';
import { sb } from '../supabase.js';
import { S, canMatchTeam, canPlanTeam } from '../session.js';
import { autosaver } from '../store.js';
import { fmt } from '../lib/dates.js';
import { mountThread } from '../lib/comments.js';
import { uploadClubImage, signedUrls } from '../lib/images.js';
import { objectivesFor, AREAS, canEditMethodology } from '../lib/methodology.js';
import { STATUS, NEXT_STATUS } from '../lib/players.js';
import { dayGuide, guideHTML } from '../lib/morpho.js';
import {
  MATERIAL, OBJECTIVES, STAFF, ROLES, BLOCK_KINDS, newBlock, blockTime, totalTime, blockShort,
  attStatus, participates, dayKey, fromLibrary, toLibrary
} from '../lib/sessions.js';

const openSecs = new Set(['datos', 'objetivos', 'tareas']);
const AREA_TO_OBJ = { tecnico: 'tectac', tactico: 'tectac', condicional: 'condicional', psicologico: 'psicologico' };

export async function render(el, ctx) {
  const client = sb();
  const { data: s, error } = await client.from('sessions').select('*').eq('id', ctx.params.id).maybeSingle();
  if (error) throw error;
  if (!s) {
    el.innerHTML = '<div class="card empty"><div class="big">🔍</div><h2>Sesión no encontrada</h2><p><a href="#/sesiones">Volver a las sesiones</a></p></div>';
    return;
  }
  const team = S.teams.find((t) => t.id === s.team_id) || S.team;
  const me = S.user?.id;
  const full = canMatchTeam(team.id);                         // Dirección, entrenador principal y 2.º entrenador
  const limited = !full && canPlanTeam(team.id) ? S.member.role : null;   // 'preparador' | 'porteros'
  const anyEdit = full || !!limited;

  const [pl, mem, morpho, club, siblings] = await Promise.all([
    client.from('players').select('id, number, name, position, status, active').eq('team_id', team.id).order('number', { nullsFirst: false }),
    client.from('club_members').select('user_id, role, team_ids, profile:profiles(full_name)').eq('club_id', S.club.id),
    client.from('morphocycles').select('name, rows, match_day').eq('team_id', team.id).order('is_default', { ascending: false }).limit(1).maybeSingle(),
    objectivesFor(team.category),
    client.from('sessions').select('id, date, time').eq('team_id', team.id).order('date').order('time')
  ]);
  const members = mem.data || [];
  const nameOf = (id) => members.find((m) => m.user_id === id)?.profile?.full_name || '';
  const att = structuredClone(s.attendance || {});
  const players = (pl.data || []).filter((p) => p.active || att[p.id]);
  const obj = { ...(s.objectives || {}) };
  const mat = { ...(s.material || {}) };
  const staff = { ...(s.staff || {}) };
  let blocks = structuredClone(s.blocks || []);
  const list = siblings.data || [];
  const idx = list.findIndex((x) => x.id === s.id);
  const prev = list[idx - 1], next = list[idx + 1];
  const saver = anyEdit ? autosaver({ table: 'sessions', id: s.id, updatedAt: s.updated_at, onSaved: (row) => Object.assign(s, row) }) : null;

  const canObj = (k) => full || (limited === 'preparador' && k === 'condicional');
  const ownBlock = (b) => full || (!!limited && b.author_id === me);
  const canRole = (b, r) => ownBlock(b) || (!!limited && r === limited);
  const dis = (ok) => (ok ? '' : 'disabled');
  const saveBlocks = () => saver?.set({ blocks: structuredClone(blocks) });
  const saveAtt = () => saver?.set({ attendance: structuredClone(att) });

  const morphoDay = (morpho.data?.rows || []).map((r) => ({ label: r.label, value: r.values?.[dayKey(s.date)] })).filter((r) => r.value);
  const images = await signedUrls(blocks.map((b) => b.image_path).filter(Boolean));

  // ---------------------------------------------------------------- pintar
  function sec(key, title, body, extra = '') {
    return `<details class="card ses-sec" data-sec="${key}"${openSecs.has(key) ? ' open' : ''}>
      <summary><h2>${title}</h2>${extra}</summary><div class="sec-body">${body}</div></details>`;
  }

  function distribution() {
    const total = totalTime(blocks);
    const planned = s.duration_min || 0;
    const scale = Math.max(total, planned) || 1;
    return `
      <div class="dist" aria-label="Distribución de tareas">
        <div class="dist-bar">${blocks.map((b, i) => `<span class="seg-${esc(b.kind)}" style="width:${(blockTime(b) / scale) * 100}%" title="${esc(b.title || BLOCK_KINDS[b.kind])}: ${blockTime(b)} min">${blockTime(b) >= 6 ? esc(blockShort(blocks, i)) : ''}</span>`).join('')}</div>
        <p class="${planned && total > planned ? 'warn-text' : 'muted'}" data-total>
          Tiempo de las tareas: <strong>${total} min</strong>${planned ? ` de ${planned} previstos${total > planned ? ` · ⚠ supera la duración en ${Math.round((total - planned) * 10) / 10} min` : ''}` : ''}</p>
      </div>`;
  }

  function datosHTML() {
    return `
      <div class="ses-grid">
        <div><label>Equipo</label><p class="static">${esc(team.name)}</p></div>
        <div><label>Categoría</label><p class="static">${esc(team.category || '—')}</p></div>
        <div><label for="sf_period">Periodo</label><input id="sf_period" data-g="period" value="${esc(s.period)}" maxlength="40" ${dis(full)}></div>
        <div><label for="sf_micro">Microciclo</label><input id="sf_micro" data-g="microcycle" type="number" min="0" max="99" value="${s.microcycle ?? ''}" ${dis(full)}></div>
        <div><label for="sf_num">Sesión nº</label><input id="sf_num" data-g="number" type="number" min="0" max="999" value="${s.number ?? ''}" ${dis(full)}></div>
        <div><label for="sf_date">Fecha</label><input id="sf_date" data-g="date" type="date" value="${esc(s.date)}" required ${dis(full)}></div>
        <div><label for="sf_time">Hora</label><input id="sf_time" data-g="time" type="time" value="${esc((s.time || '').slice(0, 5))}" ${dis(full)}></div>
        <div><label for="sf_dur">Duración (min)</label><input id="sf_dur" data-g="duration_min" type="number" min="0" max="600" step="5" value="${s.duration_min ?? ''}" ${dis(full)}></div>
      </div>
      <div data-dist>${distribution()}</div>
      ${guideHTML(dayGuide(morpho.data, s.date), esc)}`;
  }

  function staffHTML() {
    return `
      <datalist id="sfMembers">${members.map((m) => `<option value="${esc(m.profile?.full_name || '')}">`).join('')}</datalist>
      <div class="ses-grid two">${STAFF.map(([k, l]) => `
        <div><label for="st_${k}">${l}</label><input id="st_${k}" data-staff="${k}" list="sfMembers" value="${esc(staff[k] || '')}" maxlength="80" ${dis(full)}></div>`).join('')}</div>`;
  }

  function objHTML() {
    const sugg = [
      ...morphoDay.map((r) => ({ to: 'general', text: r.value, from: `Morfociclo · ${r.label}` })),
      ...(club ? AREAS.flatMap((a) => (club.objectives?.[a.key] || []).map((x) => ({ to: AREA_TO_OBJ[a.key], text: x, from: `Club · ${a.name}` }))) : [])
    ].filter((x) => canObj(x.to));
    return `
      <div class="ses-grid two">${OBJECTIVES.map(([k, l]) => `
        <div><label for="ob_${k}">${l}</label><textarea id="ob_${k}" data-obj="${k}" rows="2" maxlength="600" ${dis(canObj(k))}>${esc(obj[k] || '')}</textarea></div>`).join('')}</div>
      ${sugg.length ? `<div class="sugg"><p class="hint">Sugerencias para este día (toca para añadir):</p>
        <div class="sugg-list">${sugg.map((x, i) => `<button type="button" class="sugg-chip" data-sugg="${i}"><small>${esc(x.from)}</small>${esc(x.text)}</button>`).join('')}</div></div>` : ''}`;
  }

  function matHTML() {
    return `
      <div class="mat-grid">${MATERIAL.map((m) => {
        const on = mat[m] != null;
        return `<div class="mat${on ? ' on' : ''}" data-mat="${esc(m)}">
          <label class="check"><input type="checkbox" data-mat-on${on ? ' checked' : ''} ${dis(full)}> ${esc(m)}</label>
          <input type="number" min="0" max="999" data-mat-n value="${on ? esc(mat[m]) : ''}" aria-label="Cantidad de ${esc(m)}" ${dis(full && on)}>
        </div>`;
      }).join('')}</div>
      <label for="mt_otros">Otros</label><input id="mt_otros" data-mat-otros value="${esc(mat.otros || '')}" maxlength="200" ${dis(full)}>`;
  }

  function counts() {
    const c = { D: 0, L: 0, A: 0 };
    for (const p of players) c[attStatus(att, p)]++;
    return c;
  }
  function attHTML() {
    const c = counts();
    return `
      <div class="att-head">
        <p class="att-counts"><span class="st-D">D <strong data-c="D">${c.D}</strong> disponibles</span><span class="st-L">L <strong data-c="L">${c.L}</strong> lesionados</span><span class="st-A">A <strong data-c="A">${c.A}</strong> ausentes</span></p>
        ${full ? '<button class="btn small" type="button" data-all>Todos disponibles</button>' : ''}
      </div>
      ${players.length ? `<div class="table-scroll"><table class="att-table">
        <thead><tr><th scope="col">Nº</th><th scope="col">Jugador</th><th scope="col">Estado</th>${blocks.map((b, i) => `<th scope="col" title="${esc(b.title)}">${esc(blockShort(blocks, i))}</th>`).join('')}<th scope="col">Nota</th></tr></thead>
        <tbody>${players.map((p) => {
          const st = attStatus(att, p);
          return `<tr data-p="${esc(p.id)}">
            <td>${p.number ?? ''}</td><th scope="row">${esc(p.name)}</th>
            <td><button type="button" class="status-btn st-${st}" data-st aria-label="${esc(p.name)}: ${STATUS[st][0]}" ${dis(full)}>${st}</button></td>
            ${blocks.map((b) => `<td><input type="checkbox" data-task="${esc(b.id)}" aria-label="${esc(p.name)} en ${esc(b.title)}"${participates(att, p, b.id) ? ' checked' : ''} ${dis(full && st === 'D')}></td>`).join('')}
            <td><input data-note value="${esc(att[p.id]?.note || '')}" maxlength="120" aria-label="Nota de ${esc(p.name)}" ${dis(full)}></td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>` : '<p class="muted">No hay jugadores en la <a href="#/plantilla">plantilla</a>.</p>'}`;
  }

  function blockHTML(b, i) {
    const own = ownBlock(b);
    const st = b.structure || {};
    const img = b.image_path ? images[b.image_path] : '';
    return `
      <article class="blk blk-${esc(b.kind)}" data-b="${esc(b.id)}">
        <header class="blk-head">
          <span class="blk-tag">${esc(blockShort(blocks, i))}</span>
          <select data-k="kind" aria-label="Tipo de bloque" ${dis(own)}>${Object.entries(BLOCK_KINDS).map(([k, l]) => `<option value="${k}"${b.kind === k ? ' selected' : ''}>${l}</option>`).join('')}</select>
          <input class="blk-title" data-k="title" value="${esc(b.title)}" maxlength="80" placeholder="Título de la tarea" aria-label="Título" ${dis(own)}>
          <span class="blk-time" data-time>${blockTime(b)} min</span>
          ${full ? `<span class="arrows"><button class="icon-btn small" type="button" data-move="-1" aria-label="Subir"${i ? '' : ' disabled'}>↑</button><button class="icon-btn small" type="button" data-move="1" aria-label="Bajar"${i < blocks.length - 1 ? '' : ' disabled'}>↓</button></span>` : ''}
          ${own ? '<button class="icon-btn small" type="button" data-bdel aria-label="Quitar el bloque">✕</button>' : ''}
        </header>
        ${b.author_id && b.author_id !== me && nameOf(b.author_id) ? `<p class="hint">Creada por ${esc(nameOf(b.author_id))}</p>` : ''}
        <div class="blk-body">
          <div class="blk-main">
            <label>Desarrollo<textarea data-k="description" rows="3" maxlength="3000" ${dis(own)}>${esc(b.description)}</textarea></label>
            <label>Variantes (una por línea)<textarea data-k="variants" rows="2" maxlength="2000" ${dis(own)}>${esc((b.variants || []).join('\n'))}</textarea></label>
            <div class="two-cols">
              <label>Objetivos ofensivos<textarea data-k="obj_off" rows="2" maxlength="600" ${dis(own)}>${esc(b.obj_off)}</textarea></label>
              <label>Objetivos defensivos<textarea data-k="obj_def" rows="2" maxlength="600" ${dis(own)}>${esc(b.obj_def)}</textarea></label>
            </div>
            <fieldset class="roles"><legend>Roles del cuerpo técnico</legend>
              ${ROLES.map(([r, l]) => `<label>${l}<input data-role="${r}" value="${esc(b.roles?.[r] || '')}" maxlength="200" ${dis(canRole(b, r))}></label>`).join('')}
            </fieldset>
          </div>
          <div class="blk-side">
            <fieldset class="structure"><legend>Estructura</legend>
              <label>Duración (min)<input data-s="duration" type="number" min="0" max="180" step="0.5" value="${esc(st.duration ?? '')}" ${dis(own)}></label>
              <label>Series<input data-s="series" type="number" min="1" max="20" value="${esc(st.series ?? 1)}" ${dis(own)}></label>
              <label>Recuperación (min)<input data-s="rest" type="number" min="0" max="30" step="0.5" value="${esc(st.rest ?? 0)}" ${dis(own)}></label>
              <label>Espacio<input data-s="space" value="${esc(st.space ?? '')}" maxlength="40" placeholder="40×30 m" ${dis(own)}></label>
              <label>Nº jugadores<input data-s="players" value="${esc(st.players ?? '')}" maxlength="20" placeholder="8v8" ${dis(own)}></label>
              <label>Porteros<input data-s="goalkeepers" value="${esc(st.goalkeepers ?? '')}" maxlength="20" ${dis(own)}></label>
            </fieldset>
            <div class="blk-img">
              ${img ? `<img src="${esc(img)}" alt="Imagen de ${esc(b.title)}">` : ''}
              ${own ? `<label class="btn small">${img ? 'Cambiar imagen' : '+ Imagen del ejercicio'}<input type="file" accept="image/*" data-img hidden></label>
                ${img ? '<button class="btn small danger" type="button" data-img-del>Quitar imagen</button>' : ''}` : ''}
            </div>
            ${anyEdit ? '<button class="btn small" type="button" data-tolib>Guardar en la biblioteca</button>' : ''}
          </div>
        </div>
      </article>`;
  }

  function tasksHTML() {
    return `
      ${anyEdit ? `<div class="actions no-print"><button class="btn small" type="button" data-badd>+ Tarea</button><button class="btn small" type="button" data-fromlib>Insertar desde la biblioteca</button></div>` : ''}
      <div class="blocks">${blocks.map(blockHTML).join('') || '<p class="muted">Sin tareas.</p>'}</div>
      <p class="big-line" data-total2>Tiempo total: <strong>${totalTime(blocks)} min</strong></p>`;
  }

  let sugg = [];
  function draw() {
    sugg = [
      ...morphoDay.map((r) => ({ to: 'general', text: r.value })),
      ...(club ? AREAS.flatMap((a) => (club.objectives?.[a.key] || []).map((x) => ({ to: AREA_TO_OBJ[a.key], text: x }))) : [])
    ].filter((x) => canObj(x.to));
    const note = full ? '' : limited
      ? permNote({ ok: false, reason: limited === 'preparador' ? 'Como preparador físico editas el objetivo condicional, tu rol en cada tarea y las tareas que añadas tú.' : 'Como entrenador de porteros editas tu rol en cada tarea y las tareas que añadas tú.' })
      : permNote({ ok: false, reason: `Solo ver y comentar: la sesión la edita el cuerpo técnico de ${team.name}.` });
    el.innerHTML = `
      <div class="page-head">
        <div><p class="eyebrow">${esc(team.name)} · Sesión${s.number ? ' ' + s.number : ''}</p>
          <h1>⚽ ${esc(fmt(s.date + 'T00:00:00'))}${s.time ? ` · ${esc(s.time.slice(0, 5))}` : ''}</h1>
          <p>${s.microcycle != null ? `Microciclo ${s.microcycle}` : ''}${s.period ? ` · ${esc(s.period)}` : ''}</p></div>
        <div class="actions no-print">
          ${prev ? `<a class="btn icon-btn" href="#/sesiones/${esc(prev.id)}" aria-label="Sesión anterior">‹</a>` : ''}
          <a class="btn" href="#/sesiones">Sesiones</a>
          ${next ? `<a class="btn icon-btn" href="#/sesiones/${esc(next.id)}" aria-label="Sesión siguiente">›</a>` : ''}
          <button class="btn" type="button" data-print>Imprimir</button>
        </div>
      </div>
      ${note}
      ${sec('datos', '1. Datos generales', datosHTML())}
      ${sec('staff', '2. Cuerpo técnico', staffHTML())}
      ${sec('objetivos', '3. Objetivos', objHTML())}
      ${sec('material', '4. Material', matHTML(), `<span class="count" data-matcount>${MATERIAL.filter((m) => mat[m] != null).length}</span>`)}
      ${sec('asistencia', '5. Asistencia', attHTML(), `<span class="count" data-attsum>${counts().D}/${players.length}</span>`)}
      ${sec('tareas', '6. Tareas', tasksHTML(), `<span class="count" data-tsum>${totalTime(blocks)} min</span>`)}
      ${sec('obs', '7. Observaciones', `<label class="sr-only" for="sf_notes">Observaciones</label><textarea id="sf_notes" data-notes rows="4" maxlength="4000" ${dis(full)}>${esc(s.notes)}</textarea>`)}
      <div id="thread" class="no-print"></div>`;
    wire();
    mountThread(el.querySelector('#thread'), { teamId: team.id, entity: 'session', entityId: s.id, title: 'Comentarios sobre esta sesión' });
  }

  const updateTimes = () => {
    el.querySelector('[data-dist]').innerHTML = distribution();
    el.querySelector('[data-total2] strong').textContent = `${totalTime(blocks)} min`;
    el.querySelector('[data-tsum]').textContent = `${totalTime(blocks)} min`;
    el.querySelectorAll('[data-b]').forEach((a) => { const b = blocks.find((x) => x.id === a.dataset.b); if (b) a.querySelector('[data-time]').textContent = `${blockTime(b)} min`; });
  };
  const updateCounts = () => {
    const c = counts();
    for (const k of ['D', 'L', 'A']) el.querySelector(`[data-c="${k}"]`).textContent = c[k];
    el.querySelector('[data-attsum]').textContent = `${c.D}/${players.length}`;
  };
  /** Guarda el estado que se ve de todos los jugadores (también los que siguen el de la plantilla). */
  const materialize = () => { for (const p of players) att[p.id] = { status: attStatus(att, p), tasks: { ...(att[p.id]?.tasks || {}) }, note: att[p.id]?.note || '' }; };

  // ---------------------------------------------------------------- eventos
  function wire() {
    el.querySelectorAll('details.ses-sec').forEach((d) => d.addEventListener('toggle', () => { if (d.open) openSecs.add(d.dataset.sec); else openSecs.delete(d.dataset.sec); }));
    el.querySelector('[data-print]').addEventListener('click', () => { el.querySelectorAll('details.ses-sec').forEach((d) => { d.open = true; }); window.print(); });
    if (!anyEdit) return;

    // Datos generales
    el.querySelectorAll('[data-g]').forEach((inp) => inp.addEventListener('change', () => {
      const k = inp.dataset.g;
      let v = inp.value;
      if (k === 'date' && !v) { inp.value = s.date; return; }
      if (['microcycle', 'number', 'duration_min'].includes(k)) v = v === '' ? null : +v;
      if (k === 'time') v = v || null;
      s[k] = v;
      saver.set({ [k]: v });
      if (k === 'duration_min') updateTimes();
    }));
    el.querySelectorAll('[data-staff]').forEach((inp) => inp.addEventListener('input', () => { staff[inp.dataset.staff] = inp.value; saver.set({ staff: { ...staff } }); }));

    // Objetivos y sugerencias
    el.querySelectorAll('[data-obj]').forEach((ta) => ta.addEventListener('input', () => { obj[ta.dataset.obj] = ta.value; saver.set({ objectives: { ...obj } }); }));
    el.querySelectorAll('[data-sugg]').forEach((b) => b.addEventListener('click', () => {
      const x = sugg[+b.dataset.sugg];
      const ta = el.querySelector(`[data-obj="${x.to}"]`);
      if (ta.value.includes(x.text)) { toast('Ya está en el objetivo.'); return; }
      ta.value = ta.value.trim() ? `${ta.value.trim()}\n${x.text}` : x.text;
      obj[x.to] = ta.value;
      saver.set({ objectives: { ...obj } });
      b.classList.add('used');
    }));

    // Material
    el.querySelectorAll('[data-mat]').forEach((row) => {
      const m = row.dataset.mat;
      const n = row.querySelector('[data-mat-n]');
      row.querySelector('[data-mat-on]')?.addEventListener('change', (ev) => {
        if (ev.target.checked) { mat[m] = mat[m] || 1; n.value = mat[m]; n.disabled = false; n.focus(); n.select(); } else { delete mat[m]; n.value = ''; n.disabled = true; }
        row.classList.toggle('on', ev.target.checked);
        el.querySelector('[data-matcount]').textContent = MATERIAL.filter((x) => mat[x] != null).length;
        saver.set({ material: { ...mat } });
      });
      n?.addEventListener('input', () => { mat[m] = Math.max(0, +n.value || 0); saver.set({ material: { ...mat } }); });
    });
    el.querySelector('[data-mat-otros]')?.addEventListener('input', (ev) => { mat.otros = ev.target.value; saver.set({ material: { ...mat } }); });

    // Asistencia
    el.querySelectorAll('tr[data-p]').forEach((tr) => {
      const p = players.find((x) => x.id === tr.dataset.p);
      tr.querySelector('[data-st]')?.addEventListener('click', (ev) => {
        materialize();
        const st = NEXT_STATUS[att[p.id].status] || 'D';
        att[p.id].status = st;
        const b = ev.currentTarget;
        b.className = `status-btn st-${st}`; b.textContent = st; b.setAttribute('aria-label', `${p.name}: ${STATUS[st][0]}`);
        tr.querySelectorAll('[data-task]').forEach((c) => { c.disabled = st !== 'D'; c.checked = participates(att, p, c.dataset.task); });
        updateCounts();
        saveAtt();
      });
      tr.querySelectorAll('[data-task]').forEach((c) => c.addEventListener('change', () => {
        materialize();
        if (c.checked) delete att[p.id].tasks[c.dataset.task]; else att[p.id].tasks[c.dataset.task] = false;
        saveAtt();
      }));
      tr.querySelector('[data-note]')?.addEventListener('input', (ev) => { materialize(); att[p.id].note = ev.target.value; saveAtt(); });
    });
    el.querySelector('[data-all]')?.addEventListener('click', () => {
      materialize();
      for (const p of players) att[p.id].status = 'D';
      saveAtt();
      redraw();
      toast('Todos disponibles.');
    });

    // Tareas
    el.querySelectorAll('[data-b]').forEach((card) => {
      const b = blocks.find((x) => x.id === card.dataset.b);
      card.querySelectorAll('[data-k]').forEach((inp) => inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', () => {
        const k = inp.dataset.k;
        b[k] = k === 'variants' ? inp.value.split('\n').map((x) => x.trim()).filter(Boolean) : inp.value;
        saveBlocks();
        if (k === 'kind') redraw();
      }));
      card.querySelectorAll('[data-role]').forEach((inp) => inp.addEventListener('input', () => { b.roles = { ...(b.roles || {}), [inp.dataset.role]: inp.value }; saveBlocks(); }));
      card.querySelectorAll('[data-s]').forEach((inp) => inp.addEventListener('input', () => {
        const k = inp.dataset.s;
        b.structure = { ...(b.structure || {}), [k]: ['duration', 'series', 'rest'].includes(k) ? (inp.value === '' ? '' : +inp.value) : inp.value };
        saveBlocks();
        if (['duration', 'series', 'rest'].includes(k)) updateTimes();
      }));
      card.querySelectorAll('[data-move]').forEach((btn) => btn.addEventListener('click', () => {
        const i = blocks.indexOf(b), j = i + +btn.dataset.move;
        if (j < 0 || j >= blocks.length) return;
        [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
        saveBlocks(); redraw();
      }));
      card.querySelector('[data-bdel]')?.addEventListener('click', async () => {
        if (!(await ask(`Se quita «${b.title || BLOCK_KINDS[b.kind]}» de esta sesión.`, { title: '¿Quitar el bloque?', yes: 'Quitar', danger: true }))) return;
        blocks = blocks.filter((x) => x !== b);
        for (const a of Object.values(att)) if (a?.tasks) delete a.tasks[b.id];
        saveBlocks(); if (Object.keys(att).length) saveAtt();
        redraw();
      });
      card.querySelector('[data-img]')?.addEventListener('change', (ev) => {
        const file = ev.target.files[0];
        if (!file) return;
        busy(card.querySelector('.blk-img .btn'), async () => {
          const path = await uploadClubImage('tasks', file);
          b.image_path = path;
          Object.assign(images, await signedUrls([path]));
          saveBlocks(); redraw();
          toast('Imagen guardada.');
        });
      });
      card.querySelector('[data-img-del]')?.addEventListener('click', () => { b.image_path = null; saveBlocks(); redraw(); });
      card.querySelector('[data-tolib]')?.addEventListener('click', (ev) => busy(ev.currentTarget, async () => {
        if (!b.title?.trim()) { toast('Ponle un título a la tarea antes de guardarla.', 'err'); return; }
        const editor = canEditMethodology();
        const row = { ...toLibrary(b), club_id: S.club.id, author_id: me, status: editor ? 'oficial' : 'propuesta', categories: team.category ? [team.category] : [] };
        const { error: e } = await client.from('task_library').insert(row);
        if (e) throw e;
        toast(editor ? 'Guardada en la biblioteca del club como tarea oficial.' : 'Enviada a la biblioteca: la Coordinación la revisará.');
      }));
    });
    el.querySelector('[data-badd]')?.addEventListener('click', () => {
      const n = blocks.filter((b) => b.kind === 'task').length + 1;
      const b = newBlock('task', `Tarea ${n}`, { author_id: me });
      const cool = blocks.findIndex((x) => x.kind === 'cooldown');
      if (cool >= 0) blocks.splice(cool, 0, b); else blocks.push(b);
      saveBlocks(); redraw();
      el.querySelector(`[data-b="${b.id}"] [data-k=title]`)?.select();
    });
    el.querySelector('[data-fromlib]')?.addEventListener('click', () => libraryDialog());

    el.querySelector('[data-notes]')?.addEventListener('input', (ev) => { s.notes = ev.target.value; saver.set({ notes: ev.target.value }); });
  }

  function redraw() {
    const y = window.scrollY;
    draw();
    window.scrollTo(0, y);
  }

  // ---------------------------------------------------------------- biblioteca
  async function libraryDialog() {
    const { data: tasks, error: e } = await client.from('task_library').select('*').eq('club_id', S.club.id).order('title');
    if (e) { toast(e.message, 'err'); return; }
    const usable = (tasks || []).filter((t) => t.status === 'oficial' || t.author_id === me);
    let dlg = document.getElementById('libDlg');
    if (!dlg) {
      dlg = document.createElement('dialog'); dlg.id = 'libDlg'; dlg.className = 'lib-dlg'; dlg.setAttribute('aria-labelledby', 'libTitle');
      document.body.appendChild(dlg);
      dlg.addEventListener('click', (ev) => { if (ev.target === dlg || ev.target.closest('[data-close]')) dlg.close(); });
    }
    dlg.innerHTML = `
      <div class="sheet-head"><h2 id="libTitle">Biblioteca de tareas</h2><button class="icon-btn" type="button" data-close aria-label="Cerrar">✕</button></div>
      <label class="sr-only" for="libQ">Buscar</label>
      <input id="libQ" type="search" placeholder="Buscar por título, etiqueta o descripción…" autocomplete="off">
      <ul class="lib-list" id="libList"></ul>
      <p class="hint">Oficiales del club y tus propuestas. <a href="#/metodologia?tab=tareas" data-close>Ver la biblioteca completa</a></p>`;
    const listEl = dlg.querySelector('#libList');
    const show = (text = '') => {
      const t = text.toLowerCase().trim();
      const found = usable.filter((x) => !t || `${x.title} ${(x.tags || []).join(' ')} ${x.block?.description || ''}`.toLowerCase().includes(t));
      listEl.innerHTML = found.length ? found.map((x) => `
        <li><div><strong>${esc(x.title || 'Tarea')}</strong>${x.status !== 'oficial' ? ' <span class="pill warn">Propuesta</span>' : ''}
          <br><small class="muted">${esc([x.block?.players, x.block?.space, x.block?.duration ? x.block.duration + ' min' : '', ...(x.tags || []).map((g) => '#' + g)].filter(Boolean).join(' · '))}</small>
          ${x.block?.description ? `<p class="lib-desc">${esc(x.block.description.slice(0, 160))}</p>` : ''}</div>
          <button class="btn small primary" type="button" data-ins="${esc(x.id)}">Insertar</button></li>`).join('')
        : `<li class="muted">${usable.length ? 'Ninguna tarea coincide.' : 'La biblioteca está vacía. Guarda tareas desde cualquier bloque con «Guardar en la biblioteca».'}</li>`;
      listEl.querySelectorAll('[data-ins]').forEach((btn) => btn.addEventListener('click', () => {
        const t = usable.find((x) => x.id === btn.dataset.ins);
        const b = fromLibrary(t, me);
        const cool = blocks.findIndex((x) => x.kind === 'cooldown');
        if (cool >= 0) blocks.splice(cool, 0, b); else blocks.push(b);
        saveBlocks();
        dlg.close();
        signedUrls([b.image_path].filter(Boolean)).then((u) => { Object.assign(images, u); redraw(); });
        toast(`«${b.title}» añadida a la sesión.`);
      }));
    };
    dlg.querySelector('#libQ').addEventListener('input', (ev) => show(ev.target.value));
    show();
    dlg.showModal();
    dlg.querySelector('#libQ').focus();
  }

  draw();
}
