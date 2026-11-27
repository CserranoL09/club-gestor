// Partidos del equipo (#/partidos): jornada, fecha, local/visitante, resultado y estado.
// «Nuevo partido» y «Pegar calendario». El Prepartido está en prepartido.js.
import { esc, toast, busy, ask, permNote, errMsg } from '../ui.js';
import { sb } from '../supabase.js';
import { S, permission, canEditTeam } from '../session.js';
import { fmt } from '../lib/dates.js';
import { mountThread } from '../lib/comments.js';
import { readJSON, importOne } from '../lib/backup.js';
import { matchStatus, sides, score, parseFixtures } from '../lib/matches.js';

export async function render(el, ctx) {
  if (!S.team) { el.innerHTML = '<div class="card empty"><p>Elige un equipo en la cabecera.</p></div>'; return; }
  const team = S.team;
  const client = sb();
  const perm = permission('edit');
  const canCreate = canEditTeam(team.id);
  const q = ctx.query;
  const filter = q.get('estado') || '';
  const { data, error } = await client.from('matches').select('id, matchday, date, time, rival, is_home, venue, goals_for, goals_against, report_done, squad')
    .eq('team_id', team.id).eq('season_id', team.season_id).order('date', { nullsFirst: false }).order('matchday');
  if (error) throw error;
  const all = data || [];
  const counts = {};
  for (const m of all) { const k = matchStatus(m)[0]; counts[k] = (counts[k] || 0) + 1; }
  const list = all.filter((m) => !filter || matchStatus(m)[0] === filter);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const next = all.find((m) => m.date && new Date(m.date + 'T00:00:00') >= today);
  const STATES = [['', 'Todos'], ['pendiente', 'Pendientes'], ['convocado', 'Convocados'], ['jugado', 'Jugados'], ['informe', 'Con informe']];

  el.innerHTML = `
    <div class="page-head">
      <div><h1>📋 Partidos</h1><p>${esc(team.name)} · ${all.length} ${all.length === 1 ? 'partido' : 'partidos'}</p></div>
      ${canCreate ? `<div class="actions"><label class="btn">Importar partido<input type="file" accept=".json,application/json" data-import1 hidden></label><a class="btn" href="#/partidos?panel=pegar">Pegar calendario</a><button class="btn primary" type="button" data-new>+ Nuevo partido</button></div>` : ''}
    </div>
    ${canCreate ? '' : permNote(perm.ok ? { ok: false, reason: 'Los partidos los crea el entrenador principal; tú puedes preparar la convocatoria y el acta.' } : perm)}
    <div id="panel"></div>
    <nav class="chips no-print" aria-label="Estado">${STATES.map(([k, l]) => `<a class="chip${filter === k ? ' on' : ''}" href="#/partidos${k ? '?estado=' + k : ''}">${l}${k ? ` <span class="count">${counts[k] || 0}</span>` : ''}</a>`).join('')}</nav>
    ${list.length ? `<section class="card match-list">
      <div class="ml-row ml-head" aria-hidden="true"><span>J.</span><span>Fecha</span><span>Local</span><span></span><span>Visitante</span><span>Estado</span><span></span></div>
      <ul>${list.map((m) => {
        const [st, label, cls] = matchStatus(m);
        const [home, away] = sides(m, team.name);
        return `<li class="ml-row${m === next ? ' next' : ''}" data-id="${esc(m.id)}">
          <span class="ml-j">${m.matchday ?? '—'}</span>
          <span class="ml-date">${m.date ? esc(fmt(new Date(m.date + 'T00:00:00'))) : 'Sin fecha'}${m.time ? `<small>${esc(m.time.slice(0, 5))}</small>` : ''}</span>
          <a class="ml-home${m.is_home ? ' us' : ''}" href="#/partidos/${esc(m.id)}/prepartido">${esc(home)}</a>
          <span class="ml-score">${esc(score(m)) || 'vs'}</span>
          <a class="ml-away${m.is_home ? '' : ' us'}" href="#/partidos/${esc(m.id)}/prepartido">${esc(away)}</a>
          <span><span class="pill ${cls}" data-st="${st}">${label}</span></span>
          <span class="ml-act">
            <a class="btn small" href="#/partidos/${esc(m.id)}/prepartido">Prepartido</a>
            <a class="btn small" href="#/partidos/${esc(m.id)}/acta">Acta</a>
            <a class="btn small" href="#/partidos/${esc(m.id)}/postpartido">Informe</a>
            ${canCreate ? '<button class="icon-btn small" type="button" data-del aria-label="Borrar el partido">✕</button>' : ''}
          </span>
        </li>`;
      }).join('')}</ul></section>`
      : `<div class="card empty"><div class="big">📋</div><h2>${all.length ? 'Ningún partido con ese estado' : 'Todavía no hay partidos'}</h2>
        <p>${canCreate ? 'Añádelos uno a uno o pega el calendario de la liga.' : ''}</p></div>`}
    <div id="thread" class="no-print"></div>`;

  const again = () => render(el, ctx);

  // ---------- Nuevo partido
  el.querySelector('[data-import1]')?.addEventListener('change', async (ev) => {
    const file = ev.target.files[0]; ev.target.value = '';
    if (!file) return;
    try {
      const obj = await readJSON(file);
      const { data: pl } = await sb().from('players').select('id, number, name, active').eq('team_id', team.id);
      const r = await importOne(obj, 'match', team, pl || []);
      toast(r.missing.length ? `Partido importado. Sin estos jugadores (no están en tu plantilla): ${r.missing.join(', ')}.` : 'Partido importado.', r.missing.length ? 'err' : 'ok', r.missing.length ? 8000 : 3600);
      location.hash = `#/partidos/${r.id}/prepartido`;
    } catch (err) { toast(errMsg(err), 'err', 6000); }
  });
  el.querySelector('[data-new]')?.addEventListener('click', () => {
    let dlg = document.getElementById('matchDlg');
    if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'matchDlg'; document.body.appendChild(dlg); }
    const nextJ = Math.max(0, ...all.map((m) => m.matchday || 0)) + 1;
    dlg.innerHTML = `
      <form method="dialog">
        <h2>Nuevo partido</h2>
        <div class="row">
          <div><label for="nm_j">Jornada</label><input id="nm_j" name="matchday" type="number" min="0" max="99" value="${nextJ}"></div>
          <div><label for="nm_date">Fecha</label><input id="nm_date" name="date" type="date" required></div>
          <div><label for="nm_time">Hora</label><input id="nm_time" name="time" type="time"></div>
        </div>
        <div class="row">
          <div class="grow"><label for="nm_rival">Rival</label><input id="nm_rival" name="rival" maxlength="80" required></div>
          <div><label for="nm_home">Jugamos</label><select id="nm_home" name="is_home"><option value="true">En casa</option><option value="false">Fuera</option></select></div>
        </div>
        <label for="nm_venue">Lugar</label><input id="nm_venue" name="venue" maxlength="120" placeholder="Campo o dirección">
        <div class="dlg-actions"><button class="btn" value="no" formnovalidate>Cancelar</button><button class="btn primary" value="yes">Crear</button></div>
      </form>`;
    const f = dlg.querySelector('form');
    dlg.onclose = () => {
      if (dlg.returnValue !== 'yes') return;
      busy(el.querySelector('[data-new]'), async () => {
        const { data: row, error: e } = await client.from('matches').insert({
          team_id: team.id, season_id: team.season_id, matchday: f.matchday.value === '' ? null : +f.matchday.value, date: f.date.value,
          time: f.time.value || null, rival: f.rival.value.trim(), is_home: f.is_home.value === 'true', venue: f.venue.value.trim()
        }).select('id').single();
        if (e) throw e;
        toast('Partido creado.');
        location.hash = `#/partidos/${row.id}/prepartido`;
      });
    };
    dlg.returnValue = '';
    dlg.showModal();
  });

  // ---------- Pegar calendario
  if (canCreate && q.get('panel') === 'pegar') {
    const box = el.querySelector('#panel');
    box.innerHTML = `
      <section class="card paste">
        <h2>Pegar calendario</h2>
        <p class="hint">Una línea por partido: <code>jornada;fecha;rival;casa o fuera</code> y, si quieres, la hora: <code>1;12/09/2026;CD Rival;casa;11:00</code>. También vale copiado del Excel (columnas separadas por tabulador).</p>
        <label class="sr-only" for="fxPaste">Calendario</label>
        <textarea id="fxPaste" rows="7" placeholder="1;12/09/2026;CD Rival;casa&#10;2;19/09/2026;UD Vecina;fuera;11:30"></textarea>
        <div id="fxPreview" aria-live="polite"></div>
        <div class="actions mt"><button class="btn primary" type="button" data-import disabled>Añadir partidos</button><a class="btn" href="#/partidos">Cerrar</a></div>
      </section>`;
    const ta = box.querySelector('textarea'), btn = box.querySelector('[data-import]');
    let rows = [];
    ta.addEventListener('input', () => {
      rows = parseFixtures(ta.value);
      const dup = new Set(all.map((m) => `${m.date}|${(m.rival || '').toLowerCase()}`));
      for (const r of rows) if (!r.error && dup.has(`${r.date}|${r.rival.toLowerCase()}`)) r.error = 'Ya existe ese partido';
      const good = rows.filter((r) => !r.error);
      btn.disabled = !good.length;
      btn.textContent = good.length ? `Añadir ${good.length} ${good.length === 1 ? 'partido' : 'partidos'}` : 'Añadir partidos';
      box.querySelector('#fxPreview').innerHTML = rows.length ? `<div class="table-scroll mt"><table class="simple-table">
        <thead><tr><th>Línea</th><th>J.</th><th>Fecha</th><th>Local</th><th>Visitante</th><th>Hora</th><th>Revisión</th></tr></thead>
        <tbody>${rows.map((r) => { const [h, a] = sides(r, team.name); return `<tr class="${r.error ? 'bad' : ''}"><td>${r.line}</td><td>${r.matchday ?? '—'}</td>
          <td>${r.date ? esc(fmt(new Date(r.date + 'T00:00:00'))) : '—'}</td><td>${esc(h)}</td><td>${esc(a)}</td><td>${esc(r.time || '—')}</td>
          <td>${r.error ? `✕ ${esc(r.error)} (no se añade)` : '✓'}</td></tr>`; }).join('')}</tbody></table></div>` : '';
    });
    btn.addEventListener('click', () => busy(btn, async () => {
      const good = rows.filter((r) => !r.error);
      const { error: e } = await client.from('matches').insert(good.map((r) => ({ team_id: team.id, season_id: team.season_id, matchday: r.matchday, date: r.date, time: r.time, rival: r.rival, is_home: r.is_home })));
      if (e) throw e;
      toast(`${good.length} ${good.length === 1 ? 'partido añadido' : 'partidos añadidos'}.`);
      location.hash = '#/partidos';
    }));
    ta.focus();
  }

  el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    const m = all.find((x) => x.id === b.closest('[data-id]').dataset.id);
    const has = (m.squad || []).length || m.goals_for != null;
    if (!(await ask(`${has ? 'Tiene convocatoria o resultado: se pierde todo, incluidas las estadísticas de ese partido. ' : ''}Se borra el partido contra ${m.rival || 'el rival'} y su reserva de campo.`, { title: '¿Borrar el partido?', yes: 'Borrar', danger: true }))) return;
    await busy(b, async () => {
      const { error: e } = await client.from('matches').delete().eq('id', m.id);
      if (e) throw e;
      toast('Partido borrado.');
      again();
    });
  }));

  await mountThread(el.querySelector('#thread'), { teamId: team.id, entity: 'partidos', title: 'Comentarios sobre los partidos' });
}
