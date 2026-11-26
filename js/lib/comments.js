// Comentarios de supervisión: hilo por apartado (equipo, módulo, sesión, informe…).
// Escriben Dirección, Coordinación del equipo, su cuerpo técnico y el profesor (RLS: can_comment).
import { esc, toast, busy, ask } from '../ui.js';
import { sb } from '../supabase.js';
import { S, canSupervise, isMyTeam, isTeacher } from '../session.js';
import { MODULES } from '../modules/list.js';

/** Nombre y enlace de cada apartado comentable. */
export function entityInfo(entity, entityId) {
  if (entity === 'team') return { label: 'Equipo (general)', href: '#/inicio' };
  if (entity === 'session' && entityId) return { label: 'Sesión', href: `#/sesiones/${entityId}` };
  if (entity === 'match' && entityId) return { label: 'Partido', href: `#/partidos/${entityId}/prepartido` };
  const m = MODULES.find((x) => x.key === entity);
  if (m) return { label: m.name, href: m.route };
  return { label: entity, href: '#/inicio' };
}

/** ¿Puede escribir en los comentarios de este equipo? (la seguridad real la da RLS) */
export function canCommentTeam(teamId) {
  return !!teamId && (canSupervise(teamId) || isMyTeam(teamId) || isTeacher());
}

const SELECT = 'id, parent_id, team_id, entity, entity_id, section, author_id, text, resolved, created_at, author:profiles!comments_author_id_fkey(full_name)';
const when = (d) => new Date(d).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const body = (t) => esc(t).replace(/\n/g, '<br>');

/**
 * Monta un hilo de comentarios en `el`.
 * @param teamId    equipo
 * @param entity    'team' | clave del módulo | 'session' | 'match' …
 * @param entityId  id concreto (sesión, partido) o null
 * @param section   apartado dentro de la página ('general' por defecto)
 */
