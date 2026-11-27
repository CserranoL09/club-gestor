-- =====================================================================
-- Club Gestor · Migración 010 · Macrociclos por área (v0.13.0)
--  · Dirección, entrenador principal y 2.º entrenador editan cualquier macrociclo del equipo.
--  · El preparador físico solo los de área «condicional» y el entrenador de porteros los de «porteros».
--  · (La Coordinación aplica las plantillas del club; las políticas de la tabla siguen mandando.)
-- Idempotente: se puede volver a ejecutar.
-- =====================================================================

create or replace function public.tg_macro_area()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_team uuid := coalesce(new.team_id, old.team_id); v_area text;
begin
  -- La Coordinación entra aquí solo al aplicar plantillas del club (apply_template).
  if auth.uid() is null or public.can_edit_team(v_team) or public.has_team(v_team, array['ayudante'])
     or public.role_in(public.club_of_team(v_team)) = 'coordinador' then
    return coalesce(new, old);
  end if;
  v_area := case when public.has_team(v_team, array['preparador']) then 'condicional'
                 when public.has_team(v_team, array['porteros']) then 'porteros' end;
  if v_area is null
     or (tg_op <> 'INSERT' and old.area is distinct from v_area)
     or (tg_op <> 'DELETE' and new.area is distinct from v_area) then
    raise exception '%', case v_area when 'condicional' then 'Como preparador físico solo puedes editar los macrociclos del área condicional.'
                                     when 'porteros' then 'Como entrenador de porteros solo puedes editar los macrociclos del área de porteros.'
                                     else 'No puedes editar los macrociclos de este equipo.' end
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists macro_area on public.macrocycles;
create trigger macro_area before insert or update on public.macrocycles
  for each row execute function public.tg_macro_area();

revoke execute on function public.tg_macro_area() from public, anon, authenticated;
