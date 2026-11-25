// Datos de resumen del club para el Panel y la página de Equipos.
import { sb } from '../supabase.js';
import { S, visibleTeams, isMyTeam, isAdmin, isCoordinator } from '../session.js';

/**
 * Devuelve { teams, members, staffByTeam, playersByTeam, pendingInvites }.
 * teams: equipos de la temporada que el usuario supervisa (Dirección: todos; Coordinación: los suyos).
 */
export async function loadClubOverview() {
  const client = sb();
  const teams = visibleTeams().filter((t) => isAdmin() || isMyTeam(t.id));
  const ids = teams.map((t) => t.id);
  const [mem, players, inv] = await Promise.all([
    client.from('club_members').select('user_id, role, team_ids, specialty, profile:profiles(full_name, email)').eq('club_id', S.club.id),
    ids.length ? client.from('players').select('team_id, status').in('team_id', ids).eq('active', true) : Promise.resolve({ data: [] }),
    isAdmin() || isCoordinator()
      ? client.from('invitations').select('id, team_ids, role').eq('club_id', S.club.id).is('accepted_at', null)
          .eq('revoked', false).gt('expires_at', new Date().toISOString())
      : Promise.resolve({ data: [] })
  ]);
  for (const r of [mem, players, inv]) if (r.error) throw r.error;

  const members = mem.data || [];
  const staffByTeam = {};
  const playersByTeam = {};
  for (const t of teams) {
    staffByTeam[t.id] = members.filter((m) => m.role !== 'admin' && m.team_ids?.includes(t.id));
    playersByTeam[t.id] = { total: 0, injured: 0 };
  }
  for (const p of players.data || []) {
    const c = playersByTeam[p.team_id];
    if (!c) continue;
    c.total++;
    if (p.status === 'L') c.injured++;
  }
  return { teams, members, staffByTeam, playersByTeam, pendingInvites: inv.data || [] };
}

/** Nombre de una persona del club. */
export const personName = (m) => m.profile?.full_name || m.profile?.email || 'Sin nombre';
