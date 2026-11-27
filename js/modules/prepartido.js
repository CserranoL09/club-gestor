// Prepartido (#/partidos/:id/prepartido), hoja PREPARTIDO: datos, convocatoria con titulares,
// sistema en un mini-campo (fichas que se arrastran), planteamiento y balón parado.
import { esc, toast, busy, ask, permNote } from '../ui.js';
import { sb } from '../supabase.js';
import { S, canMatchTeam } from '../session.js';
import { autosaver } from '../store.js';
import { fmt } from '../lib/dates.js';
import { mountThread } from '../lib/comments.js';
import { STATUS, POSITIONS } from '../lib/players.js';
import { printButton, wirePrint, printHead, bar, txt } from '../lib/print.js';
import { sheetPrepartido } from '../lib/excelbook.js';
import { exportBook } from '../lib/xlsx.js';
import { SYSTEMS, starters, squadMax, sides, score } from '../lib/matches.js';

const POS_ORDER = { POR: 0, DEF: 1, LAT: 2, MC: 3, EXT: 4, DEL: 5 };

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
  const byId = new Map(players.map((p) => [p.id, p]));
  const modality = team.modality === 'f7' ? 'f7' : 'f11';
  const nStart = starters(modality);
  const max = squadMax(team);
  const systems = SYSTEMS[modality];
  m.squad = (m.squad || []).filter((s) => s.called !== false && byId.has(s.player_id));
  m.plan ||= {};
  m.positions ||= {};
  if (!systems[m.system]) m.system = Object.keys(systems)[0];

  const saveSquad = () => saver?.set({ squad: m.squad.map((s) => ({ player_id: s.player_id, called: true, starter: !!s.starter, number: byId.get(s.player_id)?.number ?? null, name: byId.get(s.player_id)?.name || '' })) });
  const nStarters = () => m.squad.filter((s) => s.starter).length;

  /** Posición de cada titular: la guardada o la del sistema (portero primero). */
  function layout() {
    const slots = systems[m.system];
    const st = m.squad.filter((s) => s.starter).map((s) => byId.get(s.player_id));
    const gk = st.find((p) => p.position === 'POR');
    const ordered = gk ? [gk, ...st.filter((p) => p !== gk)] : st;
    return ordered.map((p, i) => ({ p, ...(m.positions[p.id] || { x: (slots[i] || [50, 50])[0], y: (slots[i] || [50, 50])[1] }) }));
  }

  // ---------------------------------------------------------------- pintar
  function header() {
    const [home, away] = sides(m, team.name);
    return `
      <div class="page-head">
        <div><p class="eyebrow">${m.matchday != null ? `Jornada ${m.matchday} · ` : ''}${m.date ? esc(fmt(new Date(m.date + 'T00:00:00'))) : 'Sin fecha'}${m.time ? ` · ${esc(m.time.slice(0, 5))}` : ''}</p>
          <h1 class="match-title"><span class="${m.is_home ? 'us' : ''}">${esc(home)}</span> <span class="vs">${esc(score(m)) || 'vs'}</span> <span class="${m.is_home ? '' : 'us'}">${esc(away)}</span></h1></div>
        <div class="actions no-print"><a class="btn" href="#/partidos">← Partidos</a><button class="btn" type="button" data-xlsx>Excel</button>${printButton([['list', 'Convocatoria'], ['system', 'Convocatoria con el sistema'], ['full', 'Prepartido completo (cuerpo técnico)']])}</div>
      </div>
      <nav class="tabs page-tabs no-print" aria-label="Partido">
        <a class="tab" href="#/partidos/${esc(m.id)}/prepartido" aria-current="page">Prepartido</a>
        <a class="tab" href="#/partidos/${esc(m.id)}/acta">Acta</a>
        <a class="tab" href="#/partidos/${esc(m.id)}/postpartido">Informe</a>
      </nav>`;
  }

  function datosHTML() {
    const [home, away] = sides(m, team.name);
    return `
      <section class="card">
        <h2>Datos</h2>
        <div class="ses-grid">
          <div><label for="pp_j">Jornada</label><input id="pp_j" data-f="matchday" type="number" min="0" max="99" value="${m.matchday ?? ''}" ${dis}></div>
          <div><label for="pp_date">Fecha</label><input id="pp_date" data-f="date" type="date" value="${esc(m.date || '')}" ${dis}></div>
          <div><label for="pp_time">Hora</label><input id="pp_time" data-f="time" type="time" value="${esc((m.time || '').slice(0, 5))}" ${dis}></div>
          <div><label for="pp_call">Citación</label><input id="pp_call" data-f="call_time" type="time" value="${esc((m.call_time || '').slice(0, 5))}" ${dis}></div>
          <div class="span2"><label for="pp_venue">Lugar</label><input id="pp_venue" data-f="venue" value="${esc(m.venue)}" maxlength="120" ${dis}></div>
          <div><label for="pp_rival">Rival</label><input id="pp_rival" data-f="rival" value="${esc(m.rival)}" maxlength="80" ${dis}></div>
          <div><label for="pp_home">Jugamos</label><select id="pp_home" data-f="is_home" ${dis}><option value="true"${m.is_home ? ' selected' : ''}>En casa</option><option value="false"${m.is_home ? '' : ' selected'}>Fuera</option></select></div>
        </div>
        <p class="sides-line">Local: <strong data-home>${esc(home)}</strong> · Visitante: <strong data-away>${esc(away)}</strong></p>
      </section>`;
  }

  function squadHTML() {
    const called = new Set(m.squad.map((s) => s.player_id));
    const free = players.filter((p) => p.active && !called.has(p.id)).sort((a, b) => (POS_ORDER[a.position] ?? 9) - (POS_ORDER[b.position] ?? 9) || (a.number ?? 99) - (b.number ?? 99));
    const n = m.squad.length, ns = nStarters();
    const injured = m.squad.filter((s) => byId.get(s.player_id)?.status !== 'D');
    return `
      <section class="card squad-sec">
        <div class="section-head"><h2>Convocatoria</h2>
          ${canEdit ? `<div class="actions"><button class="btn small" type="button" data-prev>Copiar del partido anterior</button><button class="btn small" type="button" data-allfree${free.some((p) => p.status === 'D') && n < max ? '' : ' disabled'}>Convocar disponibles</button></div>` : ''}</div>
        <p class="squad-count"><span class="${n > max ? 'warn-text' : ''}"><strong data-n>${n}</strong> / ${max} convocados</span>
          <span class="${ns !== nStart ? 'warn-text' : 'ok-text'}"><strong>${ns}</strong> / ${nStart} titulares${ns !== nStart ? (ns < nStart ? ` · faltan ${nStart - ns}` : ` · sobran ${ns - nStart}`) : ' ✓'}</span></p>
        ${injured.length ? `<p class="note">⚠ Convocados no disponibles: ${injured.map((s) => { const p = byId.get(s.player_id); return `${esc(p.name)} (${STATUS[p.status][0].toLowerCase()})`; }).join(', ')}.</p>` : ''}
        <div class="squad-cols">
          <div>
            <h3>Convocados</h3>
            ${n ? `<ol class="called">${m.squad.map((s, i) => { const p = byId.get(s.player_id); return `
              <li data-p="${esc(p.id)}" class="${s.starter ? 'starter' : ''}">
                <span class="dorsal">${p.number ?? '–'}</span>
                <span class="nm">${esc(p.name)} ${p.position ? `<small>${esc(p.position)}</small>` : ''}${p.status !== 'D' ? ` <span class="pill ${STATUS[p.status][1]}">${STATUS[p.status][0]}</span>` : ''}</span>
                <label class="check st"><input type="checkbox" data-starter${s.starter ? ' checked' : ''} ${dis}> Titular</label>
                ${canEdit ? `<span class="arrows"><button class="icon-btn small" type="button" data-up aria-label="Subir"${i ? '' : ' disabled'}>↑</button><button class="icon-btn small" type="button" data-out aria-label="Quitar de la convocatoria">✕</button></span>` : ''}
              </li>`; }).join('')}</ol>` : '<p class="muted">Nadie convocado todavía.</p>'}
          </div>
          ${canEdit ? `<div class="no-print">
            <h3>Plantilla</h3>
            ${free.length ? `<ul class="free">${free.map((p) => `
              <li data-p="${esc(p.id)}"><span class="dorsal">${p.number ?? '–'}</span><span class="nm">${esc(p.name)} ${p.position ? `<small>${esc(p.position)}</small>` : ''}${p.status !== 'D' ? ` <span class="pill ${STATUS[p.status][1]}">${STATUS[p.status][0]}</span>` : ''}</span>
              <button class="btn small" type="button" data-in${n >= max ? ' disabled title="Convocatoria completa"' : ''}>Convocar</button></li>`).join('')}</ul>` : '<p class="muted">Toda la plantilla activa está convocada.</p>'}
          </div>` : ''}
        </div>
      </section>`;
  }

  function fieldHTML() {
    const pos = layout();
    const W = 100, H = 140;
    // Nombre corto de cada ficha: el nombre de pila o, si se repite, el nombre completo recortado.
    const firsts = pos.map((t) => t.p.name.split(' ')[0]);
    const short = (p) => { const f = p.name.split(' ')[0]; return (firsts.filter((x) => x === f).length > 1 ? p.name : f).slice(0, 12); };
    return `
      <section class="card system-sec">
        <div class="section-head"><h2>Sistema</h2>
          <div class="actions"><label class="sr-only" for="pp_sys">Sistema</label><select id="pp_sys" data-sys ${dis}>${Object.keys(systems).map((k) => `<option${k === m.system ? ' selected' : ''}>${k}</option>`).join('')}</select>
          ${canEdit ? '<button class="btn small" type="button" data-reset>Recolocar</button>' : ''}</div></div>
        ${pos.length ? '' : `<p class="muted">Marca los titulares en la convocatoria para colocarlos en el campo.</p>`}
        <svg class="pitch" viewBox="0 0 ${W} ${H}" role="img" aria-label="Alineación en ${esc(m.system)}">
          <rect x="1" y="1" width="98" height="138" rx="2" class="grass"/>
          <line x1="1" y1="70" x2="99" y2="70"/><circle cx="50" cy="70" r="10"/>
          <rect x="22" y="1" width="56" height="20"/><rect x="36" y="1" width="28" height="7"/>
          <rect x="22" y="119" width="56" height="20"/><rect x="36" y="132" width="28" height="7"/>
          ${pos.map((t) => `<g class="tok${t.p.position === 'POR' ? ' gk' : ''}" data-p="${esc(t.p.id)}" transform="translate(${t.x} ${t.y * 1.4})" tabindex="${canEdit ? 0 : -1}" aria-label="${esc(t.p.name)}">
            <circle r="5.2"/><text class="num" dy="1.8">${t.p.number ?? ''}</text><text class="nm" dy="10">${esc(short(t.p))}</text></g>`).join('')}
        </svg>
        ${canEdit && pos.length ? '<p class="hint">Arrastra las fichas con el ratón o con el dedo.</p>' : ''}
      </section>`;
  }

  function planHTML() {
    const ta = (id, k, label, val) => `<div><label for="${id}">${label}</label><textarea id="${id}" ${k} rows="3" maxlength="2000" ${dis}>${esc(val || '')}</textarea></div>`;
    return `
      <section class="card">
        <h2>Planteamiento</h2>
        <div class="ses-grid three">${ta('pl_att', 'data-plan="attack"', 'Ataque', m.plan.attack)}${ta('pl_def', 'data-plan="defense"', 'Defensa', m.plan.defense)}${ta('pl_riv', 'data-plan="rival"', 'Rival', m.plan.rival)}</div>
        <h2 class="mt">Balón parado y observaciones</h2>
        <div class="ses-grid three">${ta('pl_abpf', 'data-g="abp_for"', 'ABP a favor', m.abp_for)}${ta('pl_abpc', 'data-g="abp_against"', 'ABP en contra', m.abp_against)}${ta('pl_obs', 'data-g="pre_notes"', 'Observaciones', m.pre_notes)}</div>
      </section>`;
  }


  // ---------------------------------------------------------------- impresión: convocatoria para el vestuario
  function pitchSVG() {
    const pos = layout();
    const firsts = pos.map((t) => t.p.name.split(' ')[0]);
    const short = (p) => { const f = p.name.split(' ')[0]; return (firsts.filter((x) => x === f).length > 1 ? p.name : f).slice(0, 14); };
    return `<svg class="pr-pitch" viewBox="0 0 100 140" role="img" aria-label="Sistema ${esc(m.system)}">
      <g fill="none" stroke="#2f7d4a" stroke-width=".6"><rect x="1" y="1" width="98" height="138" rx="2" fill="#eef7f0"/>
      <line x1="1" y1="70" x2="99" y2="70"/><circle cx="50" cy="70" r="10"/>
      <rect x="22" y="1" width="56" height="20"/><rect x="36" y="1" width="28" height="7"/><rect x="22" y="119" width="56" height="20"/><rect x="36" y="132" width="28" height="7"/></g>
      ${pos.map((t) => `<g transform="translate(${t.x} ${t.y * 1.4})"><circle r="5.4" fill="${t.p.position === 'POR' ? '#f2a600' : 'var(--accent)'}" stroke="#fff" stroke-width=".8"/>
        <text text-anchor="middle" dy="1.9" font-size="5.2" font-weight="800" fill="${t.p.position === 'POR' ? '#111' : 'var(--accent-ink)'}">${t.p.number ?? ''}</text>
        <text text-anchor="middle" dy="10.5" font-size="3.9" font-weight="700" fill="#111">${esc(short(t.p))}</text></g>`).join('')}
    </svg>`;
  }
  function wireXlsx(root) {
    root.querySelector('[data-xlsx]').addEventListener('click', (ev) => busy(ev.currentTarget, () => exportBook(`Prepartido J${m.matchday ?? ''} ${team.name}`, [sheetPrepartido([m], team, players)])));
  }
  function printView(opt) {
    const [home, away] = sides(m, team.name);
    const withSystem = opt === 'system' || opt === 'full';
    const list = m.squad.map((s) => ({ s, p: byId.get(s.player_id) })).filter((x) => x.p);
    const rows = (arr) => arr.map(({ s, p }) => `<tr><td class="dorsal">${p.number ?? '–'}</td><td>${esc(p.name)}</td><td>${esc(POSITIONS.find(([k]) => k === p.position)?.[1] || '')}</td>${withSystem ? `<td class="c">${s.starter ? 'Titular' : ''}</td>` : ''}</tr>`).join('');
    const ordered = withSystem ? [...list.filter((x) => x.s.starter), ...list.filter((x) => !x.s.starter)] : list;
    const date = m.date ? fmt(new Date(m.date + 'T00:00:00')) : '';
    const html = `
      ${printHead({ title: opt === 'full' ? 'Prepartido' : 'Convocatoria', team, sub: `${m.matchday != null ? `Jornada ${m.matchday} · ` : ''}${esc(date)}` })}
      <p class="pr-match">${esc(home)}<span class="vs">vs</span>${esc(away)}</p>
      <div class="pr-call">
        <div class="big"><small>Citación</small><strong>${esc((m.call_time || '').slice(0, 5)) || '—'}</strong></div>
        <div><small>Partido</small><strong>${esc(date) || '—'}${m.time ? ' · ' + esc(m.time.slice(0, 5)) : ''}</strong></div>
        <div><small>Lugar</small><strong>${esc(m.venue || (m.is_home ? 'En casa' : 'Fuera'))}</strong></div>
      </div>
      ${bar('Convocados', `${list.length} jugadores${withSystem ? ` · sistema ${esc(m.system)}` : ''}`)}
      <div class="pr-callgrid${withSystem && list.some((x) => x.s.starter) ? '' : ' solo'}">
        <table class="pr-t pr-list"><thead><tr><th>Nº</th><th>Jugador</th><th>Posición</th>${withSystem ? '<th></th>' : ''}</tr></thead><tbody>${rows(ordered) || '<tr><td colspan="4" class="pr-empty">Nadie convocado todavía.</td></tr>'}</tbody></table>
        ${withSystem && list.some((x) => x.s.starter) ? `<div>${pitchSVG()}</div>` : ''}
      </div>
      ${opt === 'full' ? `
        ${bar('Planteamiento')}
        <div class="pr-cols" style="--n:3">${[['Ataque', m.plan.attack], ['Defensa', m.plan.defense], ['Rival', m.plan.rival]].map(([l, v]) => `<div class="pr-box"><h4>${l}</h4><p>${txt(v)}</p></div>`).join('')}</div>
        ${bar('Balón parado y observaciones')}
        <div class="pr-cols" style="--n:3">${[['ABP a favor', m.abp_for], ['ABP en contra', m.abp_against], ['Observaciones', m.pre_notes]].map(([l, v]) => `<div class="pr-box"><h4>${l}</h4><p>${txt(v)}</p></div>`).join('')}</div>` : ''}`;
    return { title: `Convocatoria J${m.matchday ?? ''} ${home} - ${away}`, html };
  }

  function draw() {
    el.innerHTML = `${header()}
      ${canEdit ? '' : permNote({ ok: false, reason: `Solo ver y comentar: el prepartido lo prepara el cuerpo técnico de ${team.name}.` })}
      ${datosHTML()}
      <div class="pre-grid">${squadHTML()}${fieldHTML()}</div>
      ${planHTML()}
      <div id="thread" class="no-print"></div>`;
    wire();
    mountThread(el.querySelector('#thread'), { teamId: team.id, entity: 'match', entityId: m.id, title: 'Comentarios sobre el partido' });
  }
  const redraw = () => { const y = window.scrollY; draw(); window.scrollTo(0, y); };

  // ---------------------------------------------------------------- eventos
  function wire() {
    wirePrint(el, (opt) => printView(opt));
    wireXlsx(el);
    if (!canEdit) return;
    el.querySelectorAll('[data-f]').forEach((inp) => inp.addEventListener('change', () => {
      const k = inp.dataset.f;
      let v = inp.value;
      if (k === 'matchday') v = v === '' ? null : +v;
      if (k === 'time' || k === 'call_time' || k === 'date') v = v || null;
      if (k === 'is_home') v = v === 'true';
      if (k === 'rival' || k === 'venue') v = v.trim();
      m[k] = v;
      saver.set({ [k]: v });
      if (['is_home', 'rival', 'date', 'time', 'matchday'].includes(k)) {
        const tmp = document.createElement('div');
        tmp.innerHTML = header();
        el.querySelector('.page-head').replaceWith(tmp.querySelector('.page-head'));
        const [h, a] = sides(m, team.name);
        el.querySelector('[data-home]').textContent = h; el.querySelector('[data-away]').textContent = a;
        wirePrint(el.querySelector('.page-head'), (opt) => printView(opt));
        wireXlsx(el.querySelector('.page-head'));
      }
    }));
    el.querySelectorAll('[data-plan]').forEach((ta) => ta.addEventListener('input', () => { m.plan = { ...m.plan, [ta.dataset.plan]: ta.value }; saver.set({ plan: m.plan }); }));
    el.querySelectorAll('textarea[data-g]').forEach((ta) => ta.addEventListener('input', () => { m[ta.dataset.g] = ta.value; saver.set({ [ta.dataset.g]: ta.value }); }));

    // Convocatoria
    el.querySelectorAll('.free [data-in]').forEach((b) => b.addEventListener('click', () => {
      if (m.squad.length >= max) { toast(`La convocatoria ya tiene ${max} jugadores.`, 'err'); return; }
      const p = byId.get(b.closest('[data-p]').dataset.p);
      m.squad.push({ player_id: p.id, starter: false });
      if (p.status !== 'D') toast(`${p.name} está ${STATUS[p.status][0].toLowerCase()}.`, 'err');
      saveSquad(); redraw();
    }));
    el.querySelector('[data-allfree]')?.addEventListener('click', () => {
      const called = new Set(m.squad.map((s) => s.player_id));
      for (const p of players.filter((x) => x.active && x.status === 'D' && !called.has(x.id))) { if (m.squad.length >= max) break; m.squad.push({ player_id: p.id, starter: false }); }
      saveSquad(); redraw();
    });
    el.querySelectorAll('.called [data-p]').forEach((li) => {
      const id = li.dataset.p;
      const s = m.squad.find((x) => x.player_id === id);
      li.querySelector('[data-starter]').addEventListener('change', (ev) => {
        if (ev.target.checked && nStarters() >= nStart) toast(`Ya hay ${nStart} titulares; revisa la alineación.`, 'err');
        s.starter = ev.target.checked;
        if (!s.starter) delete m.positions[id];
        saveSquad(); saver.set({ positions: m.positions }); redraw();
      });
      li.querySelector('[data-up]')?.addEventListener('click', () => { const i = m.squad.indexOf(s); [m.squad[i - 1], m.squad[i]] = [m.squad[i], m.squad[i - 1]]; saveSquad(); redraw(); });
      li.querySelector('[data-out]')?.addEventListener('click', () => { m.squad = m.squad.filter((x) => x !== s); delete m.positions[id]; saveSquad(); saver.set({ positions: m.positions }); redraw(); });
    });
    el.querySelector('[data-prev]')?.addEventListener('click', (ev) => busy(ev.currentTarget, async () => {
      let q = client.from('matches').select('id, rival, date, squad, system, positions').eq('team_id', team.id).neq('id', m.id).order('date', { ascending: false }).limit(20);
      if (m.date) q = q.lt('date', m.date);
      const { data: prev, error: e } = await q;
      if (e) throw e;
      const p0 = (prev || []).find((x) => (x.squad || []).some((y) => y.called !== false));
      if (!p0) { toast('No hay un partido anterior con convocatoria.', 'err'); return; }
      if (m.squad.length && !(await ask(`Se sustituye la convocatoria y el sistema por los del partido contra ${p0.rival || 'el rival'}.`, { title: '¿Copiar del partido anterior?', yes: 'Copiar' }))) return;
      const ok = (x) => byId.get(x.player_id)?.active;
      m.squad = (p0.squad || []).filter((x) => x.called !== false && ok(x)).slice(0, max).map((x) => ({ player_id: x.player_id, starter: !!x.starter }));
      if (systems[p0.system]) m.system = p0.system;
      m.positions = Object.fromEntries(Object.entries(p0.positions || {}).filter(([k]) => m.squad.some((x) => x.player_id === k && x.starter)));
      saveSquad(); saver.set({ system: m.system, positions: m.positions });
      const lost = (p0.squad || []).filter((x) => x.called !== false && !ok(x)).length;
      toast(`Copiada la convocatoria del partido contra ${p0.rival || 'el rival'}${lost ? ` (${lost} jugador${lost === 1 ? '' : 'es'} ya no están en la plantilla)` : ''}.`);
      redraw();
    }));

    // Sistema y fichas
    el.querySelector('[data-sys]').addEventListener('change', (ev) => { m.system = ev.target.value; m.positions = {}; saver.set({ system: m.system, positions: {} }); redraw(); });
    el.querySelector('[data-reset]')?.addEventListener('click', () => { m.positions = {}; saver.set({ positions: {} }); redraw(); });
    const svg = el.querySelector('.pitch');
    let drag = null;
    const pt = (ev) => { const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); };
    svg.querySelectorAll('.tok').forEach((g) => {
      g.addEventListener('pointerdown', (ev) => { ev.preventDefault(); g.setPointerCapture(ev.pointerId); drag = { g, id: g.dataset.p }; g.classList.add('drag'); });
      g.addEventListener('pointermove', (ev) => {
        if (!drag || drag.g !== g) return;
        const p = pt(ev);
        const x = Math.max(4, Math.min(96, p.x)), y = Math.max(4, Math.min(136, p.y));
        g.setAttribute('transform', `translate(${x} ${y})`);
        drag.x = x; drag.y = y / 1.4;
      });
      const up = () => {
        if (!drag || drag.g !== g) return;
        g.classList.remove('drag');
        if (drag.x != null) {
          // Al mover una ficha se fijan las de todos los titulares (para que no salten).
          for (const t of layout()) m.positions[t.p.id] ||= { x: t.x, y: t.y };
          m.positions[drag.id] = { x: Math.round(drag.x * 10) / 10, y: Math.round(drag.y * 10) / 10 };
          saver.set({ positions: { ...m.positions } });
        }
        drag = null;
      };
      g.addEventListener('pointerup', up);
      g.addEventListener('pointercancel', up);
    });
  }

  draw();
}
