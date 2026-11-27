// Configuración → Excel: exportar la temporada del equipo con las hojas de la plantilla e importar desde tu Excel (o CSV).
import { esc, toast, busy, ask, errMsg } from '../ui.js';
import { sb } from '../supabase.js';
import { S, canEditTeam, canReadTeam } from '../session.js';
import { fmt } from '../lib/dates.js';
import { exportBook, readBook } from '../lib/xlsx.js';
import { sheetSesion, sheetPeriodizacion, sheetMacrociclo, sheetMorfociclo, sheetPrepartido, sheetPartido, sheetPostpartido, sheetPlantilla, sheetEstadisticas } from '../lib/excelbook.js';
import { detect, matchRow, sessionRow, contentsFor, norm } from '../lib/excelimport.js';
import { defaultPeriodization, weeksOf } from '../lib/periodization.js';

const SHEETS = 'SESIÓN, PERIODIZACIÓN, MACROCICLO, MORFOCICLO, PREPARTIDO, PARTIDO, POSTPARTIDO, PLANTILLA y ESTADÍSTICAS';

/** Todos los datos de la temporada del equipo activo. */
export async function seasonData(team) {
  const client = sb();
  const season = S.seasons.find((s) => s.id === team.season_id) || S.season;
  let ses = client.from('sessions').select('*').eq('team_id', team.id).order('date').order('time');
  if (season?.start_date) ses = ses.gte('date', season.start_date);
  if (season?.end_date) ses = ses.lte('date', season.end_date);
  const [pl, se, pe, ma, mo, mt] = await Promise.all([
    client.from('players').select('*').eq('team_id', team.id).order('number', { nullsFirst: false }),
    ses,
    client.from('periodizations').select('*').eq('team_id', team.id).eq('season_id', team.season_id).maybeSingle(),
    client.from('macrocycles').select('*').eq('team_id', team.id).eq('season_id', team.season_id).order('created_at'),
    client.from('morphocycles').select('*').eq('team_id', team.id).order('is_default', { ascending: false }).order('created_at'),
    client.from('matches').select('*').eq('team_id', team.id).eq('season_id', team.season_id).order('matchday', { nullsFirst: false }).order('date', { nullsFirst: false })
  ]);
  for (const r of [pl, se, pe, ma, mo, mt]) if (r.error) throw r.error;
  return { season, players: pl.data || [], sessions: se.data || [], per: pe.data, macros: ma.data || [], morphos: mo.data || [], matches: mt.data || [] };
}

export async function exportSeason(team) {
  const d = await seasonData(team);
  const total = (team.periods || 2) * (team.period_minutes || 35);
  return exportBook(`${team.name} ${d.season?.name || ''}`, [
    sheetSesion(d.sessions, team, d.players), sheetPeriodizacion(d.per), sheetMacrociclo(d.macros), sheetMorfociclo(d.morphos),
    sheetPrepartido(d.matches, team, d.players), sheetPartido(d.matches, team, d.players), sheetPostpartido(d.matches, team, d.players, total),
    sheetPlantilla(d.players), sheetEstadisticas(d.players, d.matches, d.sessions, total)
  ]);
}

