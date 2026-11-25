// Configuración → Página inicial: orden, visibilidad y nombre de los botones, y tarjetas resumen.
import { esc, ask } from '../ui.js';
import { S, patchClub } from '../session.js';
import { autosaver } from '../store.js';
import { MODULES } from './list.js';
import { WIDGETS, normalizeLayout } from '../lib/layout.js';

export async function render(el, { canEdit }) {
  const club = S.club;
  const l = normalizeLayout(club.home_layout);
  const state = {
    order: [...l.order],
    hidden: new Set(l.hidden),
    labels: { ...l.labels },
    widgetOrder: [...l.widgets, ...WIDGETS.map((w) => w.key).filter((k) => !l.widgets.includes(k))],
    widgetsOn: new Set(l.widgets)
  };
  const saver = autosaver({
    table: 'clubs', id: club.id, updatedAt: club.updated_at,
    onSaved: (row) => { club.updated_at = row.updated_at; }
  });

  function layout() {
    return {
      order: state.order,
      hidden: [...state.hidden],
      labels: state.labels,
      widgets: state.widgetOrder.filter((k) => state.widgetsOn.has(k))
    };
  }
  function save() {
    const home = layout();
    patchClub({ home_layout: home });
    saver.set({ home_layout: home });
  }

  el.innerHTML = `
    <div class="grid two">
      <section class="card">
        <div class="section-head">
          <h2>Botones de la página inicial</h2>
        </div>
        <p class="hint">Arrastra las filas o usa ↑ ↓ para ordenarlos. Puedes cambiarles el nombre u ocultar los que tu club no use. Los cambios se guardan solos y valen para todo el club.</p>
        <fieldset class="plain" ${canEdit ? '' : 'disabled'}><ul class="sortable" id="modList"></ul></fieldset>
      </section>
      <section class="card">
        <h2>Tarjetas resumen</h2>
        <p class="hint">Aparecen encima de los botones con lo más importante de la semana.</p>
        <fieldset class="plain" ${canEdit ? '' : 'disabled'}><ul class="sortable" id="widList"></ul></fieldset>
        ${canEdit ? '<hr><button class="btn" type="button" data-reset>Volver al orden original</button>' : ''}
      </section>
    </div>`;

  const modList = el.querySelector('#modList');
  const widList = el.querySelector('#widList');

  function drawModules(focus) {
    modList.innerHTML = state.order.map((k, i) => {
      const m = MODULES.find((x) => x.key === k);
      const vis = !state.hidden.has(k);
      return `
        <li class="sort-row${vis ? '' : ' is-hidden'}" data-key="${k}" draggable="${canEdit}">
          <span class="grip" aria-hidden="true">⋮⋮</span>
          <span class="ico" aria-hidden="true">${esc(m.icon)}</span>
          <input class="label-input" value="${esc(state.labels[k] || '')}" placeholder="${esc(m.name)}" maxlength="30" aria-label="Nombre del botón ${esc(m.name)}">
          <label class="check small-check"><input type="checkbox" data-vis${vis ? ' checked' : ''}> Visible</label>
          <span class="arrows">
            <button class="icon-btn small" type="button" data-move="-1" aria-label="Subir ${esc(m.name)}"${i === 0 ? ' disabled' : ''}>↑</button>
            <button class="icon-btn small" type="button" data-move="1" aria-label="Bajar ${esc(m.name)}"${i === state.order.length - 1 ? ' disabled' : ''}>↓</button>
          </span>
        </li>`;
    }).join('');
    refocus(modList, focus);
  }

  function drawWidgets(focus) {
    widList.innerHTML = state.widgetOrder.map((k, i) => {
      const w = WIDGETS.find((x) => x.key === k);
      const on = state.widgetsOn.has(k);
      return `
        <li class="sort-row${on ? '' : ' is-hidden'}" data-key="${k}" draggable="${canEdit}">
          <span class="grip" aria-hidden="true">⋮⋮</span>
          <span class="ico" aria-hidden="true">${esc(w.icon)}</span>
          <label class="check grow-check"><input type="checkbox" data-on${on ? ' checked' : ''}> ${esc(w.name)}</label>
          <span class="arrows">
            <button class="icon-btn small" type="button" data-move="-1" aria-label="Subir ${esc(w.name)}"${i === 0 ? ' disabled' : ''}>↑</button>
            <button class="icon-btn small" type="button" data-move="1" aria-label="Bajar ${esc(w.name)}"${i === state.widgetOrder.length - 1 ? ' disabled' : ''}>↓</button>
          </span>
        </li>`;
    }).join('');
    refocus(widList, focus);
  }

  drawModules();
  drawWidgets();
  if (!canEdit) return;

  // ----- Botones
  modList.addEventListener('input', (ev) => {
    if (!ev.target.matches('.label-input')) return;
    const k = ev.target.closest('[data-key]').dataset.key;
    const v = ev.target.value.trim();
    if (v) state.labels[k] = v; else delete state.labels[k];
    save();
  });
  modList.addEventListener('change', (ev) => {
    if (!ev.target.matches('[data-vis]')) return;
    const k = ev.target.closest('[data-key]').dataset.key;
    if (ev.target.checked) state.hidden.delete(k); else state.hidden.add(k);
    ev.target.closest('li').classList.toggle('is-hidden', !ev.target.checked);
    save();
  });
  modList.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-move]');
    if (!b) return;
    const k = b.closest('[data-key]').dataset.key;
    move(state.order, k, +b.dataset.move);
    save();
    drawModules({ key: k, move: b.dataset.move });
  });
  sortable(modList, () => state.order, () => { save(); drawModules(); });

  // ----- Tarjetas
  widList.addEventListener('change', (ev) => {
    if (!ev.target.matches('[data-on]')) return;
    const k = ev.target.closest('[data-key]').dataset.key;
    if (ev.target.checked) state.widgetsOn.add(k); else state.widgetsOn.delete(k);
    ev.target.closest('li').classList.toggle('is-hidden', !ev.target.checked);
    save();
  });
  widList.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-move]');
    if (!b) return;
    const k = b.closest('[data-key]').dataset.key;
    move(state.widgetOrder, k, +b.dataset.move);
    save();
    drawWidgets({ key: k, move: b.dataset.move });
  });
  sortable(widList, () => state.widgetOrder, () => { save(); drawWidgets(); });

  el.querySelector('[data-reset]').addEventListener('click', async () => {
    if (!(await ask('Se recupera el orden original, se muestran todos los botones y tarjetas y se borran los nombres propios.', { title: '¿Volver al orden original?', yes: 'Restablecer' }))) return;
    const d = normalizeLayout({});
    state.order = [...d.order];
    state.hidden = new Set();
    state.labels = {};
    state.widgetOrder = [...d.widgets];
    state.widgetsOn = new Set(d.widgets);
    save();
    drawModules();
    drawWidgets();
  });
}

