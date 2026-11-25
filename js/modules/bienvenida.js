// Asistente para quien aún no tiene club: crear club, aceptar una invitación o unirse a una clase.
import { esc, toast, busy } from '../ui.js';
import { S, refresh, isTeacher } from '../session.js';
import { clubFormHTML, wireClubForm, createClubFromForm } from './club-form.js';

function tokenFrom(text) {
  const t = String(text || '').trim();
  const m = t.match(/invitacion\/([a-f0-9]{16,})/i) || t.match(/^([a-f0-9]{16,})$/i);
  return m ? m[1] : null;
}

export async function render(el, ctx) {
  const name = (S.profile?.full_name || '').split(' ')[0];
  const another = ctx.query.get('nuevo') === '1' || S.memberships.length > 0;
  let step = another ? 'crear' : (ctx.query.get('paso') || '');

  function draw() {
    if (step === 'crear') {
      el.innerHTML = `
        <div class="page-head">
          <div>
            <h1>${another ? 'Crear otro club' : 'Crear mi club'}</h1>
            <p>Crearás el club con su temporada y su primer equipo. Tendrás el perfil de Dirección del club.</p>
          </div>
          ${another ? '<a class="btn" href="#/inicio">Cancelar</a>' : '<button class="btn" type="button" data-back>← Volver</button>'}
        </div>
        <div class="card narrow">${clubFormHTML()}</div>`;
      const form = el.querySelector('form');
      wireClubForm(form);
      form.querySelector('input').focus();
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        await busy(form.querySelector('[type=submit]'), async () => {
          const clubId = await createClubFromForm(form);
          if (!clubId) return;
          await refresh(clubId);
          toast('¡Club creado! Ya puedes empezar.');
          location.hash = '#/inicio';
        });
      });
    } else if (step === 'invitacion') {
      el.innerHTML = `
        <div class="page-head"><div><h1>Tengo una invitación</h1><p>Pega el enlace que te ha enviado la Dirección o la Coordinación de tu club.</p></div>
          <button class="btn" type="button" data-back>← Volver</button></div>
        <div class="card narrow">
          <form novalidate>
            <label for="inv">Enlace o código de la invitación</label>
            <input id="inv" name="inv" placeholder="https://…/#/invitacion/…" autocomplete="off">
            <button class="btn primary" type="submit">Continuar</button>
          </form>
        </div>`;
      const form = el.querySelector('form');
      form.querySelector('input').focus();
      form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const token = tokenFrom(form.inv.value);
        if (!token) { toast('No reconozco ese enlace. Cópialo entero desde el mensaje.', 'err'); return; }
        location.hash = '#/invitacion/' + token;
      });
    } else {
      el.innerHTML = `
        <div class="page-head">
          <div>
            <h1>Hola${name ? ', ' + esc(name) : ''} 👋</h1>
            <p>Todavía no perteneces a ningún club. ¿Cómo quieres empezar?</p>
          </div>
        </div>
        <div class="choices">
          <button class="choice" type="button" data-step="crear">
            <span class="ico" aria-hidden="true">🛡</span>
            <strong>Crear mi club</strong>
            <span>Eres el responsable: creas el club, la temporada y el primer equipo, e invitas a tu cuerpo técnico.</span>
          </button>
          <button class="choice" type="button" data-step="invitacion">
            <span class="ico" aria-hidden="true">✉</span>
            <strong>Tengo una invitación</strong>
            <span>Te han invitado a un club como entrenador, preparador o entrenador de porteros.</span>
          </button>
          <a class="choice" href="#/unirse">
            <span class="ico" aria-hidden="true">🎓</span>
            <strong>Unirme a una clase</strong>
            <span>Eres alumno: tu profesor te ha dado un código. Crearás tu club y quedará vinculado a su clase.</span>
          </a>
        </div>
        ${isTeacher() ? `
          <div class="card note-card">
            <strong>Eres profesor/a.</strong> No necesitas un club propio: desde el <a href="#/profesor">Panel del profesor</a>
            podrás crear clases y ver los clubes de tus alumnos.
          </div>` : ''}`;
      el.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => { step = b.dataset.step; draw(); }));
    }
    el.querySelector('[data-back]')?.addEventListener('click', () => { step = ''; draw(); });
  }
  draw();
}
