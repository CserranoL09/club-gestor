// Panel del club (Dirección y Coordinación): cifras, alertas y una tarjeta por equipo.
import { esc, copyText, busy } from '../ui.js';
import { S, isAdmin, roleLabel, ROLE_LABEL, appBaseUrl, selectTeam } from '../session.js';
import { loadClubOverview, personName } from '../lib/clubdata.js';
import { exportSheet } from '../lib/xlsx.js';
import { NEW_INVITES } from './asistente-club.js';

const MOD = { f11: 'F11', f7: 'F7' };
const shortDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
const result = (m) => {
  if (m.goals_for == null || m.goals_against == null) return { txt: 'sin resultado', cls: '' };
  const [h, a] = m.is_home ? [m.goals_for, m.goals_against] : [m.goals_against, m.goals_for];
  const cls = m.goals_for > m.goals_against ? 'win' : m.goals_for < m.goals_against ? 'loss' : 'draw';
  return { txt: `${h}-${a}`, cls };
};

export async function render(el, ctx) {
  el.innerHTML = '<div class="card"><p class="hint">Cargando el panel del club…</p></div>';
  const d = await loadClubOverview();
  const admin = isAdmin();
  const q = ctx.query;
  const cat = q.get('cat') || '';
  const mod = q.get('mod') || '';
  const onlyAlerts = q.get('alertas') === '1';

  const alertsBy = {};
  d.alerts.forEach((a) => { (alertsBy[a.team.id] ||= []).push(a); });
  const totalPlayers = d.teams.reduce((n, t) => n + d.playersByTeam[t.id].total, 0);
  const staffIds = new Set(d.teams.flatMap((t) => d.staffByTeam[t.id].map((m) => m.user_id)));
  const cats = [...new Set(d.teams.map((t) => t.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const shown = d.teams.filter((t) => (!cat || t.category === cat) && (!mod || t.modality === mod) && (!onlyAlerts || alertsBy[t.id]?.length));

  let fresh = null;
  try { fresh = JSON.parse(sessionStorage.getItem(NEW_INVITES)); } catch { /* nada */ }
  const link = (t) => appBaseUrl() + '#/invitacion/' + t;
  const waText = (i) => `Te invito a ${S.club.name} en Club Gestor como ${ROLE_LABEL[i.role].toLowerCase()} (${i.team}). Abre este enlace para unirte (caduca en 7 días): ${link(i.token)}`;
  const crest = S.crestUrl ? `style="background-image:url('${esc(S.crestUrl)}'), linear-gradient(135deg, var(--accent), var(--accent-2))"` : '';
  const crestText = S.crestUrl ? '' : esc((S.club.short_name || S.club.name).slice(0, 3).toUpperCase());
  const qs = (patch) => {
    const p = new URLSearchParams({ ...(cat && { cat }), ...(mod && { mod }), ...(onlyAlerts && { alertas: '1' }), ...patch });
    [...p.keys()].forEach((k) => { if (!p.get(k)) p.delete(k); });
    return '#/club' + (p.toString() ? '?' + p : '');
  };

  el.innerHTML = `
    ${fresh?.invites?.length ? `
    <section class="card success-card no-print" id="newInvites">
      <div class="section-head"><h2>✉ Envía las invitaciones a tu cuerpo técnico</h2><button class="btn small" type="button" data-hide-invites>Hecho, ocultar</button></div>
      <p class="hint">Cada enlace es para una persona, lleva su equipo y su perfil, y caduca en 7 días. También los tienes en Configuración → Personas.</p>
      <ul class="list">${fresh.invites.map((i) => `
        <li data-token="${esc(i.token)}">
          <div><strong>${esc(i.team)}</strong> · ${esc(ROLE_LABEL[i.role])}${i.specialty ? ' · ' + esc(i.specialty) : ''}<br><small class="muted">${esc(i.email || 'Sin email: cualquiera con el enlace')}</small></div>
          <div class="actions">
            <button class="btn small" type="button" data-copy>Copiar enlace</button>
            <a class="btn small" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(waText(i))}">WhatsApp</a>
          </div>
        </li>`).join('')}</ul>
    </section>` : ''}

    <section class="hero card">
      <span class="crest big-crest" ${crest} aria-hidden="true">${crestText}</span>
      <div class="hero-text">
        <p class="eyebrow">Panel del club · ${esc(roleLabel())}</p>
        <h1>${esc(S.club.name)}</h1>
        <p class="muted">${[S.season && 'Temporada ' + S.season.name, S.club.city, 'Actualizado ' + new Date().toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })].filter(Boolean).map(esc).join(' · ')}</p>
      </div>
      <div class="hero-actions no-print">
        <button class="btn" type="button" data-print>Imprimir / PDF</button>
        <button class="btn" type="button" data-excel>Excel</button>
        ${admin ? '<a class="btn" href="#/config?tab=temporadas">+ Nuevo equipo</a>' : ''}
        <a class="btn primary" href="#/config?tab=personas">Invitar</a>
      </div>
    </section>

    <section class="stats" aria-label="El club en cifras">
      <a class="stat card" href="#/equipos"><strong>${d.teams.length}</strong><span>${d.teams.length === 1 ? 'equipo' : 'equipos'}</span></a>
      <div class="stat card"><strong>${totalPlayers}</strong><span>jugadores</span></div>
      <a class="stat card" href="#/config?tab=personas"><strong>${staffIds.size}</strong><span>cuerpo técnico</span></a>
      <a class="stat card${d.alerts.length ? ' stat-warn' : ''}" href="${qs({ alertas: '1' })}"><strong>${d.alerts.length}</strong><span>${d.alerts.length === 1 ? 'alerta' : 'alertas'}</span></a>
    </section>

    <section class="card" id="clubAlerts">
      <div class="section-head">
        <h2>Alertas del club <span class="count">${d.alerts.length}</span></h2>
        ${admin ? '<a class="btn small no-print" href="#/config?tab=club">Configurar alertas</a>' : ''}
      </div>
      ${d.alerts.length ? `<ul class="alerts">${d.alerts.map((a) => `
        <li data-alert="${esc(a.kind)}"><span class="pill warn">${esc(a.text)}</span> <strong>${esc(a.team.name)}</strong>
        ${a.href ? `<a class="no-print" href="${esc(a.href)}">Resolver</a>` : ''}</li>`).join('')}</ul>`
        : '<p class="big-line">Todo en orden ✓</p><p class="hint">No hay nada pendiente según las alertas del club.</p>'}
      ${d.pendingInvites.length ? `<p class="hint">${d.pendingInvites.length} ${d.pendingInvites.length === 1 ? 'invitación pendiente' : 'invitaciones pendientes'} de aceptar.</p>` : ''}
    </section>

    <div class="section-head mt">
      <h2 class="section-title">Equipos</h2>
      <div class="filters no-print">
        ${cats.length > 1 ? `<label class="inline-label">Categoría <select data-filter="cat"><option value="">Todas</option>${cats.map((c) => `<option${c === cat ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></label>` : ''}
        <label class="inline-label">Modalidad <select data-filter="mod"><option value="">Todas</option><option value="f11"${mod === 'f11' ? ' selected' : ''}>Fútbol 11</option><option value="f7"${mod === 'f7' ? ' selected' : ''}>Fútbol 7</option></select></label>
        <label class="check small-check"><input type="checkbox" data-filter="alertas"${onlyAlerts ? ' checked' : ''}> Solo con alertas</label>
      </div>
    </div>

    ${shown.length ? `<div class="team-cards panel-cards">${shown.map((t) => teamCard(t, d, alertsBy[t.id] || [])).join('')}</div>`
      : `<div class="card empty"><p>${d.teams.length ? 'Ningún equipo cumple el filtro.' : `Aún no hay equipos en esta temporada.${admin ? ' <a href="#/config?tab=temporadas">Crea el primero</a>.' : ''}`}</p></div>`}`;

  // ----- Interacción
  el.querySelectorAll('#newInvites [data-copy]').forEach((b) => b.addEventListener('click', () => copyText(link(b.closest('[data-token]').dataset.token))));
  el.querySelector('[data-hide-invites]')?.addEventListener('click', () => {
    try { sessionStorage.removeItem(NEW_INVITES); } catch { /* nada */ }
    el.querySelector('#newInvites').remove();
  });
  el.querySelectorAll('[data-filter]').forEach((f) => f.addEventListener('change', () => {
    const v = f.type === 'checkbox' ? (f.checked ? '1' : '') : f.value;
    location.hash = qs({ [f.dataset.filter]: v });
  }));
  el.querySelectorAll('[data-enter]').forEach((b) => b.addEventListener('click', () => {
    selectTeam(b.dataset.enter);
    location.hash = '#/inicio';
  }));
  el.querySelector('[data-print]').addEventListener('click', () => window.print());
  el.querySelector('[data-excel]').addEventListener('click', (ev) => busy(ev.currentTarget, () => exportExcel(d, shown, alertsBy)));
}

function teamCard(t, d, alerts) {
  const m = d.metrics[t.id];
  const staff = d.staffByTeam[t.id];
  const head = staff.filter((x) => x.role === 'entrenador');
  const rest = staff.filter((x) => x.role !== 'entrenador');
  const pl = d.playersByTeam[t.id];
  const nextCalled = m.next ? (m.next.squad || []).filter((p) => p.called !== false).length : 0;
  const res = m.last ? result(m.last) : null;
  const vs = (mt) => `${mt.is_home ? 'vs' : 'en'} ${esc(mt.rival || 'rival')}`;
  return `
    <article class="card team-card panel-card${alerts.length ? ' has-alerts' : ''}" data-team="${esc(t.id)}">
      <header>
        <div>
          <h3>${esc(t.name)}</h3>
          <p class="muted">${[t.category, MOD[t.modality]].filter(Boolean).map(esc).join(' · ')}</p>
        </div>
        ${alerts.length ? `<span class="pill warn" title="${esc(alerts.map((a) => a.text).join(' · '))}">⚠ ${alerts.length}</span>` : '<span class="pill ok">✓</span>'}
      </header>
      <p class="coach">${head.length ? `<strong>${esc(head.map(personName).join(', '))}</strong>` : '<span class="warn-text">Sin entrenador principal</span>'}
        ${rest.length ? `<br><small class="muted">${rest.map((x) => `${esc(personName(x))} (${esc(x.specialty || ROLE_LABEL[x.role])})`).join(', ')}</small>` : ''}</p>
      <dl class="metrics">
        <div><dt>⚽ Esta semana</dt><dd data-m="week">${m.week.planned} ${m.week.planned === 1 ? 'sesión' : 'sesiones'} · ${m.week.done} ${m.week.done === 1 ? 'hecha' : 'hechas'}</dd></div>
        <div><dt>✅ Asistencia (4 sem.)</dt><dd data-m="att">${m.attendance.pct === null ? '—' : `${m.attendance.pct}%`}${m.attendance.sessions ? ` <small class="muted">${m.attendance.sessions} ses.</small>` : ''}</dd></div>
        <div><dt>📅 Próximo partido</dt><dd data-m="next">${m.next ? `${esc(shortDate(m.next.date))} ${vs(m.next)} ${nextCalled ? `<small class="muted">· ${nextCalled} conv.</small>` : '<small class="warn-text">· sin convocar</small>'}` : '—'}</dd></div>
        <div><dt>🏁 Último resultado</dt><dd data-m="last">${m.last ? `<span class="res ${res.cls}">${esc(res.txt)}</span> ${vs(m.last)}` : '—'}</dd></div>
        <div><dt>📝 Informes pendientes</dt><dd data-m="reports">${m.pendingReports.length}</dd></div>
        <div><dt>👥 Jugadores</dt><dd data-m="players">${pl.total}${pl.injured ? ` <small class="muted">· ${pl.injured} lesionados</small>` : ''}</dd></div>
        <div><dt>💬 Comentarios abiertos</dt><dd data-m="comments">${m.comments}</dd></div>
      </dl>
      ${alerts.length ? `<ul class="card-alerts">${alerts.map((a) => `<li>${esc(a.text)}</li>`).join('')}</ul>` : ''}
      <div class="actions no-print">
        <button class="btn primary small" type="button" data-enter="${esc(t.id)}">Entrar al equipo</button>
        <a class="btn small" href="#/comentarios?team=${esc(t.id)}">Comentarios</a>
      </div>
    </article>`;
}

async function exportExcel(d, teams, alertsBy) {
  const header = ['Equipo', 'Categoría', 'Modalidad', 'Entrenador principal', 'Resto del cuerpo técnico', 'Jugadores', 'Lesionados',
    'Sesiones esta semana', 'Sesiones hechas', 'Asistencia 4 semanas (%)', 'Próximo partido', 'Fecha próximo', 'Convocados',
    'Último resultado', 'Rival último', 'Informes pendientes', 'Comentarios abiertos', 'Alertas'];
  const rows = teams.map((t) => {
    const m = d.metrics[t.id];
    const staff = d.staffByTeam[t.id];
    return [
      t.name, t.category || '', t.modality === 'f7' ? 'Fútbol 7' : 'Fútbol 11',
      staff.filter((x) => x.role === 'entrenador').map(personName).join(', '),
      staff.filter((x) => x.role !== 'entrenador').map((x) => `${personName(x)} (${x.specialty || ROLE_LABEL[x.role]})`).join(', '),
      d.playersByTeam[t.id].total, d.playersByTeam[t.id].injured,
      m.week.planned, m.week.done, m.attendance.pct ?? '',
      m.next ? m.next.rival || '' : '', m.next ? m.next.date : '', m.next ? (m.next.squad || []).filter((p) => p.called !== false).length : '',
      m.last ? result(m.last).txt : '', m.last ? m.last.rival || '' : '',
      m.pendingReports.length, m.comments, (alertsBy[t.id] || []).map((a) => a.text).join(' · ')
    ];
  });
  await exportSheet({ name: `Panel ${S.club.short_name || S.club.name} ${S.season?.name || ''}`, sheet: 'Panel del club', header, rows,
    widths: [18, 14, 11, 24, 34, 10, 10, 12, 12, 14, 18, 13, 11, 12, 18, 12, 12, 50] });
}
