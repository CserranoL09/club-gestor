-- =====================================================================
-- Club Gestor · Migración 003 · Perfiles de club y permisos por equipo (v0.5.0)
--  · Nuevos perfiles: coordinador («Coordinación») y ayudante («2.º entrenador / delegado»).
--  · Especialidad de cada persona del cuerpo técnico.
--  · Datos y ajustes del club (settings.coaches_see_all, settings.teaching_mode).
--  · Cada entrenador lee SOLO sus equipos (salvo que el club lo abra a todos).
--  · Comentarios por equipo y con destinatario; invitaciones creadas por Coordinación.
-- Idempotente: se puede volver a ejecutar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Columnas y restricciones
-- ---------------------------------------------------------------------
alter table public.club_members drop constraint if exists club_members_role_check;
alter table public.club_members add constraint club_members_role_check
  check (role in ('admin', 'coordinador', 'entrenador', 'ayudante', 'preparador', 'porteros'));
alter table public.club_members add column if not exists specialty text not null default '';

alter table public.invitations drop constraint if exists invitations_role_check;
alter table public.invitations add constraint invitations_role_check
  check (role in ('admin', 'coordinador', 'entrenador', 'ayudante', 'preparador', 'porteros'));
alter table public.invitations add column if not exists specialty text not null default '';

alter table public.clubs add column if not exists settings     jsonb not null default '{}'::jsonb;
alter table public.clubs add column if not exists city         text not null default '';
alter table public.clubs add column if not exists address      text not null default '';
alter table public.clubs add column if not exists founded_year smallint;
alter table public.clubs add column if not exists website      text not null default '';
alter table public.clubs add column if not exists email        text not null default '';
alter table public.clubs add column if not exists phone        text not null default '';
alter table public.clubs add column if not exists description  text not null default '';
alter table public.clubs drop constraint if exists clubs_founded_year_check;
alter table public.clubs add constraint clubs_founded_year_check check (founded_year is null or founded_year between 1850 and 2100);

alter table public.comments add column if not exists team_id uuid references public.teams (id) on delete cascade;
alter table public.comments add column if not exists to_user uuid references public.profiles (id) on delete set null;
create index if not exists comments_team_idx on public.comments (team_id);

-- ---------------------------------------------------------------------
-- Funciones de permisos
-- ---------------------------------------------------------------------
-- has_team(team, roles): el miembro tiene ese equipo (team_ids vacío = todos). Ya existía.

