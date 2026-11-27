// Informe postpartido (#/partidos/:id/postpartido), hoja POSTPARTIDO: convocatoria y datos por jugador
// (desde plantilla, prepartido y acta, editables), evaluación colectiva e individual y captación.
import { esc, toast, busy, permNote } from '../ui.js';
import { sb } from '../supabase.js';
import { S, canMatchTeam } from '../session.js';
import { autosaver } from '../store.js';
import { fmt } from '../lib/dates.js';
import { mountThread } from '../lib/comments.js';
import { POSITIONS, FEET } from '../lib/players.js';
import { sides, score } from '../lib/matches.js';
import { printButton, wirePrint, printHead, bar, txt } from '../lib/print.js';
import { sheetPostpartido } from '../lib/excelbook.js';
import { exportBook } from '../lib/xlsx.js';
import { COLLECTIVE, INDIVIDUAL, ORIGINS, ORIGIN_SHORT, playerRows } from '../lib/post.js';

const open = new Set(['jugadores', 'colectiva']);

export async function render(el, ctx) {
  const client = sb();
  const { data: m, error } = await client.from('matches').select('*').eq('id', ctx.params.id).maybeSingle();
  if (error) throw error;
  if (!m) { el.innerHTML = '<div class="card empty"><div class="big">🔍</div><h2>Partido no encontrado</h2><p><a href="#/partidos">Volver a los partidos</a></p></div>'; return; }
  const team = S.teams.find((t) => t.id === m.team_id) || S.team;
  const canEdit = canMatchTeam(team.id);
  const dis = canEdit ? '' : 'disabled';
  const saver = canEdit ? autosaver({ table: 'matches', id: m.id, updatedAt: m.updated_at, onSaved: (r) => { m.updated_at = r.updated_at; } }) : null;
  const { data: pl } = await client.from('players').select('id, number, name, position, status, active').eq('team_id', team.id).order('number', { nullsFirst: false });
  const players = pl || [];
  const total = (team.periods || 2) * (team.period_minutes || 35);
  m.post ||= {};
  const post = m.post;
  post.players ||= {}; post.collective ||= {}; post.individual ||= {}; post.scouting ||= [];
  post.individual.texts ||= {}; post.individual.scores ||= {};
  const save = () => saver?.set({ post: structuredClone(post) });
  const levelBtns = (val, attr) => `<span class="lv-btns" role="radiogroup">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="lv-btn${+val === n ? ' on' : ''}" ${attr} data-v="${n}" aria-pressed="${+val === n}" aria-label="Nota ${n}" ${dis}>${n}</button>`).join('')}</span>`;

  function sec(key, title, body, extra = '') {
    return `<details class="card ses-sec" data-sec="${key}"${open.has(key) ? ' open' : ''}><summary><h2>${title}</h2>${extra}</summary><div class="sec-body">${body}</div></details>`;
  }

  // ---------------------------------------------------------------- 1 y 2 · jugadores
  function playersHTML() {
    const rows = playerRows(players, m, total);
    const yn = (r, k, y, n) => `<button type="button" class="yn${r[k] ? ' yes' : ''}${r.manual[k] ? ' manual' : ''}" data-yn="${k}" aria-pressed="${!!r[k]}" ${dis}>${r[k] ? y : n}</button>`;
    const sum = (f) => rows.reduce((s, r) => s + f(r), 0);
    return `
      <p class="hint">Se rellena con la plantilla, el prepartido y el acta. Lo que cambies a mano queda marcado en ámbar. Los goles en contra se apuntan a los jugadores que estaban en el campo en ese minuto.</p>
      <div class="per-scroll"><table class="post-table">
        <thead>
          <tr><th class="lbl" rowspan="2" scope="col">Jugador</th><th colspan="4" scope="colgroup">Convocatoria</th><th colspan="5" scope="colgroup">Goles a favor</th><th colspan="4" scope="colgroup">Goles en contra</th><th colspan="2" scope="colgroup">Tarjetas</th></tr>
          <tr><th>Disp.</th><th>Conv.</th><th>Tit.</th><th>Min</th>${ORIGINS.map((o) => `<th title="${o}">${ORIGIN_SHORT[o]}</th>`).join('')}<th>Asis</th>${ORIGINS.map((o) => `<th title="${o}">${ORIGIN_SHORT[o]}</th>`).join('')}<th>TA</th><th>TR</th></tr>
        </thead>
        <tbody>${rows.map((r) => `
          <tr data-p="${esc(r.p.id)}" class="${r.called ? '' : 'nc'}">
            <th class="lbl" scope="row"><b>${r.p.number ?? '–'}</b> ${esc(r.p.name)}</th>
            <td>${yn(r, 'available', 'D', 'No D')}</td><td>${yn(r, 'called', 'C', 'No C')}</td><td>${r.called ? yn(r, 'starter', 'T', 'S') : '—'}</td>
            <td class="${r.manual.minutes ? 'manual' : ''}"><input type="number" min="0" max="${total + 30}" data-min value="${r.minutes}" aria-label="Minutos de ${esc(r.p.name)}" ${dis}></td>
            ${ORIGINS.map((o) => `<td>${r.gf[o] || ''}</td>`).join('')}<td>${r.assists || ''}</td>
            ${ORIGINS.map((o) => `<td class="${r.manual['gc_' + o] ? 'manual' : ''}"><input type="number" min="0" max="20" data-gc="${o}" value="${r.gc[o] || 0}" aria-label="Goles en contra (${o}) con ${esc(r.p.name)} en el campo" ${dis}></td>`).join('')}
            <td>${r.yellow || ''}</td><td>${r.red || ''}</td>
          </tr>`).join('')}</tbody>
        <tfoot><tr><th class="lbl" scope="row">Total</th><td>${sum((r) => +r.available)}</td><td>${sum((r) => +r.called)}</td><td>${sum((r) => +(r.called && r.starter))}</td><td></td>
          ${ORIGINS.map((o) => `<td>${sum((r) => r.gf[o])}</td>`).join('')}<td>${sum((r) => r.assists)}</td>${ORIGINS.map(() => '<td></td>').join('')}<td>${sum((r) => r.yellow)}</td><td>${sum((r) => r.red)}</td></tr></tfoot>
      </table></div>
      ${canEdit && Object.keys(post.players).length ? '<button class="btn small mt" type="button" data-recalc>Quitar las correcciones y recalcular</button>' : ''}`;
  }

  // ---------------------------------------------------------------- 3 · colectiva
  function collectiveHTML() {
    return Object.entries(COLLECTIVE).map(([side, d]) => `
      <h3>${d.label}</h3><p class="hint">${esc(d.help)}</p>
      <div class="phase-grid">${d.phases.map(([k, l]) => { const v = post.collective[k] || {}; return `
        <div class="phase" data-ph="${k}">
          <div class="phase-head"><strong>${l}</strong>${levelBtns(v.score, 'data-score')}</div>
          <textarea data-ptext rows="3" maxlength="2000" placeholder="Fortalezas y debilidades" aria-label="${l}" ${dis}>${esc(v.text || '')}</textarea>
        </div>`; }).join('')}</div>`).join('');
  }

  // ---------------------------------------------------------------- 4 · individual
  function individualHTML() {
    const called = playerRows(players, m, total).filter((r) => r.called);
    const acts = [...INDIVIDUAL.attack.actions, ...INDIVIDUAL.defense.actions];
    return `
      ${Object.entries(INDIVIDUAL).map(([side, d]) => `
        <h3>${d.label}</h3><p class="hint">${esc(d.help)}</p>
        <div class="act-grid">${d.actions.map(([k, l]) => `<label class="act">${l}<textarea data-atext="${k}" rows="2" maxlength="1500" ${dis}>${esc(post.individual.texts[k] || '')}</textarea></label>`).join('')}</div>`).join('')}
      <h3>Notas por jugador (opcional, 1–5)</h3>
      ${called.length ? `<div class="per-scroll"><table class="post-table ind-table">
        <thead><tr><th class="lbl" scope="col">Jugador</th>${acts.map(([k, l], i) => `<th scope="col" class="${i === INDIVIDUAL.attack.actions.length ? 'sep' : ''}" title="${l}">${l.slice(0, 5)}</th>`).join('')}<th>Media</th></tr></thead>
        <tbody>${called.map((r) => { const sc = post.individual.scores[r.p.id] || {}; const vals = acts.map(([k]) => +sc[k]).filter(Boolean);
          return `<tr data-p="${esc(r.p.id)}"><th class="lbl" scope="row"><b>${r.p.number ?? '–'}</b> ${esc(r.p.name)}</th>
            ${acts.map(([k, l], i) => `<td class="${i === INDIVIDUAL.attack.actions.length ? 'sep' : ''}"><select data-isc="${k}" aria-label="${l} de ${esc(r.p.name)}" ${dis}><option value="">·</option>${[1, 2, 3, 4, 5].map((n) => `<option${+sc[k] === n ? ' selected' : ''}>${n}</option>`).join('')}</select></td>`).join('')}
            <td data-avg><b>${vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '—'}</b></td></tr>`; }).join('')}</tbody>
      </table></div>` : '<p class="muted">Haz la convocatoria para valorar a los jugadores.</p>'}`;
  }

  // ---------------------------------------------------------------- 5 · captación
  function scoutHTML() {
    return `
      ${post.scouting.length ? `<div class="scout-list">${post.scouting.map((s, i) => `
        <div class="scout" data-s="${i}">
          <input data-sk="number" type="number" min="0" max="99" value="${s.number ?? ''}" placeholder="Nº" aria-label="Dorsal" ${dis}>
          <input data-sk="name" value="${esc(s.name || '')}" maxlength="80" placeholder="Jugador" aria-label="Jugador" ${dis}>
          <select data-sk="position" aria-label="Posición" ${dis}><option value="">Posición</option>${POSITIONS.map(([k, l]) => `<option value="${k}"${s.position === k ? ' selected' : ''}>${l}</option>`).join('')}</select>
          <select data-sk="foot" aria-label="Pie" ${dis}><option value="">Pie</option>${FEET.map(([k, l]) => `<option value="${k}"${s.foot === k ? ' selected' : ''}>${l}</option>`).join('')}</select>
          <span class="scout-lv"><small>Nivel</small>${levelBtns(s.level, 'data-slevel')}</span>
          <textarea data-sk="notes" rows="2" maxlength="1000" placeholder="Observaciones" aria-label="Observaciones" ${dis}>${esc(s.notes || '')}</textarea>
          ${canEdit ? '<button class="icon-btn small" type="button" data-sdel aria-label="Quitar">✕</button>' : ''}
        </div>`).join('')}</div>` : '<p class="muted">Ningún jugador rival anotado.</p>'}
      ${canEdit ? '<button class="btn small mt" type="button" data-sadd>+ Jugador rival</button>' : ''}`;
  }


  // ---------------------------------------------------------------- impresión (hoja POSTPARTIDO)
  function printView() {
    const [home, away] = sides(m, team.name);
    const rows = playerRows(players, m, total);
    const called = rows.filter((r) => r.called);
    const acts = [...INDIVIDUAL.attack.actions, ...INDIVIDUAL.defense.actions];
    const anyScore = called.some((r) => Object.values(post.individual.scores[r.p.id] || {}).some(Boolean));
    const sum = (f) => rows.reduce((n, r) => n + f(r), 0);
    const posName = (k) => POSITIONS.find(([x]) => x === k)?.[1] || '';
    const footName = (k) => FEET.find(([x]) => x === k)?.[1] || '';
    const html = `
      ${printHead({ title: 'Informe postpartido', team, sub: `${m.matchday != null ? `Jornada ${m.matchday} · ` : ''}${m.date ? esc(fmt(new Date(m.date + 'T00:00:00'))) : ''} · ${esc(home)} <b>${esc(score(m)) || 'vs'}</b> ${esc(away)}${m.report_done ? ' · terminado' : ''}` })}
      ${bar('1–2. Convocatoria, goles y tarjetas', `${total} min`)}
      <table class="pr-t pr-stats">
        <thead>
          <tr><th rowspan="2">Jugador</th><th colspan="4">Convocatoria</th><th colspan="5">Goles a favor</th><th colspan="4">Goles en contra</th><th colspan="2">Tarjetas</th></tr>
          <tr><th>Disp.</th><th>Conv.</th><th>Tit.</th><th>Min</th>${ORIGINS.map((o) => `<th>${ORIGIN_SHORT[o]}</th>`).join('')}<th>Asis</th>${ORIGINS.map((o) => `<th>${ORIGIN_SHORT[o]}</th>`).join('')}<th>TA</th><th>TR</th></tr>
        </thead>
        <tbody>${rows.map((r) => `<tr${r.called ? '' : ' class="pr-muted"'}><td><b>${r.p.number ?? '–'}</b> ${esc(r.p.name)}</td>
          <td class="c">${r.available ? 'D' : 'No'}</td><td class="c">${r.called ? 'C' : 'No'}</td><td class="c">${r.called ? (r.starter ? 'T' : 'S') : ''}</td><td class="n">${r.called ? r.minutes : ''}</td>
          ${ORIGINS.map((o) => `<td class="n">${r.gf[o] || ''}</td>`).join('')}<td class="n">${r.assists || ''}</td>${ORIGINS.map((o) => `<td class="n">${r.gc[o] || ''}</td>`).join('')}<td class="n">${r.yellow || ''}</td><td class="n">${r.red || ''}</td></tr>`).join('')}</tbody>
        <tfoot><tr><th>Total</th><td class="n">${sum((r) => +r.available)}</td><td class="n">${sum((r) => +r.called)}</td><td class="n">${sum((r) => +(r.called && r.starter))}</td><td></td>
          ${ORIGINS.map((o) => `<td class="n">${sum((r) => r.gf[o])}</td>`).join('')}<td class="n">${sum((r) => r.assists)}</td>${ORIGINS.map(() => '<td></td>').join('')}<td class="n">${sum((r) => r.yellow)}</td><td class="n">${sum((r) => r.red)}</td></tr></tfoot>
      </table>
      ${bar('3. Evaluación colectiva')}
      ${Object.values(COLLECTIVE).map((d) => `<h3 class="pr-sub">${d.label}</h3><div class="pr-cols" style="--n:3">${d.phases.map(([k, l]) => { const v = post.collective[k] || {};
        return `<div class="pr-box"><h4>${l} ${v.score ? `<span class="pr-lv">${v.score}</span>` : ''}</h4><p>${txt(v.text)}</p></div>`; }).join('')}</div>`).join('')}
      ${bar('4. Evaluación individual')}
      ${Object.values(INDIVIDUAL).map((d) => `<h3 class="pr-sub">${d.label}</h3><div class="pr-cols" style="--n:2">${d.actions.filter(([k]) => post.individual.texts[k]).map(([k, l]) => `<div class="pr-box"><h4>${l}</h4><p>${txt(post.individual.texts[k])}</p></div>`).join('') || '<p class="pr-empty">—</p>'}</div>`).join('')}
      ${anyScore ? `<h3 class="pr-sub">Notas por jugador (1–5)</h3>
        <table class="pr-t pr-stats"><thead><tr><th>Jugador</th>${acts.map(([, l]) => `<th>${l.slice(0, 6)}</th>`).join('')}<th>Media</th></tr></thead>
        <tbody>${called.map((r) => { const sc = post.individual.scores[r.p.id] || {}; const vals = acts.map(([k]) => +sc[k]).filter(Boolean);
          return `<tr><td><b>${r.p.number ?? '–'}</b> ${esc(r.p.name)}</td>${acts.map(([k]) => `<td class="n">${sc[k] || ''}</td>`).join('')}<td class="n"><b>${vals.length ? (vals.reduce((x, y) => x + y, 0) / vals.length).toFixed(1) : ''}</b></td></tr>`; }).join('')}</tbody></table>` : ''}
      ${bar('5. Captación', `${post.scouting.length}`)}
      ${post.scouting.length ? `<table class="pr-t"><thead><tr><th>Nº</th><th>Jugador</th><th>Posición</th><th>Pie</th><th>Nivel</th><th>Observaciones</th></tr></thead>
        <tbody>${post.scouting.map((x) => `<tr><td class="n">${x.number ?? ''}</td><td>${esc(x.name || '')}</td><td>${esc(posName(x.position))}</td><td>${esc(footName(x.foot))}</td><td class="n">${x.level || ''}</td><td>${txt(x.notes)}</td></tr>`).join('')}</tbody></table>` : '<p class="pr-empty">Ningún jugador rival anotado.</p>'}`;
    return { title: `Informe J${m.matchday ?? ''} ${home} ${score(m)} ${away}`, html };
  }

  function draw() {
    const [home, away] = sides(m, team.name);
    el.innerHTML = `
      <div class="page-head">
        <div><p class="eyebrow">Informe postpartido · ${esc(team.name)}${team.category ? ' · ' + esc(team.category) : ''}</p>
          <h1 class="match-title"><span class="${m.is_home ? 'us' : ''}">${esc(home)}</span> <span class="vs">${esc(score(m)) || 'vs'}</span> <span class="${m.is_home ? '' : 'us'}">${esc(away)}</span></h1>
          <p>${m.matchday != null ? `Jornada ${m.matchday} · ` : ''}${m.date ? esc(fmt(new Date(m.date + 'T00:00:00'))) : 'Sin fecha'} · Duración ${total} min</p></div>
        <div class="actions no-print"><a class="btn" href="#/partidos">← Partidos</a><button class="btn" type="button" data-xlsx>Excel</button>${printButton()}</div>
      </div>
      <nav class="tabs page-tabs no-print" aria-label="Partido">
        <a class="tab" href="#/partidos/${esc(m.id)}/prepartido">Prepartido</a>
        <a class="tab" href="#/partidos/${esc(m.id)}/acta">Acta</a>
        <a class="tab" href="#/partidos/${esc(m.id)}/postpartido" aria-current="page">Informe</a>
      </nav>
      ${canEdit ? '' : permNote({ ok: false, reason: `Solo ver y comentar: el informe lo hace el cuerpo técnico de ${team.name}.` })}
      <div class="report-bar${m.report_done ? ' done' : ''}">
        <span>${m.report_done ? '✓ Informe terminado' : 'Informe en curso'}</span>
        ${canEdit ? `<button class="btn${m.report_done ? '' : ' primary'}" type="button" data-done>${m.report_done ? 'Reabrir el informe' : 'Marcar informe como terminado'}</button>` : ''}
      </div>
      ${m.goals_for == null ? `<p class="note">Este partido aún no tiene resultado. Los goles, tarjetas y minutos salen del <a href="#/partidos/${esc(m.id)}/acta">acta</a>.</p>` : ''}
      ${sec('jugadores', '1–2. Convocatoria, goles y tarjetas', playersHTML())}
      ${sec('colectiva', '3. Evaluación colectiva', collectiveHTML())}
      ${sec('individual', '4. Evaluación individual', individualHTML())}
      ${sec('captacion', '5. Captación', scoutHTML(), `<span class="count">${post.scouting.length}</span>`)}
      <div id="thread" class="no-print"></div>`;
    wire();
    mountThread(el.querySelector('#thread'), { teamId: team.id, entity: 'match', entityId: m.id, section: 'postpartido', title: 'Comentarios sobre el informe' });
  }
  const redraw = () => { const y = window.scrollY; draw(); window.scrollTo(0, y); };

  function wire() {
    el.querySelectorAll('details.ses-sec').forEach((d) => d.addEventListener('toggle', () => { if (d.open) open.add(d.dataset.sec); else open.delete(d.dataset.sec); }));
    wirePrint(el, () => printView());
    el.querySelector('[data-xlsx]').addEventListener('click', (ev) => busy(ev.currentTarget, () => exportBook(`Postpartido J${m.matchday ?? ''} ${team.name}`, [sheetPostpartido([m], team, players, total)])));
    if (!canEdit) return;
    el.querySelector('[data-done]').addEventListener('click', (ev) => busy(ev.currentTarget, async () => {
      await saver.flush();
      m.report_done = !m.report_done;
      saver.set({ report_done: m.report_done });
      await saver.flush();
      toast(m.report_done ? 'Informe marcado como terminado.' : 'Informe reabierto.');
      redraw();
    }));
    // Jugadores
    el.querySelectorAll('.post-table:not(.ind-table) tr[data-p]').forEach((tr) => {
      const id = tr.dataset.p;
      const o = () => (post.players[id] ||= {});
      const row = () => playerRows(players, m, total).find((r) => r.p.id === id);
      tr.querySelectorAll('[data-yn]').forEach((b) => b.addEventListener('click', () => { const k = b.dataset.yn; o()[k] = !row()[k]; if (k === 'called' && !o()[k]) o().starter = false; save(); redraw(); }));
      tr.querySelector('[data-min]').addEventListener('change', (ev) => { o().minutes = Math.max(0, +ev.target.value || 0); save(); redraw(); });
      tr.querySelectorAll('[data-gc]').forEach((inp) => inp.addEventListener('change', () => { o().gc = { ...(o().gc || {}), [inp.dataset.gc]: Math.max(0, +inp.value || 0) }; save(); redraw(); }));
    });
    el.querySelector('[data-recalc]')?.addEventListener('click', () => { post.players = {}; save(); redraw(); toast('Recalculado desde la plantilla, el prepartido y el acta.'); });
    // Colectiva
    el.querySelectorAll('[data-ph]').forEach((box) => {
      const k = box.dataset.ph;
      box.querySelectorAll('[data-score]').forEach((b) => b.addEventListener('click', () => {
        const v = +b.dataset.v; const cur = post.collective[k] || {};
        post.collective[k] = { ...cur, score: cur.score === v ? null : v };
        box.querySelectorAll('[data-score]').forEach((x) => { const on = +x.dataset.v === post.collective[k].score; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
        save();
      }));
      box.querySelector('[data-ptext]').addEventListener('input', (ev) => { post.collective[k] = { ...(post.collective[k] || {}), text: ev.target.value }; save(); });
    });
    // Individual
    el.querySelectorAll('[data-atext]').forEach((ta) => ta.addEventListener('input', () => { post.individual.texts[ta.dataset.atext] = ta.value; save(); }));
    el.querySelectorAll('.ind-table tr[data-p]').forEach((tr) => {
      const id = tr.dataset.p;
      tr.querySelectorAll('[data-isc]').forEach((sel) => sel.addEventListener('change', () => {
        const sc = post.individual.scores[id] ||= {};
        if (sel.value) sc[sel.dataset.isc] = +sel.value; else delete sc[sel.dataset.isc];
        const vals = Object.values(sc).filter(Boolean);
        tr.querySelector('[data-avg]').innerHTML = `<b>${vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '—'}</b>`;
        save();
      }));
    });
    // Captación
    el.querySelectorAll('[data-s]').forEach((box) => {
      const s = post.scouting[+box.dataset.s];
      box.querySelectorAll('[data-sk]').forEach((inp) => inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', () => {
        s[inp.dataset.sk] = inp.dataset.sk === 'number' ? (inp.value === '' ? null : +inp.value) : inp.value; save();
      }));
      box.querySelectorAll('[data-slevel]').forEach((b) => b.addEventListener('click', () => {
        const v = +b.dataset.v; s.level = s.level === v ? null : v;
        box.querySelectorAll('[data-slevel]').forEach((x) => { const on = +x.dataset.v === s.level; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
        save();
      }));
      box.querySelector('[data-sdel]')?.addEventListener('click', () => { post.scouting.splice(+box.dataset.s, 1); save(); redraw(); });
    });
    el.querySelector('[data-sadd]')?.addEventListener('click', () => {
      post.scouting.push({ number: null, name: '', position: '', foot: '', level: null, notes: '' }); save(); open.add('captacion'); redraw();
      el.querySelector('.scout:last-child [data-sk=name]')?.focus();
    });
  }

  draw();
}
