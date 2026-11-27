// Panel del profesor (#/profesor): clases con su código, alumnos de cada clase y acceso a su club en solo lectura.
import { esc, toast, busy, ask, errMsg } from '../ui.js';
import { sb } from '../supabase.js';
import { S, isTeacher, viewClub } from '../session.js';
import { exportBook } from '../lib/xlsx.js';
import { rerender } from '../router.js';

const COLS = [
  ['students', 'Alumno'], ['club_name', 'Club'], ['teams', 'Equipos'], ['sessions', 'Sesiones'], ['matches', 'Partidos'],
  ['reports_done', 'Informes'], ['open_comments', 'Tus comentarios abiertos'], ['last_activity', 'Última actividad']
];
const ago = (d) => {
  if (!d) return '—';
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 864e5);
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 30) return `hace ${days} días`;
  return new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
};

export async function render(el, ctx) {
  if (!isTeacher()) {
    el.innerHTML = `<div class="card empty"><div class="big">🎓</div><h2>Panel del profesor</h2>
      <p>Este panel es para profesores que siguen los clubes de sus alumnos. Si eres profesor, actívalo en <a href="#/perfil">Mi perfil</a>.</p></div>`;
    return;
  }
  const client = sb();
  const q = ctx.query;
  const showArchived = q.get('archivadas') === '1';
  const search = q.get('buscar') || '';
  const sort = COLS.some(([k]) => k === q.get('orden')) ? q.get('orden') : 'students';
  const dir = q.get('dir') === 'desc' ? -1 : 1;
  const nav = (patch) => {
    const p = new URLSearchParams({ archivadas: showArchived ? '1' : '', buscar: search, orden: sort, dir: dir === -1 ? 'desc' : '', ...patch });
    [...p.keys()].forEach((k) => { if (!p.get(k)) p.delete(k); });
    const h = '#/profesor' + (p.toString() ? '?' + p : '');
    if (location.hash === h) rerender(); else location.hash = h;
  };

  const { data: classes, error } = await client.from('classes').select('id, name, join_code, archived, created_at').eq('teacher_id', S.user.id).order('created_at');
  if (error) throw error;
  const shown = classes.filter((c) => showArchived || !c.archived);
  const overviews = await Promise.all(shown.map((c) => client.rpc('class_overview', { p_class: c.id })));
  const rowsOf = {};
  shown.forEach((c, i) => { if (overviews[i].error) throw overviews[i].error; rowsOf[c.id] = overviews[i].data || []; });
  const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const filter = (rows) => rows.filter((r) => !search || norm(`${r.students} ${r.club_name} ${r.teams}`).includes(norm(search)))
    .sort((a, b) => {
      const x = a[sort], y = b[sort];
      if (typeof x === 'number' || typeof y === 'number') return ((x ?? -1) - (y ?? -1)) * dir;
      if (sort === 'last_activity') return (new Date(x || 0) - new Date(y || 0)) * dir;
      return String(x ?? '').localeCompare(String(y ?? ''), 'es') * dir;
    });
  const total = Object.values(rowsOf).reduce((n, r) => n + r.length, 0);

  el.innerHTML = `
    <div class="page-head">
      <div><h1>🎓 Panel del profesor</h1><p>${classes.filter((c) => !c.archived).length} ${classes.filter((c) => !c.archived).length === 1 ? 'clase activa' : 'clases activas'} · ${total} ${total === 1 ? 'club' : 'clubes'} de alumnos. Ves sus clubes en solo lectura y les dejas comentarios en cada apartado.</p></div>
    </div>
    <section class="card">
      <h2>Nueva clase</h2>
      <form class="row prof-new" data-new novalidate>
        <label class="grow"><span class="sr-only">Nombre de la clase</span><input name="name" maxlength="120" placeholder="Curso de entrenador · Grupo A" required></label>
        <button class="btn primary" type="submit">Crear clase</button>
      </form>
      <p class="hint">Cada clase tiene un código de 6 caracteres. Tus alumnos lo escriben en «Unirme a una clase» (menú de usuario) y su club queda vinculado.</p>
    </section>
    <div class="filters card prof-filters">
      <label class="inline-label grow">Buscar alumno, club o equipo<input type="search" data-search value="${esc(search)}" placeholder="Nombre…"></label>
      <label class="check"><input type="checkbox" data-archived${showArchived ? ' checked' : ''}> Ver clases archivadas</label>
    </div>
    ${shown.length ? shown.map((c) => classCard(c, filter(rowsOf[c.id]), rowsOf[c.id].length)).join('') : `<div class="card empty"><div class="big">📚</div><h2>${classes.length ? 'No hay clases activas' : 'Todavía no tienes clases'}</h2><p>Crea una clase y comparte su código con tus alumnos.</p></div>`}`;

  function classCard(c, rows, n) {
    const th = (k, l) => `<th scope="col"><button type="button" class="th-sort${sort === k ? ' on' : ''}" data-sort="${k}">${l}${sort === k ? (dir === 1 ? ' ▲' : ' ▼') : ''}</button></th>`;
    return `
      <section class="card prof-class${c.archived ? ' archived' : ''}" data-class="${esc(c.id)}">
        <header class="prof-head">
          <div class="prof-title">
            <h2 data-name>${esc(c.name)}${c.archived ? ' <span class="pill">Archivada</span>' : ''}</h2>
            <form class="row prof-rename" data-rename hidden><label class="grow"><span class="sr-only">Nombre</span><input name="name" maxlength="120" value="${esc(c.name)}"></label><button class="btn small primary" type="submit">Guardar</button><button class="btn small" type="button" data-cancel>Cancelar</button></form>
            <p class="muted">${n} ${n === 1 ? 'alumno' : 'alumnos'}</p>
          </div>
          <div class="prof-code">
            <span class="code" aria-label="Código de la clase">${esc(c.join_code)}</span>
            <button class="btn small" type="button" data-copy="${esc(c.join_code)}">Copiar</button>
            <button class="btn small" type="button" data-regen${c.archived ? ' disabled' : ''}>Cambiar código</button>
          </div>
        </header>
        <div class="actions prof-actions">
          <button class="btn small" type="button" data-edit>Renombrar</button>
          <button class="btn small" type="button" data-archive>${c.archived ? 'Recuperar' : 'Archivar'}</button>
          <button class="btn small" type="button" data-xlsx${n ? '' : ' disabled'}>Exportar resumen de la clase</button>
        </div>
        ${n ? `<div class="table-scroll"><table class="simple-table prof-table">
          <thead><tr>${COLS.map(([k, l]) => th(k, l)).join('')}<th scope="col"><span class="sr-only">Abrir</span></th></tr></thead>
          <tbody>${rows.map((r) => `<tr>
            <td><strong>${esc(r.students || '—')}</strong></td><td>${esc(r.club_name)}</td>
            <td><small>${esc(r.teams || '—')}</small></td><td class="tnum">${r.sessions}</td><td class="tnum">${r.matches}</td>
            <td class="tnum">${r.reports_done}${r.matches ? ` <small class="muted">/ ${r.matches}</small>` : ''}</td>
            <td class="tnum">${r.open_comments ? `<span class="pill warn">${r.open_comments}</span>` : '0'}</td>
            <td>${esc(ago(r.last_activity))}</td>
            <td><button class="btn small primary" type="button" data-open="${esc(r.club_id)}" data-student="${esc(r.students || r.club_name)}">Abrir club</button></td></tr>`).join('')
            || `<tr><td colspan="${COLS.length + 1}" class="muted">Nadie coincide con «${esc(search)}».</td></tr>`}</tbody>
        </table></div>` : `<p class="hint">Aún no se ha unido nadie. Comparte el código <strong>${esc(c.join_code)}</strong> con tus alumnos.</p>`}
      </section>`;
  }

  // ---------------------------------------------------------------- eventos
  el.querySelector('[data-new]').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const name = ev.currentTarget.name.value.trim();
    if (!name) { toast('Escribe el nombre de la clase.', 'err'); return; }
    await busy(ev.currentTarget.querySelector('[type=submit]'), async () => {
      const { data, error: e } = await client.from('classes').insert({ name: name.slice(0, 120) }).select('join_code').single();
      if (e) throw e;
      toast(`Clase creada. Código: ${data.join_code}`, 'ok', 6000);
      nav({});
    });
  });
  let t = null;
  el.querySelector('[data-search]').addEventListener('input', (ev) => { clearTimeout(t); t = setTimeout(() => nav({ buscar: ev.target.value.trim() }), 350); });
  el.querySelector('[data-archived]').addEventListener('change', (ev) => nav({ archivadas: ev.target.checked ? '1' : '' }));
  el.querySelectorAll('[data-sort]').forEach((b) => b.addEventListener('click', () => nav({ orden: b.dataset.sort, dir: sort === b.dataset.sort && dir === 1 ? 'desc' : '' })));

  el.querySelectorAll('[data-class]').forEach((card) => {
    const c = classes.find((x) => x.id === card.dataset.class);
    card.querySelector('[data-copy]').addEventListener('click', async (ev) => {
      const btn = ev.currentTarget;
      try { await navigator.clipboard.writeText(c.join_code); toast(`Código ${c.join_code} copiado.`); }
      catch { toast(`El código es ${c.join_code}.`, 'ok', 6000); }
      btn.textContent = 'Copiado ✓';
    });
    card.querySelector('[data-regen]').addEventListener('click', async (ev) => {
      if (!(await ask(`El código ${c.join_code} dejará de valer para nuevos alumnos. Los que ya están en la clase siguen dentro.`, { title: '¿Cambiar el código?', yes: 'Cambiar código' }))) return;
      await busy(ev.currentTarget, async () => {
        const { data, error: e } = await client.rpc('regenerate_join_code', { p_class: c.id });
        if (e) throw e;
        toast(`Nuevo código: ${data}`, 'ok', 6000);
        nav({});
      });
    });
    const rename = card.querySelector('[data-rename]');
    card.querySelector('[data-edit]').addEventListener('click', () => { rename.hidden = false; card.querySelector('[data-name]').hidden = true; rename.name.focus(); });
    rename.querySelector('[data-cancel]').addEventListener('click', () => { rename.hidden = true; card.querySelector('[data-name]').hidden = false; });
    rename.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const name = rename.name.value.trim();
      if (!name) { toast('Escribe un nombre.', 'err'); return; }
      await busy(rename.querySelector('[type=submit]'), async () => {
        const { error: e } = await client.from('classes').update({ name: name.slice(0, 120) }).eq('id', c.id);
        if (e) throw e;
        toast('Clase renombrada.');
        nav({});
      });
    });
    card.querySelector('[data-archive]').addEventListener('click', async (ev) => {
      if (!c.archived && !(await ask('La clase se oculta y su código deja de valer. Puedes ver y recuperar las clases archivadas cuando quieras; los clubes de los alumnos no cambian.', { title: `¿Archivar «${c.name}»?`, yes: 'Archivar' }))) return;
      await busy(ev.currentTarget, async () => {
        const { error: e } = await client.from('classes').update({ archived: !c.archived }).eq('id', c.id);
        if (e) throw e;
        toast(c.archived ? 'Clase recuperada.' : 'Clase archivada.');
        nav({});
      });
    });
    card.querySelector('[data-xlsx]').addEventListener('click', (ev) => busy(ev.currentTarget, async () => {
      const rows = rowsOf[c.id];
      await exportBook(`Clase ${c.name}`, [{
        name: 'RESUMEN', freeze: { x: 1, y: 1 }, widths: [26, 26, 30, 9, 9, 9, 12, 9, 9, 16],
        rows: [['Alumno', 'Club', 'Equipos', 'Nº equipos', 'Jugadores', 'Sesiones', 'Partidos', 'Informes terminados', 'Comentarios abiertos', 'Última actividad'],
          ...rows.map((r) => [r.students || '', r.club_name, r.teams || '', r.team_count, r.players, r.sessions, r.matches, r.reports_done, r.open_comments, r.last_activity ? new Date(r.last_activity) : ''])]
      }]);
    }));
    card.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => busy(b, async () => {
      try { await viewClub(b.dataset.open, b.dataset.student); location.hash = '#/inicio'; }
      catch (err) { toast(errMsg(err), 'err'); }
    })));
  });
}
