-- =====================================================================
-- Club Gestor · 3/4 · Seguridad a nivel de fila (RLS)
-- Regla general: ver = miembros del club y su profesor; escribir = según el rol.
-- El profesor nunca escribe datos del club (solo comentarios).
-- =====================================================================

-- Activar RLS en todas las tablas y borrar políticas anteriores (idempotente)
do $$
declare t text; p record;
begin
  foreach t in array array['profiles','classes','clubs','club_members','invitations','seasons','teams','players',
                           'sessions','task_library','periodizations','macrocycles','morphocycles','matches','comments']
  loop
    execute format('alter table public.%I enable row level security', t);
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
  end loop;
end $$;

-- Nadie sin sesión toca las tablas.
revoke all on all tables in schema public from anon;

-- Perfiles ----------------------------------------------------------------
create policy profiles_select on public.profiles for select to authenticated
  using (public.can_see_profile(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
-- El perfil lo crea el trigger al registrarse; no se borra desde la app.
revoke insert, update, delete on public.profiles from authenticated;
grant update (full_name, is_teacher) on public.profiles to authenticated;

-- Clases ------------------------------------------------------------------
create policy classes_select on public.classes for select to authenticated
  using (teacher_id = auth.uid()
         or exists (select 1 from public.clubs c where c.class_id = classes.id and public.is_member(c.id)));
create policy classes_insert on public.classes for insert to authenticated
  with check (teacher_id = auth.uid()
              and exists (select 1 from public.profiles where id = auth.uid() and is_teacher));
create policy classes_update on public.classes for update to authenticated
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
create policy classes_delete on public.classes for delete to authenticated
  using (teacher_id = auth.uid());
revoke update on public.classes from authenticated;
grant update (name, archived) on public.classes to authenticated;   -- el código se cambia con regenerate_join_code()

-- Clubes ------------------------------------------------------------------
-- Se crean con create_club(); la clase se cambia con join_class() / leave_class().
create policy clubs_select on public.clubs for select to authenticated
  using (public.can_read_club(id));
create policy clubs_update on public.clubs for update to authenticated
  using (public.is_admin(id)) with check (public.is_admin(id));
create policy clubs_delete on public.clubs for delete to authenticated
  using (public.is_admin(id));
revoke insert, update on public.clubs from authenticated;
grant update (name, short_name, crest_path, primary_color, secondary_color, theme, font, home_layout)
  on public.clubs to authenticated;

-- Personas del club ---------------------------------------------------------
-- Se entra con create_club() o accept_invitation(); se sale con leave_club().
create policy members_select on public.club_members for select to authenticated
  using (public.can_read_club(club_id));
create policy members_update on public.club_members for update to authenticated
  using (public.is_admin(club_id)) with check (public.is_admin(club_id));
create policy members_delete on public.club_members for delete to authenticated
  using (public.is_admin(club_id));
revoke insert, update on public.club_members from authenticated;
grant update (role, team_ids) on public.club_members to authenticated;

-- Invitaciones (solo el admin del club) --------------------------------------
create policy invitations_all on public.invitations for all to authenticated
  using (public.is_admin(club_id)) with check (public.is_admin(club_id));
revoke update on public.invitations from authenticated;
grant update (revoked, expires_at, role, team_ids, email) on public.invitations to authenticated;

-- Temporadas y equipos (lectura: club y profesor · escritura: admin) ----------
create policy seasons_select on public.seasons for select to authenticated
  using (public.can_read_club(club_id));
create policy seasons_write on public.seasons for all to authenticated
  using (public.is_admin(club_id)) with check (public.is_admin(club_id));

create policy teams_select on public.teams for select to authenticated
  using (public.can_read_club(club_id));
create policy teams_write on public.teams for all to authenticated
  using (public.is_admin(club_id))
  with check (public.is_admin(club_id)
              and exists (select 1 from public.seasons s where s.id = season_id and s.club_id = teams.club_id));

-- Jugadores, periodización y partidos (escritura: admin y entrenador del equipo)
create policy players_select on public.players for select to authenticated
  using (public.can_read_club(public.club_of_team(team_id)));
create policy players_write on public.players for all to authenticated
  using (public.can_edit_team(team_id)) with check (public.can_edit_team(team_id));

create policy periodizations_select on public.periodizations for select to authenticated
  using (public.can_read_club(public.club_of_team(team_id)));
create policy periodizations_write on public.periodizations for all to authenticated
  using (public.can_edit_team(team_id)) with check (public.can_edit_team(team_id));

create policy matches_select on public.matches for select to authenticated
  using (public.can_read_club(public.club_of_team(team_id)));
create policy matches_write on public.matches for all to authenticated
  using (public.can_edit_team(team_id)) with check (public.can_edit_team(team_id));

-- Sesiones, macrociclos y morfociclos (también preparador y porteros; borrar: admin y entrenador)
create policy sessions_select on public.sessions for select to authenticated
  using (public.can_read_club(public.club_of_team(team_id)));
create policy sessions_insert on public.sessions for insert to authenticated
  with check (public.can_plan_team(team_id));
create policy sessions_update on public.sessions for update to authenticated
  using (public.can_plan_team(team_id)) with check (public.can_plan_team(team_id));
create policy sessions_delete on public.sessions for delete to authenticated
  using (public.can_edit_team(team_id));

create policy macrocycles_select on public.macrocycles for select to authenticated
  using (public.can_read_club(public.club_of_team(team_id)));
create policy macrocycles_insert on public.macrocycles for insert to authenticated
  with check (public.can_plan_team(team_id));
create policy macrocycles_update on public.macrocycles for update to authenticated
  using (public.can_plan_team(team_id)) with check (public.can_plan_team(team_id));
create policy macrocycles_delete on public.macrocycles for delete to authenticated
  using (public.can_edit_team(team_id));

create policy morphocycles_select on public.morphocycles for select to authenticated
  using (public.can_read_club(public.club_of_team(team_id)));
create policy morphocycles_insert on public.morphocycles for insert to authenticated
  with check (public.can_plan_team(team_id));
create policy morphocycles_update on public.morphocycles for update to authenticated
  using (public.can_plan_team(team_id)) with check (public.can_plan_team(team_id));
create policy morphocycles_delete on public.morphocycles for delete to authenticated
  using (public.can_edit_team(team_id));

-- Biblioteca de tareas (cualquier miembro añade; edita o borra su autor o el admin)
create policy task_library_select on public.task_library for select to authenticated
  using (public.can_read_club(club_id));
create policy task_library_insert on public.task_library for insert to authenticated
  with check (public.is_member(club_id) and author_id = auth.uid());
create policy task_library_update on public.task_library for update to authenticated
  using (public.is_member(club_id) and (author_id = auth.uid() or public.is_admin(club_id)))
  with check (public.is_member(club_id));
create policy task_library_delete on public.task_library for delete to authenticated
  using (public.is_member(club_id) and (author_id = auth.uid() or public.is_admin(club_id)));

-- Comentarios (profesor y miembros escriben; resolver: cualquiera que lo vea; borrar: el autor)
create policy comments_select on public.comments for select to authenticated
  using (public.can_read_club(club_id));
create policy comments_insert on public.comments for insert to authenticated
  with check (public.can_read_club(club_id) and author_id = auth.uid());
create policy comments_update on public.comments for update to authenticated
  using (public.can_read_club(club_id)) with check (public.can_read_club(club_id));
create policy comments_delete on public.comments for delete to authenticated
  using (author_id = auth.uid());
revoke update on public.comments from authenticated;
grant update (text, resolved) on public.comments to authenticated;
