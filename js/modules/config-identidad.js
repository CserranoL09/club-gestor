// Configuración → Identidad: nombre, escudo, colores, tema y tipografía (con vista previa y guardado automático).
import { esc, toast, busy, ask, squareImage } from '../ui.js';
import { sb } from '../supabase.js';
import { S, patchClub, refreshCrest, clubSettings } from '../session.js';
import { alertSettings } from '../lib/clubdata.js';
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

    <div class="grid two cfg-more">
      <section class="card">
        <fieldset class="plain" ${canEdit ? '' : 'disabled'}>
          <h2>Datos del club</h2>
          <div class="row">
            <div class="grow"><label for="cd_city">Localidad</label><input id="cd_city" data-club="city" value="${esc(club.city || '')}" maxlength="80"></div>
            <div><label for="cd_year">Año de fundación</label><input id="cd_year" data-club="founded_year" type="number" min="1850" max="2100" value="${esc(club.founded_year ?? '')}"></div>
          </div>
          <label for="cd_address">Dirección / instalación principal</label>
          <input id="cd_address" data-club="address" value="${esc(club.address || '')}" maxlength="160">
          <div class="row">
            <div class="grow"><label for="cd_email">Email de contacto</label><input id="cd_email" data-club="email" type="email" value="${esc(club.email || '')}" maxlength="120"></div>
            <div><label for="cd_phone">Teléfono</label><input id="cd_phone" data-club="phone" type="tel" value="${esc(club.phone || '')}" maxlength="30"></div>
          </div>
          <label for="cd_web">Web o redes</label>
          <input id="cd_web" data-club="website" value="${esc(club.website || '')}" maxlength="160" placeholder="https://…">
          <label for="cd_desc">Presentación del club</label>
          <textarea id="cd_desc" data-club="description" rows="3" maxlength="1000" placeholder="Historia, filosofía, categorías…">${esc(club.description || '')}</textarea>
        </fieldset>
      </section>
      <section class="card">
        <fieldset class="plain" ${canEdit ? '' : 'disabled'}>
          <h2>Acceso de los entrenadores</h2>
          <label class="check switch">
            <input type="checkbox" id="set_see_all"${clubSettings().coaches_see_all ? ' checked' : ''}>
            <span><strong>Los entrenadores pueden ver los demás equipos</strong><br>
            <small class="muted">Desactivado: cada persona del cuerpo técnico solo ve los equipos que tiene asignados. Activado: ven el trabajo de todos los equipos del club (sin poder editarlo). La Dirección y la Coordinación siempre ven sus equipos.</small></span>
          </label>
        </fieldset>
        <fieldset class="plain alerts-cfg" id="alertas" ${canEdit ? '' : 'disabled'}>
          <h2 class="mt">Alertas del panel</h2>
          <p class="hint">Qué avisos aparecen en el Panel del club. Pon 0 para desactivar las que llevan número.</p>
          <label class="check"><input type="checkbox" data-alert="no_coach"${alertSettings().no_coach ? ' checked' : ''}> Equipo sin entrenador principal</label>
          <label class="check"><input type="checkbox" data-alert="no_session"${alertSettings().no_session ? ' checked' : ''}> Equipo sin sesiones planificadas esta semana</label>
          <div class="alert-num"><label for="al_report">Informe postpartido sin hacer a los</label><input id="al_report" type="number" min="0" max="30" data-alert-num="report_days" value="${alertSettings().report_days}"><span>días</span></div>
          <div class="alert-num"><label for="al_att">Asistencia por debajo del</label><input id="al_att" type="number" min="0" max="100" data-alert-num="attendance_min" value="${alertSettings().attendance_min}"><span>%</span></div>
          <div class="alert-num"><label for="al_squad">Convocatoria sin hacer</label><input id="al_squad" type="number" min="0" max="168" data-alert-num="squad_hours" value="${alertSettings().squad_hours}"><span>horas antes del partido</span></div>
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

  // Datos del club
  el.querySelectorAll('[data-club]').forEach((inp) => inp.addEventListener('input', () => {
    const field = inp.dataset.club;
    let value = inp.value.trim();
    if (field === 'founded_year') {
      if (value === '') value = null;
      else {
        value = parseInt(value, 10);
        if (!(value >= 1850 && value <= 2100)) { inp.setAttribute('aria-invalid', 'true'); return; }
      }
    }
    if (field === 'email' && value && !/^\S+@\S+\.\S+$/.test(value)) { inp.setAttribute('aria-invalid', 'true'); return; }
    inp.removeAttribute('aria-invalid');
    club[field] = value;
    saver.set({ [field]: value });
  }));

  // Alertas del panel
  const saveAlerts = (patch) => {
    const settings = { ...clubSettings(), alerts: { ...alertSettings(), ...patch } };
    patchClub({ settings });
    saver.set({ settings });
  };
  el.querySelectorAll('[data-alert]').forEach((c) => c.addEventListener('change', () => saveAlerts({ [c.dataset.alert]: c.checked })));
  el.querySelectorAll('[data-alert-num]').forEach((i) => i.addEventListener('input', () => {
    const v = parseInt(i.value, 10);
    if (!Number.isFinite(v) || v < +i.min || v > +i.max) { i.setAttribute('aria-invalid', 'true'); return; }
    i.removeAttribute('aria-invalid');
    saveAlerts({ [i.dataset.alertNum]: v });
  }));

  // Acceso de los entrenadores
  $('#set_see_all').addEventListener('change', (ev) => {
    const settings = { ...clubSettings(), coaches_see_all: ev.target.checked };
    patchClub({ settings });
    saver.set({ settings });
  });

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
