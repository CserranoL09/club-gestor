// Comentarios por apartado: un botón 💬 en el título de cada sección de cualquier página de equipo.
// El profesor (y la Dirección o Coordinación que supervisa el equipo) añaden comentarios; el cuerpo técnico
// ve los apartados con comentarios marcados, responde y los marca como resueltos.
import { sb } from '../supabase.js';
import { S, canSupervise, isAdmin, isPersonalClub, teamsOfSeason } from '../session.js';
import { mountThread } from './comments.js';

/** Qué se comenta en cada ruta: entidad, id y prefijo del apartado. */
export function targetOf(route, params) {
  const p = route.path;
  if (p === '/sesiones/:id') return { entity: 'session', entityId: params.id, prefix: '' };
  if (p.startsWith('/partidos/:id/')) return { entity: 'match', entityId: params.id, prefix: p.split('/').pop() + ':' };
  if (p === '/jugador/:id') return { entity: 'player', entityId: params.id, prefix: '' };
  if (p === '/macrociclo/:id') return { entity: 'macrociclo', entityId: params.id, prefix: '' };
  if (route.area === 'team' && route.key && !p.includes(':') && p !== '/inicio') return { entity: route.key, entityId: null, prefix: '' };
  return null;
}

const slug = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/^(\d+-)+/, '').slice(0, 50) || 'general';
/** Texto del título sin contadores ni botones. */
const titleOf = (h) => { const c = h.cloneNode(true); c.querySelectorAll('.sec-cmt, .count, .pill, small, button').forEach((x) => x.remove()); return c.textContent.replace(/\s+/g, ' ').trim(); };

let observer = null;
let seq = 0;

/** Pone los marcadores en `main`. Se vuelve a aplicar si el módulo repinta una parte. */
export async function decorateSections(main, route, params) {
  observer?.disconnect();
  observer = null;
  const mine = ++seq;   // si se cambia de página mientras carga, esta llamada ya no pinta nada
  const target = targetOf(route, params);
  const teamId = S.team?.id;
  if (!target || !teamId || !S.club) return;
  // Añaden comentarios: el profesor, la Coordinación y la Dirección de un club con varios equipos.
  // (En el club de un alumno con un solo equipo, la Dirección es el propio entrenador: solo ve los marcadores con comentarios.)
  const canAdd = !!S.viewing || (canSupervise(teamId) && (!isAdmin() || (!isPersonalClub() && teamsOfSeason().length > 1)));

  // Recuento de comentarios por apartado (solo los principales)
  let q = sb().from('comments').select('section, resolved').eq('team_id', teamId).eq('entity', target.entity).is('parent_id', null);
  q = target.entityId ? q.eq('entity_id', target.entityId) : q.is('entity_id', null);
  const { data, error } = await q;
  if (mine !== seq) return;
  if (error) { console.warn(error); return; }
  const counts = {};
  for (const c of data || []) {
    const k = c.section;
    counts[k] = counts[k] || { all: 0, open: 0 };
    counts[k].all++;
    if (!c.resolved) counts[k].open++;
  }
  if (!canAdd && !(data || []).length) return;

  const apply = () => {
    const heads = [...main.querySelectorAll('.page-head h1, h2')].filter((h) => !h.dataset.secDone
      && !h.closest('.thread, .sec-thread, dialog, #printRoot, .imp-preview, .empty, .modal, .print-menu'));
    for (const h of heads) {
      h.dataset.secDone = '1';
      const title = titleOf(h);
      if (!title) continue;
      const key = target.prefix + (h.tagName === 'H1' ? 'pagina' : slug(title));
      const n = counts[key];
      if (!canAdd && !n) continue;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `sec-cmt no-print${n?.open ? ' open' : n ? ' has' : ''}`;
      btn.dataset.sec = key;
      btn.title = n ? `${n.all} ${n.all === 1 ? 'comentario' : 'comentarios'} en «${title}»${n.open ? ` (${n.open} sin resolver)` : ''}` : `Comentar «${title}»`;
      btn.setAttribute('aria-label', btn.title);
      btn.innerHTML = `💬${n ? `<span>${n.open || n.all}</span>` : '<span class="plus">+</span>'}`;
      h.appendChild(btn);
      btn.addEventListener('click', async (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        const host = h.closest('summary') ? h.closest('details') : h;
        if (host.tagName === 'DETAILS') host.open = true;
        const anchor = h.closest('summary') || h;
        let box = anchor.nextElementSibling?.classList?.contains('sec-thread') ? anchor.nextElementSibling : null;
        if (box) { box.remove(); return; }
        box = document.createElement('div');
        box.className = 'sec-thread no-print';
        anchor.after(box);
        await mountThread(box, { teamId, entity: target.entity, entityId: target.entityId, section: key, title: `Comentarios · ${title}`, open: true });
        box.querySelector('textarea')?.focus();
      });
    }
  };
  apply();
  let t = null;
  observer = new MutationObserver(() => { clearTimeout(t); t = setTimeout(apply, 120); });
  observer.observe(main, { childList: true, subtree: true });
}
