// Configuración → Instalaciones: campos (enteros, 1/2 o 1/4), vestuarios y otras salas.
// Las mantienen la Dirección y la Coordinación; las reservas se hacen desde el calendario.
import { esc, toast, busy, ask, formValues } from '../ui.js';
import { sb } from '../supabase.js';
import { S } from '../session.js';
import { autosaver } from '../store.js';
import { FACILITY_KINDS } from '../lib/calendar.js';

const EXAMPLE = [
  { name: 'Campo 1', kind: 'campo', divisible: true },
  { name: 'Campo 2 (F7)', kind: 'campo', divisible: true },
  { name: 'Vestuario 1', kind: 'vestuario', divisible: false },
  { name: 'Vestuario 2', kind: 'vestuario', divisible: false }
];

export async function render(el, { canEdit }) {
  const client = sb();
  const { data, error } = await client.from('facilities').select('*').eq('club_id', S.club.id).order('sort').order('name');
  if (error) throw error;
  const list = data || [];
  const dis = canEdit ? '' : 'disabled';
  const kindOpts = (k) => FACILITY_KINDS.map(([v, l]) => `<option value="${v}"${v === k ? ' selected' : ''}>${l}</option>`).join('');

  el.innerHTML = `
    <section class="card">
      <div class="section-head">
        <div><h2>🏟 Instalaciones</h2>
          <p class="hint">Los campos divisibles se reservan completos, por mitades o por cuartos. El calendario avisa cuando dos reservas no caben a la vez.</p></div>
      </div>
      ${list.length ? `<ul class="fac-list">${list.map((f, i) => `
        <li class="fac${f.active ? '' : ' is-hidden'}" data-id="${esc(f.id)}">
          <input data-f="name" value="${esc(f.name)}" maxlength="60" aria-label="Nombre de la instalación" ${dis}>
          <select data-f="kind" aria-label="Tipo de ${esc(f.name)}" ${dis}>${kindOpts(f.kind)}</select>
          <label class="check"><input type="checkbox" data-f="divisible"${f.divisible ? ' checked' : ''}${f.kind !== 'campo' ? ' disabled' : ''} ${dis}> Por mitades y cuartos</label>
          <label class="check"><input type="checkbox" data-f="active"${f.active ? ' checked' : ''} ${dis}> En uso</label>
          <input data-f="notes" value="${esc(f.notes)}" maxlength="200" placeholder="Notas (superficie, luz, horario…)" aria-label="Notas de ${esc(f.name)}" ${dis}>
          ${canEdit ? `<span class="arrows"><button class="icon-btn small" type="button" data-move="-1" aria-label="Subir"${i ? '' : ' disabled'}>↑</button><button class="icon-btn small" type="button" data-del aria-label="Borrar ${esc(f.name)}">✕</button></span>` : ''}
        </li>`).join('')}</ul>`
        : `<p class="muted">Todavía no hay instalaciones.</p>${canEdit ? '<button class="btn" type="button" data-example>Añadir 2 campos y 2 vestuarios de ejemplo</button>' : ''}`}
      ${canEdit ? `
        <form class="fac-new" data-new>
          <div class="grow-label"><label for="fn_name">Nueva instalación</label><input id="fn_name" name="name" maxlength="60" required placeholder="p. ej. Campo municipal"></div>
          <div><label for="fn_kind">Tipo</label><select id="fn_kind" name="kind">${kindOpts('campo')}</select></div>
          <button class="btn primary" type="submit">Añadir</button>
        </form>` : ''}
    </section>`;
  if (!canEdit) return;

  const again = () => render(el, { canEdit });
  el.querySelectorAll('.fac').forEach((li) => {
    const f = list.find((x) => x.id === li.dataset.id);
    const saver = autosaver({ table: 'facilities', id: f.id, updatedAt: f.updated_at, onSaved: (row) => Object.assign(f, row) });
    li.querySelectorAll('[data-f]').forEach((inp) => inp.addEventListener(inp.type === 'checkbox' || inp.tagName === 'SELECT' ? 'change' : 'input', () => {
      const k = inp.dataset.f;
      let v = inp.type === 'checkbox' ? inp.checked : inp.value;
      if (k === 'name') { v = v.trim(); if (!v) { inp.setAttribute('aria-invalid', 'true'); return; } inp.removeAttribute('aria-invalid'); }
      const patch = { [k]: v };
      if (k === 'kind') {
        const div = li.querySelector('[data-f=divisible]');
        div.disabled = v !== 'campo';
        if (v !== 'campo') { div.checked = false; patch.divisible = false; }
      }
      if (k === 'active') li.classList.toggle('is-hidden', !v);
      saver.set(patch);
    }));
  });
  el.querySelectorAll('[data-move]').forEach((b) => b.addEventListener('click', () => busy(b, async () => {
    const i = list.findIndex((x) => x.id === b.closest('[data-id]').dataset.id);
    const order = [...list];
    [order[i - 1], order[i]] = [order[i], order[i - 1]];
    await Promise.all(order.map((x, n) => client.from('facilities').update({ sort: n }).eq('id', x.id)));
    again();
  })));
  el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    const f = list.find((x) => x.id === b.closest('[data-id]').dataset.id);
    if (!(await ask(`Se borran también todas sus reservas. Si solo deja de usarse, desmarca «En uso».`, { title: `¿Borrar ${f.name}?`, yes: 'Borrar', danger: true }))) return;
    await busy(b, async () => {
      const { error: e } = await client.from('facilities').delete().eq('id', f.id);
      if (e) throw e;
      toast('Instalación borrada.');
      again();
    });
  }));
  el.querySelector('[data-example]')?.addEventListener('click', (ev) => busy(ev.currentTarget, async () => {
    const { error: e } = await client.from('facilities').insert(EXAMPLE.map((x, n) => ({ ...x, club_id: S.club.id, sort: n })));
    if (e) throw e;
    toast('Instalaciones añadidas. Cambia los nombres por los de tu club.');
    again();
  }));
  el.querySelector('[data-new]').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const v = formValues(ev.target);
    busy(ev.target.querySelector('[type=submit]'), async () => {
      const { error: e } = await client.from('facilities').insert({ club_id: S.club.id, name: v.name.trim(), kind: v.kind, divisible: v.kind === 'campo', sort: list.length });
      if (e) throw e;
      toast(`${v.name.trim()} añadida.`);
      again();
    });
  });
}
