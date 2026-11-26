// Metodología → Objetivos por categoría (técnicos, tácticos, condicionales y psicológicos).
import { esc, toast, busy } from '../ui.js';
import { sb } from '../supabase.js';
import { S } from '../session.js';
import { autosaver } from '../store.js';
import { AREAS, EXAMPLE_OBJECTIVES, clubCategories, stageOf, stageName } from '../lib/methodology.js';

const lines = (txt) => String(txt || '').split('\n').map((x) => x.trim()).filter(Boolean);
const exampleFor = (cat) => EXAMPLE_OBJECTIVES[Object.keys(EXAMPLE_OBJECTIVES).find((k) => cat.toLowerCase().startsWith(k.toLowerCase()))];

export async function render(el, { canEdit, query }) {
  const client = sb();
  const { data, error } = await client.from('category_objectives').select('*').eq('club_id', S.club.id);
  if (error) throw error;
  const rows = data || [];
  const cats = clubCategories(rows.map((r) => r.category));
  const teamCat = S.team?.category && cats.find((c) => S.team.category.toLowerCase().startsWith(c.toLowerCase()));
  const cat = query.get('cat') || teamCat || cats[0];
  let row = rows.find((r) => r.category === cat) || null;
  const count = (c) => { const r = rows.find((x) => x.category === c); return r ? AREAS.reduce((n, a) => n + (r.objectives?.[a.key]?.length || 0), 0) : 0; };
  const objs = row?.objectives || {};

  el.innerHTML = `
    <div class="obj-layout">
      <nav class="card obj-cats" aria-label="Categorías">
        ${cats.map((c) => `<a class="obj-cat${c === cat ? ' active' : ''}" href="#/metodologia?tab=objetivos&cat=${encodeURIComponent(c)}"${c === cat ? ' aria-current="page"' : ''}>
          <span>${esc(c)}</span><span class="count">${count(c)}</span></a>`).join('')}
      </nav>
      <section class="card obj-editor">
        <div class="section-head">
          <div><h2>${esc(cat)}</h2><p class="muted">${esc(stageName(stageOf(cat)))}</p></div>
          ${canEdit && exampleFor(cat) ? '<button class="btn small" type="button" data-example>Rellenar con el ejemplo</button>' : ''}
        </div>
        ${canEdit ? `
          <div class="obj-grid">
            ${AREAS.map((a) => `
              <div><label for="ob_${a.key}">Objetivos ${a.name.toLowerCase()}</label>
              <textarea id="ob_${a.key}" data-area="${a.key}" rows="5" placeholder="Uno por línea">${esc((objs[a.key] || []).join('\n'))}</textarea></div>`).join('')}
          </div>
          <label for="ob_notes">Notas para el cuerpo técnico</label>
          <textarea id="ob_notes" data-notes rows="3" maxlength="2000">${esc(row?.notes || '')}</textarea>
          <p class="hint">Se guardan solos. Las sesiones de los equipos de esta categoría mostrarán estos objetivos como guía.</p>`
        : row ? `
          <div class="obj-grid read">
            ${AREAS.map((a) => `<div><h3>${a.name}</h3>${(objs[a.key] || []).length ? `<ul>${objs[a.key].map((o) => `<li>${esc(o)}</li>`).join('')}</ul>` : '<p class="muted">—</p>'}</div>`).join('')}
          </div>
          ${row.notes ? `<p class="quote">${esc(row.notes).replace(/\n/g, '<br>')}</p>` : ''}`
        : '<p class="muted">El club aún no ha definido objetivos para esta categoría.</p>'}
      </section>
    </div>`;

  if (!canEdit) return;

  // La fila se crea al escribir por primera vez.
  let saver = row ? autosaver({ table: 'category_objectives', id: row.id, updatedAt: row.updated_at }) : null;
  let creating = null;
  const collect = () => ({
    objectives: Object.fromEntries(AREAS.map((a) => [a.key, lines(el.querySelector(`[data-area=${a.key}]`).value)])),
    notes: el.querySelector('[data-notes]').value
  });
  async function save() {
    if (saver) { saver.set(collect()); return; }
    if (!creating) {
      creating = client.from('category_objectives').insert({ club_id: S.club.id, category: cat, ...collect() }).select().single()
        .then(({ data: r, error: e }) => {
          if (e) { creating = null; toast(e.message, 'err'); return; }
          row = r;
          saver = autosaver({ table: 'category_objectives', id: r.id, updatedAt: r.updated_at });
          saver.set(collect());     // lo escrito mientras se creaba
        });
    }
  }
  el.querySelectorAll('[data-area], [data-notes]').forEach((t) => t.addEventListener('input', save));
  el.querySelector('[data-example]')?.addEventListener('click', (ev) => busy(ev.currentTarget, async () => {
    const ex = exampleFor(cat);
    AREAS.forEach((a) => { el.querySelector(`[data-area=${a.key}]`).value = (ex[a.key] || []).join('\n'); });
    await save();
    toast('Ejemplo cargado. Adáptalo a tu club.');
  }));
}
