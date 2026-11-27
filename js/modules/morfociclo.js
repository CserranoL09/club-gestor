// Morfociclo del equipo (hoja MORFOCICLO): filas × días, varios por equipo y uno predeterminado.
// Opción de ver los días respecto al partido (P+1 … P−1, Partido) y colores por intensidad.
import { esc, toast, busy, ask, permNote } from '../ui.js';
import { sb } from '../supabase.js';
import { S, permission, canEditTeam } from '../session.js';
import { autosaver } from '../store.js';
import { mountThread } from '../lib/comments.js';
import { DAYS, relLabel, intensityOf, INTENSITY } from '../lib/morpho.js';
import { printButton, wirePrint, printHead, txt } from '../lib/print.js';
import { sheetMorfociclo } from '../lib/excelbook.js';
import { exportBook } from '../lib/xlsx.js';

const SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
/** Alto aproximado de la celda para que se lea el texto entero (unos 16 caracteres por línea). */
const rowsFor = (t) => Math.min(6, Math.max(2, Math.ceil(String(t || '').length / 16)));

export async function render(el, ctx) {
  if (!S.team) { el.innerHTML = '<div class="card empty"><p>Elige un equipo en la cabecera.</p></div>'; return; }
  const team = S.team;
  const client = sb();
  const perm = permission('plan');
  const canEdit = perm.ok;
  const canDelete = canEditTeam(team.id);
  const q = ctx.query;
  const rel = q.get('rel') === '1';
  const link = (patch) => {
    const p = new URLSearchParams({ id: q.get('id') || '', rel: rel ? '1' : '', dia: q.get('dia') || '', ...patch });
    for (const [k, v] of [...p]) if (!v) p.delete(k);
    return `#/morfociclo${p.toString() ? '?' + p : ''}`;
  };

  const { data, error } = await client.from('morphocycles').select('*').eq('team_id', team.id).order('is_default', { ascending: false }).order('created_at');
  if (error) throw error;
  const all = data || [];
  const head = `
    <div class="page-head">
      <div><h1>🔁 Morfociclo</h1><p>${esc(team.name)} · semana tipo de lunes a domingo</p></div>
      <div class="actions no-print"><a class="btn" href="#/planificacion">← Planificación</a>${canEdit ? '<button class="btn primary" type="button" data-new>+ Nuevo</button>' : ''}</div>
    </div>${permNote(perm)}`;

  if (!all.length) {
    el.innerHTML = `${head}<div class="card empty"><div class="big">🔁</div><h2>Todavía no hay morfociclo</h2><p>${canEdit ? 'Crea el estándar con las filas y valores de tu Excel.' : ''}</p></div>`;
    el.querySelector('[data-new]')?.addEventListener('click', () => create());
    return;
  }
  const m = all.find((x) => x.id === q.get('id')) || all[0];
  m.rows ||= [];
  const saver = canEdit ? autosaver({ table: 'morphocycles', id: m.id, updatedAt: m.updated_at, onSaved: (r) => { m.updated_at = r.updated_at; } }) : null;
  const save = () => saver?.set({ rows: structuredClone(m.rows) });
  const dis = canEdit ? '' : 'disabled';
  const day = Math.max(0, Math.min(6, q.get('dia') != null && q.get('dia') !== '' ? +q.get('dia') : (new Date().getDay() + 6) % 7));
  const label = (i) => (rel ? relLabel(i, m.match_day) : DAYS[i][1]);

  function headCell(i) {
    const lv = intensityOf(m.rows, DAYS[i][0]);
    return `<th scope="col" class="dayh${i === m.match_day ? ' match' : ''}${lv ? ' int-' + lv : ''}">
      <span>${esc(label(i))}</span>${rel ? `<small>${DAYS[i][1]}</small>` : ''}${lv ? `<small>Intensidad ${INTENSITY[lv].toLowerCase()}</small>` : ''}</th>`;
  }

  function draw() {
    el.innerHTML = `${head}
      <nav class="mf-tabs no-print" aria-label="Morfociclos">${all.map((x) => `<a class="chip${x.id === m.id ? ' on' : ''}" href="${link({ id: x.id })}">${x.is_default ? '★ ' : ''}${esc(x.name)}</a>`).join('')}</nav>
      <section class="card mf-bar">
        <div class="mf-opts">
          <div class="grow"><label for="mf_name">Nombre</label><input id="mf_name" data-name value="${esc(m.name)}" maxlength="60" ${dis}></div>
          <div><label for="mf_md">Día de partido</label><select id="mf_md" data-md ${dis}>${DAYS.map(([, n], i) => `<option value="${i}"${m.match_day === i ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
          <label class="check"><input type="checkbox" data-rel${rel ? ' checked' : ''}> Ver como días respecto al partido</label>
        </div>
        <div class="actions">
          ${m.is_default ? '<span class="pill">★ Predeterminado</span>' : canEdit ? '<button class="btn small" type="button" data-default>Marcar como predeterminado</button>' : ''}
          ${canEdit ? '<button class="btn small" type="button" data-dup>Duplicar</button>' : ''}
          <button class="btn small" type="button" data-xlsx>Excel</button>${printButton(null, 'btn small')}
          ${canDelete && all.length > 1 ? '<button class="btn small danger" type="button" data-del>Borrar</button>' : ''}
        </div>
        <p class="hint">El predeterminado es la guía que aparece al crear y preparar sesiones. Los colores de los días salen de la fila «Complej./Intens.» (baja, media, alta).</p>
      </section>

      <div class="mf-desktop">
        <div class="per-scroll mf-scroll">
          <table class="mf-table">
            <thead><tr><th class="lbl" scope="col">Fila</th>${DAYS.map((_, i) => headCell(i)).join('')}</tr></thead>
            <tbody>${m.rows.map((r, ri) => r.section ? `
              <tr class="mf-sec" data-r="${ri}"><th colspan="8" scope="rowgroup"><div class="lbl-in"><input data-label value="${esc(r.label)}" maxlength="80" aria-label="Título de la sección" ${dis}>${canEdit ? actions(ri) : ''}</div></th></tr>` : `
              <tr data-r="${ri}">
                <th class="lbl" scope="row"><div class="lbl-in"><input data-label value="${esc(r.label)}" maxlength="60" aria-label="Nombre de la fila ${ri + 1}" ${dis}>${canEdit ? actions(ri) : ''}</div></th>
                ${DAYS.map(([k, n], i) => `<td class="${i === m.match_day ? 'match' : ''}${intensityOf(m.rows, k) ? ' int-' + intensityOf(m.rows, k) : ''}"><textarea data-v="${k}" rows="${rowsFor(r.values?.[k])}" maxlength="300" aria-label="${esc(r.label)} · ${n}" ${dis}>${esc(r.values?.[k] || '')}</textarea></td>`).join('')}
              </tr>`).join('')}</tbody>
          </table>
        </div>
      </div>

      <div class="mf-mobile">
        <nav class="mf-days" aria-label="Días">${DAYS.map((_, i) => { const lv = intensityOf(m.rows, DAYS[i][0]);
          return `<a class="mf-day${i === day ? ' on' : ''}${i === m.match_day ? ' match' : ''}${lv ? ' int-' + lv : ''}" href="${link({ dia: String(i) })}"><strong>${rel ? esc(relLabel(i, m.match_day)) : SHORT[i]}</strong>${rel ? `<small>${SHORT[i]}</small>` : ''}</a>`; }).join('')}</nav>
        <section class="card mf-col">
          <h2>${esc(DAYS[day][1])}${rel || day === m.match_day ? ` · ${esc(relLabel(day, m.match_day))}` : ''}</h2>
          ${m.rows.map((r, ri) => r.section ? `<h3 class="mf-sech">${esc(r.label)}</h3>` : `
            <label class="mf-cell" data-r="${ri}">${esc(r.label)}<textarea data-v="${DAYS[day][0]}" rows="2" maxlength="300" ${dis}>${esc(r.values?.[DAYS[day][0]] || '')}</textarea></label>`).join('')}
        </section>
      </div>

      ${canEdit ? '<div class="actions mt no-print"><button class="btn small" type="button" data-radd>+ Fila</button><button class="btn small" type="button" data-sadd>+ Sección</button></div>' : ''}
      <div id="thread" class="no-print"></div>`;
    wire();
    mountThread(el.querySelector('#thread'), { teamId: team.id, entity: 'morfociclo', title: 'Comentarios sobre el morfociclo' });
  }

  // ---------------------------------------------------------------- impresión (apaisado)
  function printView() {
    const html = `
      ${printHead({ title: m.name, team, sub: `Morfociclo · partido el ${esc(DAYS[m.match_day ?? 6][1].toLowerCase())}${m.is_default ? ' · predeterminado' : ''}` })}
      <table class="pr-t pr-mf">
        <colgroup><col style="width:30mm">${DAYS.map(() => '<col>').join('')}</colgroup>
        <thead><tr><th class="lbl">Fila</th>${DAYS.map(([k, n], i) => { const lvl = intensityOf(m.rows, k);
          return `<th class="${i === m.match_day ? 'match' : ''}${lvl ? ' int-' + lvl : ''}">${n}<small>${esc(relLabel(i, m.match_day ?? 6))}${lvl ? ' · ' + INTENSITY[lvl].toLowerCase() : ''}</small></th>`; }).join('')}</tr></thead>
        <tbody>${m.rows.map((r) => r.section ? `<tr class="sec"><th colspan="8">${esc(r.label)}</th></tr>`
          : `<tr><th class="lbl">${esc(r.label)}</th>${DAYS.map(([k], i) => `<td class="${i === m.match_day ? 'match' : ''}">${r.values?.[k] ? txt(r.values[k]) : ''}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
      <div class="pr-legend"><span><i style="background:#d9f2e3"></i>Intensidad baja</span><span><i style="background:#fdebc8"></i>Media</span><span><i style="background:#f9d0c4"></i>Alta</span></div>`;
    return { title: `${m.name} ${team.name}`, html, landscape: true };
  }

  function actions(ri) {
    return `<span class="mf-act"><button class="icon-btn small" type="button" data-up aria-label="Subir la fila"${ri ? '' : ' disabled'}>↑</button><button class="icon-btn small" type="button" data-down aria-label="Bajar la fila"${ri < m.rows.length - 1 ? '' : ' disabled'}>↓</button><button class="icon-btn small" type="button" data-rdel aria-label="Quitar la fila">✕</button></span>`;
  }
  const redraw = () => { const y = window.scrollY; draw(); window.scrollTo(0, y); };
  const recolor = () => {
    el.querySelectorAll('.mf-table thead th.dayh').forEach((th, i) => { th.outerHTML = headCell(i); });
    el.querySelectorAll('.mf-table tbody tr:not(.mf-sec)').forEach((tr) => tr.querySelectorAll('td').forEach((td, i) => {
      const lv = intensityOf(m.rows, DAYS[i][0]);
      td.className = `${i === m.match_day ? 'match' : ''}${lv ? ' int-' + lv : ''}`;
    }));
  };

  function wire() {
    el.querySelector('[data-rel]').addEventListener('change', (ev) => { location.hash = link({ rel: ev.target.checked ? '1' : '' }); });
    wirePrint(el, () => printView());
    el.querySelector('[data-xlsx]').addEventListener('click', (ev) => busy(ev.currentTarget, () => exportBook(`${m.name} ${team.name}`, [sheetMorfociclo([m])])));
    el.querySelector('[data-new]')?.addEventListener('click', () => create());
    if (!canEdit) return;
    el.querySelector('[data-name]').addEventListener('input', (ev) => { const v = ev.target.value.trim(); if (v) { m.name = v; saver.set({ name: v }); } });
    el.querySelector('[data-md]').addEventListener('change', (ev) => { m.match_day = +ev.target.value; saver.set({ match_day: m.match_day }); redraw(); });
    el.querySelectorAll('[data-r]').forEach((row) => {
      const r = m.rows[+row.dataset.r];
      row.querySelector('[data-label]')?.addEventListener('input', (ev) => { r.label = ev.target.value; save(); });
      row.querySelectorAll('[data-v]').forEach((ta) => ta.addEventListener('input', () => {
        r.values = { ...(r.values || {}), [ta.dataset.v]: ta.value };
        save();
        if (/intens/i.test(r.label || '')) recolor();
      }));
      row.querySelector('[data-up]')?.addEventListener('click', () => { const i = +row.dataset.r; [m.rows[i - 1], m.rows[i]] = [m.rows[i], m.rows[i - 1]]; save(); redraw(); });
      row.querySelector('[data-down]')?.addEventListener('click', () => { const i = +row.dataset.r; [m.rows[i + 1], m.rows[i]] = [m.rows[i], m.rows[i + 1]]; save(); redraw(); });
      row.querySelector('[data-rdel]')?.addEventListener('click', async () => {
        const filled = Object.values(r.values || {}).some(Boolean);
        if (filled && !(await ask(`Se quita la fila «${r.label}» con su contenido de todos los días.`, { title: '¿Quitar la fila?', yes: 'Quitar', danger: true }))) return;
        m.rows.splice(+row.dataset.r, 1); save(); redraw();
      });
    });
    el.querySelector('[data-radd]')?.addEventListener('click', () => {
      m.rows.push({ label: 'Nueva fila', values: {} }); save(); redraw();
      el.querySelector(`.mf-table tr[data-r="${m.rows.length - 1}"] [data-label]`)?.select();
    });
    el.querySelector('[data-sadd]')?.addEventListener('click', () => { m.rows.push({ label: 'Nueva sección', section: true, values: {} }); save(); redraw(); });
    el.querySelector('[data-default]')?.addEventListener('click', (ev) => busy(ev.currentTarget, async () => {
      await saver.flush();
      for (const o of all.filter((x) => x.is_default && x.id !== m.id)) {
        const { error: e } = await client.from('morphocycles').update({ is_default: false }).eq('id', o.id);
        if (e) throw e;
      }
      const { error: e } = await client.from('morphocycles').update({ is_default: true }).eq('id', m.id);
      if (e) throw e;
      toast(`«${m.name}» es ahora el predeterminado.`);
      render(el, ctx);
    }));
    el.querySelector('[data-dup]')?.addEventListener('click', () => create(m));
    el.querySelector('[data-del]')?.addEventListener('click', async (ev) => {
      if (!(await ask(`Se borra «${m.name}».${m.is_default ? ' El siguiente pasará a ser el predeterminado.' : ''}`, { title: '¿Borrar el morfociclo?', yes: 'Borrar', danger: true }))) return;
      await busy(ev.currentTarget, async () => {
        saver.dispose?.();
        const { error: e } = await client.from('morphocycles').delete().eq('id', m.id);
        if (e) throw e;
        const rest = all.filter((x) => x.id !== m.id);
        if (m.is_default && rest[0]) await client.from('morphocycles').update({ is_default: true }).eq('id', rest[0].id);
        toast('Morfociclo borrado.');
        location.hash = link({ id: '' });
      });
    });
  }

  async function create(base) {
    let dlg = document.getElementById('mfDlg');
    if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'mfDlg'; document.body.appendChild(dlg); }
    dlg.innerHTML = `
      <form method="dialog">
        <h2>${base ? 'Duplicar morfociclo' : 'Nuevo morfociclo'}</h2>
        ${base ? '' : `<fieldset class="tpl-pick"><legend>Plantilla</legend>
          <label class="check"><input type="radio" name="tpl" value="std" checked> <span><strong>Morfociclo estándar</strong><br><small class="muted">Las filas y valores de la hoja MORFOCICLO del Excel</small></span></label>
          <label class="check"><input type="radio" name="tpl" value="two"> <span><strong>Semana con dos partidos</strong><br><small class="muted">Filas del estándar, partidos el miércoles y el domingo</small></span></label>
          <label class="check"><input type="radio" name="tpl" value="blank"> <span><strong>En blanco</strong><br><small class="muted">Solo los nombres de las filas</small></span></label>
        </fieldset>`}
        <label for="mfn_name">Nombre</label><input id="mfn_name" name="name" maxlength="60" required value="${esc(base ? `${base.name} (copia)` : 'Semana estándar')}">
        <div class="dlg-actions"><button class="btn" value="no" formnovalidate>Cancelar</button><button class="btn primary" value="yes">${base ? 'Duplicar' : 'Crear'}</button></div>
      </form>`;
    const f = dlg.querySelector('form');
    f.addEventListener('change', (ev) => { if (ev.target.name === 'tpl') f.name.value = { std: 'Semana estándar', two: 'Semana con dos partidos', blank: 'Morfociclo' }[ev.target.value]; });
    dlg.returnValue = '';
    dlg.showModal();
    await new Promise((r) => dlg.addEventListener('close', r, { once: true }));
    if (dlg.returnValue !== 'yes') return;
    const tpl = base ? null : f.tpl.value;
    let rows = base ? structuredClone(base.rows) : null, match = base ? base.match_day : 6;
    if (!base) {
      const { data: std, error: e } = await client.rpc('default_morphocycle_rows');
      if (e) { toast(e.message, 'err'); return; }
      rows = std;
      if (tpl === 'blank') rows = rows.map((r) => ({ ...r, values: {} }));
      if (tpl === 'two') rows = rows.map((r) => ({ ...r, values: r.section ? {} : { ...(r.values || {}), mie: /principio|tem[aá]tica/i.test(r.label) ? 'PARTIDO' : '', jue: /tem[aá]tica/i.test(r.label) ? 'Recuperación activa' : (r.values?.jue && !/principio/i.test(r.label) ? '' : r.values?.jue || '') } }));
    }
    const { data: row, error } = await client.from('morphocycles').insert({ team_id: team.id, name: f.name.value.trim() || 'Morfociclo', match_day: match, rows, is_default: !all.length }).select('id').single();
    if (error) { toast(error.message, 'err'); return; }
    toast('Morfociclo creado.');
    location.hash = link({ id: row.id });
  }

  draw();
}
