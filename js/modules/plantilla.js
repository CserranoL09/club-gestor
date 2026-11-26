// Plantilla de jugadores del equipo activo: dorsal, nombre, posición, pie, año, estado y activo.
// Edición en línea con autoguardado, «Pegar lista», «Copiar de otro equipo» y exportación a Excel.
import { esc, toast, busy, ask, permNote } from '../ui.js';
import { sb } from '../supabase.js';
import { S, permission, canReadTeam } from '../session.js';
import { autosaver } from '../store.js';
import { mountThread } from '../lib/comments.js';
import { exportSheet } from '../lib/xlsx.js';
import { POSITIONS, FEET, STATUS, NEXT_STATUS, parseRoster, freeNumber } from '../lib/players.js';

const SORTS = [['dorsal', 'Dorsal'], ['nombre', 'Nombre'], ['posicion', 'Posición']];
const POS_ORDER = Object.fromEntries(POSITIONS.map(([k], i) => [k, i]));

export async function render(el, ctx) {
  if (!S.team) { el.innerHTML = '<div class="card empty"><p>Elige un equipo en la cabecera.</p></div>'; return; }
  const q = ctx.query;
  const sort = SORTS.find(([k]) => k === q.get('orden'))?.[0] || 'dorsal';
  const showInactive = q.get('inactivos') === '1';
  const panel = q.get('panel') || '';
  const perm = permission('edit');
  const canEdit = perm.ok;
  const team = S.team;
  const client = sb();
  const link = (patch) => {
    const p = new URLSearchParams({ orden: sort, inactivos: showInactive ? '1' : '', panel, ...patch });
    for (const [k, v] of [...p]) if (!v || (k === 'orden' && v === 'dorsal')) p.delete(k);
    const s = p.toString();
    return `#/plantilla${s ? '?' + s : ''}`;
  };

  const { data, error } = await client.from('players').select('*').eq('team_id', team.id).order('number', { nullsFirst: false }).order('name');
  if (error) throw error;
  const players = data || [];
  const active = players.filter((p) => p.active);
  const count = (s) => active.filter((p) => p.status === s).length;
  const sorted = (showInactive ? players : active).slice().sort((a, b) => {
    if (sort === 'nombre') return a.name.localeCompare(b.name, 'es');
    if (sort === 'posicion') return (POS_ORDER[a.position] ?? 9) - (POS_ORDER[b.position] ?? 9) || (a.number ?? 999) - (b.number ?? 999);
    return (a.number ?? 999) - (b.number ?? 999) || a.name.localeCompare(b.name, 'es');
  });
  const max = team.squad_max || (team.modality === 'f7' ? 14 : 18);

  el.innerHTML = `
    <div class="page-head">
      <div><h1>👥 Plantilla</h1><p>${esc(team.name)}${team.category ? ' · ' + esc(team.category) : ''} · ${esc(S.season?.name || '')}</p></div>
      <div class="actions no-print">
        <button class="btn" type="button" data-excel${players.length ? '' : ' disabled'}>Excel</button>
        <button class="btn" type="button" data-print>Imprimir / PDF</button>
      </div>
    </div>
    ${permNote(perm)}
    <section class="stats squad-stats" aria-label="Resumen de la plantilla">
      <div class="card stat"><strong>${active.length}</strong><span>Jugadores activos</span></div>
      <div class="card stat st-D"><strong data-count="D">${count('D')}</strong><span>Disponibles</span></div>
      <div class="card stat st-L"><strong data-count="L">${count('L')}</strong><span>Lesionados</span></div>
      <div class="card stat st-A"><strong data-count="A">${count('A')}</strong><span>Ausentes</span></div>
    </section>
    <p class="hint">Convocatoria máxima: ${max} jugadores (${team.modality === 'f7' ? 'Fútbol 7' : 'Fútbol 11'}). ${canEdit ? 'Toca el estado para cambiarlo: disponible → lesionado → ausente.' : ''}</p>

    <div class="squad-toolbar no-print">
      <div class="squad-sort">
        <label class="inline-label" for="plSort">Ordenar por</label>
        <select id="plSort" data-sort>${SORTS.map(([k, l]) => `<option value="${k}"${k === sort ? ' selected' : ''}>${l}</option>`).join('')}</select>
        <label class="check"><input type="checkbox" data-inactive${showInactive ? ' checked' : ''}> Ver inactivos (${players.length - active.length})</label>
      </div>
      ${canEdit ? `<div class="actions">
        <a class="btn${panel === 'pegar' ? ' active' : ''}" href="${link({ panel: panel === 'pegar' ? '' : 'pegar' })}">Pegar lista</a>
        <a class="btn${panel === 'copiar' ? ' active' : ''}" href="${link({ panel: panel === 'copiar' ? '' : 'copiar' })}">Copiar de otro equipo</a>
      </div>` : ''}
    </div>
    <div id="plPanel"></div>

    <section class="card squad">
      ${sorted.length ? `
      <div class="pl-row pl-head" aria-hidden="true"><span>Dorsal</span><span>Nombre</span><span>Posición</span><span>Pie</span><span>Año</span><span>Estado</span><span>Activo</span><span></span></div>
      <ul class="pl-list">${sorted.map((p) => rowHTML(p)).join('')}</ul>` : `<p class="muted">Todavía no hay jugadores.${canEdit ? ' Añádelos uno a uno, pega la lista del Excel o cópialos de otro equipo.' : ''}</p>`}
      ${canEdit ? `
      <form class="pl-row pl-new no-print" data-new>
        <input name="number" type="number" min="0" max="99" value="${freeNumber(players) ?? ''}" aria-label="Dorsal del nuevo jugador">
        <input name="name" required maxlength="80" placeholder="Nombre del nuevo jugador" aria-label="Nombre del nuevo jugador">
        <select name="position" aria-label="Posición del nuevo jugador"><option value="">Posición</option>${POSITIONS.map(([k, l]) => `<option value="${k}" title="${l}">${k}</option>`).join('')}</select>
        <button class="btn primary" type="submit">+ Añadir</button>
      </form>` : ''}
    </section>
    <div id="thread" class="no-print"></div>`;

  function rowHTML(p) {
    const dis = canEdit ? '' : 'disabled';
    const [label, cls] = STATUS[p.status] || STATUS.D;
    return `
      <li class="pl-row${p.active ? '' : ' is-hidden'}" data-id="${esc(p.id)}">
        <input data-f="number" type="number" min="0" max="99" value="${p.number ?? ''}" aria-label="Dorsal de ${esc(p.name)}" ${dis}>
        <input data-f="name" value="${esc(p.name)}" maxlength="80" aria-label="Nombre" ${dis}>
        <select data-f="position" aria-label="Posición de ${esc(p.name)}" ${dis}><option value="">—</option>${POSITIONS.map(([k, l]) => `<option value="${k}" title="${l}"${p.position === k ? ' selected' : ''}>${k}</option>`).join('')}</select>
        <select data-f="foot" aria-label="Pie de ${esc(p.name)}" ${dis}><option value="">—</option>${FEET.map(([k, l]) => `<option value="${k}"${p.foot === k ? ' selected' : ''}>${l}</option>`).join('')}</select>
        <input data-f="birth_year" type="number" min="1950" max="2100" value="${p.birth_year ?? ''}" placeholder="Año" aria-label="Año de nacimiento de ${esc(p.name)}" ${dis}>
        <button type="button" class="status-btn st-${esc(p.status)}" data-status aria-label="Estado de ${esc(p.name)}: ${label}${canEdit ? '. Toca para cambiarlo' : ''}" ${dis}>${esc(p.status)} <small>${label}</small></button>
        <label class="check pl-active"><input type="checkbox" data-f="active"${p.active ? ' checked' : ''} ${dis}><span>Activo</span></label>
        <span class="pl-actions"><a class="btn small" href="#/jugador/${esc(p.id)}">Ficha</a>${canEdit ? `<button class="icon-btn small" type="button" data-del aria-label="Quitar a ${esc(p.name)}">✕</button>` : ''}</span>
        <small class="pl-err" role="alert" hidden></small>
      </li>`;
  }

  // ---------- Barra
  el.querySelector('[data-sort]').addEventListener('change', (ev) => { location.hash = link({ orden: ev.target.value }); });
  el.querySelector('[data-inactive]').addEventListener('change', (ev) => { location.hash = link({ inactivos: ev.target.checked ? '1' : '' }); });
  el.querySelector('[data-print]').addEventListener('click', () => window.print());
  el.querySelector('[data-excel]').addEventListener('click', (ev) => busy(ev.currentTarget, () => exportSheet({
    name: `Plantilla ${team.name}`, sheet: 'Plantilla',
    header: ['Dorsal', 'Nombre', 'Posición', 'Pie', 'Año', 'Estado', 'Activo'],
    rows: sorted.map((p) => [p.number ?? '', p.name, p.position, p.foot || '', p.birth_year ?? '', STATUS[p.status]?.[0] || '', p.active ? 'Sí' : 'No']),
    widths: [8, 30, 10, 10, 8, 12, 8]
  })));

  // ---------- Edición en línea
  const byId = new Map(players.map((p) => [p.id, p]));
  const refreshCounts = () => {
    for (const s of ['D', 'L', 'A']) el.querySelector(`[data-count="${s}"]`).textContent = players.filter((p) => p.active && p.status === s).length;
  };
  /** Dorsal libre entre los activos (el índice único de la base de datos también lo impide). */
  const clash = (p, number) => number != null && players.find((o) => o.id !== p.id && o.active && o.number === number);

  if (canEdit) {
    el.querySelectorAll('.pl-list [data-id]').forEach((li) => {
      const p = byId.get(li.dataset.id);
      const err = li.querySelector('.pl-err');
      const showErr = (msg, inp) => {
        err.hidden = !msg; err.textContent = msg || '';
        if (inp) inp.toggleAttribute('aria-invalid', !!msg);
      };
      const saver = autosaver({ table: 'players', id: p.id, updatedAt: p.updated_at, onSaved: (row) => Object.assign(p, row) });
      li.querySelectorAll('[data-f]').forEach((inp) => {
        const evName = inp.type === 'checkbox' || inp.tagName === 'SELECT' ? 'change' : 'input';
        inp.addEventListener(evName, () => {
          const k = inp.dataset.f;
          let v = inp.type === 'checkbox' ? inp.checked : inp.value;
          if (k === 'name') {
            v = v.trim();
            if (!v) { showErr('El nombre no puede quedar vacío.', inp); return; }
          }
          if (k === 'number') {
            v = v === '' ? null : +v;
            if (v != null && (!Number.isInteger(v) || v < 0 || v > 99)) { showErr('El dorsal va de 0 a 99.', inp); return; }
            const o = p.active && clash(p, v);
            if (o) { showErr(`El ${v} ya es de ${o.name}. Elige otro dorsal.`, inp); return; }
          }
          if (k === 'birth_year') {
            v = v === '' ? null : +v;
            if (v != null && (v < 1950 || v > 2100)) { showErr('Año de nacimiento no válido.', inp); return; }
          }
          if (k === 'active' && v) {
            const o = clash(p, p.number);
            if (o) { inp.checked = false; showErr(`No se puede reactivar con el ${p.number}: lo tiene ${o.name}. Cambia antes el dorsal.`); return; }
          }
          if (k === 'foot' || k === 'position') v = v || (k === 'foot' ? null : '');
          showErr('', inp);
          p[k] = v;
          if (k === 'active') { li.classList.toggle('is-hidden', !v); refreshCounts(); }
          saver.set({ [k]: v });
        });
      });
      li.querySelector('[data-status]').addEventListener('click', (ev) => {
        const next = NEXT_STATUS[p.status] || 'D';
        p.status = next;
        const b = ev.currentTarget;
        b.className = `status-btn st-${next}`;
        b.innerHTML = `${next} <small>${STATUS[next][0]}</small>`;
        b.setAttribute('aria-label', `Estado de ${p.name}: ${STATUS[next][0]}. Toca para cambiarlo`);
        refreshCounts();
        saver.set({ status: next });
      });
      li.querySelector('[data-del]').addEventListener('click', async (ev) => {
        const btn = ev.currentTarget;
        const { data: use, error: e } = await client.rpc('player_usage', { p_player: p.id });
        if (e) { toast(e.message, 'err'); return; }
        const parts = [use.sessions ? `${use.sessions} ${use.sessions === 1 ? 'sesión' : 'sesiones'}` : '', use.matches ? `${use.matches} ${use.matches === 1 ? 'partido' : 'partidos'}` : ''].filter(Boolean);
        if (parts.length) {
          if (!p.active) { toast(`${p.name} ya está inactivo y tiene datos en ${parts.join(' y ')}: se conserva para las estadísticas.`, 'err', 6000); return; }
          if (!(await ask(`${p.name} aparece en ${parts.join(' y ')}. Si lo borras se pierden sus datos y estadísticas. Márcalo como inactivo: deja de salir en la plantilla y en las convocatorias, pero se conserva todo.`,
            { title: `¿Quitar a ${p.name}?`, yes: 'Marcar como inactivo' }))) return;
          await busy(btn, async () => {
            await saver.flush();
            const { error: e2 } = await client.from('players').update({ active: false }).eq('id', p.id);
            if (e2) throw e2;
            toast(`${p.name} marcado como inactivo.`);
            again();
          });
          return;
        }
        if (!(await ask(`${p.name} no tiene datos en sesiones ni partidos.`, { title: `¿Borrar a ${p.name}?`, yes: 'Borrar', danger: true }))) return;
        await busy(btn, async () => {
          saver.dispose?.();
          const { error: e2 } = await client.from('players').delete().eq('id', p.id);
          if (e2) throw e2;
          toast(`${p.name} borrado.`);
          again();
        });
      });
    });

    el.querySelector('[data-new]').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const f = ev.target;
      const number = f.number.value === '' ? null : +f.number.value;
      const o = clash({ id: null }, number);
      if (o) { toast(`El ${number} ya es de ${o.name}. Elige otro dorsal.`, 'err'); f.number.focus(); return; }
      busy(f.querySelector('[type=submit]'), async () => {
        const { error: e } = await client.from('players').insert({ team_id: team.id, number, name: f.name.value.trim(), position: f.position.value });
        if (e) throw e;
        toast(`${f.name.value.trim()} añadido.`);
        await again();
        el.querySelector('[data-new] [name=name]')?.focus();
      });
    });
  }

  const again = () => render(el, ctx);

  // ---------- Paneles
  const box = el.querySelector('#plPanel');
  if (canEdit && panel === 'pegar') pastePanel(box);
  if (canEdit && panel === 'copiar') await copyPanel(box);

  function pastePanel(box) {
    const taken = new Map(active.filter((p) => p.number != null).map((p) => [p.number, p.name]));
    box.innerHTML = `
      <section class="card paste no-print">
        <h2>Pegar lista</h2>
        <p class="hint">Una línea por jugador. Vale «7 Pedro López» o, separado por punto y coma o tabulador (copiado del Excel): <code>dorsal;nombre;posición;pie;año</code>, p. ej. <code>7;Pedro López;DEL;zurdo;2014</code>.</p>
        <label class="sr-only" for="plPaste">Lista de jugadores</label>
        <textarea id="plPaste" rows="7" placeholder="1;Hugo;POR;diestro;2014&#10;4 Mario Gil&#10;7;Pedro López;DEL;zurdo"></textarea>
        <div id="plPreview" aria-live="polite"></div>
        <div class="actions mt"><button class="btn primary" type="button" data-import disabled>Añadir jugadores</button><a class="btn" href="${link({ panel: '' })}">Cerrar</a></div>
      </section>`;
    const ta = box.querySelector('textarea');
    const btn = box.querySelector('[data-import]');
    let rows = [];
    const preview = () => {
      rows = parseRoster(ta.value, taken);
      const good = rows.filter((r) => !r.error);
      btn.disabled = !good.length;
      btn.textContent = good.length ? `Añadir ${good.length} ${good.length === 1 ? 'jugador' : 'jugadores'}` : 'Añadir jugadores';
      box.querySelector('#plPreview').innerHTML = rows.length ? `
        <div class="table-scroll mt"><table class="simple-table">
          <thead><tr><th>Línea</th><th>Dorsal</th><th>Nombre</th><th>Pos.</th><th>Pie</th><th>Año</th><th>Revisión</th></tr></thead>
          <tbody>${rows.map((r) => `<tr class="${r.error ? 'bad' : r.warn.length ? 'warnrow' : ''}">
            <td>${r.line}</td><td>${r.number ?? '—'}</td><td>${esc(r.name || '—')}</td><td>${esc(r.position || '—')}</td><td>${esc(r.foot || '—')}</td><td>${r.birth_year ?? '—'}</td>
            <td>${r.error ? `✕ ${esc(r.error)} (no se añade)` : r.warn.length ? `⚠ ${esc(r.warn.join('; '))}` : '✓'}</td></tr>`).join('')}</tbody>
        </table></div>` : '';
    };
    ta.addEventListener('input', preview);
    btn.addEventListener('click', () => busy(btn, async () => {
      const good = rows.filter((r) => !r.error);
      const { error: e } = await client.from('players').insert(good.map((r) => ({ team_id: team.id, number: r.number, name: r.name, position: r.position, foot: r.foot, birth_year: r.birth_year })));
      if (e) throw e;
      toast(`${good.length} ${good.length === 1 ? 'jugador añadido' : 'jugadores añadidos'}.`);
      location.hash = link({ panel: '' });
    }));
    ta.focus();
  }

  async function copyPanel(box) {
    const seasons = new Map(S.seasons.map((s) => [s.id, s.name]));
    const others = S.teams.filter((t) => t.id !== team.id && canReadTeam(t.id))
      .sort((a, b) => (seasons.get(b.season_id) || '').localeCompare(seasons.get(a.season_id) || '') || a.name.localeCompare(b.name, 'es'));
    const from = others.find((t) => t.id === q.get('de'));
    box.innerHTML = `
      <section class="card copy no-print">
        <h2>Copiar de otro equipo o temporada</h2>
        ${others.length ? `
        <label for="plFrom">Equipo de origen</label>
        <select id="plFrom" data-from><option value="">Elige un equipo…</option>${others.map((t) => `<option value="${esc(t.id)}"${t.id === from?.id ? ' selected' : ''}>${esc(t.name)} · ${esc(seasons.get(t.season_id) || '')}</option>`).join('')}</select>
        <div id="plFromList" class="mt"></div>` : '<p class="muted">No hay otros equipos que puedas ver.</p>'}
        <div class="actions mt"><a class="btn" href="${link({ panel: '' })}">Cerrar</a></div>
      </section>`;
    box.querySelector('[data-from]')?.addEventListener('change', (ev) => { location.hash = link({ panel: 'copiar', de: ev.target.value }); });
    if (!from) return;
    const { data: src, error: e } = await client.from('players').select('number, name, position, foot, birth_year').eq('team_id', from.id).eq('active', true).order('number', { nullsFirst: false });
    if (e) throw e;
    const names = new Set(active.map((p) => p.name.toLowerCase()));
    const list = box.querySelector('#plFromList');
    if (!src.length) { list.innerHTML = '<p class="muted">Ese equipo no tiene jugadores activos.</p>'; return; }
    list.innerHTML = `
      <p class="hint">Se copian los datos (no las estadísticas). Si un dorsal ya está ocupado aquí, el jugador se copia sin dorsal.</p>
      <ul class="copy-list">${src.map((p, i) => {
        const dup = names.has(p.name.toLowerCase());
        return `<li><label class="check"><input type="checkbox" value="${i}"${dup ? '' : ' checked'}> <span>${p.number ?? '—'} · ${esc(p.name)} ${p.position ? `<small class="muted">${esc(p.position)}</small>` : ''}
          ${dup ? '<small class="warn-text">ya está en la plantilla</small>' : clash({ id: null }, p.number) ? `<small class="muted">(el ${p.number} está ocupado: sin dorsal)</small>` : ''}</span></label></li>`;
      }).join('')}</ul>
      <button class="btn primary" type="button" data-copy>Copiar seleccionados</button>`;
    list.querySelector('[data-copy]').addEventListener('click', (ev) => busy(ev.currentTarget, async () => {
      const pick = [...list.querySelectorAll('input:checked')].map((x) => src[+x.value]);
      if (!pick.length) { toast('Marca al menos un jugador.', 'err'); return; }
      const used = new Set(active.map((p) => p.number).filter((n) => n != null));
      const rows = pick.map((p) => {
        const number = p.number != null && !used.has(p.number) ? p.number : null;
        if (number != null) used.add(number);
        return { team_id: team.id, number, name: p.name, position: p.position, foot: p.foot, birth_year: p.birth_year };
      });
      const { error: e2 } = await client.from('players').insert(rows);
      if (e2) throw e2;
      toast(`${rows.length} ${rows.length === 1 ? 'jugador copiado' : 'jugadores copiados'} de ${from.name}.`);
      location.hash = link({ panel: '', de: '' });
    }));
  }

  if (ctx.route?.area === 'team') await mountThread(el.querySelector('#thread'), { teamId: team.id, entity: 'plantilla', title: 'Comentarios sobre la plantilla' });
}
