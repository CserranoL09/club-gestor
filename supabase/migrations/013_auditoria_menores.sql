-- 013 · Correcciones menores de la auditoría (Prompt 18)

-- 12) Forma de los datos guardados en bloque: listas y objetos donde la app los espera.
do $$
declare c record;
begin
  for c in select * from (values
    ('sessions', 'blocks', 'array'), ('sessions', 'attendance', 'object'), ('sessions', 'staff', 'object'), ('sessions', 'objectives', 'object'), ('sessions', 'material', 'object'),
    ('matches', 'squad', 'array'), ('matches', 'events', 'array'), ('matches', 'player_stats', 'object'), ('matches', 'post', 'object'), ('matches', 'plan', 'object'),
    ('matches', 'positions', 'object'), ('matches', 'counters', 'object'),
    ('periodizations', 'legend', 'array'), ('periodizations', 'periods', 'array'), ('periodizations', 'macro', 'array'), ('periodizations', 'meso', 'array'),
    ('periodizations', 'contents', 'array'), ('periodizations', 'options', 'object'),
    ('macrocycles', 'phases', 'array'), ('macrocycles', 'groups', 'array'), ('morphocycles', 'rows', 'array'), ('teams', 'schedule', 'array'),
    ('clubs', 'settings', 'object'), ('task_library', 'block', 'object')
  ) as v(t, col, kind) loop
    execute format('alter table public.%I drop constraint if exists %I', c.t, c.t || '_' || c.col || '_shape');
    execute format('alter table public.%I add constraint %I check (%I is null or jsonb_typeof(%I) = %L)', c.t, c.t || '_' || c.col || '_shape', c.col, c.col, c.kind);
  end loop;
end $$;

-- 13) Códigos de clase: como mucho 10 intentos fallidos por hora y persona.
create table if not exists public.class_join_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now()
);
alter table public.class_join_attempts add column if not exists id bigint generated always as identity primary key;
create index if not exists class_join_attempts_user_idx on public.class_join_attempts (user_id, at);
alter table public.class_join_attempts enable row level security;   -- sin políticas: solo la usa join_class
revoke all on public.class_join_attempts from anon, authenticated;

-- Con un código que no existe devuelve null (en vez de un error) para que quede apuntado el intento.
create or replace function public.join_class(p_code text, p_club uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_class classes%rowtype;
begin
  if auth.uid() is null then raise exception 'Tienes que iniciar sesión.'; end if;
  if not public.is_admin(p_club) then raise exception 'Solo el administrador del club puede unirlo a una clase.'; end if;
  if (select count(*) from class_join_attempts where user_id = auth.uid() and at > now() - interval '1 hour') >= 10 then
    raise exception 'Demasiados códigos incorrectos. Espera una hora o pide el código a tu profesor.';
  end if;
  select * into v_class from classes where join_code = upper(trim(p_code)) and not archived;
  if not found then
    delete from class_join_attempts where at < now() - interval '1 day';
    insert into class_join_attempts (user_id) values (auth.uid());
    return null;
  end if;
  update clubs set class_id = v_class.id where id = p_club;
  return v_class.name;
end;
$$;
revoke execute on function public.join_class(text, uuid) from public, anon;
grant  execute on function public.join_class(text, uuid) to authenticated;

-- 16) Rendimiento de las reglas de acceso
--   a) auth.uid() se calcula una vez por consulta, no por fila.
do $$
declare p record; q text; w text;
begin
  for p in select * from pg_policies where schemaname = 'public'
      and (qual ~ 'auth\.uid\(\)' or with_check ~ 'auth\.uid\(\)')
      and coalesce(qual, '') !~* 'select auth\.uid\(\)' and coalesce(with_check, '') !~* 'select auth\.uid\(\)' loop
    q := replace(p.qual, 'auth.uid()', '(select auth.uid())');
    w := replace(p.with_check, 'auth.uid()', '(select auth.uid())');
    if p.cmd = 'INSERT' then
      execute format('alter policy %I on public.%I with check (%s)', p.policyname, p.tablename, w);
    elsif w is null then
      execute format('alter policy %I on public.%I using (%s)', p.policyname, p.tablename, q);
    else
      execute format('alter policy %I on public.%I using (%s) with check (%s)', p.policyname, p.tablename, q, w);
    end if;
  end loop;
end $$;

--   b) Las reglas «_write» (para todo) se separan en alta, cambio y borrado, para no repetir la de lectura.
do $$
declare p record;
begin
  for p in select * from pg_policies where schemaname = 'public' and cmd = 'ALL' and policyname like '%\_write' loop
    execute format('drop policy if exists %I on public.%I', p.tablename || '_ins', p.tablename);
    execute format('drop policy if exists %I on public.%I', p.tablename || '_upd', p.tablename);
    execute format('drop policy if exists %I on public.%I', p.tablename || '_del', p.tablename);
    execute format('create policy %I on public.%I for insert to authenticated with check (%s)', p.tablename || '_ins', p.tablename, coalesce(p.with_check, p.qual));
    execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)', p.tablename || '_upd', p.tablename, p.qual, coalesce(p.with_check, p.qual));
    execute format('create policy %I on public.%I for delete to authenticated using (%s)', p.tablename || '_del', p.tablename, p.qual);
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

--   c) Índices para las relaciones que no lo tenían.
create index if not exists bookings_team_idx on public.bookings (team_id);
create index if not exists classes_teacher_idx on public.classes (teacher_id);
create index if not exists club_principles_parent_idx on public.club_principles (parent_id);
create index if not exists clubs_created_by_idx on public.clubs (created_by);
create index if not exists comments_author_idx on public.comments (author_id);
create index if not exists comments_parent_idx on public.comments (parent_id);
create index if not exists comments_to_user_idx on public.comments (to_user);
create index if not exists invitations_accepted_by_idx on public.invitations (accepted_by);
create index if not exists macrocycles_season_idx on public.macrocycles (season_id);
create index if not exists matches_season_idx on public.matches (season_id);
create index if not exists periodizations_season_idx on public.periodizations (season_id);
create index if not exists task_library_author_idx on public.task_library (author_id);
create index if not exists task_library_principle_idx on public.task_library (principle_id);
create index if not exists task_library_reviewed_by_idx on public.task_library (reviewed_by);

-- 18) Funciones auxiliares: nadie sin iniciar sesión las necesita.
revoke execute on function public.add_minutes(time, integer) from public, anon;
revoke execute on function public.default_morphocycle_rows() from public, anon;
revoke execute on function public.gen_join_code() from public, anon;
revoke execute on function public.stage_of_category(text) from public, anon;
revoke execute on function public.storage_club(text) from public, anon;
grant  execute on function public.add_minutes(time, integer), public.default_morphocycle_rows(), public.gen_join_code(),
                           public.stage_of_category(text), public.storage_club(text) to authenticated;
revoke execute on function public.tg_comment_guard() from public, anon, authenticated;
revoke execute on function public.tg_principle_parent() from public, anon, authenticated;
revoke execute on function public.tg_touch() from public, anon, authenticated;
