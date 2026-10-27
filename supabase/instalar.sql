-- =====================================================================
-- Club Gestor · INSTALAR (v0.2.0)
-- Pega TODO este archivo en Supabase → SQL Editor → New query y pulsa Run.
-- Es la suma de schema.sql + functions.sql + policies.sql + storage.sql.
-- Se puede volver a ejecutar sin perder datos.
-- =====================================================================

-- =====================================================================
-- Club Gestor · 1/4 · Esquema (tablas, índices, restricciones, triggers)
-- Idempotente: se puede volver a ejecutar sin borrar datos.
-- =====================================================================

create extension if not exists pgcrypto;

-- Trigger común: updated_at y updated_by -------------------------------
create or replace function public.tg_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
  end if;
  return new;
end;
$$;

-- Código de clase: 6 caracteres sin letras ni números confusos ---------
create or replace function public.gen_join_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.classes where join_code = code);
  end loop;
  return code;
end;
$$;

-- Perfiles --------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '',
  is_teacher  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

-- Clases del profesor ---------------------------------------------------
create table if not exists public.classes (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name        text not null check (length(name) between 1 and 120),
  join_code   text not null unique,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);
-- El valor por defecto se pone después porque gen_join_code() consulta la tabla.
alter table public.classes alter column join_code set default public.gen_join_code();

