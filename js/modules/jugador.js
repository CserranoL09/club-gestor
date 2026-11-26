// Ficha del jugador (#/jugador/:id). Datos básicos y asistencia; las estadísticas completas llegan con el Prompt 13.
import { esc } from '../ui.js';
import { sb } from '../supabase.js';
import { S, canReadTeam, permission } from '../session.js';
import { mountThread } from '../lib/comments.js';
import { POSITIONS, FEET, STATUS } from '../lib/players.js';

export async function render(el, ctx) {
  const client = sb();
  const { data: p, error } = await client.from('players').select('*').eq('id', ctx.params.id).maybeSingle();
  if (error) throw error;
  if (!p || !canReadTeam(p.team_id)) {
    el.innerHTML = '<div class="card empty"><div class="big">🔍</div><h2>Jugador no encontrado</h2><p><a href="#/plantilla">Volver a la plantilla</a></p></div>';
    return;
  }
  const team = S.teams.find((t) => t.id === p.team_id);
  const { data: ses } = await client.from('sessions').select('date, attendance').eq('team_id', p.team_id).not(`attendance->${p.id}`, 'is', null);
  const att = { D: 0, L: 0, A: 0 };
  for (const s of ses || []) { const st = s.attendance?.[p.id]?.status; if (st in att) att[st]++; }
  const total = att.D + att.L + att.A;
  const [label, cls] = STATUS[p.status] || STATUS.D;
  const pos = POSITIONS.find(([k]) => k === p.position)?.[1] || '—';
  const foot = FEET.find(([k]) => k === p.foot)?.[1] || '—';
  const age = p.birth_year ? new Date().getFullYear() - p.birth_year : null;

  el.innerHTML = `
    <div class="page-head">
      <div><p class="eyebrow">${esc(team?.name || '')}</p><h1><span class="shirt" aria-hidden="true">${p.number ?? '–'}</span> ${esc(p.name)}</h1>
        <p><span class="status-btn st-${esc(p.status)} static">${esc(p.status)} <small>${label}</small></span>${p.active ? '' : ' <span class="pill">Inactivo</span>'}</p></div>
      <a class="btn" href="#/plantilla">← Plantilla</a>
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
        <h2>Asistencia a entrenamientos</h2>
        ${total ? `<dl class="metrics">
          <div><dt>Sesiones con registro</dt><dd>${total}</dd></div>
          <div><dt>Disponible</dt><dd>${att.D} <small class="muted">(${Math.round((att.D / total) * 100)}%)</small></dd></div>
          <div><dt>Lesionado</dt><dd>${att.L}</dd></div>
          <div><dt>Ausente</dt><dd>${att.A}</dd></div>
        </dl>` : '<p class="muted">Todavía no hay asistencia registrada.</p>'}
      </section>
    </div>
    <section class="card empty">
      <div class="big">📊</div>
      <h2>Estadísticas de la temporada</h2>
      <p>Minutos, goles, asistencias, tarjetas y valoraciones llegarán con el módulo de Estadísticas (Prompt 13).</p>
    </section>
    <div id="thread"></div>`;
  await mountThread(el.querySelector('#thread'), { teamId: p.team_id, entity: 'player', entityId: p.id, title: `Comentarios sobre ${p.name}` });
}
