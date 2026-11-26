-- =====================================================================
-- Club Gestor · Migración 007 · Plantilla de jugadores (v0.10.0)
--  · player_usage(jugador): en cuántas sesiones y partidos aparece, para
--    proponer «marcar como inactivo» en lugar de borrar a quien ya tiene datos.
-- Idempotente: se puede volver a ejecutar.
-- =====================================================================

create or replace function public.player_usage(p_player uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_team uuid; v_ses int; v_mat int; k text := p_player::text;
begin
  select team_id into v_team from players where id = p_player;
  if v_team is null or not public.can_read_team(v_team) then
    raise exception 'Jugador no encontrado.' using errcode = '42501';
  end if;
  select count(*) into v_ses from sessions where team_id = v_team and attendance ? k;
  select count(*) into v_mat from matches where team_id = v_team and (
       player_stats ? k
    or exists (select 1 from jsonb_array_elements(squad) s where s ->> 'player_id' = k)
    or exists (select 1 from jsonb_array_elements(events) e where k in (e ->> 'player_id', e ->> 'player_out_id', e ->> 'assist_id')));
  return jsonb_build_object('sessions', v_ses, 'matches', v_mat);
end;
$$;

revoke execute on function public.player_usage(uuid) from public, anon;
grant  execute on function public.player_usage(uuid) to authenticated;
