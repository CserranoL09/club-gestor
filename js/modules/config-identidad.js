// Configuración → Identidad: nombre, escudo, colores, tema y tipografía (con vista previa y guardado automático).
import { esc, toast, busy, ask, squareImage } from '../ui.js';
import { sb } from '../supabase.js';
import { S, patchClub, refreshCrest } from '../session.js';
import { autosaver } from '../store.js';

const PRESETS = [
  ['Verde', '#16a34a', '#0ea5e9'],
  ['Azul y oro', '#1d4ed8', '#facc15'],
  ['Rojo', '#dc2626', '#111827'],
  ['Granate', '#9f1239', '#f59e0b'],
  ['Celeste', '#0ea5e9', '#1e3a8a'],
  ['Amarillo', '#eab308', '#1e3a8a'],
  ['Naranja', '#ea580c', '#0f172a'],
  ['Morado', '#7c3aed', '#22d3ee']
];
const FONTS = [
  ['saira', 'Saira', "'Saira Condensed'"],
  ['oswald', 'Oswald', "'Oswald'"],
  ['barlow', 'Barlow', "'Barlow Condensed'"]
];
const HEX = /^#[0-9a-fA-F]{6}$/;

export async function render(el, { canEdit }) {
  const club = S.club;
  const saver = autosaver({
    table: 'clubs',
    id: club.id,
    updatedAt: club.updated_at,
    onSaved: (row) => { club.updated_at = row.updated_at; },
    onReload: () => location.reload()
  });

  el.innerHTML = `
    <div class="grid two cfg-identity">
      <section class="card">
        <fieldset class="plain" ${canEdit ? '' : 'disabled'}>
          <h2>Club</h2>
          <label for="id_name">Nombre del club</label>
          <input id="id_name" name="name" value="${esc(club.name)}" maxlength="120" required>
          <p class="field-error" id="nameErr" hidden>El nombre no puede quedar vacío.</p>
          <label for="id_short">Nombre corto <small class="muted">(cabecera en el móvil y documentos)</small></label>
          <input id="id_short" name="short_name" value="${esc(club.short_name || '')}" maxlength="20">

          <h2 class="mt">Escudo</h2>
          <div class="crest-edit">
            <span class="crest big-crest" id="crestPreview" aria-hidden="true"></span>
            <div>
              <label class="btn" for="id_crest">${club.crest_path ? 'Cambiar escudo' : 'Subir escudo'}</label>
              <input id="id_crest" type="file" accept="image/png,image/jpeg,image/webp" class="sr-only">
              ${club.crest_path ? '<button class="btn danger" type="button" data-remove-crest>Quitar</button>' : ''}
              <p class="hint">PNG o JPG. Se recorta en cuadrado y se reduce a menos de 200 KB.</p>
            </div>
          </div>
        </fieldset>
      </section>

      <section class="card">
        <fieldset class="plain" ${canEdit ? '' : 'disabled'}>
          <h2>Colores</h2>
          <div class="row">
            <div>
              <label for="id_c1">Color principal</label>
              <div class="color-field"><input type="color" id="id_c1" value="${esc(club.primary_color)}" aria-label="Color principal"><input id="id_c1hex" value="${esc(club.primary_color)}" maxlength="7" aria-label="Código del color principal"></div>
            </div>
            <div>
              <label for="id_c2">Color secundario</label>
              <div class="color-field"><input type="color" id="id_c2" value="${esc(club.secondary_color)}" aria-label="Color secundario"><input id="id_c2hex" value="${esc(club.secondary_color)}" maxlength="7" aria-label="Código del color secundario"></div>
            </div>
          </div>
          <span class="label">Combinaciones rápidas</span>
          <div class="swatches">
            ${PRESETS.map(([n, a, b]) => `<button type="button" class="swatch" data-c1="${a}" data-c2="${b}" title="${n}" aria-label="${n}"><span style="background:${a}"></span><span style="background:${b}"></span></button>`).join('')}
          </div>

          <span class="label">Tema por defecto del club</span>
          <div class="seg" role="radiogroup" aria-label="Tema">
            <label><input type="radio" name="theme" value="dark"${club.theme === 'dark' ? ' checked' : ''}> 🌙 Oscuro</label>
            <label><input type="radio" name="theme" value="light"${club.theme === 'light' ? ' checked' : ''}> ☀ Claro</label>
          </div>
          <p class="hint">Cada persona puede cambiarlo en su dispositivo con el botón ◐ de la cabecera.</p>

          <span class="label">Tipografía de los títulos</span>
          <div class="font-pick" role="radiogroup" aria-label="Tipografía">
            ${FONTS.map(([k, n, f]) => `<label><input type="radio" name="font" value="${k}"${club.font === k ? ' checked' : ''}><span style="font-family:${f}">${n} · ${esc(club.short_name || 'Club')}</span></label>`).join('')}
          </div>
        </fieldset>
      </section>
    </div>

    <section class="card preview-card" aria-label="Vista previa">
      <h2>Vista previa</h2>
      <div class="preview">
        <div class="preview-head"><span class="crest" id="crestMini" aria-hidden="true"></span><div><strong id="pvName"></strong><small>Temporada · Equipo · Rol</small></div></div>
        <div class="preview-body">
          <span class="module"><span class="ico" aria-hidden="true">⚽</span><span><strong>Sesiones</strong><span>Así se verán los botones</span></span></span>
          <button class="btn primary" type="button" tabindex="-1">Botón principal</button>
          <span class="badge">Etiqueta</span>
        </div>
      </div>
    </section>`;

  const $ = (sel) => el.querySelector(sel);
  const paintCrest = () => {
    const bg = S.crestUrl ? `url("${S.crestUrl}"), linear-gradient(135deg, var(--accent), var(--accent-2))` : '';
    const txt = S.crestUrl ? '' : (club.short_name || club.name).slice(0, 3).toUpperCase();
    for (const c of [$('#crestPreview'), $('#crestMini')]) { c.style.backgroundImage = bg; c.textContent = txt; }
    $('#pvName').textContent = club.name;
  };
  paintCrest();
  if (!canEdit) return;

  // Nombre
  const name = $('#id_name');
  name.addEventListener('input', () => {
    const v = name.value.trim();
    $('#nameErr').hidden = !!v;
    name.setAttribute('aria-invalid', String(!v));
    if (!v) return;
    patchClub({ name: v });
    paintCrest();
    saver.set({ name: v });
  });
  $('#id_short').addEventListener('input', (ev) => {
    const v = ev.target.value.trim();
    patchClub({ short_name: v });
    paintCrest();
    saver.set({ short_name: v });
  });

  // Colores
  function setColors(c1, c2) {
    const patch = {};
    if (c1 && HEX.test(c1)) { patch.primary_color = c1.toLowerCase(); $('#id_c1').value = c1; $('#id_c1hex').value = c1; }
    if (c2 && HEX.test(c2)) { patch.secondary_color = c2.toLowerCase(); $('#id_c2').value = c2; $('#id_c2hex').value = c2; }
    if (!Object.keys(patch).length) return;
    patchClub(patch);
    saver.set(patch);
  }
  $('#id_c1').addEventListener('input', (ev) => setColors(ev.target.value, null));
  $('#id_c2').addEventListener('input', (ev) => setColors(null, ev.target.value));
  $('#id_c1hex').addEventListener('input', (ev) => setColors(normHex(ev.target.value), null));
  $('#id_c2hex').addEventListener('input', (ev) => setColors(null, normHex(ev.target.value)));
  el.querySelectorAll('.swatch').forEach((b) => b.addEventListener('click', () => setColors(b.dataset.c1, b.dataset.c2)));

  // Tema y tipografía
  el.querySelectorAll('[name=theme]').forEach((r) => r.addEventListener('change', () => { patchClub({ theme: r.value }); saver.set({ theme: r.value }); }));
  el.querySelectorAll('[name=font]').forEach((r) => r.addEventListener('change', () => { patchClub({ font: r.value }); saver.set({ font: r.value }); }));

  // Escudo
  $('#id_crest').addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    if (!/^image\//.test(file.type)) { toast('Elige una imagen PNG o JPG.', 'err'); return; }
    await busy(el.querySelector('label[for=id_crest]'), async () => {
      await saver.flush();
      const blob = await squareImage(file);
      const ext = { 'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg' }[blob.type] || 'png';
      const path = `${club.id}/crest.${ext}`;
      const up = await sb().storage.from('club-files').upload(path, blob, { upsert: true, contentType: blob.type });
      if (up.error) throw up.error;
      const old = club.crest_path;
      const { data, error } = await sb().from('clubs').update({ crest_path: path }).eq('id', club.id).select('updated_at').single();
      if (error) throw error;
      if (old && old !== path) await sb().storage.from('club-files').remove([old]);
      club.crest_path = path;
      club.updated_at = data.updated_at;
      saver.setVersion(data.updated_at);
      await refreshCrest();
      toast('Escudo actualizado.');
      render(el, { canEdit });
    });
  });
  el.querySelector('[data-remove-crest]')?.addEventListener('click', async (ev) => {
    if (!(await ask('El club se mostrará con sus iniciales y colores.', { title: '¿Quitar el escudo?', yes: 'Quitar', danger: true }))) return;
    await busy(ev.currentTarget, async () => {
      await saver.flush();
      const old = club.crest_path;
      const { data, error } = await sb().from('clubs').update({ crest_path: null }).eq('id', club.id).select('updated_at').single();
      if (error) throw error;
      if (old) await sb().storage.from('club-files').remove([old]);
      club.crest_path = null;
      club.updated_at = data.updated_at;
      saver.setVersion(data.updated_at);
      await refreshCrest();
      toast('Escudo quitado.');
      render(el, { canEdit });
    });
  });
}

function normHex(v) {
  const t = String(v || '').trim();
  const h = t.startsWith('#') ? t : '#' + t;
  return HEX.test(h) ? h : null;
}
