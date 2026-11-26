-- =====================================================================
-- Club Gestor · Migración 008 · Sesiones de entrenamiento (v0.11.0)
--  · El preparador físico y el entrenador de porteros solo cambian, en una sesión:
--    su objetivo (el condicional, el preparador), su rol en cada tarea y las tareas que crean ellos.
--    El resto de la ficha lo ven en solo lectura. (Dirección, entrenador principal y 2.º entrenador: todo.)
-- Idempotente: se puede volver a ejecutar.
-- =====================================================================

create or replace function public.tg_session_limited()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uid  uuid := auth.uid();
  me   text;
  ob   jsonb;
  nb   jsonb;
  msg  text;
begin
  if uid is null or public.can_edit_team(new.team_id) or public.has_team(new.team_id, array['ayudante']) then
    return new;
  end if;
  -- Aquí solo llega el preparador físico o el entrenador de porteros (RLS ya exige can_plan_team).
  me := case when public.has_team(new.team_id, array['preparador']) then 'preparador' else 'porteros' end;
  msg := case me when 'preparador' then 'Como preparador físico solo puedes cambiar el objetivo condicional, tu rol en cada tarea y las tareas que crees tú.'
                 else 'Como entrenador de porteros solo puedes cambiar tu rol en cada tarea y las tareas que crees tú.' end;
  if tg_op = 'INSERT' then
    return new;
  end if;

  if new.team_id is distinct from old.team_id or new.date is distinct from old.date or new.time is distinct from old.time
     or new.duration_min is distinct from old.duration_min or new.period is distinct from old.period
     or new.microcycle is distinct from old.microcycle or new.number is distinct from old.number
     or new.staff is distinct from old.staff or new.material is distinct from old.material
     or new.attendance is distinct from old.attendance or new.notes is distinct from old.notes then
    raise exception '%', msg using errcode = '42501';
  end if;

  if me = 'preparador' then
    if (coalesce(new.objectives, '{}') - 'condicional') is distinct from (coalesce(old.objectives, '{}') - 'condicional') then
      raise exception '%', msg using errcode = '42501';
    end if;
  elsif new.objectives is distinct from old.objectives then
    raise exception '%', msg using errcode = '42501';
  end if;

  -- Tareas de otros: siguen ahí y solo cambia su rol.
  for ob in select * from jsonb_array_elements(coalesce(old.blocks, '[]')) loop
    continue when ob ->> 'author_id' = uid::text;
    select b into nb from jsonb_array_elements(coalesce(new.blocks, '[]')) b where b ->> 'id' = ob ->> 'id';
    if nb is null
       or (nb - 'roles') is distinct from (ob - 'roles')
       or (coalesce(nb -> 'roles', '{}') - me) is distinct from (coalesce(ob -> 'roles', '{}') - me) then
      raise exception '%', msg using errcode = '42501';
    end if;
  end loop;
  -- Tareas nuevas: solo a su nombre.
  for nb in select * from jsonb_array_elements(coalesce(new.blocks, '[]')) loop
    if not exists (select 1 from jsonb_array_elements(coalesce(old.blocks, '[]')) b where b ->> 'id' = nb ->> 'id')
       and nb ->> 'author_id' is distinct from uid::text then
      raise exception '%', msg using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists session_limited on public.sessions;
create trigger session_limited before update on public.sessions
  for each row execute function public.tg_session_limited();

revoke execute on function public.tg_session_limited() from public, anon, authenticated;
