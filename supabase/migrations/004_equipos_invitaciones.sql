-- =====================================================================
-- Club Gestor · Migración 004 · Alta rápida de equipos e invitaciones por equipo (v0.6.0)
--  · create_team(): crea un equipo con los valores de su modalidad y el morfociclo estándar.
--  · get_invitation(): devuelve también los equipos y la especialidad de la invitación.
-- Idempotente: se puede volver a ejecutar.
-- =====================================================================

create or replace function public.create_team(
  p_club uuid,
  p_season uuid,
  p_name text,
  p_category text default '',
  p_modality text default 'f11',
  p_periods int default null,
  p_period_minutes int default null,
  p_squad_max int default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_team uuid;
begin
  if not public.is_admin(p_club) then raise exception 'Solo la Dirección del club puede crear equipos.'; end if;
  if not exists (select 1 from seasons where id = p_season and club_id = p_club) then
    raise exception 'La temporada no es de este club.';
  end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'El equipo necesita un nombre.'; end if;
  if p_modality not in ('f11', 'f7') then raise exception 'Modalidad no válida (f11 o f7).'; end if;

  insert into teams (club_id, season_id, name, category, modality, periods, period_minutes, squad_max)
  values (p_club, p_season, trim(p_name), coalesce(trim(p_category), ''), p_modality,
          coalesce(p_periods, 2),
          coalesce(p_period_minutes, case when p_modality = 'f7' then 35 else 45 end),
          coalesce(p_squad_max, case when p_modality = 'f7' then 14 else 18 end))
  returning id into v_team;

  insert into morphocycles (team_id, name, match_day, rows, is_default)
  values (v_team, 'Morfociclo estándar', 6, public.default_morphocycle_rows(), true);

  return v_team;
end;
$$;
revoke execute on function public.create_team(uuid, uuid, text, text, text, int, int, int) from public, anon;
grant  execute on function public.create_team(uuid, uuid, text, text, text, int, int, int) to authenticated;

-- Cambia las columnas que devuelve: hay que borrarla antes.
drop function if exists public.get_invitation(text);
create function public.get_invitation(p_token text)
returns table (club_name text, role text, expires_at timestamptz, valid boolean,
               specialty text, team_ids uuid[], team_names text)
language sql stable security definer set search_path = public as $$
  select c.name, i.role, i.expires_at,
         (not i.revoked and i.accepted_at is null and i.expires_at > now()),
         i.specialty, i.team_ids,
         (select string_agg(t.name, ', ' order by t.name) from teams t where t.id = any (i.team_ids))
  from invitations i join clubs c on c.id = i.club_id
  where i.token = p_token;
$$;
revoke execute on function public.get_invitation(text) from public, anon;
grant  execute on function public.get_invitation(text) to authenticated;
