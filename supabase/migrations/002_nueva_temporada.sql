-- =====================================================================
-- Club Gestor · Migración 002 · Nueva temporada a partir de la anterior (v0.4.0)
-- Copia los equipos, la plantilla (opcional), los morfociclos y los macrociclos
-- (estos sin marcas, como plantilla). Las personas asignadas a un equipo
-- quedan asignadas también a su copia.
-- Idempotente: se puede volver a ejecutar.
-- =====================================================================

create or replace function public.copy_season(
  p_from uuid,
  p_name text,
  p_start date,
  p_end date,
  p_copy_players boolean default true,
  p_make_current boolean default true
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_club uuid;
  v_new uuid;
  v_team uuid;
  t record;
begin
  select club_id into v_club from seasons where id = p_from;
  if v_club is null then raise exception 'La temporada de origen no existe.'; end if;
  if not public.is_admin(v_club) then raise exception 'Solo el administrador del club puede crear temporadas.'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'La temporada necesita un nombre.'; end if;
  if p_end <= p_start then raise exception 'La temporada debe terminar después de empezar.'; end if;

  insert into seasons (club_id, name, start_date, end_date, is_current)
  values (v_club, trim(p_name), p_start, p_end, p_make_current)
  returning id into v_new;

  for t in select * from teams where season_id = p_from and not archived order by name loop
    insert into teams (club_id, season_id, name, category, modality, periods, period_minutes, squad_max)
    values (v_club, v_new, t.name, t.category, t.modality, t.periods, t.period_minutes, t.squad_max)
    returning id into v_team;

    if p_copy_players then
      insert into players (team_id, number, name, position, foot, birth_year, status, active)
      select v_team, number, name, position, foot, birth_year, 'D', true
        from players where team_id = t.id and active;
    end if;

    insert into morphocycles (team_id, name, match_day, rows, is_default)
    select v_team, name, match_day, rows, is_default from morphocycles where team_id = t.id;

    insert into macrocycles (team_id, season_id, name, area, start_monday, weeks, phases, groups)
    select v_team, v_new, m.name, m.area,
           (p_start - ((extract(isodow from p_start)::int - 1)))::date,
           m.weeks, '[]'::jsonb,
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'name', g -> 'name',
                      'items', coalesce((select jsonb_agg(jsonb_build_object('name', i -> 'name', 'marks', '{}'::jsonb))
                                          from jsonb_array_elements(coalesce(g -> 'items', '[]'::jsonb)) i), '[]'::jsonb)))
               from jsonb_array_elements(coalesce(m.groups, '[]'::jsonb)) g), '[]'::jsonb)
      from macrocycles m where m.team_id = t.id;

    -- Quien tenía asignado el equipo, tiene también el nuevo.
    update club_members set team_ids = array_append(team_ids, v_team)
     where club_id = v_club and t.id = any (team_ids);
  end loop;

  return v_new;
end;
$$;

revoke execute on function public.copy_season(uuid, text, date, date, boolean, boolean) from public, anon;
grant  execute on function public.copy_season(uuid, text, date, date, boolean, boolean) to authenticated;
