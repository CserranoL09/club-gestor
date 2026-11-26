// Bandeja de comentarios: los de todos los equipos que el usuario ve, con filtros.
import { esc, busy, toast } from '../ui.js';
import { sb } from '../supabase.js';
import { S, visibleTeams, isClubManager, selectTeam } from '../session.js';
import { entityInfo, mountThread, canCommentTeam } from '../lib/comments.js';

export async function render(el, ctx) {
  const teams = visibleTeams();
  const q = ctx.query;
  const team = q.get('team') || (isClubManager() ? '' : S.team?.id || '');
  const state = q.get('estado') || 'abiertos';
  const go = (patch) => {
    const p = new URLSearchParams({ team, estado: state, ...patch });
    [...p.keys()].forEach((k) => { if (!p.get(k)) p.delete(k); });
    location.hash = '#/comentarios' + (p.toString() ? '?' + p : '');
  };

  el.innerHTML = `
    <div class="page-head">
      <div><h1>💬 Comentarios</h1><p>Seguimiento entre la ${isClubManager() ? 'Dirección y Coordinación y los entrenadores' : 'Coordinación del club y tu cuerpo técnico'}.</p></div>
    </div>
    <div class="filters card">
      <label class="inline-label">Equipo
        <select data-f="team"><option value="">Todos</option>${teams.map((t) => `<option value="${esc(t.id)}"${t.id === team ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
      <label class="inline-label">Estado
        <select data-f="estado">${[['abiertos', 'Abiertos'], ['resueltos', 'Resueltos'], ['todos', 'Todos']].map(([k, v]) => `<option value="${k}"${k === state ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
    </div>
    <div id="inbox"><p class="hint">Cargando…</p></div>`;
  el.querySelectorAll('[data-f]').forEach((s) => s.addEventListener('change', () => go({ [s.dataset.f]: s.value })));

  const ids = team ? [team] : teams.map((t) => t.id);
  const box = el.querySelector('#inbox');
  if (!ids.length) { box.innerHTML = '<div class="card empty"><p>No ves ningún equipo en esta temporada.</p></div>'; return; }

  let query = sb().from('comments')
    .select('id, team_id, entity, entity_id, section, text, resolved, created_at, author_id, author:profiles!comments_author_id_fkey(full_name)')
    .in('team_id', ids).is('parent_id', null).order('created_at', { ascending: false }).limit(200);
  if (state === 'abiertos') query = query.eq('resolved', false);
  if (state === 'resueltos') query = query.eq('resolved', true);
  const [{ data, error }, { data: rep }] = await Promise.all([
    query,
    sb().from('comments').select('parent_id').in('team_id', ids).not('parent_id', 'is', null)
  ]);
  if (error) throw error;
  const replies = {};
  (rep || []).forEach((r) => { replies[r.parent_id] = (replies[r.parent_id] || 0) + 1; });
  const teamName = (id) => teams.find((t) => t.id === id)?.name || 'Equipo';

  if (!data.length) {
    box.innerHTML = `<div class="card empty"><div class="big">💬</div><h2>${state === 'abiertos' ? 'Nada pendiente' : 'Sin comentarios'}</h2>
      <p>${state === 'abiertos' ? 'No hay comentarios abiertos.' : 'No hay comentarios con este filtro.'} Los comentarios se escriben en «Mi equipo» y en cada apartado de un equipo.</p></div>`;
    return;
  }

  // Un bloque por apartado (equipo + apartado + id), con su hilo completo al abrirlo.
  const groups = [];
  for (const c of data) {
    const key = [c.team_id, c.entity, c.entity_id || '', c.section].join('|');
    let g = groups.find((x) => x.key === key);
    if (!g) groups.push(g = { key, c, items: [] });
    g.items.push(c);
  }
  box.innerHTML = groups.map((g, i) => {
    const info = entityInfo(g.c.entity, g.c.entity_id);
    const last = g.items[0];
    return `
      <article class="card inbox-item" data-g="${i}">
        <header>
          <div><strong>${esc(teamName(g.c.team_id))}</strong> · ${esc(info.label)}${g.c.section !== 'general' ? ` · ${esc(g.c.section)}` : ''}
            <br><small class="muted">${g.items.length} ${g.items.length === 1 ? 'comentario' : 'comentarios'} · último de ${esc(last.author?.full_name || 'alguien')}, ${esc(new Date(last.created_at).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</small></div>
          <div class="actions">
            <button class="btn small" type="button" data-open-thread>Ver conversación</button>
            <button class="btn small" type="button" data-go>Ir al apartado</button>
          </div>
        </header>
        <blockquote class="quote">${esc(String(last.text).slice(0, 220))}${last.text.length > 220 ? '…' : ''}${replies[last.id] ? `<small class="muted"> · ${replies[last.id]} ${replies[last.id] === 1 ? 'respuesta' : 'respuestas'}</small>` : ''}</blockquote>
        <div class="thread-box"></div>
      </article>`;
  }).join('');

  box.querySelectorAll('[data-open-thread]').forEach((b) => b.addEventListener('click', () => busy(b, async () => {
    const art = b.closest('[data-g]');
    const g = groups[+art.dataset.g];
    const tb = art.querySelector('.thread-box');
    if (tb.childElementCount) { tb.innerHTML = ''; b.textContent = 'Ver conversación'; return; }
    await mountThread(tb, { teamId: g.c.team_id, entity: g.c.entity, entityId: g.c.entity_id, section: g.c.section, title: 'Conversación', open: true });
    if (!canCommentTeam(g.c.team_id)) toast('Puedes leer, pero no escribir en este equipo.');
  }).then(() => { if (b.closest('[data-g]').querySelector('.thread-box').childElementCount) b.textContent = 'Ocultar'; })));
  box.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => {
    const g = groups[+b.closest('[data-g]').dataset.g];
    if (g.c.team_id !== S.team?.id) selectTeam(g.c.team_id);
    location.hash = entityInfo(g.c.entity, g.c.entity_id).href;
  }));
}
