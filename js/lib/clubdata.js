// Datos y métricas del club para el Panel y la página de Equipos.
// Todo se calcula en el navegador a partir de lo que RLS deja leer a cada usuario.
import { sb } from '../supabase.js';
import { S, visibleTeams, isMyTeam, isAdmin, isCoordinator, clubSettings } from '../session.js';
import { mondayOf, addDays } from './dates.js';

export const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Ajustes de alertas del club (Configuración → Club). 0 = desactivada. */
export const ALERT_DEFAULTS = { no_session: true, report_days: 3, attendance_min: 70, no_coach: true, squad_hours: 48 };
export function alertSettings() {
  return { ...ALERT_DEFAULTS, ...(clubSettings().alerts || {}) };
}

/** Nombre de una persona del club. */
export const personName = (m) => m.profile?.full_name || m.profile?.email || 'Sin nombre';

/**
 * Devuelve { teams, members, staffByTeam, playersByTeam, pendingInvites, metrics, alerts }.
 * teams: equipos de la temporada que el usuario supervisa (Dirección: todos; Coordinación: los suyos).
 * metrics[teamId]: { week:{planned, done}, attendance:{pct, sessions}, next, last, pendingReports, injured, comments }
 * alerts: [{ team, kind, text }]
 */
export async function loadClubOverview({ withMetrics = true } = {}) {
  const client = sb();
  const teams = visibleTeams().filter((t) => isAdmin() || isMyTeam(t.id));
  const ids = teams.map((t) => t.id);
  const none = Promise.resolve({ data: [] });
  const today = new Date();
  const mon = mondayOf(today);
  const sun = addDays(mon, 6);

  const [mem, players, inv, sessions, matches, comments] = await Promise.all([
    client.from('club_members').select('user_id, role, team_ids, specialty, profile:profiles(full_name, email)').eq('club_id', S.club.id),
    ids.length ? client.from('players').select('team_id, status').in('team_id', ids).eq('active', true) : none,
    isAdmin() || isCoordinator()
      ? client.from('invitations').select('id, team_ids, role').eq('club_id', S.club.id).is('accepted_at', null)
          .eq('revoked', false).gt('expires_at', new Date().toISOString())
      : none,
    withMetrics && ids.length
      ? client.from('sessions').select('team_id, date, attendance').in('team_id', ids)
          .gte('date', iso(addDays(today, -28))).lte('date', iso(sun))
      : none,
    withMetrics && ids.length
      ? client.from('matches').select('id, team_id, date, time, rival, is_home, goals_for, goals_against, report_done, squad, matchday')
          .in('team_id', ids).gte('date', iso(addDays(today, -120))).lte('date', iso(addDays(today, 60))).order('date')
      : none,
    withMetrics && ids.length
      ? client.from('comments').select('team_id').in('team_id', ids).eq('resolved', false).is('parent_id', null)
      : none
  ]);
  for (const r of [mem, players, inv, sessions, matches, comments]) if (r.error) throw r.error;

  const members = mem.data || [];
  const staffByTeam = {};
  const playersByTeam = {};
  const metrics = {};
  for (const t of teams) {
    staffByTeam[t.id] = members.filter((m) => m.role !== 'admin' && m.team_ids?.includes(t.id));
    playersByTeam[t.id] = { total: 0, injured: 0 };
    metrics[t.id] = { week: { planned: 0, done: 0 }, attendance: { pct: null, sessions: 0 }, next: null, last: null, pendingReports: [], comments: 0 };
  }
  for (const p of players.data || []) {
    const c = playersByTeam[p.team_id];
    if (!c) continue;
    c.total++;
    if (p.status === 'L') c.injured++;
  }
  if (!withMetrics) return { teams, members, staffByTeam, playersByTeam, pendingInvites: inv.data || [], metrics, alerts: [] };

  const todayIso = iso(today);
  const monIso = iso(mon);
  const sunIso = iso(sun);
  const att = {};
  for (const s of sessions.data || []) {
    const m = metrics[s.team_id];
    if (!m) continue;
    const marked = s.attendance && Object.keys(s.attendance).length > 0;
    if (s.date >= monIso && s.date <= sunIso) {
      m.week.planned++;
      if (s.date <= todayIso && marked) m.week.done++;
    }
    if (s.date <= todayIso && marked) {
      const a = (att[s.team_id] ||= { D: 0, total: 0, sessions: 0 });
      a.sessions++;
      for (const v of Object.values(s.attendance)) {
        if (!v?.status) continue;
        a.total++;
        if (v.status === 'D') a.D++;
      }
    }
  }
  for (const [tid, a] of Object.entries(att)) {
    metrics[tid].attendance = { pct: a.total ? Math.round((a.D / a.total) * 100) : null, sessions: a.sessions };
  }
  for (const mt of matches.data || []) {
    const m = metrics[mt.team_id];
    if (!m) continue;
    if (mt.date >= todayIso) { if (!m.next) m.next = mt; }
    else {
      m.last = mt;                                   // ordenados por fecha: el último gana
      if (!mt.report_done) m.pendingReports.push(mt);
    }
  }
  for (const c of comments.data || []) if (metrics[c.team_id]) metrics[c.team_id].comments++;

  return { teams, members, staffByTeam, playersByTeam, pendingInvites: inv.data || [], metrics, alerts: computeAlerts(teams, staffByTeam, playersByTeam, metrics) };
}

/** Alertas según los ajustes del club. */
export function computeAlerts(teams, staffByTeam, playersByTeam, metrics) {
  const cfg = alertSettings();
  const out = [];
  const now = new Date();
  const todayIso = iso(now);
  for (const t of teams) {
    const m = metrics[t.id];
    const add = (kind, text, href) => out.push({ team: t, kind, text, href });
    if (cfg.no_coach && !staffByTeam[t.id].some((x) => x.role === 'entrenador')) add('no_coach', 'Sin entrenador principal', '#/config?tab=personas');
    if (!playersByTeam[t.id].total) add('no_players', 'Sin jugadores en la plantilla', null);
    if (cfg.no_session && m.week.planned === 0) add('no_session', 'Sin sesiones planificadas esta semana', null);
    if (cfg.report_days > 0) {
      const late = m.pendingReports.filter((x) => daysBetween(x.date, todayIso) >= cfg.report_days);
      if (late.length) add('report', `${late.length} ${late.length === 1 ? 'informe postpartido pendiente' : 'informes postpartido pendientes'} (más de ${cfg.report_days} días)`, null);
    }
    if (cfg.attendance_min > 0 && m.attendance.pct !== null && m.attendance.pct < cfg.attendance_min) {
      add('attendance', `Asistencia del ${m.attendance.pct}% (por debajo del ${cfg.attendance_min}%)`, null);
    }
    if (cfg.squad_hours > 0 && m.next) {
      const when = new Date(`${m.next.date}T${m.next.time ? String(m.next.time).slice(0, 5) : '12:00'}:00`);
      const hours = (when - now) / 3600000;
      const called = (m.next.squad || []).filter((p) => p.called !== false).length;
      if (hours <= cfg.squad_hours && hours > -3 && !called) add('squad', `Convocatoria sin hacer para el partido contra ${m.next.rival || 'el rival'}`, null);
    }
  }
  return out;
}

function daysBetween(a, b) {
  return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
}
