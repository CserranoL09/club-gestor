// Ficha del jugador (#/jugador/:id): datos, resumen de la temporada, minutos por jornada,
// asistencia a entrenamientos y notas del postpartido.
import { esc } from '../ui.js';
import { sb } from '../supabase.js';
import { S, canReadTeam, permission } from '../session.js';
import { fmt } from '../lib/dates.js';
import { mountThread } from '../lib/comments.js';
import { POSITIONS, FEET, STATUS } from '../lib/players.js';
import { sides, score } from '../lib/matches.js';
import { ORIGINS } from '../lib/post.js';
import { played, playerTotals } from '../lib/seasonstats.js';
import { bars, donut, line, CAT } from '../lib/charts.js';

export async function render(el, ctx) {
  const client = sb();
  const { data: p, error } = await client.from('players').select('*').eq('id', ctx.params.id).maybeSingle();
  if (error) throw error;
  if (!p || !canReadTeam(p.team_id)) {
    el.innerHTML = '<div class="card empty"><div class="big">🔍</div><h2>Jugador no encontrado</h2><p><a href="#/plantilla">Volver a la plantilla</a></p></div>';
    return;
  }
  const team = S.teams.find((t) => t.id === p.team_id) || S.team;
  const total = (team?.periods || 2) * (team?.period_minutes || 35);
  const [mt, se] = await Promise.all([
    client.from('matches').select('id, matchday, date, rival, is_home, goals_for, goals_against, squad, events, player_stats, post').eq('team_id', p.team_id).order('date', { nullsFirst: false }),
    client.from('sessions').select('date, attendance').eq('team_id', p.team_id).order('date')
  ]);
  const matches = (mt.data || []).filter(played).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const sessions = se.data || [];
  const [t] = playerTotals([p], matches, sessions, total);
  const [label] = STATUS[p.status] || STATUS.D;
  const pos = POSITIONS.find(([k]) => k === p.position)?.[1] || '—';
  const foot = FEET.find(([k]) => k === p.foot)?.[1] || '—';
  const age = p.birth_year ? new Date().getFullYear() - p.birth_year : null;
  const attN = t.att.D + t.att.L + t.att.A;
  const recent = sessions.filter((s) => s.attendance?.[p.id]).slice(-12);

  el.innerHTML = `
    <div class="page-head">
      <div><p class="eyebrow">${esc(team?.name || '')}</p><h1><span class="shirt" aria-hidden="true">${p.number ?? '–'}</span> ${esc(p.name)}</h1>
        <p><span class="status-btn st-${esc(p.status)} static">${esc(p.status)} <small>${label}</small></span>${p.active ? '' : ' <span class="pill">Inactivo</span>'}</p></div>
      <div class="actions no-print"><a class="btn" href="#/plantilla">← Plantilla</a><a class="btn" href="#/estadisticas">Estadísticas</a><button class="btn" type="button" data-print>Imprimir</button></div>
    </div>
    <div class="grid-2">
      <section class="card">
        <h2>Datos</h2>
        <dl class="metrics">
          <div><dt>Dorsal</dt><dd>${p.number ?? '—'}</dd></div>
          <div><dt>Posición</dt><dd>${esc(pos)}</dd></div>
          <div><dt>Pie</dt><dd>${esc(foot)}</dd></div>
          <div><dt>Año</dt><dd>${p.birth_year ?? '—'}${age ? ` <small class="muted">(${age} años)</small>` : ''}</dd></div>
        </dl>
        ${permission('edit').ok ? '<p class="hint">Los datos se editan en la Plantilla.</p>' : ''}
      </section>
      <section class="card">
        <h2>Temporada</h2>
        <dl class="metrics">
          <div><dt>Convocatorias</dt><dd>${t.called} <small class="muted">de ${matches.length}</small></dd></div>
          <div><dt>Titular</dt><dd>${t.starter}</dd></div>
          <div><dt>Minutos</dt><dd>${t.minutes} <small class="muted">(${t.pct}%)</small></dd></div>
          <div><dt>Goles</dt><dd>${t.goals}${t.goals ? ` <small class="muted">${ORIGINS.filter((o) => t.gf[o]).map((o) => `${o.toLowerCase()} ${t.gf[o]}`).join(', ')}</small>` : ''}</dd></div>
          <div><dt>Asistencias</dt><dd>${t.assists}</dd></div>
          <div><dt>Tarjetas</dt><dd>🟨 ${t.yellow} · 🟥 ${t.red}</dd></div>
          <div><dt>Goles en contra en el campo</dt><dd>${t.against}</dd></div>
          <div><dt>Nota media</dt><dd>${t.avg != null ? t.avg.toFixed(1) : '—'}</dd></div>
        </dl>
      </section>
    </div>
    <div class="chart-grid">
      <section class="card wide"><h2>Minutos por jornada</h2>${matches.length
        ? bars({ width: 640, height: 200, labels: t.series.map((x) => `J${x.m.matchday ?? ''}`), series: [{ name: 'Minutos', color: 'var(--accent)', values: t.series.map((x) => x.minutes) }], title: 'Minutos por jornada', unit: ' min' })
        : '<p class="muted">Sin partidos jugados.</p>'}</section>
      <section class="card"><h2>Asistencia a entrenamientos</h2>${attN
        ? donut({ data: [{ label: 'Disponible', value: t.att.D, color: CAT[0] }, { label: 'Lesionado', value: t.att.L, color: CAT[1] }, { label: 'Ausente', value: t.att.A, color: CAT[3] }], title: 'disponible', center: `${t.attPct}%` })
          + `<p class="att-strip" aria-label="Últimas sesiones">${recent.map((s) => { const st = s.attendance[p.id].status; return `<i class="st-${esc(st)}" title="${esc(fmt(new Date(s.date + 'T00:00:00')))} · ${STATUS[st]?.[0] || st}">${esc(st)}</i>`; }).join('')}</p>`
        : '<p class="muted">Todavía no hay asistencia registrada.</p>'}</section>
      <section class="card"><h2>Notas del postpartido</h2>${t.scores.length
        ? line({ labels: t.series.map((x) => `J${x.m.matchday ?? ''}`), series: [{ name: 'Nota', color: 'var(--accent)', values: t.series.map((x) => (x.avg == null ? null : Math.round(x.avg * 10) / 10)) }], title: 'Notas', max: 5 })
        : '<p class="muted">Sin notas individuales en los informes.</p>'}</section>
    </div>
    ${matches.length ? `<section class="card"><h2>Partido a partido</h2>
      <div class="table-scroll"><table class="simple-table">
        <thead><tr><th>J.</th><th>Partido</th><th>Conv.</th><th>Min</th><th>Goles</th><th>Asis</th><th>TA</th><th>TR</th><th>Nota</th></tr></thead>
        <tbody>${t.series.map((x) => { const [h, a] = sides(x.m, team?.name || ''); const r = x.row;
          return `<tr><td>${x.m.matchday ?? '—'}</td><td><a href="#/partidos/${esc(x.m.id)}/postpartido">${esc(h)} ${esc(score(x.m))} ${esc(a)}</a> <small class="muted">${x.m.date ? esc(fmt(new Date(x.m.date + 'T00:00:00'))) : ''}</small></td>
            <td>${r?.called ? (r.starter ? 'Titular' : 'Suplente') : 'No'}</td><td>${r?.called ? x.minutes : ''}</td><td>${r ? ORIGINS.reduce((s, o) => s + (r.gf[o] || 0), 0) || '' : ''}</td><td>${r?.assists || ''}</td><td>${r?.yellow || ''}</td><td>${r?.red || ''}</td><td>${x.avg != null ? x.avg.toFixed(1) : ''}</td></tr>`; }).join('')}</tbody>
      </table></div></section>` : ''}
    <div id="thread" class="no-print"></div>`;
  el.querySelector('[data-print]').addEventListener('click', () => window.print());
  await mountThread(el.querySelector('#thread'), { teamId: p.team_id, entity: 'player', entityId: p.id, title: `Comentarios sobre ${p.name}` });
}
