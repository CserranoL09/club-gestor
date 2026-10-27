-- =====================================================================
-- Club Gestor · 2/4 · Funciones de permisos, triggers y RPC
-- Todas las funciones security definer llevan search_path fijo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Funciones de permisos (las usan las políticas RLS)
-- ---------------------------------------------------------------------

create or replace function public.is_member(p_club uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from club_members where club_id = p_club and user_id = auth.uid());
$$;

create or replace function public.role_in(p_club uuid)
returns text language sql stable security definer set search_path = public as $$
  select role from club_members where club_id = p_club and user_id = auth.uid();
$$;

create or replace function public.is_admin(p_club uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.role_in(p_club) = 'admin', false);
$$;

create or replace function public.club_of_team(p_team uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select club_id from teams where id = p_team;
$$;

create or replace function public.is_teacher_of(p_club uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from clubs c join classes k on k.id = c.class_id
    where c.id = p_club and k.teacher_id = auth.uid()
  );
$$;

-- Ver un club: sus miembros y el profesor de su clase.
create or replace function public.can_read_club(p_club uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_member(p_club) or public.is_teacher_of(p_club);
$$;

-- El miembro tiene ese equipo asignado (team_ids vacío = todos los equipos del club).
create or replace function public.has_team(p_team uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from club_members m join teams t on t.club_id = m.club_id
    where t.id = p_team and m.user_id = auth.uid() and m.role = any (p_roles)
      and (cardinality(m.team_ids) = 0 or p_team = any (m.team_ids))
  );
$$;

-- Editar todo en un equipo: admin y entrenador.
create or replace function public.can_edit_team(p_team uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin(public.club_of_team(p_team)) or public.has_team(p_team, array['entrenador']);
$$;

-- Planificar (sesiones, macrociclos, morfociclos): también preparador y porteros.
create or replace function public.can_plan_team(p_team uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_edit_team(p_team) or public.has_team(p_team, array['preparador', 'porteros']);
$$;

-- Comparte club con otra persona (para ver su nombre).
create or replace function public.can_see_profile(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_user = auth.uid()
    or exists (select 1 from club_members a join club_members b on a.club_id = b.club_id
               where a.user_id = auth.uid() and b.user_id = p_user)
    or exists (select 1 from club_members m where m.user_id = p_user and public.is_teacher_of(m.club_id))
    or exists (select 1 from classes k join clubs c on c.class_id = k.id join club_members m on m.club_id = c.id
               where k.teacher_id = p_user and m.user_id = auth.uid());
$$;

-- Clubes en la carpeta <club_id>/... de Storage.
create or replace function public.storage_club(p_name text)
returns uuid language sql immutable set search_path = public as $$
  select case when split_part(p_name, '/', 1) ~ '^[0-9a-fA-F-]{36}$' then split_part(p_name, '/', 1)::uuid end;
$$;

-- ---------------------------------------------------------------------
-- Triggers de protección
-- ---------------------------------------------------------------------

-- Crear el perfil al registrarse.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, is_teacher)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(coalesce(new.email, ''), '@', 1)),
    coalesce((new.raw_user_meta_data ->> 'is_teacher')::boolean, false)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Un club nunca puede quedarse sin administrador.
create or replace function public.tg_keep_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'admin'
     and (tg_op = 'DELETE' or new.role <> 'admin')
     and exists (select 1 from clubs where id = old.club_id)          -- si se borra el club entero, se permite
     and not exists (select 1 from club_members
                     where club_id = old.club_id and role = 'admin' and user_id <> old.user_id) then
    raise exception 'El club debe tener al menos un administrador. Transfiere la administración antes.'
      using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists keep_admin on public.club_members;
create trigger keep_admin before update or delete on public.club_members
  for each row execute function public.tg_keep_admin();

-- Comentarios: quien no es el autor solo puede marcarlos como resueltos.
create or replace function public.tg_comment_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.author_id is distinct from old.author_id or new.club_id is distinct from old.club_id
     or new.entity is distinct from old.entity or new.entity_id is distinct from old.entity_id then
    raise exception 'No se puede cambiar el autor ni el destino de un comentario.';
  end if;
  if auth.uid() is distinct from old.author_id and new.text is distinct from old.text then
    raise exception 'Solo el autor puede editar el texto del comentario.';
  end if;
  return new;
end;
$$;
drop trigger if exists comment_guard on public.comments;
create trigger comment_guard before update on public.comments
  for each row execute function public.tg_comment_guard();

-- Solo un morfociclo predeterminado por equipo.
create or replace function public.tg_one_default_morpho()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_default then
    update morphocycles set is_default = false where team_id = new.team_id and id <> new.id and is_default;
  end if;
  return new;
end;
$$;
drop trigger if exists one_default_morpho on public.morphocycles;
create trigger one_default_morpho after insert or update of is_default on public.morphocycles
  for each row when (new.is_default) execute function public.tg_one_default_morpho();

-- Solo una temporada actual por club.
create or replace function public.tg_one_current_season()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_current then
    update seasons set is_current = false where club_id = new.club_id and id <> new.id and is_current;
  end if;
  return new;
end;
$$;
drop trigger if exists one_current_season on public.seasons;
create trigger one_current_season before insert or update of is_current on public.seasons
  for each row when (new.is_current) execute function public.tg_one_current_season();

-- ---------------------------------------------------------------------
-- Datos iniciales: morfociclo estándar de la hoja MORFOCICLO
-- ---------------------------------------------------------------------
create or replace function public.default_morphocycle_rows()
returns jsonb language sql immutable as $$
  select '[
    {"label":"Principios","values":{"lun":"","mar":"Recuperación","mie":"Sub-Principios","jue":"Principios","vie":"Sub y sub-sub-principios","sab":"","dom":"PARTIDO"}},
    {"label":"Grupos","values":{"lun":"","mar":"Por líneas o posicional","mie":"Relación de varias líneas","jue":"Todas las líneas","vie":"Por líneas","sab":"","dom":""}},
    {"label":"Táctica/Est.","values":{"lun":"","mar":"Espacios reducidos","mie":"Espacios intermedios","jue":"Espacio real","vie":"Espacios reducidos","sab":"","dom":""}},
    {"label":"Guía de ejercicios de entrenamiento","section":true,"values":{}},
    {"label":"Temática","values":{"lun":"Recuperación pasiva","mar":"Recuperación activa","mie":"Fuerza y velocidad","jue":"Resistencia","vie":"Velocidad","sab":"Recuperación pasiva","dom":"PARTIDO"}},
    {"label":"Complej./Intens.","values":{"lun":"","mar":"Baja","mie":"Media","jue":"Alta","vie":"Baja/Media","sab":"","dom":""}},
    {"label":"Espacio","values":{"lun":"","mar":"Medio campo","mie":"Espacio reducido","jue":"Medio campo y campo entero","vie":"Medio campo y espacio reducido","sab":"","dom":"Campo completo"}},
    {"label":"Diseño del espacio","values":{"lun":"","mar":"","mie":"","jue":"","vie":"","sab":"","dom":""}},
    {"label":"Duración/Volumen","values":{"lun":"","mar":"Media duración. Ej: 4x15'' (60'')","mie":"Corta duración. Ej: 6x10'' (60'')","jue":"Media/Larga duración. Ej: 2x30'' (60'')","vie":"Corta duración. Ej: 6x10'' (60'')","sab":"","dom":""}},
    {"label":"Intervalos","values":{"lun":"","mar":"4 intervalos","mie":"4 a 6 intervalos","jue":"1, 2 o 3 intervalos","vie":"4 a 6 intervalos","sab":"","dom":""}},
    {"label":"Recuperación","values":{"lun":"","mar":"Larga: 5 a 8''","mie":"Corta: 3 a 5''","jue":"Larga: 5 a 8''","vie":"Media: 4 a 6''","sab":"","dom":""}},
    {"label":"Periodos","values":{"lun":"","mar":"1 periodo","mie":"2 a 3 periodos","jue":"1 a 2 periodos","vie":"1 periodo","sab":"","dom":""}},
    {"label":"Número de rivales","values":{"lun":"","mar":"Débil: 1x0, 5x0, 10x0","mie":"Baja: 5x2, 8x4","jue":"Relación de partido: 10x8, 11x11","vie":"Baja: 4x2, 5x2, 8x4","sab":"","dom":""}},
    {"label":"Estrategia de partido","values":{"lun":"Evaluación del partido anterior","mar":"Análisis del partido previo","mie":"Análisis del oponente","jue":"Definición del 11 inicial. Táctica del oponente","vie":"ABP, otros detalles del rival","sab":"Sesión de vídeo","dom":""}}
  ]'::jsonb;
$$;

-- ---------------------------------------------------------------------
-- RPC (operaciones de varios pasos, en una sola transacción)
-- ---------------------------------------------------------------------

-- Crear club + temporada actual + primer equipo + admin + morfociclo estándar.
create or replace function public.create_club(
  p_name text,
  p_short_name text default '',
  p_season_name text default '2026/27',
  p_start_date date default '2026-08-03',
  p_end_date date default '2027-06-30',
  p_team_name text default 'Primer equipo',
  p_category text default '',
  p_modality text default 'f11',
  p_periods int default 2,
  p_period_minutes int default 45
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_club uuid;
  v_season uuid;
  v_team uuid;
begin
  if v_uid is null then raise exception 'Tienes que iniciar sesión.'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'El club necesita un nombre.'; end if;
  if p_modality not in ('f11', 'f7') then raise exception 'Modalidad no válida (f11 o f7).'; end if;

  insert into profiles (id) values (v_uid) on conflict (id) do nothing;

  insert into clubs (name, short_name, created_by)
  values (trim(p_name), coalesce(trim(p_short_name), ''), v_uid)
  returning id into v_club;

  insert into club_members (club_id, user_id, role) values (v_club, v_uid, 'admin');

  insert into seasons (club_id, name, start_date, end_date, is_current)
  values (v_club, p_season_name, p_start_date, p_end_date, true)
  returning id into v_season;

  insert into teams (club_id, season_id, name, category, modality, periods, period_minutes, squad_max)
  values (v_club, v_season, coalesce(nullif(trim(p_team_name), ''), 'Primer equipo'), coalesce(p_category, ''),
          p_modality, p_periods, p_period_minutes, case when p_modality = 'f7' then 14 else 18 end)
  returning id into v_team;

  insert into morphocycles (team_id, name, match_day, rows, is_default)
  values (v_team, 'Morfociclo estándar', 6, public.default_morphocycle_rows(), true);

  return v_club;
end;
$$;

-- Ver una invitación antes de aceptarla (solo con el token).
create or replace function public.get_invitation(p_token text)
returns table (club_name text, role text, expires_at timestamptz, valid boolean)
language sql stable security definer set search_path = public as $$
  select c.name, i.role, i.expires_at,
         (not i.revoked and i.accepted_at is null and i.expires_at > now())
  from invitations i join clubs c on c.id = i.club_id
  where i.token = p_token;
$$;

-- Aceptar una invitación.
create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_inv invitations%rowtype;
  v_email text;
begin
  if v_uid is null then raise exception 'Tienes que iniciar sesión.'; end if;

  select * into v_inv from invitations where token = p_token for update;
  if not found then raise exception 'La invitación no existe.'; end if;
  if v_inv.revoked then raise exception 'La invitación se ha anulado.'; end if;
  if v_inv.accepted_at is not null then raise exception 'La invitación ya se ha usado.'; end if;
  if v_inv.expires_at <= now() then raise exception 'La invitación ha caducado. Pide una nueva.'; end if;

  select email into v_email from auth.users where id = v_uid;
  if coalesce(v_inv.email, '') <> '' and lower(v_inv.email) <> lower(coalesce(v_email, '')) then
    raise exception 'Esta invitación es para otro email (%).', v_inv.email;
  end if;

  insert into profiles (id) values (v_uid) on conflict (id) do nothing;

  insert into club_members (club_id, user_id, role, team_ids)
  values (v_inv.club_id, v_uid, v_inv.role, v_inv.team_ids)
  on conflict (club_id, user_id) do update
    set role = case when club_members.role = 'admin' then 'admin' else excluded.role end,
        team_ids = excluded.team_ids;

  update invitations set accepted_by = v_uid, accepted_at = now() where id = v_inv.id;
  return v_inv.club_id;
end;
$$;

-- Vincular el club a la clase de un profesor (lo hace el admin del club).
create or replace function public.join_class(p_code text, p_club uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_class classes%rowtype;
begin
  if auth.uid() is null then raise exception 'Tienes que iniciar sesión.'; end if;
  if not public.is_admin(p_club) then raise exception 'Solo el administrador del club puede unirlo a una clase.'; end if;

  select * into v_class from classes where join_code = upper(trim(p_code)) and not archived;
  if not found then raise exception 'No hay ninguna clase con ese código.'; end if;

  update clubs set class_id = v_class.id where id = p_club;
  return v_class.name;
end;
$$;

-- Desvincular el club de su clase.
create or replace function public.leave_class(p_club uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(p_club) then raise exception 'Solo el administrador del club puede hacerlo.'; end if;
  update clubs set class_id = null where id = p_club;
end;
$$;

-- Salir de un club.
create or replace function public.leave_club(p_club uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Tienes que iniciar sesión.'; end if;
  delete from club_members where club_id = p_club and user_id = auth.uid();   -- tg_keep_admin protege al último admin
  if not found then raise exception 'No perteneces a este club.'; end if;
end;
$$;

-- Pasar la administración a otra persona del club (el admin actual queda como entrenador).
create or replace function public.transfer_admin(p_club uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(p_club) then raise exception 'Solo el administrador puede transferir la administración.'; end if;
  if p_user = auth.uid() then raise exception 'Elige a otra persona.'; end if;
  update club_members set role = 'admin', team_ids = '{}' where club_id = p_club and user_id = p_user;
  if not found then raise exception 'Esa persona no pertenece al club.'; end if;
  update club_members set role = 'entrenador' where club_id = p_club and user_id = auth.uid();
end;
$$;

-- Nuevo código para una clase.
create or replace function public.regenerate_join_code(p_class uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  update classes set join_code = public.gen_join_code()
  where id = p_class and teacher_id = auth.uid()
  returning join_code into v_code;
  if v_code is null then raise exception 'Esa clase no es tuya.'; end if;
  return v_code;
end;
$$;

-- Las funciones internas no se llaman desde la app.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.tg_keep_admin() from public, anon, authenticated;
revoke execute on function public.tg_one_default_morpho() from public, anon, authenticated;
revoke execute on function public.tg_one_current_season() from public, anon, authenticated;
-- Las RPC son solo para usuarios con sesión.
revoke execute on function public.create_club(text, text, text, date, date, text, text, text, int, int) from public, anon;
grant  execute on function public.create_club(text, text, text, date, date, text, text, text, int, int) to authenticated;
revoke execute on function public.accept_invitation(text) from public, anon;
grant  execute on function public.accept_invitation(text) to authenticated;
revoke execute on function public.get_invitation(text) from public, anon;
grant  execute on function public.get_invitation(text) to authenticated;
revoke execute on function public.join_class(text, uuid) from public, anon;
grant  execute on function public.join_class(text, uuid) to authenticated;
revoke execute on function public.leave_class(uuid) from public, anon;
grant  execute on function public.leave_class(uuid) to authenticated;
revoke execute on function public.leave_club(uuid) from public, anon;
grant  execute on function public.leave_club(uuid) to authenticated;
revoke execute on function public.transfer_admin(uuid, uuid) from public, anon;
grant  execute on function public.transfer_admin(uuid, uuid) to authenticated;
revoke execute on function public.regenerate_join_code(uuid) from public, anon;
grant  execute on function public.regenerate_join_code(uuid) to authenticated;
