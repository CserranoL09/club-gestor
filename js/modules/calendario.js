// Calendario del club: sesiones, partidos y reservas de todos los equipos visibles.
// Vistas semana y mes, filtros por equipo y categoría, reservas de instalaciones con aviso de solapes,
// generación de sesiones desde el horario base y exportación a PDF (imprimir) y .ics.
import { esc, toast, busy, ask, errMsg } from '../ui.js';
import { sb } from '../supabase.js';
import { S, visibleTeams, teamsOfSeason, canPlanTeam, canEditTeam, canMatchTeam, canScheduleTeam, canManageFacilities, selectTeam } from '../session.js';
import { MONTHS, DAYS, addDays, fmt } from '../lib/dates.js';
import { SHORT_DAYS, SHARES, iso, parseISO, mins, hhmm, short, shareName, teamColor, rangeOf, matchEnd, findConflicts, buildICS, download } from '../lib/calendar.js';

const VIEWS = [['semana', 'Semana'], ['mes', 'Mes'], ['horarios', 'Horarios']];

export async function render(el, ctx) {
  const q = ctx.query;
  const view = VIEWS.find(([k]) => k === q.get('vista'))?.[0] || 'semana';
  const date = parseISO(q.get('fecha')) || new Date();
  const cat = q.get('cat') || '';
  const picked = (q.get('equipos') || '').split(',').filter(Boolean);
  const link = (patch) => {
    const p = new URLSearchParams({ vista: view, fecha: iso(date), cat, equipos: picked.join(','), ...patch });
    for (const [k, v] of [...p]) if (!v) p.delete(k);
    return `#/calendario?${p}`;
  };

  if (!S.season) { el.innerHTML = '<div class="card empty"><p>Crea una temporada para usar el calendario.</p></div>'; return; }

  const all = teamsOfSeason();
  const colorOf = (t) => teamColor(t, all.findIndex((x) => x.id === t?.id));
  const teams = visibleTeams();
  const cats = [...new Set(teams.map((t) => t.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const shown = teams.filter((t) => (!cat || t.category === cat) && (!picked.length || picked.includes(t.id)));

  el.innerHTML = `
    <div class="page-head">
      <div><h1>📅 Calendario</h1><p>${esc(S.club.name)} · ${esc(S.season.name)}</p></div>
      <div class="actions no-print">
        ${view !== 'horarios' ? `<button class="btn" type="button" data-print>Imprimir / PDF</button><button class="btn" type="button" data-ics>Descargar .ics</button>` : ''}
      </div>
    </div>
    <nav class="tabs page-tabs no-print" aria-label="Vistas del calendario">
      ${VIEWS.map(([k, l]) => `<a class="tab" href="${link({ vista: k })}" aria-current="${k === view ? 'page' : 'false'}">${l}</a>`).join('')}
    </nav>
    <div id="calBody"></div>`;
  const body = el.querySelector('#calBody');

  if (view === 'horarios') {
    const mod = await import('./calendario-horarios.js');
    return mod.render(body, { teams, colorOf });
  }

  // ---------- Datos del rango
  const { from, to } = rangeOf(view, date);
  const client = sb();
  const ids = teams.map((t) => t.id);
  const [ses, mat, bk, fac] = ids.length ? await Promise.all([
    client.from('sessions').select('id, team_id, date, time, duration_min, number').in('team_id', ids).gte('date', iso(from)).lte('date', iso(to)),
    client.from('matches').select('id, team_id, date, time, rival, is_home, venue, goals_for, goals_against').in('team_id', ids).gte('date', iso(from)).lte('date', iso(to)),
    client.from('bookings').select('*').eq('club_id', S.club.id).gte('date', iso(from)).lte('date', iso(to)),
    client.from('facilities').select('*').eq('club_id', S.club.id).order('sort').order('name')
  ]) : [{ data: [] }, { data: [] }, { data: [] }, await client.from('facilities').select('*').eq('club_id', S.club.id)];
  for (const r of [ses, mat, bk, fac]) if (r.error) throw r.error;
  const facilities = fac.data || [];
  const facName = (id) => facilities.find((f) => f.id === id)?.name || 'Instalación';
  const bookings = bk.data || [];
  const conflicts = findConflicts(bookings);
  const teamOf = (id) => S.teams.find((t) => t.id === id);
  const shownIds = new Set(shown.map((t) => t.id));

  const events = [];
  for (const s of ses.data || []) {
    const t = teamOf(s.team_id);
    const start = short(s.time);
    events.push({ kind: 'session', id: s.id, row: s, team: t, date: s.date, start, end: start ? hhmm(mins(start) + (s.duration_min || 90)) : '',
      title: `Sesión${s.number ? ' ' + s.number : ''}`, bookings: bookings.filter((b) => b.session_id === s.id) });
  }
  for (const m of mat.data || []) {
    const t = teamOf(m.team_id);
    const start = short(m.time);
    const score = m.goals_for != null && m.goals_against != null ? ` (${m.goals_for}-${m.goals_against})` : '';
    events.push({ kind: 'match', id: m.id, row: m, team: t, date: m.date, start, end: start ? matchEnd(start, t) : '',
      title: `${m.is_home ? 'vs' : 'en'} ${m.rival || 'Rival'}${score}`, bookings: bookings.filter((b) => b.match_id === m.id) });
  }
  for (const b of bookings.filter((x) => !x.session_id && !x.match_id && (!x.team_id || ids.includes(x.team_id)))) {
    events.push({ kind: 'booking', id: b.id, row: b, team: teamOf(b.team_id), date: b.date, start: short(b.start_time), end: short(b.end_time),
      title: b.note || 'Reserva', bookings: [b] });
  }
  const visible = events.filter((e) => !e.team || shownIds.has(e.team.id))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.start || '99').localeCompare(b.start || '99'));
  for (const e of visible) e.conflict = e.bookings.some((b) => conflicts.has(b.id));

  const icon = { session: '⚽', match: '🏆', booking: '📍' };
  const chipFor = (e) => `
    <button type="button" class="ev ev-${e.kind}${e.conflict ? ' ev-conflict' : ''}" data-ev="${e.kind}:${esc(e.id)}" style="--team:${esc(colorOf(e.team))}">
      <span class="ev-time">${e.start ? esc(e.start) : 'Sin hora'}${e.end ? '–' + esc(e.end) : ''}</span>
      <span class="ev-title"><span aria-hidden="true">${icon[e.kind]}</span> ${esc(e.team?.name || 'Club')} · ${esc(e.title)}</span>
      ${e.bookings.length ? `<span class="ev-fac">${e.bookings.map((b) => `${esc(facName(b.facility_id))}${+b.share < 4 ? ' (' + esc(shareName(b.share).replace(' campo', '')) + ')' : ''}`).join(', ')}</span>` : ''}
      ${e.conflict ? '<span class="ev-warn">⚠ Solapa con otra reserva</span>' : ''}
    </button>`;

  const today = iso(new Date());
  const title = view === 'mes'
    ? `${MONTHS[date.getMonth()][0].toUpperCase()}${MONTHS[date.getMonth()].slice(1)} ${date.getFullYear()}`
    : `${fmt(from)} – ${fmt(to)}`;
  const step = (n) => iso(view === 'mes' ? new Date(date.getFullYear(), date.getMonth() + n, 1) : addDays(date, 7 * n));
  const plannable = teams.filter((t) => canPlanTeam(t.id));
  const withSchedule = plannable.filter((t) => (t.schedule || []).length);
  const nConflicts = visible.filter((e) => e.conflict).length;

  body.innerHTML = `
    <div class="cal-toolbar no-print">
      <div class="cal-nav">
        <a class="btn icon-btn" href="${link({ fecha: step(-1) })}" aria-label="${view === 'mes' ? 'Mes anterior' : 'Semana anterior'}">‹</a>
        <a class="btn" href="${link({ fecha: today })}">Hoy</a>
        <a class="btn icon-btn" href="${link({ fecha: step(1) })}" aria-label="${view === 'mes' ? 'Mes siguiente' : 'Semana siguiente'}">›</a>
        <h2 class="cal-title">${esc(title)}</h2>
      </div>
      <div class="actions">
        ${view === 'semana' && withSchedule.length ? '<button class="btn" type="button" data-generate>Generar sesiones de la semana</button>' : ''}
        ${plannable.length || canManageFacilities() || teams.some((t) => canScheduleTeam(t.id)) ? '<button class="btn primary" type="button" data-new>+ Nuevo</button>' : ''}
      </div>
    </div>
    <div class="cal-filters no-print">
      ${cats.length > 1 ? `<label class="sr-only" for="calCat">Categoría</label>
        <select id="calCat" data-cat><option value="">Todas las categorías</option>${cats.map((c) => `<option${c === cat ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select>` : ''}
      <nav class="team-chips" aria-label="Equipos">
        ${teams.filter((t) => !cat || t.category === cat).map((t) => {
          const on = !picked.length || picked.includes(t.id);
          const next = picked.length ? (on ? picked.filter((x) => x !== t.id) : [...picked, t.id]) : teams.filter((x) => x.id !== t.id).map((x) => x.id);
          return `<a class="team-chip${on ? ' on' : ''}" href="${link({ equipos: next.join(',') })}" style="--team:${esc(colorOf(t))}" aria-pressed="${on}"><span class="dot" aria-hidden="true"></span>${esc(t.name)}</a>`;
        }).join('')}
        ${picked.length ? `<a class="team-chip reset" href="${link({ equipos: '' })}">Todos</a>` : ''}
      </nav>
    </div>
    ${nConflicts ? `<p class="note no-print" role="status">⚠ ${nConflicts} ${nConflicts === 1 ? 'evento solapa' : 'eventos solapan'} con otra reserva de la misma instalación. Ábrelos para cambiar el campo o la hora.</p>` : ''}
    <h2 class="print-only">${esc(S.club.name)} · ${esc(title)}</h2>
    ${!teams.length ? '<div class="card empty"><p>No tienes equipos en esta temporada.</p></div>' : view === 'mes' ? monthHTML() : weekHTML()}`;

  function weekHTML() {
    return `<div class="cal-week">${[0, 1, 2, 3, 4, 5, 6].map((i) => {
      const d = iso(addDays(from, i));
      const list = visible.filter((e) => e.date === d);
      return `<section class="cal-day${d === today ? ' today' : ''}${list.length ? '' : ' empty'}" data-day="${d}">
        <h3><span>${DAYS[i]}</span> ${+d.slice(8)}</h3>
        ${list.map(chipFor).join('') || '<p class="muted">—</p>'}
      </section>`;
    }).join('')}</div>`;
  }

  function monthHTML() {
    const days = [];
    for (let d = new Date(from); d <= to; d = addDays(d, 1)) days.push(iso(d));
    return `<div class="cal-month" role="grid" aria-label="${esc(title)}">
      ${SHORT_DAYS.map((n) => `<div class="cal-dow" role="columnheader">${n}</div>`).join('')}
      ${days.map((d) => {
        const list = visible.filter((e) => e.date === d);
        const out = +d.slice(5, 7) !== date.getMonth() + 1;
        return `<a class="cal-cell${out ? ' out' : ''}${d === today ? ' today' : ''}" role="gridcell" href="${link({ vista: 'semana', fecha: d })}" data-cell="${d}"
            aria-label="${fmt(parseISO(d))}: ${list.length} ${list.length === 1 ? 'evento' : 'eventos'}">
          <span class="num">${+d.slice(8)}</span>
          ${list.slice(0, 3).map((e) => `<span class="ev-mini${e.conflict ? ' ev-conflict' : ''}" style="--team:${esc(colorOf(e.team))}">${esc(e.start || '')} ${esc(e.team?.name || '')}${e.kind === 'match' ? ' 🏆' : ''}</span>`).join('')}
          ${list.length > 3 ? `<span class="more">+${list.length - 3} más</span>` : ''}
          <span class="dots" aria-hidden="true">${list.slice(0, 5).map((e) => `<i style="--team:${esc(colorOf(e.team))}"></i>`).join('')}</span>
        </a>`;
      }).join('')}
    </div>`;
  }

  // ---------- Acciones
  body.querySelector('[data-cat]')?.addEventListener('change', (ev) => { location.hash = link({ cat: ev.target.value, equipos: '' }); });
  el.querySelector('[data-print]')?.addEventListener('click', () => window.print());
  el.querySelector('[data-ics]')?.addEventListener('click', () => {
    const list = visible.map((e) => ({
      uid: `${e.kind}-${e.id}`, date: e.date, start: e.start || null, end: e.end || null,
      summary: `${e.team?.name || S.club.short_name || 'Club'} · ${e.kind === 'session' ? 'Entrenamiento' : e.kind === 'match' ? (e.row.is_home ? 'Partido vs ' : 'Partido en ') + (e.row.rival || 'rival') : e.title}`,
      location: e.bookings.map((b) => `${facName(b.facility_id)}${+b.share < 4 ? ' (' + shareName(b.share) + ')' : ''}`).join(', ') || (e.kind === 'match' ? e.row.venue : ''),
      description: e.kind === 'match' && e.row.goals_for != null ? `Resultado ${e.row.goals_for}-${e.row.goals_against}` : ''
    }));
    if (!list.length) { toast('No hay eventos que exportar en este periodo.', 'err'); return; }
    download(`calendario_${iso(from)}_${iso(to)}.ics`, buildICS(list, `${S.club.name} · ${S.season.name}`), 'text/calendar;charset=utf-8');
    toast(`${list.length} eventos exportados. Ábrelo o impórtalo en Google Calendar u Outlook.`);
  });
  body.querySelector('[data-generate]')?.addEventListener('click', (ev) => busy(ev.currentTarget, async () => {
    const { data: n, error } = await client.rpc('generate_week_sessions', { p_season: S.season.id, p_monday: iso(from) });
    if (error) throw error;
    toast(n ? `${n} ${n === 1 ? 'sesión creada' : 'sesiones creadas'} a partir del horario.` : 'No hay sesiones nuevas que crear: ya existen o coinciden con partidos.');
    if (n) reload();
  }));
  body.querySelector('[data-new]')?.addEventListener('click', () => openNew());
  body.querySelectorAll('[data-ev]').forEach((b) => b.addEventListener('click', () => {
    const [kind, id] = b.dataset.ev.split(':');
    openEvent(visible.find((e) => e.kind === kind && e.id === id));
  }));

  const reload = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

  // ---------- Diálogo
  function dialog(html) {
    let dlg = document.getElementById('calDlg');
    if (!dlg) {
      dlg = document.createElement('dialog');
      dlg.id = 'calDlg';
      dlg.className = 'cal-dlg';
      dlg.setAttribute('aria-labelledby', 'calDlgTitle');
      document.body.appendChild(dlg);
      dlg.addEventListener('click', (ev) => { if (ev.target === dlg || ev.target.closest('[data-close]')) dlg.close(); });
    }
    dlg.innerHTML = html;
    if (!dlg.open) dlg.showModal();
    return dlg;
  }

  /** Reservas que coincidirían con una nueva (para avisar antes de guardar). */
  function wouldConflict(cand) {
    const c = findConflicts([...bookings.filter((b) => b.id !== cand.id), { ...cand, id: '__new' }]);
    if (!c.has('__new')) return null;
    return c.get('__new').with.map((id) => bookings.find((b) => b.id === id));
  }
  const describe = (b) => {
    const t = teamOf(b.team_id);
    return `${t ? t.name : (b.note || 'Reserva')} · ${short(b.start_time)}–${short(b.end_time)} · ${shareName(b.share)}`;
  };
  async function confirmFree(cand) {
    const hit = wouldConflict(cand);
    if (!hit) return true;
    return ask(`${facName(cand.facility_id)} ya está ocupado: ${hit.map(describe).join('; ')}. Puedes reservar igualmente y coordinarlo con el otro equipo.`,
      { title: '⚠ Solape de instalación', yes: 'Reservar igualmente' });
  }
  const facOptions = (sel = '') => facilities.filter((f) => f.active).map((f) => `<option value="${esc(f.id)}"${f.id === sel ? ' selected' : ''}>${esc(f.name)}</option>`).join('');
  const shareOptions = (sel = 4) => SHARES.map(([k, l]) => `<option value="${k}"${+sel === k ? ' selected' : ''}>${l}</option>`).join('');

  function openEvent(e) {
    if (!e) return;
    const t = e.team;
    const canBook = canManageFacilities() || (t && canScheduleTeam(t.id));
    const canChange = e.kind === 'session' ? t && canPlanTeam(t.id) : e.kind === 'match' ? t && canMatchTeam(t.id) : canBook;
    const canDelete = e.kind === 'session' || e.kind === 'match' ? t && canEditTeam(t.id) : canBook;
    const dis = canChange ? '' : 'disabled';
    const kindName = { session: 'Sesión de entrenamiento', match: 'Partido', booking: 'Reserva de instalación' }[e.kind];
    const fields = e.kind === 'session' ? `
        <div class="row">
          <div><label for="ce_date">Fecha</label><input id="ce_date" name="date" type="date" value="${esc(e.date)}" required ${dis}></div>
          <div><label for="ce_time">Hora</label><input id="ce_time" name="time" type="time" value="${esc(e.start)}" ${dis}></div>
          <div><label for="ce_dur">Minutos</label><input id="ce_dur" name="duration_min" type="number" min="15" max="300" step="5" value="${esc(e.row.duration_min || 90)}" ${dis}></div>
        </div>` : e.kind === 'match' ? `
        <div class="row">
          <div><label for="ce_date">Fecha</label><input id="ce_date" name="date" type="date" value="${esc(e.date)}" required ${dis}></div>
          <div><label for="ce_time">Hora</label><input id="ce_time" name="time" type="time" value="${esc(e.start)}" ${dis}></div>
        </div>
        <div class="row">
          <div class="grow"><label for="ce_rival">Rival</label><input id="ce_rival" name="rival" value="${esc(e.row.rival)}" maxlength="80" ${dis}></div>
          <div><label for="ce_home">Campo</label><select id="ce_home" name="is_home" ${dis}><option value="true"${e.row.is_home ? ' selected' : ''}>Local</option><option value="false"${e.row.is_home ? '' : ' selected'}>Visitante</option></select></div>
        </div>` : `
        <div class="row">
          <div><label for="ce_date">Fecha</label><input id="ce_date" name="date" type="date" value="${esc(e.date)}" required ${dis}></div>
          <div><label for="ce_time">Desde</label><input id="ce_time" name="start_time" type="time" value="${esc(e.start)}" required ${dis}></div>
          <div><label for="ce_end">Hasta</label><input id="ce_end" name="end_time" type="time" value="${esc(e.end)}" required ${dis}></div>
        </div>
        <label for="ce_note">Motivo</label><input id="ce_note" name="note" value="${esc(e.row.note)}" maxlength="120" ${dis}>`;
    const bookingList = e.kind === 'booking' ? '' : `
      <h3 class="mt">Instalaciones</h3>
      ${e.bookings.length ? `<ul class="list compact">${e.bookings.map((b) => {
        const c = conflicts.get(b.id);
        return `<li data-bid="${esc(b.id)}"><div><strong>${esc(facName(b.facility_id))}</strong> · ${esc(shareName(b.share))}<br>
          <small class="muted">${esc(short(b.start_time))}–${esc(short(b.end_time))}</small>
          ${c ? `<br><small class="warn-text">⚠ Coincide con ${c.with.map((id) => esc(describe(bookings.find((x) => x.id === id)))).join('; ')}</small>` : ''}</div>
          ${canBook ? '<button class="btn small danger" type="button" data-unbook>Quitar</button>' : ''}</li>`;
      }).join('')}</ul>` : '<p class="muted">Sin instalación reservada.</p>'}
      ${canBook && facilities.length ? `
        <form class="book-form" data-book>
          <label class="sr-only" for="ce_fac">Instalación</label><select id="ce_fac" name="facility_id" required>${facOptions()}</select>
          <label class="sr-only" for="ce_share">Fracción</label><select id="ce_share" name="share">${shareOptions()}</select>
          <button class="btn small" type="submit">Reservar</button>
        </form>` : ''}
      ${canBook && !facilities.length ? `<p class="hint">El club aún no tiene instalaciones. ${canManageFacilities() ? '<a href="#/config?tab=instalaciones" data-close>Añádelas en Configuración</a>.' : 'Pídeselo a la Dirección o a la Coordinación.'}</p>` : ''}
      ${e.kind === 'match' && !e.start ? '<p class="hint">Pon la hora del partido para reservar instalación.</p>' : ''}
      ${e.kind === 'session' && !e.start ? '<p class="hint">Pon la hora de la sesión para reservar instalación.</p>' : ''}`;
    const conflictBooking = e.kind === 'booking' && conflicts.get(e.id);

    const dlg = dialog(`
      <div class="sheet-head"><div><p class="eyebrow" style="color:${esc(colorOf(t))}">${esc(kindName)}</p><h2 id="calDlgTitle">${esc(t?.name || 'Club')} · ${esc(e.title)}</h2></div>
        <button class="icon-btn" type="button" data-close aria-label="Cerrar">✕</button></div>
      ${conflictBooking ? `<p class="note">⚠ Coincide con ${conflictBooking.with.map((id) => esc(describe(bookings.find((x) => x.id === id)))).join('; ')}</p>` : ''}
      ${e.kind === 'booking' ? `<p><strong>${esc(facName(e.row.facility_id))}</strong> · ${esc(shareName(e.row.share))}</p>` : ''}
      <form data-edit>${fields}
        ${canChange ? '<div class="actions mt"><button class="btn primary" type="submit">Guardar cambios</button></div>' : ''}
      </form>
      ${bookingList}
      <div class="dlg-actions">
        ${e.kind === 'session' && t ? '<button class="btn" type="button" data-open="sesiones">Abrir la sesión</button>' : ''}
        ${e.kind === 'match' && t ? '<button class="btn" type="button" data-open="partidos">Abrir el partido</button>' : ''}
        ${canDelete ? `<button class="btn danger" type="button" data-delete>Borrar</button>` : ''}
      </div>`);

    dlg.querySelector('[data-edit]').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const f = new FormData(ev.target);
      busy(ev.submitter || ev.target.querySelector('[type=submit]'), async () => {
        let patch, table;
        if (e.kind === 'session') {
          table = 'sessions';
          patch = { date: f.get('date'), time: f.get('time') || null, duration_min: +f.get('duration_min') || 90 };
        } else if (e.kind === 'match') {
          table = 'matches';
          patch = { date: f.get('date'), time: f.get('time') || null, rival: String(f.get('rival')).trim(), is_home: f.get('is_home') === 'true' };
        } else {
          table = 'bookings';
          patch = { date: f.get('date'), start_time: f.get('start_time'), end_time: f.get('end_time'), note: String(f.get('note')).trim() };
          if (mins(patch.end_time) <= mins(patch.start_time)) { toast('La hora de fin debe ser posterior a la de inicio.', 'err'); return; }
          if (!(await confirmFree({ ...e.row, ...patch }))) return;
        }
        const { error } = await client.from(table).update(patch).eq('id', e.id);
        if (error) throw error;
        dlg.close();
        toast('Cambios guardados.');
        reload();
      });
    });
    dlg.querySelector('[data-book]')?.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const f = new FormData(ev.target);
      busy(ev.target.querySelector('[type=submit]'), async () => {
        if (!e.start) { toast('Pon primero la hora.', 'err'); return; }
        const facility = facilities.find((x) => x.id === f.get('facility_id'));
        const share = facility?.kind === 'campo' && facility.divisible ? +f.get('share') : 4;
        const cand = { facility_id: facility.id, date: e.date, start_time: e.kind === 'match' ? hhmm(mins(e.start) - 30) : e.start, end_time: e.end, share };
        if (!(await confirmFree(cand))) return;
        const row = { facility_id: facility.id, share, date: e.date, start_time: cand.start_time, end_time: cand.end_time, [e.kind === 'session' ? 'session_id' : 'match_id']: e.id };
        const { error } = await client.from('bookings').insert(row);
        if (error) throw error;
        dlg.close();
        toast(`${facility.name} reservado.`);
        reload();
      });
    });
    dlg.querySelectorAll('[data-unbook]').forEach((b) => b.addEventListener('click', () => busy(b, async () => {
      const { error } = await client.from('bookings').delete().eq('id', b.closest('[data-bid]').dataset.bid);
      if (error) throw error;
      dlg.close();
      toast('Reserva quitada.');
      reload();
    })));
    dlg.querySelector('[data-open]')?.addEventListener('click', (ev) => {
      dlg.close();
      if (S.team?.id !== t.id) selectTeam(t.id);
      location.hash = ev.currentTarget.dataset.open === 'sesiones' ? `#/sesiones/${e.id}` : `#/partidos/${e.id}/prepartido`;
    });
    dlg.querySelector('[data-delete]')?.addEventListener('click', async (ev) => {
      const what = { session: 'la sesión', match: 'el partido', booking: 'la reserva' }[e.kind];
      dlg.close();
      if (!(await ask(e.kind === 'booking' ? 'Se libera la instalación.' : `Se borra ${what} con todo lo que tenga dentro y sus reservas de instalación.`, { title: `¿Borrar ${what}?`, yes: 'Borrar', danger: true }))) return;
      await busy(ev.currentTarget, async () => {
        const { error } = await client.from({ session: 'sessions', match: 'matches', booking: 'bookings' }[e.kind]).delete().eq('id', e.id);
        if (error) throw error;
        toast('Borrado.');
        reload();
      });
    });
  }

  function openNew() {
    const options = (pred) => teams.filter(pred).map((t) => `<option value="${esc(t.id)}"${t.id === S.team?.id ? ' selected' : ''}>${esc(t.name)}</option>`).join('');
    const kinds = [
      ['session', 'Sesión', options((t) => canPlanTeam(t.id))],
      ['match', 'Partido', options((t) => canEditTeam(t.id))],
      ['booking', 'Reserva', options((t) => canManageFacilities() || canScheduleTeam(t.id))]
    ].filter(([, , o]) => o || false);
    if (!kinds.length && canManageFacilities()) kinds.push(['booking', 'Reserva', '']);
    const defDate = view === 'semana' && !(today >= iso(from) && today <= iso(to)) ? iso(from) : today;
    const dlg = dialog(`
      <div class="sheet-head"><h2 id="calDlgTitle">Nuevo en el calendario</h2><button class="icon-btn" type="button" data-close aria-label="Cerrar">✕</button></div>
      <form data-create>
        <div class="seg" role="radiogroup" aria-label="Tipo">${kinds.map(([k, l], i) => `<label><input type="radio" name="kind" value="${k}"${i ? '' : ' checked'}><span>${l}</span></label>`).join('')}</div>
        <label for="cn_team">Equipo</label><select id="cn_team" name="team_id"></select>
        <div class="row">
          <div><label for="cn_date">Fecha</label><input id="cn_date" name="date" type="date" value="${defDate}" required></div>
          <div><label for="cn_time">Hora</label><input id="cn_time" name="time" type="time" value="18:00" required></div>
          <div data-for="session booking"><label for="cn_dur">Minutos</label><input id="cn_dur" name="duration" type="number" min="15" max="300" step="5" value="90"></div>
        </div>
        <div data-for="match" class="row">
          <div class="grow"><label for="cn_rival">Rival</label><input id="cn_rival" name="rival" maxlength="80"></div>
          <div><label for="cn_home">Campo</label><select id="cn_home" name="is_home"><option value="true">Local</option><option value="false">Visitante</option></select></div>
        </div>
        <div data-for="booking"><label for="cn_note">Motivo</label><input id="cn_note" name="note" maxlength="120" placeholder="p. ej. Partido amistoso, jornada de puertas abiertas"></div>
        ${facilities.length ? `<div class="row">
          <div class="grow"><label for="cn_fac">Instalación</label><select id="cn_fac" name="facility_id"><option value="">Sin reservar</option>${facOptions()}</select></div>
          <div><label for="cn_share">Fracción</label><select id="cn_share" name="share">${shareOptions()}</select></div>
        </div>` : ''}
        <div class="dlg-actions"><button class="btn" type="button" data-close>Cancelar</button><button class="btn primary" type="submit">Crear</button></div>
      </form>`);
    const f = dlg.querySelector('form');
    const sync = () => {
      const k = f.kind.value;
      f.team_id.innerHTML = (kinds.find(([x]) => x === k)?.[2] || '') + (k === 'booking' && canManageFacilities() ? '<option value="">Club (sin equipo)</option>' : '');
      f.querySelectorAll('[data-for]').forEach((x) => { x.hidden = !x.dataset.for.split(' ').includes(k); });
      if (f.facility_id) f.facility_id.required = k === 'booking';
      f.rival.required = k === 'match';
    };
    f.addEventListener('change', (ev) => { if (ev.target.name === 'kind') sync(); });
    sync();
    f.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const v = Object.fromEntries(new FormData(f));
      busy(f.querySelector('[type=submit]'), async () => {
        const team = teamOf(v.team_id);
        const facility = facilities.find((x) => x.id === v.facility_id);
        const share = facility?.kind === 'campo' && facility.divisible ? +v.share : 4;
        const dur = +v.duration || 90;
        let start = v.time, end = hhmm(mins(v.time) + dur);
        if (v.kind === 'match') { start = hhmm(mins(v.time) - 30); end = matchEnd(v.time, team); }
        if (facility && !(await confirmFree({ facility_id: facility.id, date: v.date, start_time: start, end_time: end, share }))) return;
        let link_ = {};
        if (v.kind === 'session') {
          const { data, error } = await client.from('sessions').insert({ team_id: v.team_id, date: v.date, time: v.time, duration_min: dur }).select('id').single();
          if (error) throw error;
          link_ = { session_id: data.id };
        } else if (v.kind === 'match') {
          const { data, error } = await client.from('matches').insert({ team_id: v.team_id, season_id: S.season.id, date: v.date, time: v.time, rival: v.rival.trim(), is_home: v.is_home === 'true' }).select('id').single();
          if (error) throw error;
          link_ = { match_id: data.id };
        } else {
          link_ = { team_id: v.team_id || null, note: v.note.trim() };
        }
        if (facility) {
          const { error } = await client.from('bookings').insert({ facility_id: facility.id, share, date: v.date, start_time: start, end_time: end, ...link_ });
          if (error) { toast(`Se ha creado, pero no se ha podido reservar la instalación: ${errMsg(error)}`, 'err', 6000); }
        }
        dlg.close();
        toast({ session: 'Sesión creada.', match: 'Partido creado.', booking: 'Reserva creada.' }[v.kind]);
        if (v.date < iso(from) || v.date > iso(to)) location.hash = link({ fecha: v.date }); else reload();
      });
    });
  }
}
