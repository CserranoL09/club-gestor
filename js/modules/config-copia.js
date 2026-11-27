// Configuración → Copia de seguridad: descargar todo el club en JSON y restaurarlo (club nuevo o sustituir un equipo o una temporada).
import { esc, toast, busy, ask, errMsg } from '../ui.js';
import { S, isAdmin, canEditTeam, refresh, reloadClubData } from '../session.js';
import { fmt } from '../lib/dates.js';
import { buildBackup, downloadJSON, readJSON, validateBackup, summary, imagePaths, restoreAsNewClub, replaceTeam, replaceSeason } from '../lib/backup.js';

const pl = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const mb = (n) => `${(n / 1024 / 1024).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MB`;

export async function render(el) {
  const team = S.team;
  el.innerHTML = `
    <section class="card">
      <h2>💾 Descargar copia</h2>
      <p>Un archivo JSON con <strong>${esc(S.club.name)}</strong>: temporadas, equipos, plantillas, sesiones, biblioteca de tareas, metodología, periodizaciones, macrociclos, morfociclos, partidos e instalaciones. No lleva datos de otras personas ni los comentarios.</p>
      <label class="check"><input type="checkbox" data-img> Incluir las imágenes (escudo, tareas y principios). La copia puede ocupar varios MB.</label>
      <button class="btn primary" type="button" data-down>Descargar copia</button>
      <p class="hint" data-prog></p>
    </section>
    <section class="card">
      <h2>♻️ Restaurar copia</h2>
      <p>Elige un archivo de copia de Club Gestor. Antes de cambiar nada verás lo que contiene y elegirás cómo restaurarlo.</p>
      <label class="btn">Elegir copia…<input type="file" accept=".json,application/json" data-file hidden></label>
      <div data-restore></div>
    </section>
    <p class="hint">Para pasar un solo partido o una sola sesión a otro club, usa «Compartir» en su página y «Importar» en la lista de Partidos o de Sesiones.</p>`;

  el.querySelector('[data-down]').addEventListener('click', (ev) => busy(ev.currentTarget, async () => {
    const prog = el.querySelector('[data-prog]');
    const withImages = el.querySelector('[data-img]').checked;
    const b = await buildBackup({ withImages, onProgress: (i, n) => { prog.textContent = `Imágenes ${i} de ${n}…`; } });
    const size = JSON.stringify(b).length;
    prog.textContent = '';
    if (size > 10 * 1024 * 1024 && !(await ask(`La copia ocupa ${mb(size)} por las imágenes. ¿Descargarla igualmente?`, { title: 'Copia grande', yes: 'Descargar' }))) return;
    downloadJSON(b, `Copia ${S.club.short_name || S.club.name}`);
    toast(`Copia descargada (${mb(size)}).`);
  }));

  el.querySelector('[data-file]').addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    const box = el.querySelector('[data-restore]');
    try { show(box, validateBackup(await readJSON(file))); } catch (err) { box.innerHTML = `<p class="note">No se puede restaurar «${esc(file.name)}»: ${esc(errMsg(err))}</p>`; }
  });

  function show(box, b) {
    const sum = summary(b);
    const teams = b.teams;
    const canTeam = team && canEditTeam(team.id);
    const canSeason = isAdmin() && S.season;
    const imgs = imagePaths(b);
    const inCopy = Object.keys(b.images).length;
    box.innerHTML = `
      <div class="imp-preview">
        <h3>${esc(b.club.name)}</h3>
        <p class="hint">Copia del ${b.exportedAt ? esc(fmt(new Date(b.exportedAt))) : '—'}${b.appVersion ? ` · Club Gestor v${esc(b.appVersion)}` : ''} · ${pl(imgs.length, 'imagen', 'imágenes')}${imgs.length ? (inCopy ? ` (${inCopy} incluidas)` : ' (no incluidas)') : ''}</p>
        <ul class="bk-sum">${sum.map((s) => `<li><strong>${esc(s.season.name)}</strong>${s.teams.length ? `: ${s.teams.map((t) => `${esc(t.team.name)} <small class="muted">(${pl(t.players, 'jugador', 'jugadores')} · ${pl(t.sessions, 'sesión', 'sesiones')} · ${pl(t.matches, 'partido', 'partidos')})</small>`).join(', ')}` : ' <small class="muted">sin equipos</small>'}</li>`).join('')}</ul>
        <fieldset class="imp-group bk-modes"><legend>¿Cómo la restauro?</legend>
          <label class="check"><input type="radio" name="bkmode" value="club" checked> <span><strong>Crear un club nuevo con esta copia</strong><br><small class="muted">Tu club actual no se toca. Serás la Dirección del club nuevo; el resto de personas habrá que invitarlas otra vez.</small></span></label>
          <div class="bk-opt" data-for="club"><label for="bk_name">Nombre del club nuevo</label><input id="bk_name" maxlength="120" value="${esc(b.club.name)}"></div>
          <label class="check"><input type="radio" name="bkmode" value="team"${canTeam && teams.length ? '' : ' disabled'}> <span><strong>Reemplazar el equipo ${esc(team?.name || '—')}</strong><br><small class="muted">Se borran su plantilla, sesiones, partidos, macrociclos, morfociclos y periodización y se ponen los del equipo que elijas de la copia.${canTeam ? '' : ' (Solo la Dirección o su entrenador principal.)'}</small></span></label>
          <div class="bk-opt" data-for="team"><label for="bk_team">Equipo de la copia</label><select id="bk_team">${teams.map((t) => `<option value="${esc(t.id)}"${t.name === team?.name ? ' selected' : ''}>${esc(t.name)} · ${esc(b.seasons.find((s) => s.id === t.season_id)?.name || '')}</option>`).join('')}</select></div>
          <label class="check"><input type="radio" name="bkmode" value="season"${canSeason && b.seasons.length ? '' : ' disabled'}> <span><strong>Reemplazar la temporada ${esc(S.season?.name || '—')}</strong><br><small class="muted">Cada equipo de la temporada de la copia sustituye al equipo con el mismo nombre (si no existe, se crea). Los demás equipos no se tocan.${canSeason ? '' : ' (Solo la Dirección.)'}</small></span></label>
          <div class="bk-opt" data-for="season"><label for="bk_season">Temporada de la copia</label><select id="bk_season">${b.seasons.map((s) => `<option value="${esc(s.id)}"${s.name === S.season?.name ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
        </fieldset>
        <div class="actions"><button class="btn primary" type="button" data-go>Restaurar</button><button class="btn" type="button" data-cancel>Cancelar</button></div>
      </div>`;
    const sync = () => { const v = box.querySelector('[name=bkmode]:checked').value; box.querySelectorAll('.bk-opt').forEach((o) => { o.hidden = o.dataset.for !== v; }); };
    box.querySelectorAll('[name=bkmode]').forEach((r) => r.addEventListener('change', sync));
    sync();
    box.querySelector('[data-cancel]').addEventListener('click', () => { box.innerHTML = ''; });
    box.querySelector('[data-go]').addEventListener('click', (ev) => busy(ev.currentTarget, async () => {
      const mode = box.querySelector('[name=bkmode]:checked').value;
      if (mode === 'club') {
        const name = box.querySelector('#bk_name').value.trim() || b.club.name;
        if (!(await ask(`Se creará el club «${name}» con todo lo que hay en la copia. Tu club actual no cambia.`, { title: 'Crear club nuevo', yes: 'Crear club' }))) return;
        const clubId = await restoreAsNewClub(b, { name });
        await refresh(clubId);
        toast(`Club «${name}» creado con la copia.`);
        location.hash = '#/inicio';
      } else if (mode === 'team') {
        const src = teams.find((t) => t.id === box.querySelector('#bk_team').value);
        if (!(await ask(`Se borrarán la plantilla, las sesiones, los partidos, los macrociclos, los morfociclos y la periodización de «${team.name}» y se pondrán los de «${src.name}» de la copia. No se puede deshacer.`, { title: `¿Reemplazar ${team.name}?`, yes: 'Sí, reemplazar', danger: true }))) return;
        await replaceTeam(b, src.id, team);
        Object.assign(team, { category: src.category, modality: src.modality, periods: src.periods, period_minutes: src.period_minutes, squad_max: src.squad_max });
        toast(`«${team.name}» restaurado desde la copia.`);
        box.innerHTML = '<div class="success"><h3>Equipo restaurado</h3><p><a href="#/plantilla">Plantilla</a> · <a href="#/sesiones">Sesiones</a> · <a href="#/partidos">Partidos</a></p></div>';
      } else {
        const src = b.seasons.find((s) => s.id === box.querySelector('#bk_season').value);
        const names = b.teams.filter((t) => t.season_id === src.id).map((t) => t.name);
        if (!names.length) { toast('Esa temporada de la copia no tiene equipos.', 'err'); return; }
        if (!(await ask(`En la temporada ${S.season.name} se reemplazarán los datos de ${names.join(', ')} con los de la copia (${src.name}). Los que no existan se crearán. No se puede deshacer.`, { title: `¿Reemplazar la temporada ${S.season.name}?`, yes: 'Sí, reemplazar', danger: true }))) return;
        const done = await replaceSeason(b, src.id, S.season);
        toast(`Temporada restaurada: ${done.join(', ')}.`, 'ok', 8000);
        await reloadClubData();   // puede haber equipos nuevos: se vuelve a pintar la configuración
      }
    }));
  }
}