function move(list, key, delta) {
  const i = list.indexOf(key);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
}

/** Devuelve el foco a la flecha pulsada después de volver a pintar la lista. */
function refocus(list, focus) {
  if (!focus) return;
  const row = list.querySelector(`[data-key="${focus.key}"]`);
  const btn = row?.querySelector(`[data-move="${focus.move}"]`);
  (btn && !btn.disabled ? btn : row?.querySelector('[data-move]:not([disabled])'))?.focus();
}

/** Arrastrar y soltar filas (ratón). En el móvil se usan las flechas. */
function sortable(list, getOrder, onChange) {
  let dragKey = null;
  list.addEventListener('dragstart', (ev) => {
    const li = ev.target.closest('[data-key]');
    if (!li) return;
    dragKey = li.dataset.key;
    li.classList.add('dragging');
    ev.dataTransfer.effectAllowed = 'move';
    ev.dataTransfer.setData('text/plain', dragKey);
  });
  list.addEventListener('dragend', (ev) => { ev.target.closest('[data-key]')?.classList.remove('dragging'); dragKey = null; });
  list.addEventListener('dragover', (ev) => {
    if (!dragKey) return;
    ev.preventDefault();
    const over = ev.target.closest('[data-key]');
    if (!over || over.dataset.key === dragKey) return;
    const order = getOrder();
    const from = order.indexOf(dragKey);
    const to = order.indexOf(over.dataset.key);
    order.splice(from, 1);
    order.splice(to, 0, dragKey);
    const dragged = list.querySelector(`[data-key="${dragKey}"]`);
    if (from < to) over.after(dragged); else over.before(dragged);
  });
  list.addEventListener('drop', (ev) => { ev.preventDefault(); onChange(); });
}
