// Página inicial del club: tarjetas resumen y botones en el orden que elija el club.
import { esc } from '../ui.js';
import { isConfigured, sb } from '../supabase.js';
import { S, permission, roleLabel } from '../session.js';
import { MODULES } from './list.js';
import { WIDGETS, normalizeLayout, orderedModules } from '../lib/layout.js';
import { microcycleAt } from '../lib/periodization.js';
import { fmt, mondayOf, addDays } from '../lib/dates.js';

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayDiff = (dateStr) => Math.round((new Date(dateStr + 'T00:00:00') - new Date(iso(new Date()) + 'T00:00:00')) / 86400000);
const longDate = (dateStr) => new Date(dateStr + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
const hhmm = (t) => (t ? String(t).slice(0, 5) : '');

export async function render(el) {
  // Modo de prueba (sin Supabase): solo los botones.
  if (!isConfigured || !S.club) {
    el.innerHTML = `
      <div class="page-head"><div><h1>Inicio</h1><p>Elige qué quieres hacer. Cada botón corresponde a una hoja de tu plantilla de control de temporada.</p></div>
      ${isConfigured ? '<a class="btn primary" href="#/login">Entrar</a>' : ''}</div>
      <nav class="modules">${MODULES.map((m) => moduleTile({ ...m, label: m.name }, m.route)).join('')}</nav>`;
    return;
  }

  const layout = normalizeLayout(S.club.home_layout);
  const modules = orderedModules(layout).filter((m) => !m.hidden);
  const first = (S.profile?.full_name || '').split(' ')[0];

  el.innerHTML = `
    <div class="page-head">
      <div>
        <h1>${esc(S.club.name)}</h1>
        <p>Hola${first ? ', ' + esc(first) : ''}. Tu perfil: <strong>${esc(roleLabel())}</strong>${S.team ? ` · equipo <strong>${esc(S.team.name)}</strong>` : ''}.</p>
      </div>
    </div>
    ${!S.team ? `<p class="note">Este club aún no tiene equipos en esta temporada. ${permission('admin').ok ? '<a href="#/config?tab=temporadas">Crea uno en Configuración</a>.' : 'La Dirección del club puede crearlos en Configuración.'}</p>` : ''}
    ${layout.widgets.length && S.team ? `<section class="widgets grid" aria-label="Resumen" id="widgets">${layout.widgets.map((k) => skeleton(k)).join('')}</section>` : ''}
    <nav class="modules" aria-label="Módulos" id="modules">${modules.map((m) => moduleTile(m, m.route)).join('')}</nav>
    ${!modules.length ? '<p class="hint">La Dirección del club ha ocultado todos los botones. Puedes volver a mostrarlos en Configuración → Página inicial.</p>' : ''}`;

  if (!S.team) return;
  const data = await loadData(layout);

  // Prepartido / Partido / Postpartido abren el partido más próximo (o el último jugado).
  const links = {
    prepartido: data.next ? `#/partidos/${data.next.id}/prepartido` : '#/partidos',
    partido: data.next ? `#/partidos/${data.next.id}/acta` : '#/partidos',
    postpartido: data.last ? `#/partidos/${data.last.id}/postpartido` : '#/partidos'
  };
  const nav = el.querySelector('#modules');
  if (nav) nav.innerHTML = modules.map((m) => moduleTile(m, links[m.key] || m.route)).join('');

  const box = el.querySelector('#widgets');
  if (box) box.innerHTML = layout.widgets.map((k) => widget(k, data)).join('');
}

function moduleTile(m, href) {
  const lock = isConfigured && m.perm !== 'read' && !permission(m.perm).ok
    ? '<span class="lock" title="Con tu rol solo puedes verlo">🔒 Solo ver</span>' : '';
  return `
    <a class="module" href="${esc(href)}" data-module="${esc(m.key)}">
      <span class="ico" aria-hidden="true">${esc(m.icon)}</span>
      <span><strong>${esc(m.label)}</strong><span>${esc(m.desc)}</span>${lock}</span>
    </a>`;
}

function skeleton(key) {
  const w = WIDGETS.find((x) => x.key === key);
  return `<article class="card widget is-loading" data-widget="${key}"><h3><span aria-hidden="true">${w.icon}</span> ${esc(w.name)}</h3><p class="muted">Cargando…</p></article>`;
}

// ---------------------------------------------------------------------
// Datos de las tarjetas (solo lo que hace falta)
// ---------------------------------------------------------------------
async function loadData(layout) {
  const client = sb();
  const team = S.team.id;
  const today = iso(new Date());
  const on = new Set(layout.widgets);
  const visible = new Set(orderedModules(layout).filter((m) => !m.hidden).map((m) => m.key));
  const needMatches = on.has('partido') || ['prepartido', 'partido', 'postpartido'].some((k) => visible.has(k));
  const q = {};

  if (needMatches) {
    q.next = client.from('matches').select('id, date, time, call_time, rival, is_home, venue, squad, matchday')
      .eq('team_id', team).gte('date', today).order('date').order('time', { nullsFirst: false }).limit(1).maybeSingle();
    q.last = client.from('matches').select('id, date, rival, is_home, goals_for, goals_against, report_done')
      .eq('team_id', team).lt('date', today).order('date', { ascending: false }).limit(1).maybeSingle();
  }
  if (on.has('sesiones')) {
    q.lastSession = client.from('sessions').select('id, date, time, duration_min, blocks').eq('team_id', team).lt('date', today)
      .order('date', { ascending: false }).limit(1).maybeSingle();
    q.nextSession = client.from('sessions').select('id, date, time, duration_min, blocks').eq('team_id', team).gte('date', today)
      .order('date').order('time', { nullsFirst: false }).limit(1).maybeSingle();
  }
  if (on.has('microciclo') && S.season) {
    q.period = client.from('periodizations').select('*').eq('team_id', team).eq('season_id', S.season.id).maybeSingle();
  }
  if (on.has('lesionados')) {
    q.injured = client.from('players').select('id, number, name').eq('team_id', team).eq('active', true).eq('status', 'L').order('number');
  }
  if (on.has('asistencia')) {
    q.attendance = client.from('sessions').select('date, attendance').eq('team_id', team)
      .gte('date', iso(addDays(new Date(), -28))).lte('date', today);
  }
  if (on.has('comentarios')) {
    q.comments = client.from('comments').select('id, text, created_at, entity, section', { count: 'exact' })
      .eq('club_id', S.club.id).eq('resolved', false).neq('author_id', S.user.id)
      .order('created_at', { ascending: false }).limit(1);
  }

  const keys = Object.keys(q);
  const res = await Promise.all(keys.map((k) => q[k]));
  const out = {};
  keys.forEach((k, i) => {
    out[k] = res[i].error ? { error: res[i].error } : res[i].data;
    if (k === 'comments') out.commentCount = res[i].count || 0;
  });
  return out;
}

// ---------------------------------------------------------------------
// Tarjetas
// ---------------------------------------------------------------------
function card(key, body, link) {
  const w = WIDGETS.find((x) => x.key === key);
  return `
    <article class="card widget" data-widget="${key}">
      <h3><span aria-hidden="true">${w.icon}</span> ${esc(w.name)}</h3>
      ${body}
      ${link ? `<a class="widget-link" href="${esc(link[0])}">${esc(link[1])} →</a>` : ''}
    </article>`;
}

const failed = (v) => v && v.error;
const errorBody = '<p class="muted">No se ha podido cargar.</p>';

function widget(key, d) {
  switch (key) {
    case 'partido': {
      if (failed(d.next)) return card(key, errorBody);
      const m = d.next;
      if (!m) return card(key, '<p class="muted">No hay partidos programados.</p>', ['#/partidos', 'Añadir partidos']);
      const days = dayDiff(m.date);
      const when = days === 0 ? 'Hoy' : days === 1 ? 'Mañana' : `Faltan ${days} días`;
      const called = (m.squad || []).filter((p) => p.called !== false).length;
      const home = S.club.short_name || S.club.name;
      const vs = m.is_home ? `${esc(home)} – ${esc(m.rival || 'Rival')}` : `${esc(m.rival || 'Rival')} – ${esc(home)}`;
      return card(key, `
        <p class="big-line">${vs}</p>
        <p><span class="countdown">${when}</span> · ${esc(longDate(m.date))}${m.time ? ' · ' + esc(hhmm(m.time)) : ''}${m.matchday ? ` · Jornada ${esc(m.matchday)}` : ''}</p>
        <p>${called ? `<span class="pill ok">Convocatoria hecha · ${called}</span>` : '<span class="pill warn">Convocatoria pendiente</span>'}</p>`,
        [`#/partidos/${m.id}/prepartido`, 'Abrir prepartido']);
    }
    case 'sesiones': {
      if (failed(d.lastSession) || failed(d.nextSession)) return card(key, errorBody);
      const line = (s, label) => {
        if (!s) return `<li><span class="muted">${label}:</span> ninguna</li>`;
        const n = (s.blocks || []).length;
        const days = dayDiff(s.date);
        const rel = days === 0 ? 'hoy' : days === 1 ? 'mañana' : days === -1 ? 'ayer' : fmt(s.date + 'T00:00');
        return `<li><span class="muted">${label}:</span> <a href="#/sesiones/${esc(s.id)}">${esc(rel)}${s.time ? ' · ' + esc(hhmm(s.time)) : ''}</a>${s.duration_min ? ` · ${esc(s.duration_min)}'` : ''}${n ? ` · ${n} bloques` : ''}</li>`;
      };
      return card(key, `<ul class="plain-list">${line(d.lastSession, 'Última')}${line(d.nextSession, 'Próxima')}</ul>`, ['#/sesiones', 'Ver sesiones']);
    }
    case 'microciclo': {
      if (failed(d.period)) return card(key, errorBody);
      if (!S.season) return card(key, '<p class="muted">Sin temporada.</p>');
      const mc = microcycleAt(d.period, new Date());
      const week = `Semana del ${fmt(mondayOf(new Date()))}`;
      if (!d.period) return card(key, `<p class="muted">Aún no hay periodización para este equipo.</p><p class="hint">${esc(week)}</p>`, ['#/periodizacion', 'Crear periodización']);
      if (!mc) return card(key, `<p class="muted">Hoy está fuera de la periodización de la temporada.</p>`, ['#/periodizacion', 'Ver periodización']);
      return card(key, `
        <p class="big-line">${mc.skipped ? 'Semana sin microciclo' : `Microciclo ${esc(mc.number)}`}</p>
        <p>${esc(week)}${mc.period ? ` · <span class="pill">${esc(mc.period)}</span>` : ''}</p>`, ['#/periodizacion', 'Ver periodización']);
    }
    case 'lesionados': {
      if (failed(d.injured)) return card(key, errorBody);
      const list = d.injured || [];
      if (!list.length) return card(key, '<p class="big-line">Ninguno 💪</p>', ['#/plantilla', 'Ver plantilla']);
      const shown = list.slice(0, 5).map((p) => `<li>${p.number != null ? `<span class="num">${esc(p.number)}</span>` : ''}${esc(p.name)}</li>`).join('');
      return card(key, `<p class="big-line">${list.length} ${list.length === 1 ? 'lesionado' : 'lesionados'}</p><ul class="plain-list">${shown}${list.length > 5 ? `<li class="muted">y ${list.length - 5} más</li>` : ''}</ul>`, ['#/plantilla', 'Ver plantilla']);
    }
    case 'asistencia': {
      if (failed(d.attendance)) return card(key, errorBody);
      const sessions = (d.attendance || []).filter((s) => s.attendance && Object.keys(s.attendance).length);
      if (!sessions.length) return card(key, '<p class="muted">Sin asistencia registrada en las últimas 4 semanas.</p>', ['#/sesiones', 'Ver sesiones']);
      let D = 0, L = 0, A = 0;
      sessions.forEach((s) => Object.values(s.attendance).forEach((a) => {
        if (a?.status === 'D') D++; else if (a?.status === 'L') L++; else if (a?.status === 'A') A++;
      }));
      const total = D + L + A;
      const pct = total ? Math.round((D / total) * 100) : 0;
      return card(key, `
        <p class="big-line">${pct}%</p>
        <div class="meter" role="img" aria-label="${pct}% de asistencia"><span style="width:${pct}%"></span></div>
        <p class="hint">${sessions.length} ${sessions.length === 1 ? 'sesión' : 'sesiones'} · ${D} presentes · ${A} ausencias · ${L} lesionados</p>`, ['#/estadisticas', 'Ver estadísticas']);
    }
    case 'comentarios': {
      if (failed(d.comments)) return card(key, errorBody);
      const n = d.commentCount || 0;
      if (!S.club.class_id && !n) return card(key, '<p class="muted">Tu club no está en ninguna clase.</p>', ['#/unirse', 'Unirme a una clase']);
      if (!n) return card(key, '<p class="big-line">Todo al día ✓</p><p class="hint">No hay comentarios pendientes.</p>');
      const c = d.comments[0];
      return card(key, `
        <p class="big-line">${n} ${n === 1 ? 'pendiente' : 'pendientes'}</p>
        <blockquote class="quote">${esc(String(c.text).slice(0, 140))}${c.text.length > 140 ? '…' : ''}</blockquote>
        <p class="hint">${esc(fmt(c.created_at))}</p>`);
    }
    default:
      return '';
  }
}
