// Acta del partido (#/partidos/:id/acta), hoja PARTIDO. Pensada para el banquillo (móvil o tableta):
// cronómetro por partes, botones grandes de evento, lista de eventos, tabla de convocados calculada sola,
// contadores rápidos, anotaciones y observaciones. Sin conexión, los cambios esperan en la cola local.
import { esc, toast, ask, permNote } from '../ui.js';
import { sb } from '../supabase.js';
import { S, canMatchTeam } from '../session.js';
import { autosaver } from '../store.js';
import { fmt } from '../lib/dates.js';
import { mountThread } from '../lib/comments.js';
import { sides } from '../lib/matches.js';
import { printButton, wirePrint, printHead, kv, bar, txt } from '../lib/print.js';
import { EVENT_TYPES, ORIGINS, DEFAULT_COUNTERS, STAT_FIELDS, sortEvents, scoreOf, computeStats, onField, clockMinute } from '../lib/acta.js';

const CLOCK_KEY = (id) => `clubgestor:clock:${id}`;
const load = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const keep = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };
let tick = null;
let wake = null;

export async function render(el, ctx) {
  const client = sb();
  const { data: m, error } = await client.from('matches').select('*').eq('id', ctx.params.id).maybeSingle();
  if (error) throw error;
  if (!m) { el.innerHTML = '<div class="card empty"><div class="big">🔍</div><h2>Partido no encontrado</h2><p><a href="#/partidos">Volver a los partidos</a></p></div>'; return; }
  const team = S.teams.find((t) => t.id === m.team_id) || S.team;
  const canEdit = canMatchTeam(team.id);
  const dis = canEdit ? '' : 'disabled';
  const saver = canEdit ? autosaver({ table: 'matches', id: m.id, updatedAt: m.updated_at, onSaved: (r) => { m.updated_at = r.updated_at; } }) : null;
  const { data: pl } = await client.from('players').select('id, number, name, position, active').eq('team_id', team.id).order('number', { nullsFirst: false });
  const players = pl || [];
  const byId = new Map(players.map((p) => [p.id, p]));
  const periods = team.periods || 2, perMin = team.period_minutes || (team.modality === 'f7' ? 30 : 45);
  const total = periods * perMin;
  // Convocados del prepartido; si no hay convocatoria, toda la plantilla activa (sin titulares).
  let squad = (m.squad || []).filter((s) => s.called !== false && byId.has(s.player_id));
  const noSquad = !squad.length;
  if (noSquad) squad = players.filter((p) => p.active).map((p) => ({ player_id: p.id, starter: false }));
  m.events = (m.events || []).map((e, i) => ({ id: e.id || crypto.randomUUID().slice(0, 8), seq: e.seq ?? i, ...e }));
  m.counters = m.counters?.items ? m.counters : { items: DEFAULT_COUNTERS.map((name) => ({ name, value: 0 })) };
  let stats = computeStats(m.events, squad, total, m.player_stats);
  const name = (id) => { const p = byId.get(id); return p ? `${p.number != null ? p.number + '. ' : ''}${p.name}` : '—'; };

  // ---------------------------------------------------------------- cronómetro (en este dispositivo)
  const clock = load(CLOCK_KEY(m.id)) || { period: 1, running: false, base: 0, since: 0 };
  const secs = () => clock.base + (clock.running ? (Date.now() - clock.since) / 1000 : 0);
  const saveClock = () => keep(CLOCK_KEY(m.id), clock);
  const nowMinute = () => (clock.running || clock.base ? Math.min(total, clockMinute(clock.period, secs(), perMin)) : null);
  const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  async function keepAwake(on) {
    try {
      if (on && 'wakeLock' in navigator && !wake && document.visibilityState === 'visible') {
        wake = await navigator.wakeLock.request('screen');
        wake.addEventListener('release', () => { wake = null; });
      } else if (!on && wake) { await wake.release(); wake = null; }
    } catch { /* el navegador no lo permite */ }
  }

  function persist() {
    stats = computeStats(m.events, squad, total, m.player_stats);
    const sc = scoreOf(m.events);
    m.goals_for = sc.for; m.goals_against = sc.against;
    m.player_stats = stats;
    saver?.set({ events: m.events.map(({ id, seq, type, minute, player_id, assist_id, player_out_id, origin, note }) => ({ id, seq, type, minute, player_id, assist_id, player_out_id, origin, note })),
      goals_for: sc.for, goals_against: sc.against, player_stats: stats });
  }

  // ---------------------------------------------------------------- pintar
  function scoreHTML() {
    const sc = scoreOf(m.events);
    const [home, away] = sides(m, team.name);
    const [h, a] = m.is_home ? [sc.for, sc.against] : [sc.against, sc.for];
    return `<div class="sb-teams"><span class="${m.is_home ? 'us' : ''}">${esc(home)}</span><strong class="sb-score" data-score>${h} – ${a}</strong><span class="${m.is_home ? '' : 'us'}">${esc(away)}</span></div>`;
  }
  function clockHTML() {
    return `<div class="sb-clock">
      <span class="sb-period">Parte ${clock.period}/${periods}</span>
      <strong class="sb-time" data-time>${mmss(secs())}</strong>
      <span class="sb-min">min <strong data-min>${nowMinute() ?? '—'}</strong></span>
      ${canEdit ? `<span class="sb-btns">
        <button class="btn small${clock.running ? '' : ' primary'}" type="button" data-run>${clock.running ? 'Pausa' : secs() ? 'Seguir' : 'Iniciar'}</button>
        <button class="btn small" type="button" data-next${clock.period >= periods ? ' disabled' : ''}>Parte ${Math.min(periods, clock.period + 1)}</button>
        <button class="btn small" type="button" data-adj>Ajustar</button>
      </span>` : ''}
    </div>`;
  }

  function eventsHTML() {
    const list = sortEvents(m.events);
    return list.length ? `<ul class="ev-list">${list.map((e) => { const t = EVENT_TYPES[e.type];
      const who = e.type === 'sub' ? `${esc(name(e.player_id))} <small>entra por</small> ${esc(name(e.player_out_id))}`
        : e.type === 'goal_against' ? 'Rival' : esc(name(e.player_id));
      return `<li class="${t.cls}" data-e="${esc(e.id)}">
        <span class="ev-min">${e.minute != null ? e.minute + '′' : '—'}</span>
        <span class="ev-ico" aria-hidden="true">${t.icon}</span>
        <span class="ev-txt"><strong>${t.label}</strong> · ${who}${e.type === 'goal' && e.assist_id ? ` <small>(asist. ${esc(name(e.assist_id))})</small>` : ''}
          ${e.origin ? `<span class="pill">${esc(e.origin)}</span>` : ''}${e.note ? `<br><small class="muted">${esc(e.note)}</small>` : ''}</span>
        ${canEdit ? `<span class="ev-acts"><button class="icon-btn small" type="button" data-edit aria-label="Editar el evento">✎</button><button class="icon-btn small" type="button" data-rm aria-label="Borrar el evento">✕</button></span>` : ''}
      </li>`; }).join('')}</ul>` : '<p class="muted">Sin eventos todavía.</p>';
  }

  function tableHTML() {
    const tot = { goals: 0, assists: 0, yellow: 0, red: 0, minutes: 0 };
    return `
      ${noSquad ? `<p class="note">No hay convocatoria: se muestra toda la plantilla y nadie suma minutos como titular. <a href="#/partidos/${esc(m.id)}/prepartido">Hacer la convocatoria</a></p>` : ''}
      <div class="table-scroll"><table class="acta-table">
        <thead><tr><th scope="col">Nº</th><th scope="col">Jugador</th>${STAT_FIELDS.map(([, l]) => `<th scope="col">${l}</th>`).join('')}</tr></thead>
        <tbody>${squad.map((s) => { const p = byId.get(s.player_id); const st = stats[s.player_id] || {};
          for (const [k] of STAT_FIELDS) tot[k] += st[k] || 0;
          return `<tr data-p="${esc(p.id)}" class="${s.starter ? 'starter' : ''}">
            <td>${p.number ?? ''}</td><th scope="row">${esc(p.name)}${s.starter ? ' <small>T</small>' : ''}</th>
            ${STAT_FIELDS.map(([k, l]) => `<td class="${st.manual?.[k] ? 'manual' : ''}"><input type="number" min="0" max="${k === 'minutes' ? total + 30 : 20}" data-k="${k}" value="${st[k] ?? 0}" aria-label="${l} de ${esc(p.name)}${st.manual?.[k] ? ' (manual)' : ''}" ${dis}>${st.manual?.[k] && canEdit ? `<button type="button" class="reset" data-auto="${k}" title="Volver al cálculo automático" aria-label="Volver al cálculo automático">↺</button>` : ''}</td>`).join('')}
          </tr>`; }).join('')}</tbody>
        <tfoot><tr><td></td><th scope="row">Total</th>${STAT_FIELDS.map(([k]) => `<td>${k === 'minutes' ? '' : tot[k]}</td>`).join('')}</tr></tfoot>
      </table></div>
      <p class="hint">Se calcula sola con los eventos (${periods} × ${perMin} = ${total} min). Si corriges una celda queda marcada como manual; ↺ la devuelve al cálculo.</p>`;
  }

  function countersHTML() {
    return `<div class="counters">${m.counters.items.map((c, i) => `
      <div class="counter" data-c="${i}">
        <span class="c-name">${esc(c.name)}</span>
        ${canEdit ? '<button class="cbtn" type="button" data-dec aria-label="Restar">−</button>' : ''}
        <strong class="c-val" data-val>${c.value || 0}</strong>
        ${canEdit ? '<button class="cbtn" type="button" data-inc aria-label="Sumar">+</button>' : ''}
      </div>`).join('')}</div>
      ${canEdit ? `<details class="mt"><summary>Configurar contadores</summary>
        <label for="ac_list">Un contador por línea</label><textarea id="ac_list" data-clist rows="4">${esc(m.counters.items.map((c) => c.name).join('\n'))}</textarea></details>` : ''}`;
  }


  // ---------------------------------------------------------------- impresión (hoja PARTIDO)
  function printView() {
    const [home, away] = sides(m, team.name);
    const sc = scoreOf(m.events);
    const [h, a] = m.is_home ? [sc.for, sc.against] : [sc.against, sc.for];
    const tot = { goals: 0, assists: 0, yellow: 0, red: 0, minutes: 0 };
    const date = m.date ? fmt(new Date(m.date + 'T00:00:00')) : '';
    const html = `
      ${printHead({ title: 'Acta del partido', team, sub: `${m.matchday != null ? `Jornada ${m.matchday} · ` : ''}${esc(date)}` })}
      <p class="pr-score">${esc(home)}<b>${h} – ${a}</b>${esc(away)}</p>
      ${kv([['Jornada', m.matchday ?? ''], ['Fecha', esc(date)], ['Hora', esc((m.time || '').slice(0, 5))], ['Duración', `${periods} × ${perMin} = ${total} min`], ['Lugar', esc(m.venue || '')], ['Sistema', esc(m.system || '')]], 3)}
      <div class="pr-cols" style="--n:2">
        <div>${bar('Eventos', `${m.events.length}`)}
          <table class="pr-t"><thead><tr><th>Min</th><th>Evento</th><th>Jugador</th><th>Origen</th></tr></thead><tbody>${sortEvents(m.events).map((e) => { const t = EVENT_TYPES[e.type];
            const who = e.type === 'sub' ? `${esc(name(e.player_id))} <span class="pr-muted">por</span> ${esc(name(e.player_out_id))}` : e.type === 'goal_against' ? 'Rival' : esc(name(e.player_id));
            return `<tr><td class="n">${e.minute ?? '—'}′</td><td>${t.icon} ${t.label}</td><td>${who}${e.type === 'goal' && e.assist_id ? `<br><small class="pr-muted">asist. ${esc(name(e.assist_id))}</small>` : ''}${e.note ? `<br><small class="pr-muted">${esc(e.note)}</small>` : ''}</td><td>${esc(e.origin || '')}</td></tr>`; }).join('') || '<tr><td colspan="4" class="pr-empty">Sin eventos.</td></tr>'}</tbody></table></div>
        <div>${bar('Convocados')}
          <table class="pr-t"><thead><tr><th>Nº</th><th>Jugador</th>${STAT_FIELDS.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead>
            <tbody>${squad.map((s) => { const p = byId.get(s.player_id); const st = stats[s.player_id] || {}; for (const [k] of STAT_FIELDS) tot[k] += st[k] || 0;
              return `<tr><td class="n">${p.number ?? ''}</td><td>${esc(p.name)}${s.starter ? ' <small class="pr-muted">T</small>' : ''}</td>${STAT_FIELDS.map(([k]) => `<td class="n">${st[k] || ''}</td>`).join('')}</tr>`; }).join('')}</tbody>
            <tfoot><tr><td></td><th>Total</th>${STAT_FIELDS.map(([k]) => `<td class="n">${k === 'minutes' ? '' : tot[k]}</td>`).join('')}</tr></tfoot></table></div>
      </div>
      ${bar('Anotaciones')}
      <p>${m.counters.items.map((c) => `${esc(c.name)} <b>${c.value || 0}</b>`).join(' · ')}</p>
      <p>${txt(m.annotations)}</p>
      ${bar('Observaciones')}<p>${txt(m.notes)}</p>`;
    return { title: `Acta J${m.matchday ?? ''} ${home} ${h}-${a} ${away}`, html };
  }

  function draw() {
    const [home, away] = sides(m, team.name);
    el.innerHTML = `
      <div class="page-head acta-head">
        <div><p class="eyebrow">${m.matchday != null ? `Jornada ${m.matchday} · ` : ''}${m.date ? esc(fmt(new Date(m.date + 'T00:00:00'))) : 'Sin fecha'}</p>
          <h1 class="match-title"><span class="${m.is_home ? 'us' : ''}">${esc(home)}</span> <span class="vs">vs</span> <span class="${m.is_home ? '' : 'us'}">${esc(away)}</span></h1></div>
        <div class="actions no-print"><a class="btn" href="#/partidos">← Partidos</a>${printButton()}</div>
      </div>
      <nav class="tabs page-tabs no-print" aria-label="Partido">
        <a class="tab" href="#/partidos/${esc(m.id)}/prepartido">Prepartido</a>
        <a class="tab" href="#/partidos/${esc(m.id)}/acta" aria-current="page">Acta</a>
        <a class="tab" href="#/partidos/${esc(m.id)}/postpartido">Informe</a>
      </nav>
      ${canEdit ? '' : permNote({ ok: false, reason: `Solo ver y comentar: el acta la lleva el cuerpo técnico de ${team.name}.` })}
      <section class="scoreboard" aria-live="polite">${scoreHTML()}<div data-clockbox>${clockHTML()}</div></section>
      ${canEdit ? `<div class="ev-buttons no-print">${Object.entries(EVENT_TYPES).map(([k, t]) => `<button type="button" class="ev-btn ${t.cls}" data-add="${k}"><span aria-hidden="true">${t.icon}</span>${t.label}</button>`).join('')}</div>` : ''}
      <div class="acta-grid">
        <section class="card"><div class="section-head"><h2>Eventos</h2>${canEdit && m.events.length ? '<button class="btn small" type="button" data-undo>Deshacer el último</button>' : ''}</div><div data-events>${eventsHTML()}</div></section>
        <section class="card"><h2>Convocados</h2><div data-table>${tableHTML()}</div></section>
      </div>
      <section class="card"><h2>Anotaciones</h2><div data-counters>${countersHTML()}</div>
        <label for="ac_ann" class="mt">Anotaciones</label><textarea id="ac_ann" data-g="annotations" rows="3" maxlength="3000" ${dis}>${esc(m.annotations)}</textarea>
        <label for="ac_obs">Observaciones</label><textarea id="ac_obs" data-g="notes" rows="3" maxlength="3000" ${dis}>${esc(m.notes)}</textarea>
      </section>
      <div id="thread" class="no-print"></div>`;
    wire();
    mountThread(el.querySelector('#thread'), { teamId: team.id, entity: 'match', entityId: m.id, section: 'acta', title: 'Comentarios sobre el acta' });
  }
  const refresh = () => {
    el.querySelector('.scoreboard .sb-teams').outerHTML = scoreHTML();
    el.querySelector('[data-events]').innerHTML = eventsHTML();
    el.querySelector('[data-table]').innerHTML = tableHTML();
    const undo = el.querySelector('[data-undo]');
    if (!undo && m.events.length && canEdit) { draw(); return; }
    if (undo && !m.events.length) undo.remove();
    wireLists();
  };
  const drawClock = () => { el.querySelector('[data-clockbox]').innerHTML = clockHTML(); wireClock(); };

  // ---------------------------------------------------------------- diálogo de evento
  function eventDialog(type, existing) {
    const e = existing ? { ...existing } : { type, minute: nowMinute() };
    const t = EVENT_TYPES[e.type];
    const field = onField(m.events.filter((x) => x.id !== e.id), squad, e.minute ?? Infinity);
    const inField = squad.filter((s) => field.has(s.player_id)).map((s) => s.player_id);
    const bench = squad.filter((s) => !field.has(s.player_id)).map((s) => s.player_id);
    const all = squad.map((s) => s.player_id);
    const pick = (ids, sel, nameAttr) => `<div class="pick" role="radiogroup">${ids.map((id) => { const p = byId.get(id);
      return `<label class="pick-p"><input type="radio" name="${nameAttr}" value="${esc(id)}" required${id === sel ? ' checked' : ''}><span><b>${p.number ?? '–'}</b>${esc(p.name)}</span></label>`; }).join('') || '<p class="muted">Nadie disponible.</p>'}</div>`;
    const playerIds = bench.length ? bench : all;
    let dlg = document.getElementById('evDlg');
    if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'evDlg'; dlg.className = 'ev-dlg'; document.body.appendChild(dlg); }
    dlg.innerHTML = `
      <form method="dialog">
        <h2><span aria-hidden="true">${t.icon}</span> ${t.label}${existing ? ' (editar)' : ''}</h2>
        <div class="row"><div><label for="ev_min">Minuto</label><input id="ev_min" name="minute" type="number" min="0" max="${total + 30}" value="${e.minute ?? ''}" inputmode="numeric"></div></div>
        ${e.type === 'sub' ? `<h3>Sale</h3>${pick(inField.length ? inField : all, e.player_out_id, 'out')}<h3>Entra</h3>${pick(playerIds, e.player_id, 'pid')}`
          : e.type === 'goal_against' ? '' : `<h3>Jugador</h3>${pick(e.type === 'goal' ? (inField.length ? inField : all) : all, e.player_id, 'pid')}`}
        ${e.type === 'goal' ? `<h3>Asistencia</h3><select name="assist"><option value="">Sin asistencia</option>${(inField.length ? inField : all).map((id) => `<option value="${esc(id)}"${id === e.assist_id ? ' selected' : ''}>${esc(name(id))}</option>`).join('')}</select>` : ''}
        ${e.type === 'goal' || e.type === 'goal_against' ? `<h3>Origen</h3><div class="seg">${ORIGINS.map((o) => `<label><input type="radio" name="origin" value="${o}"${e.origin === o ? ' checked' : ''}><span>${o}</span></label>`).join('')}</div>` : ''}
        <label for="ev_note">${e.type === 'yellow' || e.type === 'red' ? 'Motivo' : 'Nota'} (opcional)</label><input id="ev_note" name="note" maxlength="200" value="${esc(e.note || '')}">
        <div class="dlg-actions"><button class="btn" value="no" formnovalidate>Cancelar</button><button class="btn primary" value="yes">Guardar</button></div>
      </form>`;
    const f = dlg.querySelector('form');
    dlg.returnValue = '';
    dlg.showModal();
    dlg.onclose = () => {
      if (dlg.returnValue !== 'yes') return;
      const v = Object.fromEntries(new FormData(f));
      const ev = { ...e, minute: v.minute === '' ? null : Math.max(0, +v.minute), note: (v.note || '').trim() };
      if (e.type !== 'goal_against') {
        if (!v.pid) { toast(e.type === 'sub' ? 'Elige quién entra.' : 'Elige el jugador.', 'err'); return; }
        ev.player_id = v.pid;
      }
      if (e.type === 'sub') {
        if (!v.out) { toast('Elige quién sale.', 'err'); return; }
        if (v.out === v.pid) { toast('Sale y entra el mismo jugador.', 'err'); return; }
        ev.player_out_id = v.out;
      }
      if (e.type === 'goal') ev.assist_id = v.assist && v.assist !== v.pid ? v.assist : null;
      if (v.origin) ev.origin = v.origin;
      if (existing) m.events = m.events.map((x) => (x.id === e.id ? ev : x));
      else m.events.push({ ...ev, id: crypto.randomUUID().slice(0, 8), seq: Math.max(0, ...m.events.map((x) => x.seq ?? 0)) + 1 });
      persist(); refresh();
      if (!navigator.onLine) toast('Sin conexión: el evento se guardará al volver la conexión.');
    };
  }

  // ---------------------------------------------------------------- eventos
  function wireClock() {
    if (!canEdit) return;
    el.querySelector('[data-run]')?.addEventListener('click', () => {
      if (clock.running) { clock.base = secs(); clock.running = false; } else { clock.since = Date.now(); clock.running = true; }
      saveClock(); drawClock(); keepAwake(clock.running);
    });
    el.querySelector('[data-next]')?.addEventListener('click', async () => {
      if (!(await ask(`Termina la parte ${clock.period} y el cronómetro vuelve a 00:00.`, { title: `¿Empezar la parte ${clock.period + 1}?`, yes: 'Siguiente parte' }))) return;
      clock.period = Math.min(periods, clock.period + 1); clock.base = 0; clock.running = false;
      saveClock(); drawClock();
    });
    el.querySelector('[data-adj]')?.addEventListener('click', () => {
      let dlg = document.getElementById('clkDlg');
      if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'clkDlg'; document.body.appendChild(dlg); }
      const cur = Math.floor(secs() / 60);
      dlg.innerHTML = `<form method="dialog"><h2>Ajustar el cronómetro</h2>
        <div class="row"><div><label for="ck_p">Parte</label><select id="ck_p" name="p">${Array.from({ length: periods }, (_, i) => `<option value="${i + 1}"${clock.period === i + 1 ? ' selected' : ''}>${i + 1}</option>`).join('')}</select></div>
        <div><label for="ck_m">Minuto dentro de la parte</label><input id="ck_m" name="m" type="number" min="0" max="${perMin + 15}" value="${cur}"></div></div>
        <div class="dlg-actions"><button class="btn" type="button" data-reset-clock>Poner a cero</button><button class="btn" value="no" formnovalidate>Cancelar</button><button class="btn primary" value="yes">Guardar</button></div></form>`;
      dlg.querySelector('[data-reset-clock]').onclick = () => { clock.period = 1; clock.base = 0; clock.running = false; saveClock(); dlg.close('no'); drawClock(); };
      dlg.returnValue = '';
      dlg.showModal();
      dlg.onclose = () => {
        if (dlg.returnValue !== 'yes') return;
        const f = dlg.querySelector('form');
        clock.period = +f.p.value; clock.base = Math.max(0, +f.m.value || 0) * 60; clock.since = Date.now();
        saveClock(); drawClock();
      };
    });
  }

  function wireLists() {
    if (!canEdit) return;
    el.querySelectorAll('[data-e]').forEach((li) => {
      const e = m.events.find((x) => x.id === li.dataset.e);
      li.querySelector('[data-edit]').addEventListener('click', () => eventDialog(e.type, e));
      li.querySelector('[data-rm]').addEventListener('click', async () => {
        if (!(await ask(`${EVENT_TYPES[e.type].label} del minuto ${e.minute ?? '—'}.`, { title: '¿Borrar el evento?', yes: 'Borrar', danger: true }))) return;
        m.events = m.events.filter((x) => x !== e); persist(); refresh();
      });
    });
    el.querySelectorAll('.acta-table [data-p]').forEach((tr) => {
      const id = tr.dataset.p;
      tr.querySelectorAll('[data-k]').forEach((inp) => inp.addEventListener('change', () => {
        const k = inp.dataset.k;
        const st = m.player_stats[id] ||= {};
        st[k] = Math.max(0, +inp.value || 0);
        st.manual = { ...(st.manual || {}), [k]: true };
        persist(); refresh();
      }));
      tr.querySelectorAll('[data-auto]').forEach((b) => b.addEventListener('click', () => {
        const st = m.player_stats[id];
        if (st?.manual) delete st.manual[b.dataset.auto];
        persist(); refresh();
      }));
    });
  }

  function wire() {
    wirePrint(el, () => printView());
    wireClock();
    wireLists();
    if (!canEdit) return;
    el.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => eventDialog(b.dataset.add)));
    el.querySelector('[data-undo]')?.addEventListener('click', async () => {
      const last = [...m.events].sort((a, b) => (b.seq ?? 0) - (a.seq ?? 0))[0];
      if (!last) return;
      m.events = m.events.filter((x) => x !== last);
      persist(); refresh();
      toast(`Deshecho: ${EVENT_TYPES[last.type].label.toLowerCase()} del minuto ${last.minute ?? '—'}.`);
    });
    wireCounters();
    el.querySelectorAll('textarea[data-g]').forEach((ta) => ta.addEventListener('input', () => { m[ta.dataset.g] = ta.value; saver.set({ [ta.dataset.g]: ta.value }); }));
  }

  function wireCounters() {
    if (!canEdit) return;
    el.querySelectorAll('[data-c]').forEach((box) => {
      const c = m.counters.items[+box.dataset.c];
      const set = (d) => { c.value = Math.max(0, (c.value || 0) + d); box.querySelector('[data-val]').textContent = c.value; saver.set({ counters: structuredClone(m.counters) }); };
      box.querySelector('[data-inc]').addEventListener('click', () => set(1));
      box.querySelector('[data-dec]').addEventListener('click', () => set(-1));
    });
    el.querySelector('[data-clist]')?.addEventListener('change', (ev) => {
      const names = ev.target.value.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 12);
      m.counters = { items: names.map((n) => ({ name: n, value: m.counters.items.find((c) => c.name === n)?.value || 0 })) };
      saver.set({ counters: structuredClone(m.counters) });
      el.querySelector('[data-counters]').innerHTML = countersHTML();
      wireCounters();
    });
  }

  // Si el acta se abre por primera vez con eventos antiguos, se guarda el resultado calculado.
  draw();
  // El marcador queda fijo justo debajo de la barra superior.
  const fitTop = () => { const tb = document.querySelector('.topbar'); if (tb) el.style.setProperty('--topbar-h', `${tb.offsetHeight}px`); };
  fitTop();
  window.addEventListener('resize', fitTop);
  const sc0 = scoreOf(m.events);
  if (canEdit && m.events.length && (m.goals_for !== sc0.for || m.goals_against !== sc0.against)) persist();

  // Reloj en pantalla y pantalla encendida mientras corre.
  clearInterval(tick);
  tick = setInterval(() => {
    if (!document.body.contains(el.querySelector('[data-time]'))) { clearInterval(tick); keepAwake(false); return; }
    el.querySelector('[data-time]').textContent = mmss(secs());
    const mm = nowMinute();
    el.querySelector('[data-min]').textContent = mm ?? '—';
  }, 1000);
  if (clock.running) keepAwake(true);
  const onVis = () => { if (!document.body.contains(el.querySelector('[data-time]'))) { document.removeEventListener('visibilitychange', onVis); return; } if (clock.running) keepAwake(true); };
  document.addEventListener('visibilitychange', onVis);
  const onLeave = () => { keepAwake(false); clearInterval(tick); window.removeEventListener('hashchange', onLeave); window.removeEventListener('resize', fitTop); };
  window.addEventListener('hashchange', onLeave);
}
