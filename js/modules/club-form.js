// Formulario «Crear mi club» (lo usan la bienvenida y «Unirme a una clase»).
import { esc, formValues, squareImage, toast } from '../ui.js';
import { sb } from '../supabase.js';
import { seasonName, mondayOf, addDays } from '../lib/dates.js';

function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function seasonDefaults(date = new Date()) {
  const name = seasonName(date);
  const year = parseInt(name, 10);
  const aug1 = new Date(year, 7, 1);
  const firstMonday = aug1.getDay() === 1 ? aug1 : addDays(mondayOf(aug1), 7);
  return { name, start: iso(firstMonday), end: `${year + 1}-06-30` };
}

export function clubFormHTML({ submitLabel = 'Crear club' } = {}) {
  const s = seasonDefaults();
  return `
    <form class="club-form" novalidate>
      <fieldset>
        <legend>Club</legend>
        <div class="row">
          <div class="grow">
            <label for="cf_name">Nombre del club</label>
            <input id="cf_name" name="name" required maxlength="120" placeholder="p. ej. CD Las Rozas">
          </div>
          <div>
            <label for="cf_short">Nombre corto</label>
            <input id="cf_short" name="short_name" maxlength="20" placeholder="p. ej. CDLR">
          </div>
        </div>
        <label for="cf_crest">Escudo (opcional)</label>
        <input id="cf_crest" name="crest" type="file" accept="image/png,image/jpeg,image/webp">
        <p class="hint">Se recorta en cuadrado y se reduce automáticamente.</p>
      </fieldset>
      <fieldset>
        <legend>Temporada</legend>
        <div class="row">
          <div><label for="cf_season">Nombre</label><input id="cf_season" name="season_name" value="${esc(s.name)}" required maxlength="40"></div>
          <div><label for="cf_start">Empieza</label><input id="cf_start" name="start_date" type="date" value="${s.start}" required></div>
          <div><label for="cf_end">Termina</label><input id="cf_end" name="end_date" type="date" value="${s.end}" required></div>
        </div>
      </fieldset>
      <fieldset>
        <legend>Primer equipo</legend>
        <div class="row">
          <div class="grow"><label for="cf_team">Nombre del equipo</label><input id="cf_team" name="team_name" required maxlength="80" placeholder="p. ej. Infantil A"></div>
          <div class="grow"><label for="cf_cat">Categoría</label><input id="cf_cat" name="category" maxlength="60" placeholder="p. ej. Infantil · 2.ª División"></div>
        </div>
        <div class="row">
          <div>
            <span class="label">Modalidad</span>
            <div class="seg" role="radiogroup" aria-label="Modalidad">
              <label><input type="radio" name="modality" value="f11" checked> Fútbol 11</label>
              <label><input type="radio" name="modality" value="f7"> Fútbol 7</label>
            </div>
          </div>
          <div><label for="cf_periods">Partes</label><input id="cf_periods" name="periods" type="number" min="1" max="4" value="2" required></div>
          <div><label for="cf_minutes">Minutos por parte</label><input id="cf_minutes" name="period_minutes" type="number" min="5" max="60" value="45" required></div>
        </div>
      </fieldset>
      <button class="btn primary" type="submit">${esc(submitLabel)}</button>
    </form>`;
}

/** Prepara los detalles del formulario (minutos según modalidad). */
export function wireClubForm(form) {
  const minutes = form.querySelector('#cf_minutes');
  let touched = false;
  minutes.addEventListener('input', () => { touched = true; });
  form.querySelectorAll('[name=modality]').forEach((r) => r.addEventListener('change', () => {
    if (!touched) minutes.value = r.value === 'f7' ? 35 : 45;
  }));
}

/** Valida, crea el club con create_club y sube el escudo. Devuelve el id del club o null. */
export async function createClubFromForm(form) {
  const v = formValues(form);
  if (!v.name) { toast('Escribe el nombre del club.', 'err'); return null; }
  if (!v.team_name) { toast('Escribe el nombre del primer equipo.', 'err'); return null; }
  if (!v.start_date || !v.end_date || v.end_date <= v.start_date) { toast('Revisa las fechas: la temporada debe terminar después de empezar.', 'err'); return null; }

  const client = sb();
  const { data: clubId, error } = await client.rpc('create_club', {
    p_name: v.name,
    p_short_name: v.short_name || '',
    p_season_name: v.season_name || seasonDefaults().name,
    p_start_date: v.start_date,
    p_end_date: v.end_date,
    p_team_name: v.team_name,
    p_category: v.category || '',
    p_modality: v.modality || 'f11',
    p_periods: parseInt(v.periods, 10) || 2,
    p_period_minutes: parseInt(v.period_minutes, 10) || 45
  });
  if (error) throw error;

  const file = form.querySelector('[name=crest]').files[0];
  if (file) {
    try {
      const blob = await squareImage(file);
      const ext = { 'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg' }[blob.type] || 'png';
      const path = `${clubId}/crest.${ext}`;
      const up = await client.storage.from('club-files').upload(path, blob, { upsert: true, contentType: blob.type });
      if (up.error) throw up.error;
      const upd = await client.from('clubs').update({ crest_path: path }).eq('id', clubId);
      if (upd.error) throw upd.error;
    } catch (err) {
      console.error(err);
      toast('El club se ha creado, pero no se ha podido subir el escudo. Podrás subirlo en Configuración.', 'err', 6000);
    }
  }
  return clubId;
}
