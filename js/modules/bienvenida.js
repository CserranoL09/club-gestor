// Bienvenida: «¿Cómo vas a usar Club Gestor?»
//  · Dirijo o coordino un club → asistente en 4 pasos (asistente-club.js)
//  · Mi club me ha invitado   → pegar el enlace
//  · Entreno por mi cuenta    → club personal de un equipo
//  · Modo formación           → alumnos (código de clase) y profesores
import { esc, toast, busy } from '../ui.js';
import { sb } from '../supabase.js';
import { S, refresh } from '../session.js';
import { clubFormHTML, wireClubForm, createClubFromForm } from './club-form.js';

function tokenFrom(text) {
  const t = String(text || '').trim();
  const m = t.match(/invitacion\/([a-f0-9]{16,})/i) || t.match(/^([a-f0-9]{16,})$/i);
  return m ? m[1] : null;
}

export async function render(el, ctx) {
  const name = (S.profile?.full_name || '').split(' ')[0];
  const another = ctx.query.get('nuevo') === '1' || S.memberships.length > 0;
  // «crear» se mantiene como sinónimo de «personal» (enlaces antiguos).
  let step = ctx.query.get('paso') || '';
  if (step === 'crear') step = 'personal';
  // El paso va en la dirección (#/bienvenida?paso=…): sobrevive a los repintados y funciona el «atrás».
  const go = (next) => {
    const q = new URLSearchParams();
    if (ctx.query.get('nuevo') === '1') q.set('nuevo', '1');
    if (next) q.set('paso', next);
    location.hash = '#/bienvenida' + (q.toString() ? '?' + q : '');
  };

  async function draw() {
    if (step === 'club') {
      const wizard = await import('./asistente-club.js');
      wizard.render(el, { onCancel: () => go('') });
      return;
    }

    if (step === 'personal') {
      el.innerHTML = `
        <div class="page-head">
          <div><p class="eyebrow">Entreno por mi cuenta</p><h1>Mi equipo</h1>
            <p>Crea tu espacio de trabajo con tu equipo. Si más adelante tu club usa Club Gestor, te podrán invitar.</p></div>
          <button class="btn" type="button" data-back>← Volver</button>
        </div>
        <div class="card narrow">${clubFormHTML({ submitLabel: 'Empezar' })}</div>`;
      const form = el.querySelector('form');
      wireClubForm(form);
      form.querySelector('input').focus();
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        await busy(form.querySelector('[type=submit]'), async () => {
          const clubId = await createClubFromForm(form, { mode: 'personal' });
          if (!clubId) return;
          await refresh(clubId);
          toast('¡Listo! Ya puedes empezar.');
          location.hash = '#/inicio';
        });
      });
    } else if (step === 'invitacion') {
      el.innerHTML = `
        <div class="page-head"><div><p class="eyebrow">Mi club me ha invitado</p><h1>Pega tu invitación</h1><p>Copia el enlace que te ha enviado la Dirección o la Coordinación de tu club.</p></div>
          <button class="btn" type="button" data-back>← Volver</button></div>
        <div class="card narrow">
          <form novalidate>
            <label for="inv">Enlace de la invitación</label>
            <input id="inv" name="inv" placeholder="https://…/#/invitacion/…" autocomplete="off">
            <button class="btn primary" type="submit">Continuar</button>
          </form>
          <p class="hint">¿No tienes el enlace? Pídeselo a tu club: lo generan en Configuración → Personas.</p>
        </div>`;
      const form = el.querySelector('form');
      form.querySelector('input').focus();
      form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const token = tokenFrom(form.inv.value);
        if (!token) { toast('No reconozco ese enlace. Cópialo entero desde el mensaje.', 'err'); return; }
        location.hash = '#/invitacion/' + token;
      });
    } else if (step === 'formacion') {
      el.innerHTML = `
        <div class="page-head"><div><p class="eyebrow">Modo formación</p><h1>Cursos de entrenador</h1>
          <p>Para cursos donde cada alumno gestiona su propio club y el profesor lo revisa.</p></div>
          <button class="btn" type="button" data-back>← Volver</button></div>
        <div class="choices two">
          <a class="choice" href="#/unirse">
            <span class="ico" aria-hidden="true">🎒</span>
            <strong>Soy alumno/a</strong>
            <span>Tu profesor te ha dado un código de 6 caracteres. Crearás tu club y quedará vinculado a su clase.</span>
          </a>
          <button class="choice" type="button" data-teacher>
            <span class="ico" aria-hidden="true">🎓</span>
            <strong>Soy profesor/a</strong>
            <span>Crearás clases con un código para tus alumnos y verás sus clubes sin poder cambiarlos.</span>
          </button>
        </div>
        ${S.profile?.is_teacher ? '<p class="note">Ya tienes el perfil de profesor/a. <a href="#/profesor">Abre el Panel del profesor</a> para crear tus clases.</p>' : ''}`;
      el.querySelector('[data-teacher]').addEventListener('click', (ev) => busy(ev.currentTarget, async () => {
        const { error } = await sb().from('profiles').update({ is_teacher: true }).eq('id', S.user.id);
        if (error) throw error;
        toast('Perfil de profesor/a activado.');
        await refresh();
        location.hash = '#/profesor';
      }));
    } else {
      el.innerHTML = `
        <div class="page-head">
          <div>
            <h1>${another ? 'Crear otro club' : `Hola${name ? ', ' + esc(name) : ''} 👋`}</h1>
            <p>¿Cómo vas a usar Club Gestor?</p>
          </div>
          ${another ? '<a class="btn" href="#/inicio">Cancelar</a>' : ''}
        </div>
        <div class="choices">
          <button class="choice featured" type="button" data-step="club">
            <span class="ico" aria-hidden="true">🏟</span>
            <strong>Dirijo o coordino un club</strong>
            <span>Das de alta el club, sus equipos y su cuerpo técnico, y supervisas el trabajo de todos los entrenadores.</span>
            <span class="choice-cta">Alta del club en 4 pasos →</span>
          </button>
          <button class="choice" type="button" data-step="invitacion">
            <span class="ico" aria-hidden="true">✉</span>
            <strong>Mi club me ha invitado</strong>
            <span>Eres entrenador o parte del cuerpo técnico y tienes un enlace de tu club.</span>
          </button>
          <button class="choice" type="button" data-step="personal" data-old-step="crear">
            <span class="ico" aria-hidden="true">🧢</span>
            <strong>Entreno por mi cuenta</strong>
            <span>Trabajas con tu equipo sin club en la app. Podrás unirte a uno más adelante.</span>
          </button>
        </div>
        <p class="formacion-link"><button type="button" class="linklike" data-step="formacion">¿Eres profesor/a o alumno/a de un curso de entrenador? Modo formación →</button></p>`;
      el.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => go(b.dataset.step)));
      return;
    }
    el.querySelector('[data-back]')?.addEventListener('click', () => go(''));
  }
  await draw();
}