export async function mountThread(el, { teamId, entity, entityId = null, section = 'general', title = 'Comentarios', open = null }) {
  if (!teamId || !S.club) { el.innerHTML = ''; return; }
  const client = sb();
  const me = S.user?.id;
  const canWrite = canCommentTeam(teamId);

  async function load() {
    let q = client.from('comments').select(SELECT).eq('team_id', teamId).eq('entity', entity).eq('section', section).order('created_at');
    q = entityId ? q.eq('entity_id', entityId) : q.is('entity_id', null);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }

  async function draw() {
    let list;
    try { list = await load(); } catch (err) { console.error(err); el.innerHTML = '<p class="hint">No se han podido cargar los comentarios.</p>'; return; }
    const roots = list.filter((c) => !c.parent_id);
    const replies = (id) => list.filter((c) => c.parent_id === id);
    const openCount = roots.filter((c) => !c.resolved).length;
    const isOpen = open ?? (openCount > 0);
    const item = (c, reply = false) => `
      <li class="cmt${c.resolved ? ' resolved' : ''}${reply ? ' reply' : ''}" data-cid="${esc(c.id)}">
        <div class="cmt-head">
          <span class="avatar sm" aria-hidden="true">${esc((c.author?.full_name || '?').slice(0, 1).toUpperCase())}</span>
          <strong>${esc(c.author?.full_name || 'Alguien')}</strong>
          <small class="muted">${esc(when(c.created_at))}</small>
          ${!reply ? `<span class="pill ${c.resolved ? 'ok' : 'warn'}">${c.resolved ? 'Resuelto' : 'Abierto'}</span>` : ''}
        </div>
        <p class="cmt-text">${body(c.text)}</p>
        <div class="cmt-actions">
          ${!reply && canWrite ? `<button type="button" class="linklike" data-reply>Responder</button>` : ''}
          ${!reply && canWrite ? `<button type="button" class="linklike" data-resolve>${c.resolved ? 'Reabrir' : 'Marcar como resuelto'}</button>` : ''}
          ${c.author_id === me ? '<button type="button" class="linklike danger-text" data-del>Borrar</button>' : ''}
        </div>
        ${!reply ? `<ul class="cmt-replies">${replies(c.id).map((r) => item(r, true)).join('')}</ul>
          <form class="cmt-form reply-form" data-reply-form hidden><label class="sr-only" for="r-${esc(c.id)}">Respuesta</label>
            <textarea id="r-${esc(c.id)}" rows="2" maxlength="4000" placeholder="Escribe tu respuesta…"></textarea>
            <div class="actions"><button class="btn small primary" type="submit">Responder</button><button class="btn small" type="button" data-cancel>Cancelar</button></div></form>` : ''}
      </li>`;

    el.innerHTML = `
      <details class="card thread"${isOpen ? ' open' : ''} data-thread="${esc(entity)}">
        <summary><span>💬 ${esc(title)}</span> <span class="count">${roots.length}</span>${openCount ? ` <span class="pill warn">${openCount} ${openCount === 1 ? 'abierto' : 'abiertos'}</span>` : ''}</summary>
        ${roots.length ? `<ul class="cmt-list">${roots.map((c) => item(c)).join('')}</ul>` : '<p class="hint">Todavía no hay comentarios en este apartado.</p>'}
        ${canWrite ? `
          <form class="cmt-form" data-new>
            <label class="sr-only" for="new-${esc(entity)}">Nuevo comentario</label>
            <textarea id="new-${esc(entity)}" rows="2" maxlength="4000" placeholder="${canSupervise(teamId) ? 'Escribe un comentario para el cuerpo técnico…' : 'Escribe un comentario…'}"></textarea>
            <button class="btn small primary" type="submit">Publicar</button>
          </form>` : '<p class="hint">Puedes leer los comentarios, pero no escribir en este equipo.</p>'}
      </details>`;
    wire(list);
  }

  function wire(list) {
    const insert = async (text, parentId) => {
      const t = text.trim();
      if (!t) { toast('Escribe algo antes de publicar.', 'err'); return false; }
      const { error } = await client.from('comments').insert({
        club_id: S.club.id, team_id: teamId, entity, entity_id: entityId, section, parent_id: parentId || null, text: t
      });
      if (error) throw error;
      return true;
    };
    el.querySelector('[data-new]')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const ta = ev.currentTarget.querySelector('textarea');
      await busy(ev.currentTarget.querySelector('[type=submit]'), async () => {
        if (await insert(ta.value)) { toast('Comentario publicado.'); open = true; await draw(); }
      });
    });
    el.querySelectorAll('[data-reply]').forEach((b) => b.addEventListener('click', () => {
      const f = b.closest('.cmt').querySelector('[data-reply-form]');
      f.hidden = false;
      f.querySelector('textarea').focus();
    }));
    el.querySelectorAll('[data-reply-form]').forEach((f) => {
      f.querySelector('[data-cancel]').addEventListener('click', () => { f.hidden = true; });
      f.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        await busy(f.querySelector('[type=submit]'), async () => {
          if (await insert(f.querySelector('textarea').value, f.closest('[data-cid]').dataset.cid)) { open = true; await draw(); }
        });
      });
    });
    el.querySelectorAll('[data-resolve]').forEach((b) => b.addEventListener('click', () => busy(b, async () => {
      const c = list.find((x) => x.id === b.closest('[data-cid]').dataset.cid);
      const { error } = await client.from('comments').update({ resolved: !c.resolved }).eq('id', c.id);
      if (error) throw error;
      toast(c.resolved ? 'Comentario reabierto.' : 'Comentario resuelto.');
      open = true;
      await draw();
    })));
    el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!(await ask('Se borrará el comentario y sus respuestas.', { title: '¿Borrar el comentario?', yes: 'Borrar', danger: true }))) return;
      await busy(b, async () => {
        const { error } = await client.from('comments').delete().eq('id', b.closest('[data-cid]').dataset.cid);
        if (error) throw error;
        open = true;
        await draw();
      });
    }));
  }

  await draw();
}