-- Clubes ----------------------------------------------------------------
create table if not exists public.clubs (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (length(name) between 1 and 120),
  short_name       text not null default '' check (length(short_name) <= 20),
  crest_path       text,
  primary_color    text not null default '#22c55e' check (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  secondary_color  text not null default '#0ea5e9' check (secondary_color ~ '^#[0-9a-fA-F]{6}$'),
  theme            text not null default 'dark' check (theme in ('dark', 'light')),
  font             text not null default 'saira' check (font in ('saira', 'oswald', 'barlow')),
  home_layout      jsonb not null default '{}'::jsonb,
  class_id         uuid references public.classes (id) on delete set null,
  created_by       uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid
);
create index if not exists clubs_class_idx on public.clubs (class_id);

-- Personas del club -----------------------------------------------------
create table if not exists public.club_members (
  club_id     uuid not null references public.clubs (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        text not null check (role in ('admin', 'entrenador', 'preparador', 'porteros')),
  team_ids    uuid[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  primary key (club_id, user_id)
);
create index if not exists club_members_user_idx on public.club_members (user_id);

-- Invitaciones ----------------------------------------------------------
create table if not exists public.invitations (
  id           uuid primary key default gen_random_uuid(),
  club_id      uuid not null references public.clubs (id) on delete cascade,
  email        text,
  role         text not null check (role in ('admin', 'entrenador', 'preparador', 'porteros')),
  team_ids     uuid[] not null default '{}',
  token        text not null unique default encode(gen_random_bytes(18), 'hex'),
  expires_at   timestamptz not null default now() + interval '7 days',
  revoked      boolean not null default false,
  accepted_by  uuid references public.profiles (id) on delete set null,
  accepted_at  timestamptz,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid
);
create index if not exists invitations_club_idx on public.invitations (club_id);

-- Temporadas ------------------------------------------------------------
create table if not exists public.seasons (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references public.clubs (id) on delete cascade,
  name        text not null check (length(name) between 1 and 40),
  start_date  date not null,
  end_date    date not null,
  is_current  boolean not null default false,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  check (end_date > start_date)
);
create index if not exists seasons_club_idx on public.seasons (club_id);
create unique index if not exists seasons_one_current on public.seasons (club_id) where is_current;

-- Equipos ---------------------------------------------------------------
create table if not exists public.teams (
  id              uuid primary key default gen_random_uuid(),
  club_id         uuid not null references public.clubs (id) on delete cascade,
  season_id       uuid not null references public.seasons (id) on delete cascade,
  name            text not null check (length(name) between 1 and 80),
  category        text not null default '',
  modality        text not null default 'f11' check (modality in ('f11', 'f7')),
  periods         smallint not null default 2 check (periods between 1 and 4),
  period_minutes  smallint not null default 45 check (period_minutes between 5 and 60),
  squad_max       smallint not null default 18 check (squad_max between 7 and 30),
  archived        boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid
);
create index if not exists teams_club_idx on public.teams (club_id);
create index if not exists teams_season_idx on public.teams (season_id);

-- Jugadores -------------------------------------------------------------
create table if not exists public.players (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams (id) on delete cascade,
  number      smallint check (number between 0 and 99),
  name        text not null check (length(name) between 1 and 80),
  position    text not null default '',
  foot        text check (foot in ('diestro', 'zurdo', 'ambas')),
  birth_year  smallint check (birth_year between 1950 and 2100),
  status      text not null default 'D' check (status in ('D', 'L', 'A')),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);
create index if not exists players_team_idx on public.players (team_id);
-- Dorsal único por equipo entre los jugadores activos.
create unique index if not exists players_number_unique on public.players (team_id, number) where active and number is not null;

-- Sesiones de entrenamiento ---------------------------------------------
create table if not exists public.sessions (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references public.teams (id) on delete cascade,
  date          date not null,
  time          time,
  duration_min  smallint check (duration_min between 0 and 600),
  period        text not null default '',
  microcycle    integer,
  number        integer,
  staff         jsonb not null default '{}'::jsonb,
  objectives    jsonb not null default '{}'::jsonb,
  material      jsonb not null default '{}'::jsonb,
  attendance    jsonb not null default '{}'::jsonb,
  blocks        jsonb not null default '[]'::jsonb,
  notes         text not null default '',
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid
);
create index if not exists sessions_team_date_idx on public.sessions (team_id, date);

-- Biblioteca de tareas --------------------------------------------------
create table if not exists public.task_library (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references public.clubs (id) on delete cascade,
  block       jsonb not null default '{}'::jsonb,
  tags        text[] not null default '{}',
  author_id   uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);
create index if not exists task_library_club_idx on public.task_library (club_id);

-- Periodización ---------------------------------------------------------
create table if not exists public.periodizations (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references public.teams (id) on delete cascade,
  season_id     uuid not null references public.seasons (id) on delete cascade,
  start_monday  date not null,
  end_date      date not null,
  legend        jsonb not null default '[]'::jsonb,
  periods       jsonb not null default '[]'::jsonb,
  macro         jsonb not null default '[]'::jsonb,
  meso          jsonb not null default '[]'::jsonb,
  micro_start   integer not null default 1,
  micro_skip    integer[] not null default '{}',
  contents      jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  unique (team_id, season_id)
);

-- Macrociclos -----------------------------------------------------------
create table if not exists public.macrocycles (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references public.teams (id) on delete cascade,
  season_id     uuid references public.seasons (id) on delete cascade,
  name          text not null default 'Macrociclo',
  area          text not null default 'general',
  start_monday  date not null,
  weeks         smallint not null default 36 check (weeks between 1 and 60),
  phases        jsonb not null default '[]'::jsonb,
  groups        jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid
);
create index if not exists macrocycles_team_idx on public.macrocycles (team_id);

-- Morfociclos -----------------------------------------------------------
create table if not exists public.morphocycles (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams (id) on delete cascade,
  name        text not null default 'Morfociclo estándar',
  match_day   smallint not null default 6 check (match_day between 0 and 6),
  rows        jsonb not null default '[]'::jsonb,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);
create index if not exists morphocycles_team_idx on public.morphocycles (team_id);

-- Partidos --------------------------------------------------------------
create table if not exists public.matches (
  id             uuid primary key default gen_random_uuid(),
  team_id        uuid not null references public.teams (id) on delete cascade,
  season_id      uuid references public.seasons (id) on delete cascade,
  matchday       smallint,
  date           date,
  time           time,
  call_time      time,
  venue          text not null default '',
  is_home        boolean not null default true,
  rival          text not null default '',
  system         text not null default '',
  positions      jsonb not null default '{}'::jsonb,
  plan           jsonb not null default '{}'::jsonb,
  abp_for        text not null default '',
  abp_against    text not null default '',
  pre_notes      text not null default '',
  squad          jsonb not null default '[]'::jsonb,
  goals_for      smallint,
  goals_against  smallint,
  events         jsonb not null default '[]'::jsonb,
  counters       jsonb not null default '{}'::jsonb,
  annotations    text not null default '',
  notes          text not null default '',
  player_stats   jsonb not null default '{}'::jsonb,
  post           jsonb not null default '{}'::jsonb,
  report_done    boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid
);
create index if not exists matches_team_date_idx on public.matches (team_id, date);

-- Comentarios (profesor y alumnos) --------------------------------------
create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references public.clubs (id) on delete cascade,
  entity      text not null,
  entity_id   uuid,
  section     text not null default '',
  parent_id   uuid references public.comments (id) on delete cascade,
  author_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  text        text not null check (length(text) between 1 and 4000),
  resolved    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);
create index if not exists comments_club_idx on public.comments (club_id, entity, entity_id);

-- Triggers updated_at / updated_by en todas las tablas -------------------
do $$
declare t text;
begin
  foreach t in array array['profiles','classes','clubs','club_members','invitations','seasons','teams','players',
                           'sessions','task_library','periodizations','macrocycles','morphocycles','matches','comments']
  loop
    execute format('drop trigger if exists touch on public.%I', t);
    execute format('create trigger touch before insert or update on public.%I for each row execute function public.tg_touch()', t);
  end loop;
end $$;


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


-- =====================================================================
-- Club Gestor · 4/4 · Archivos (Storage)
-- Bucket privado 'club-files'. Rutas: <club_id>/crest.png y <club_id>/tasks/<uuid>.jpg
-- Ver: miembros y profesor del club · Subir, cambiar y borrar: miembros del club.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('club-files', 'club-files', false, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists club_files_select on storage.objects;
drop policy if exists club_files_insert on storage.objects;
drop policy if exists club_files_update on storage.objects;
drop policy if exists club_files_delete on storage.objects;

create policy club_files_select on storage.objects for select to authenticated
  using (bucket_id = 'club-files' and public.can_read_club(public.storage_club(name)));

create policy club_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'club-files' and public.is_member(public.storage_club(name)));

create policy club_files_update on storage.objects for update to authenticated
  using (bucket_id = 'club-files' and public.is_member(public.storage_club(name)))
  with check (bucket_id = 'club-files' and public.is_member(public.storage_club(name)));

create policy club_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'club-files' and public.is_member(public.storage_club(name)));