-- Planificar: también el 2.º entrenador / delegado.
create or replace function public.can_plan_team(p_team uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_edit_team(p_team) or public.has_team(p_team, array['preparador', 'porteros', 'ayudante']);
$$;

-- Día de partido (acta, convocatoria): entrenador principal y 2.º entrenador / delegado.
create or replace function public.can_match_team(p_team uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_edit_team(p_team) or public.has_team(p_team, array['ayudante']);
$$;

-- Supervisar (ver todo y comentar): Dirección y Coordinación de ese equipo.
create or replace function public.can_supervise(p_team uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin(public.club_of_team(p_team)) or public.has_team(p_team, array['coordinador']);
$$;

-- Leer los datos de un equipo.
create or replace function public.can_read_team(p_team uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    public.is_admin(public.club_of_team(p_team))
    or public.has_team(p_team, array['coordinador', 'entrenador', 'ayudante', 'preparador', 'porteros'])
    or (public.is_member(public.club_of_team(p_team))
        and coalesce((select (c.settings ->> 'coaches_see_all')::boolean from clubs c where c.id = public.club_of_team(p_team)), false))
    or public.is_teacher_of(public.club_of_team(p_team));
$$;

-- Invitar: Dirección a cualquiera; Coordinación al cuerpo técnico de sus equipos.
create or replace function public.can_invite(p_club uuid, p_role text, p_teams uuid[])
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin(p_club)
    or (
      public.role_in(p_club) = 'coordinador'
      and p_role in ('entrenador', 'ayudante', 'preparador', 'porteros')
      and cardinality(coalesce(p_teams, '{}')) > 0
      and not exists (
        select 1 from unnest(p_teams) t(id)
        where public.club_of_team(t.id) is distinct from p_club
           or not public.has_team(t.id, array['coordinador'])
      )
    );
$$;

-- Aceptar invitación: ahora también guarda la especialidad.
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

  insert into club_members (club_id, user_id, role, team_ids, specialty)
  values (v_inv.club_id, v_uid, v_inv.role, v_inv.team_ids, coalesce(v_inv.specialty, ''))
  on conflict (club_id, user_id) do update
    set role = case when club_members.role = 'admin' then 'admin' else excluded.role end,
        team_ids = case when club_members.role = 'admin' or cardinality(club_members.team_ids) = 0 then '{}'::uuid[]
                        else (select coalesce(array_agg(distinct x), '{}') from unnest(club_members.team_ids || excluded.team_ids) x) end,
        specialty = case when excluded.specialty <> '' then excluded.specialty else club_members.specialty end;

  update invitations set accepted_by = v_uid, accepted_at = now() where id = v_inv.id;
  return v_inv.club_id;
end;
$$;

revoke execute on function public.can_invite(uuid, text, uuid[]) from public, anon;
grant  execute on function public.can_invite(uuid, text, uuid[]) to authenticated;

-- ---------------------------------------------------------------------
-- Permisos de columnas
-- ---------------------------------------------------------------------
grant update (name, short_name, crest_path, primary_color, secondary_color, theme, font, home_layout,
              settings, city, address, founded_year, website, email, phone, description)
  on public.clubs to authenticated;
grant update (role, team_ids, specialty) on public.club_members to authenticated;
grant update (revoked, expires_at, role, team_ids, email, specialty) on public.invitations to authenticated;
grant update (text, resolved) on public.comments to authenticated;

-- ---------------------------------------------------------------------
-- Políticas de lectura por equipo
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['players', 'sessions', 'matches', 'periodizations', 'macrocycles', 'morphocycles'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.can_read_team(team_id))', t || '_select', t);
  end loop;
end $$;

-- Partidos: crear y borrar, entrenador principal; editar, también el 2.º entrenador / delegado.
drop policy if exists matches_write on public.matches;
drop policy if exists matches_insert on public.matches;
drop policy if exists matches_update on public.matches;
drop policy if exists matches_delete on public.matches;
create policy matches_insert on public.matches for insert to authenticated with check (public.can_edit_team(team_id));
create policy matches_update on public.matches for update to authenticated
  using (public.can_match_team(team_id)) with check (public.can_match_team(team_id));
create policy matches_delete on public.matches for delete to authenticated using (public.can_edit_team(team_id));

-- ---------------------------------------------------------------------
-- Comentarios: del club (team_id nulo) o de un equipo
-- ---------------------------------------------------------------------
create or replace function public.can_comment(p_club uuid, p_team uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when p_team is null then public.can_read_club(p_club)
    else public.club_of_team(p_team) = p_club
         and (public.can_supervise(p_team)
              or public.has_team(p_team, array['entrenador', 'ayudante', 'preparador', 'porteros'])
              or public.is_teacher_of(p_club))
  end;
$$;

drop policy if exists comments_select on public.comments;
drop policy if exists comments_insert on public.comments;
drop policy if exists comments_update on public.comments;
create policy comments_select on public.comments for select to authenticated
  using (case when team_id is null then public.can_read_club(club_id) else public.can_read_team(team_id) end);
create policy comments_insert on public.comments for insert to authenticated
  with check (author_id = auth.uid() and public.can_comment(club_id, team_id));
create policy comments_update on public.comments for update to authenticated
  using (case when team_id is null then public.can_read_club(club_id) else public.can_read_team(team_id) end)
  with check (case when team_id is null then public.can_read_club(club_id) else public.can_read_team(team_id) end);

-- El destino del comentario (equipo) no se puede cambiar.
create or replace function public.tg_comment_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.author_id is distinct from old.author_id or new.club_id is distinct from old.club_id
     or new.entity is distinct from old.entity or new.entity_id is distinct from old.entity_id
     or new.team_id is distinct from old.team_id then
    raise exception 'No se puede cambiar el autor ni el destino de un comentario.';
  end if;
  if auth.uid() is distinct from old.author_id and new.text is distinct from old.text then
    raise exception 'Solo el autor puede editar el texto del comentario.';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Invitaciones: Dirección todas; Coordinación las suyas
-- ---------------------------------------------------------------------
drop policy if exists invitations_all on public.invitations;
drop policy if exists invitations_select on public.invitations;
drop policy if exists invitations_insert on public.invitations;
drop policy if exists invitations_update on public.invitations;
drop policy if exists invitations_delete on public.invitations;
create policy invitations_select on public.invitations for select to authenticated
  using (public.is_admin(club_id) or (created_by = auth.uid() and public.role_in(club_id) = 'coordinador'));
create policy invitations_insert on public.invitations for insert to authenticated
  with check (created_by = auth.uid() and public.can_invite(club_id, role, team_ids));
create policy invitations_update on public.invitations for update to authenticated
  using (public.is_admin(club_id) or (created_by = auth.uid() and public.role_in(club_id) = 'coordinador'))
  with check (public.can_invite(club_id, role, team_ids));
create policy invitations_delete on public.invitations for delete to authenticated
  using (public.is_admin(club_id) or (created_by = auth.uid() and public.role_in(club_id) = 'coordinador'));