export async function render(el) {
  const team = S.team;
  if (!team) { el.innerHTML = '<div class="card empty"><p>Elige un equipo en la cabecera.</p></div>'; return; }
  const canImport = canEditTeam(team.id);
  const canExport = canReadTeam(team.id) || canImport;
  el.innerHTML = `
    <section class="card">
      <h2>📤 Exportar temporada a Excel</h2>
      <p>Un .xlsx de <strong>${esc(team.name)}</strong> · ${esc(S.season?.name || '')} con las hojas ${SHEETS}: las mismas que tu plantilla, con fechas reales de Excel, anchos de columna y cabeceras fijas.</p>
      <button class="btn primary" type="button" data-export${canExport ? '' : ' disabled'}>Exportar temporada a Excel</button>
      <p class="hint">Cada módulo tiene también su botón «Excel» para exportar solo lo que estás viendo.</p>
    </section>
    <section class="card">
      <h2>📥 Importar desde mi Excel</h2>
      ${canImport ? `<p>Elige tu archivo «Control competición TEMPORADA» (o uno exportado por la app, o un CSV con «Dorsal;Nombre;Posición»). Primero verás lo que se ha encontrado y eliges qué importar; no se guarda nada hasta que pulses «Importar».</p>
        <label class="btn">Elegir archivo…<input type="file" accept=".xlsx,.xls,.xlsm,.ods,.csv,text/csv" data-file hidden></label>
        <p class="hint">Se ignoran los textos de ejemplo de la plantilla («Jugador 1», «AAA», «dd/mm/aaaa»). Todo se limpia y se comprueba antes de guardar.</p>`
        : '<p class="muted">Importar lo hacen la Dirección y el entrenador principal del equipo.</p>'}
      <div data-preview></div>
    </section>`;

  el.querySelector('[data-export]').addEventListener('click', (ev) => busy(ev.currentTarget, async () => {
    const kind = await exportSeason(team);
    if (kind === 'xlsx') toast('Excel descargado.');
  }));
  el.querySelector('[data-file]')?.addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) { toast('El archivo pasa de 15 MB.', 'err'); return; }
    const box = el.querySelector('[data-preview]');
    box.innerHTML = '<p class="muted">Leyendo el archivo…</p>';
    try {
      const book = await readBook(file);
      const { data: existing } = await sb().from('players').select('id, number, name, active').eq('team_id', team.id);
      const found = detect(book, { team, season: S.seasons.find((s) => s.id === team.season_id) || S.season, players: existing || [] });
      preview(box, file.name, found, existing || []);
    } catch (err) {
      console.error(err);
      box.innerHTML = `<p class="note">No se ha podido leer «${esc(file.name)}»: ${esc(errMsg(err))}. Prueba a guardarlo como .xlsx o CSV.</p>`;
    }
  });

  // ---------------------------------------------------------------- vista previa
  async function preview(box, fileName, f, existing) {
    const client = sb();
    const [{ data: oldMatches }, { data: oldSessions }, { data: per }] = await Promise.all([
      client.from('matches').select('id, matchday, date').eq('team_id', team.id).eq('season_id', team.season_id),
      client.from('sessions').select('id, date, time').eq('team_id', team.id),
      client.from('periodizations').select('*').eq('team_id', team.id).eq('season_id', team.season_id).maybeSingle()
    ]);
    const matchTwin = (m) => (oldMatches || []).find((x) => (m.matchday != null && x.matchday === m.matchday) || (m.matchday == null && m.date && x.date === m.date));
    const sesTwin = (s) => (oldSessions || []).find((x) => x.date === s.date && (x.time || '').slice(0, 5) === (s.time || ''));
    const newPlayers = f.players.filter((p) => !p.existing);
    const nothing = !f.players.length && !f.matches.length && !f.sessions.length && !f.contents.length;
    const chk = (group, i, on, label, extra = '') => `<label class="check imp-item"><input type="checkbox" data-g="${group}" data-i="${i}"${on ? ' checked' : ''}> <span>${label}${extra ? ` <small class="muted">${extra}</small>` : ''}</span></label>`;
    const head = (group, title, n, on, hint = '') => `<div class="imp-head"><label class="check"><input type="checkbox" data-all="${group}"${on ? ' checked' : ''}> <strong>${title}</strong> <span class="count">${n}</span></label>${hint ? `<p class="hint">${hint}</p>` : ''}</div>`;
    box.innerHTML = `
      <div class="imp-preview">
        <h3>Encontrado en «${esc(fileName)}»</h3>
        <p class="hint">Hojas: ${f.sheets.map(esc).join(', ')}</p>
        ${f.warnings.map((w) => `<p class="note">⚠ ${esc(w)}</p>`).join('')}
        ${nothing ? '<p class="note">No se ha encontrado nada que importar: la plantilla parece vacía (solo textos de ejemplo).</p>' : ''}
        ${f.players.length ? `<fieldset class="imp-group">${head('players', 'Jugadores nuevos', newPlayers.length, newPlayers.length > 0, f.players.length > newPlayers.length ? `${f.players.length - newPlayers.length} ya están en la plantilla y no se tocan.` : '')}
          <div class="imp-list">${f.players.map((p, i) => p.existing ? '' : chk('players', i, true, `${p.number != null ? `<b>${p.number}</b> ` : ''}${esc(p.name)}`, p.numberTaken ? 'dorsal ocupado: entra sin dorsal' : '')).join('')}</div></fieldset>` : ''}
        ${f.matches.length ? `<fieldset class="imp-group">${head('matches', 'Partidos', f.matches.length, true, 'Con convocatoria, minutos, goles por origen, tarjetas y, si los hay, prepartido, eventos del acta y evaluación del postpartido.')}
          <div class="imp-list">${f.matches.map((m, i) => { const tw = matchTwin(m); const res = m.gh != null && m.ga != null ? ` · ${m.gh}–${m.ga}` : '';
            return chk('matches', i, true, `J${m.matchday ?? '–'} · ${m.date ? esc(fmt(new Date(m.date + 'T00:00:00'))) : 'sin fecha'} · ${m.is_home ? 'vs' : 'en'} ${esc(m.rival || 'rival')}${res}`,
              `${(m.players || []).filter((r) => r.called).length || (m.lineup || []).length || (m.table || []).length} convocados · ${esc(m.source)}${tw ? ' · <b class="warn-text">sustituye al partido que ya existe</b>' : ''}`); }).join('')}</div></fieldset>` : ''}
        ${f.sessions.length ? `<fieldset class="imp-group">${head('sessions', 'Sesiones', f.sessions.length, true)}
          <div class="imp-list">${f.sessions.map((s, i) => chk('sessions', i, true, `${esc(fmt(new Date(s.date + 'T00:00:00')))}${s.time ? ' · ' + esc(s.time) : ''}${s.number ? ` · sesión ${s.number}` : ''}`,
            `${s.blocks.length} bloques${sesTwin(s) ? ' · <b class="warn-text">sustituye a la sesión que ya existe</b>' : ''}`)).join('')}</div></fieldset>` : ''}
        ${f.contents.length ? `<fieldset class="imp-group">${head('contents', 'Contenidos de la periodización', f.contents.length, !f.contents.every((c) => c.placeholder),
            f.contents.every((c) => c.placeholder) ? 'Sin nombre en tu Excel: se desmarcan para que no entren los ejemplos de la plantilla. Márcalos si son tuyos.' : (per ? 'Los que tengan el mismo nombre que uno existente lo sustituyen; el resto se añaden.' : 'Se creará la periodización de la temporada.'))}
          <div class="imp-list">${f.contents.map((c, i) => chk('contents', i, !c.placeholder, esc(c.name), `${Object.keys(c.marks).length} ${Object.keys(c.marks).length === 1 ? 'semana marcada' : 'semanas marcadas'}`)).join('')}</div></fieldset>` : ''}
        ${nothing ? '' : '<div class="actions"><button class="btn primary" type="button" data-import>Importar lo marcado</button><button class="btn" type="button" data-cancel>Cancelar</button></div>'}
      </div>`;
    box.querySelectorAll('[data-all]').forEach((a) => a.addEventListener('change', () => box.querySelectorAll(`[data-g="${a.dataset.all}"]`).forEach((c) => { c.checked = a.checked; })));
    box.querySelectorAll('[data-g]').forEach((c) => c.addEventListener('change', () => {
      const all = box.querySelector(`[data-all="${c.dataset.g}"]`);
      const items = [...box.querySelectorAll(`[data-g="${c.dataset.g}"]`)];
      all.checked = items.some((x) => x.checked);
    }));
    box.querySelector('[data-cancel]')?.addEventListener('click', () => { box.innerHTML = ''; });
    box.querySelector('[data-import]')?.addEventListener('click', (ev) => {
      const pick = (g) => [...box.querySelectorAll(`[data-g="${g}"]:checked`)].map((c) => +c.dataset.i);
      const sel = { players: pick('players').map((i) => f.players[i]), matches: pick('matches').map((i) => f.matches[i]), sessions: pick('sessions').map((i) => f.sessions[i]), contents: pick('contents').map((i) => f.contents[i]) };
      if (!sel.players.length && !sel.matches.length && !sel.sessions.length && !sel.contents.length) { toast('No hay nada marcado.', 'err'); return; }
      busy(ev.currentTarget, async () => {
        const over = sel.matches.filter(matchTwin).length + sel.sessions.filter(sesTwin).length
          + (per ? sel.contents.filter((c) => (per.contents || []).some((x) => norm(x.name) === norm(c.name))).length : 0);
        if (over && !(await ask(`Se sustituirán ${over} ${over === 1 ? 'elemento que ya existe' : 'elementos que ya existen'} (partidos, sesiones o contenidos con la misma jornada, fecha o nombre). Lo que tenían se perderá.`, { title: '¿Sobrescribir?', yes: 'Sí, sobrescribir', danger: true }))) return;
        const n = await apply(sel, existing, matchTwin, sesTwin, per);
        box.innerHTML = `<div class="success"><h3>Importación terminada</h3><p>${[n.players && `${n.players} jugadores`, n.matches && `${n.matches} partidos`, n.sessions && `${n.sessions} sesiones`, n.contents && `${n.contents} contenidos de periodización`].filter(Boolean).join(' · ') || 'Nada nuevo'}.</p>
          <p><a href="#/plantilla">Plantilla</a> · <a href="#/partidos">Partidos</a> · <a href="#/sesiones">Sesiones</a> · <a href="#/periodizacion">Periodización</a></p></div>`;
        toast('Importación terminada.');
      });
    });
  }

  // ---------------------------------------------------------------- guardar
  async function apply(sel, existing, matchTwin, sesTwin, per) {
    const client = sb();
    const n = { players: 0, matches: 0, sessions: 0, contents: 0 };
    const ids = new Map(existing.map((p) => [norm(p.name), p.id]));
    const used = new Set(existing.filter((p) => p.active).map((p) => p.number).filter((x) => x != null));
    // Jugadores primero: los partidos y sesiones los necesitan. También los que aparecen en partidos aunque no se hayan marcado.
    const needed = new Map(sel.players.map((p) => [norm(p.name), p]));
    const all = (m) => [...(m.players || []).map((r) => r.player), ...(m.lineup || []), ...(m.table || []).map((r) => r.player)];
    for (const m of sel.matches) for (const p of all(m)) if (!ids.has(norm(p.name))) needed.set(norm(p.name), p);
    for (const s of sel.sessions) for (const a of s.attendance || []) if (!ids.has(norm(a.player.name))) needed.set(norm(a.player.name), a.player);
    const rows = [...needed.values()].filter((p) => !ids.has(norm(p.name))).map((p) => {
      const number = p.number != null && !used.has(p.number) ? p.number : null;
      if (number != null) used.add(number);
      return { team_id: team.id, number, name: p.name.slice(0, 80), position: p.position || '', foot: p.foot || null, birth_year: p.birth_year || null };
    });
    if (rows.length) {
      const { data, error } = await client.from('players').insert(rows).select('id, name');
      if (error) throw error;
      for (const p of data) ids.set(norm(p.name), p.id);
      n.players = data.length;
    }
    const idOf = (name) => ids.get(norm(name)) || null;
    for (const m of sel.matches) {
      const row = matchRow(m, idOf, team);
      const twin = matchTwin(m);
      const { error } = twin ? await client.from('matches').update(row).eq('id', twin.id) : await client.from('matches').insert({ ...row, team_id: team.id, season_id: team.season_id });
      if (error) throw error;
      n.matches++;
    }
    for (const s of sel.sessions) {
      const row = sessionRow(s, idOf);
      const twin = sesTwin(s);
      const { error } = twin ? await client.from('sessions').update(row).eq('id', twin.id) : await client.from('sessions').insert({ ...row, team_id: team.id });
      if (error) throw error;
      n.sessions++;
    }
    if (sel.contents.length) {
      let p = per;
      if (!p) {
        const season = S.seasons.find((x) => x.id === team.season_id) || S.season;
        const { data, error } = await client.from('periodizations').insert({ team_id: team.id, season_id: team.season_id, ...defaultPeriodization(season) }).select('*').single();
        if (error) throw error;
        p = data;
      }
      const incoming = contentsFor(sel.contents, p.start_monday, weeksOf(p).length);
      const contents = [...(p.contents || [])];
      for (const c of incoming) {
        const i = contents.findIndex((x) => norm(x.name) === norm(c.name));
        const empty = contents.findIndex((x) => !x.name && !Object.keys(x.marks || {}).length);   // filas vacías de la periodización por defecto
        if (i >= 0) contents[i] = { ...contents[i], marks: c.marks };
        else if (empty >= 0) contents[empty] = { ...contents[empty], ...c };
        else contents.push(c);
      }
      const { error } = await client.from('periodizations').update({ contents }).eq('id', p.id);
      if (error) throw error;
      n.contents = incoming.length;
    }
    return n;
  }
}
