// Calendario → Horarios: horario base de entrenamientos y color de cada equipo.
// Con el horario se generan las sesiones vacías de cada semana (botón en la vista Semana).
import { esc, toast, busy } from '../ui.js';
import { sb } from '../supabase.js';
import { S, canScheduleTeam, canManageFacilities, patchTeam } from '../session.js';
import { DAYS } from '../lib/dates.js';
import { SHARES, mins, shareName, scheduleConflicts } from '../lib/calendar.js';

export async function render(el, { teams, colorOf }) {
  const { data: facs, error } = await sb().from('facilities').select('*').eq('club_id', S.club.id).eq('active', true).order('sort').order('name');
  if (error) throw error;
  const facilities = facs || [];
  const facName = (id) => facilities.find((f) => f.id === id)?.name || '';
  const drafts = new Map(teams.map((t) => [t.id, structuredClone(t.schedule || [])]));

  function draw() {
    const clash = scheduleConflicts(teams.map((t) => ({ ...t, schedule: drafts.get(t.id) })));
    const seen = new Set();
    const clashLines = clash.filter((c) => {
      const k = [c.id, ...c.with.map((w) => w.id)].sort().join();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).map((c) => `<li>${esc(DAYS[c.slot.day])} · ${esc(facName(c.facility_id))}: ${[c, ...c.with].map((x) => `${esc(x.team.name)} ${esc(x.slot.start)}–${esc(x.slot.end)} (${esc(shareName(x.slot.share || 4))})`).join(' + ')}</li>`);

    el.innerHTML = `
      <p class="hint">Días y horas en los que entrena cada equipo. Con ellos, en la vista <a href="#/calendario?vista=semana">Semana</a> se crean de una vez las sesiones vacías de esa semana (con su campo reservado).
        ${facilities.length ? '' : canManageFacilities() ? ' Añade las instalaciones en <a href="#/config?tab=instalaciones">Configuración → Instalaciones</a> para reservar campo.' : ''}</p>
      ${clashLines.length ? `<div class="note" role="status"><strong>⚠ Solapes en el horario base</strong><ul>${clashLines.join('')}</ul></div>` : ''}
      <div class="sched-list">
      ${teams.map((t) => {
        const can = canScheduleTeam(t.id);
        const dis = can ? '' : 'disabled';
        const slots = drafts.get(t.id);
        return `
        <section class="card sched" data-team="${esc(t.id)}" style="--team:${esc(colorOf(t))}">
          <div class="section-head">
            <h2><span class="dot" aria-hidden="true"></span> ${esc(t.name)} <small class="muted">${esc(t.category || '')}</small></h2>
            <label class="color-pick">Color <input type="color" data-color value="${esc(colorOf(t))}" aria-label="Color de ${esc(t.name)}" ${dis}></label>
          </div>
          ${slots.length ? `<div class="slots">${slots.map((s, i) => `
            <div class="slot" data-i="${i}">
              <select data-k="day" aria-label="Día" ${dis}>${DAYS.map((d, n) => `<option value="${n}"${+s.day === n ? ' selected' : ''}>${d}</option>`).join('')}</select>
              <input data-k="start" type="time" value="${esc(s.start)}" aria-label="Desde" ${dis}>
              <input data-k="end" type="time" value="${esc(s.end)}" aria-label="Hasta" ${dis}>
              <select data-k="facility_id" aria-label="Instalación" ${dis}><option value="">Sin campo</option>${facilities.filter((f) => f.kind !== 'vestuario').map((f) => `<option value="${esc(f.id)}"${f.id === s.facility_id ? ' selected' : ''}>${esc(f.name)}</option>`).join('')}</select>
              <select data-k="share" aria-label="Fracción" ${dis}>${SHARES.map(([k, l]) => `<option value="${k}"${+(s.share || 4) === k ? ' selected' : ''}>${l}</option>`).join('')}</select>
              ${can ? '<button class="icon-btn small" type="button" data-del aria-label="Quitar franja">✕</button>' : ''}
            </div>`).join('')}</div>` : '<p class="muted">Sin horario.</p>'}
          ${can ? `<div class="actions">
            <button class="btn small" type="button" data-add>+ Franja</button>
            <button class="btn small primary" type="button" data-save>Guardar horario</button>
          </div>` : ''}
        </section>`;
      }).join('')}
      </div>`;
    wire();
  }

  function wire() {
    el.querySelectorAll('[data-team]').forEach((card) => {
      const id = card.dataset.team;
      const slots = drafts.get(id);
      card.querySelectorAll('[data-k]').forEach((inp) => inp.addEventListener('change', () => {
        const s = slots[+inp.closest('[data-i]').dataset.i];
        const k = inp.dataset.k;
        s[k] = k === 'day' || k === 'share' ? +inp.value : inp.value;
        if (k === 'facility_id' && !inp.value) delete s.facility_id;
        draw();
      }));
      card.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => { slots.splice(+b.closest('[data-i]').dataset.i, 1); draw(); }));
      card.querySelector('[data-add]')?.addEventListener('click', () => {
        const last = slots[slots.length - 1];
        slots.push(last ? { ...last, day: (last.day + 2) % 7 } : { day: 0, start: '18:00', end: '19:30', share: 4 });
        draw();
        el.querySelector(`[data-team="${id}"] .slot:last-child [data-k=day]`)?.focus();
      });
      card.querySelector('[data-save]')?.addEventListener('click', (ev) => busy(ev.currentTarget, async () => {
        const bad = slots.find((s) => !s.start || !s.end || mins(s.end) <= mins(s.start));
        if (bad) { toast(`Revisa la franja del ${DAYS[bad.day].toLowerCase()}: la hora de fin debe ser posterior a la de inicio.`, 'err'); return; }
        const clean = slots.map((s) => ({ day: +s.day, start: s.start.slice(0, 5), end: s.end.slice(0, 5), share: +s.share || 4, ...(s.facility_id ? { facility_id: s.facility_id } : {}) }))
          .sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));
        const color = card.querySelector('[data-color]').value;
        const { error: e } = await sb().rpc('set_team_schedule', { p_team: id, p_schedule: clean, p_color: color });
        if (e) throw e;
        drafts.set(id, clean);
        patchTeam(id, { schedule: clean, color });
        toast('Horario guardado.');
        draw();
      }));
      card.querySelector('[data-color]')?.addEventListener('input', (ev) => card.style.setProperty('--team', ev.target.value));
    });
  }
  draw();
}
