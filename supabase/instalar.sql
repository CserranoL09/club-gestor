-- =====================================================================
-- Club Gestor · INSTALAR (instalación completa desde cero)
-- Pega TODO este archivo en Supabase → SQL Editor → New query y pulsa Run.
-- Es la suma de schema.sql + functions.sql + policies.sql + storage.sql + migrations/*.
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

-- Ver una invitación antes de aceptarla (solo con el token). Igual que en la migración 004.
drop function if exists public.get_invitation(text);
create function public.get_invitation(p_token text)
returns table (club_name text, role text, expires_at timestamptz, valid boolean,
               specialty text, team_ids uuid[], team_names text)
language sql stable security definer set search_path = public as $$
  select c.name, i.role, i.expires_at,
         (not i.revoked and i.accepted_at is null and i.expires_at > now()),
         '' :: text, i.team_ids,
         (select string_agg(t.name, ', ' order by t.name) from teams t where t.id = any (i.team_ids))
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

-- =====================================================================
-- Club Gestor · Migración 001 · Email en el perfil (v0.3.0)
-- Para que el administrador vea quién es cada persona del club.
-- Idempotente: se puede volver a ejecutar.
-- =====================================================================

alter table public.profiles add column if not exists email text not null default '';

-- Rellenar el email de las cuentas que ya existen.
update public.profiles p
   set email = coalesce(u.email, '')
  from auth.users u
 where u.id = p.id and p.email is distinct from coalesce(u.email, '');

-- Al registrarse: nombre, email y si es profesor.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, is_teacher, email)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(coalesce(new.email, ''), '@', 1)),
    coalesce((new.raw_user_meta_data ->> 'is_teacher')::boolean, false),
    coalesce(new.email, '')
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

-- Si alguien cambia su email, se actualiza en el perfil.
create or replace function public.handle_user_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;
drop trigger if exists on_auth_user_email on auth.users;
create trigger on_auth_user_email after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.handle_user_email();

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_email() from public, anon, authenticated;

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

-- =====================================================================
-- Club Gestor · Migración 005 · Metodología del club (v0.8.0)
--  · Modelo de juego: principios y subprincipios por fase y etapa.
--  · Objetivos por categoría (técnicos, tácticos, condicionales, psicológicos).
--  · Plantillas del club: sesión tipo, morfociclo y macrociclo por etapa.
--  · Biblioteca de tareas: oficiales (Coordinación) y propuestas (entrenadores).
-- Leen todos los miembros del club (y el profesor); editan Dirección y Coordinación.
-- Idempotente: se puede volver a ejecutar.
-- =====================================================================

-- Quién edita la metodología
create or replace function public.can_edit_methodology(p_club uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.role_in(p_club) in ('admin', 'coordinador'), false);
$$;

-- Etapa de una categoría: rendimiento (juvenil y adultos) o fútbol base (el resto).
create or replace function public.stage_of_category(p_category text)
returns text language sql immutable set search_path = public as $$
  select case
    when lower(coalesce(p_category, '')) ~ '(juvenil|aficionad|senior|sénior|regional|preferente|tercera|segunda|primera|veteran|amateur)' then 'rendimiento'
    else 'base'
  end;
$$;

-- ---------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------
create table if not exists public.club_principles (
  id           uuid primary key default gen_random_uuid(),
  club_id      uuid not null references public.clubs (id) on delete cascade,
  parent_id    uuid references public.club_principles (id) on delete cascade,
  phase        text not null check (phase in ('ataque', 'defensa', 'trans_ofensiva', 'trans_defensiva', 'abp')),
  stage        text not null default 'todas' check (stage in ('todas', 'base', 'rendimiento')),
  title        text not null check (length(title) between 1 and 120),
  description  text not null default '',
  image_path   text,
  sort         integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid
);
create index if not exists club_principles_club_idx on public.club_principles (club_id, phase, sort);

create table if not exists public.category_objectives (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references public.clubs (id) on delete cascade,
  category    text not null check (length(category) between 1 and 60),
  objectives  jsonb not null default '{}'::jsonb,   -- { tecnico:[], tactico:[], condicional:[], psicologico:[] }
  notes       text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  unique (club_id, category)
);

create table if not exists public.club_templates (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references public.clubs (id) on delete cascade,
  kind        text not null check (kind in ('sesion', 'morfociclo', 'macrociclo')),
  stage       text not null default 'todas' check (stage in ('todas', 'base', 'rendimiento')),
  name        text not null check (length(name) between 1 and 80),
  data        jsonb not null default '{}'::jsonb,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);
create index if not exists club_templates_club_idx on public.club_templates (club_id, kind);

alter table public.task_library add column if not exists title        text not null default '';
alter table public.task_library add column if not exists status       text not null default 'propuesta';
alter table public.task_library add column if not exists phase        text not null default '';
alter table public.task_library add column if not exists categories   text[] not null default '{}';
alter table public.task_library add column if not exists principle_id uuid references public.club_principles (id) on delete set null;
alter table public.task_library add column if not exists image_path   text;
alter table public.task_library add column if not exists review_note  text not null default '';
alter table public.task_library add column if not exists reviewed_by  uuid references public.profiles (id) on delete set null;
alter table public.task_library add column if not exists reviewed_at  timestamptz;
alter table public.task_library drop constraint if exists task_library_status_check;
alter table public.task_library add constraint task_library_status_check check (status in ('propuesta', 'oficial', 'rechazada'));
create index if not exists task_library_status_idx on public.task_library (club_id, status);

-- updated_at / updated_by
do $$
declare t text;
begin
  foreach t in array array['club_principles', 'category_objectives', 'club_templates'] loop
    execute format('drop trigger if exists touch on public.%I', t);
    execute format('create trigger touch before insert or update on public.%I for each row execute function public.tg_touch()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Seguridad
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['club_principles', 'category_objectives', 'club_templates'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.can_read_club(club_id))', t || '_select', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.can_edit_methodology(club_id)) with check (public.can_edit_methodology(club_id))', t || '_write', t);
  end loop;
end $$;
revoke all on public.club_principles, public.category_objectives, public.club_templates from anon;
grant select, insert, update, delete on public.club_principles, public.category_objectives, public.club_templates to authenticated;

-- El subprincipio debe ser del mismo club y fase que su principio.
create or replace function public.tg_principle_parent()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.parent_id is not null and not exists (
    select 1 from club_principles p where p.id = new.parent_id and p.club_id = new.club_id and p.phase = new.phase and p.parent_id is null
  ) then
    raise exception 'El subprincipio debe colgar de un principio de la misma fase.';
  end if;
  return new;
end;
$$;
drop trigger if exists principle_parent on public.club_principles;
create trigger principle_parent before insert or update on public.club_principles
  for each row execute function public.tg_principle_parent();

-- Tareas: cualquier miembro propone; solo Dirección y Coordinación aprueban, rechazan o editan las oficiales.
drop policy if exists task_library_update on public.task_library;
drop policy if exists task_library_delete on public.task_library;
create policy task_library_update on public.task_library for update to authenticated
  using (public.is_member(club_id) and (author_id = auth.uid() or public.can_edit_methodology(club_id)))
  with check (public.is_member(club_id));
create policy task_library_delete on public.task_library for delete to authenticated
  using (public.is_member(club_id) and ((author_id = auth.uid() and status <> 'oficial') or public.can_edit_methodology(club_id)));

create or replace function public.tg_task_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_editor boolean := public.can_edit_methodology(new.club_id);
begin
  if tg_op = 'INSERT' then
    if not v_editor then new.status := 'propuesta'; end if;
  else
    if not v_editor then
      if old.status <> 'propuesta' then raise exception 'Solo la Coordinación puede cambiar una tarea ya revisada.'; end if;
      if new.status <> old.status then raise exception 'Solo la Dirección o la Coordinación pueden aprobar o rechazar tareas.'; end if;
      new.review_note := old.review_note;
    end if;
    if new.author_id is distinct from old.author_id then raise exception 'No se puede cambiar el autor de la tarea.'; end if;
  end if;
  if v_editor and (tg_op = 'INSERT' or new.status is distinct from old.status) and new.status <> 'propuesta' then
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists task_status on public.task_library;
create trigger task_status before insert or update on public.task_library
  for each row execute function public.tg_task_status();

-- ---------------------------------------------------------------------
-- Plantillas: aplicar al crear equipos y a mano
-- ---------------------------------------------------------------------
-- Plantilla predeterminada de un tipo para la etapa de una categoría (la de la etapa gana a «todas»).
create or replace function public.club_template_for(p_club uuid, p_kind text, p_category text)
returns public.club_templates language sql stable security definer set search_path = public as $$
  select t.* from club_templates t
  where t.club_id = p_club and t.kind = p_kind and t.is_default
    and t.stage in (public.stage_of_category(p_category), 'todas')
  order by (t.stage = 'todas'), t.updated_at desc
  limit 1;
$$;

-- Crear equipo: ahora con el morfociclo y los macrociclos modelo del club.
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
  v_start date;
  v_tpl club_templates;
begin
  if not public.is_admin(p_club) then raise exception 'Solo la Dirección del club puede crear equipos.'; end if;
  select start_date into v_start from seasons where id = p_season and club_id = p_club;
  if not found then raise exception 'La temporada no es de este club.'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'El equipo necesita un nombre.'; end if;
  if p_modality not in ('f11', 'f7') then raise exception 'Modalidad no válida (f11 o f7).'; end if;

  insert into teams (club_id, season_id, name, category, modality, periods, period_minutes, squad_max)
  values (p_club, p_season, trim(p_name), coalesce(trim(p_category), ''), p_modality,
          coalesce(p_periods, 2),
          coalesce(p_period_minutes, case when p_modality = 'f7' then 35 else 45 end),
          coalesce(p_squad_max, case when p_modality = 'f7' then 14 else 18 end))
  returning id into v_team;

  v_tpl := public.club_template_for(p_club, 'morfociclo', p_category);
  insert into morphocycles (team_id, name, match_day, rows, is_default)
  values (v_team,
          coalesce(v_tpl.name, 'Morfociclo estándar'),
          coalesce((v_tpl.data ->> 'match_day')::smallint, 6),
          coalesce(v_tpl.data -> 'rows', public.default_morphocycle_rows()),
          true);

  insert into macrocycles (team_id, season_id, name, area, start_monday, weeks, phases, groups)
  select v_team, p_season, t.name, coalesce(t.data ->> 'area', 'general'),
         (v_start - (extract(isodow from v_start)::int - 1))::date,
         coalesce((t.data ->> 'weeks')::smallint, 36), '[]'::jsonb, coalesce(t.data -> 'groups', '[]'::jsonb)
  from club_templates t
  where t.club_id = p_club and t.kind = 'macrociclo' and t.is_default
    and t.stage in (public.stage_of_category(p_category), 'todas');

  return v_team;
end;
$$;

-- Aplicar una plantilla (morfociclo o macrociclo) a los equipos de una temporada de su etapa.
create or replace function public.apply_template(p_template uuid, p_season uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_tpl club_templates;
  v_start date;
  v_count integer := 0;
  t record;
begin
  select * into v_tpl from club_templates where id = p_template;
  if not found then raise exception 'La plantilla no existe.'; end if;
  if not public.can_edit_methodology(v_tpl.club_id) then raise exception 'Solo la Dirección o la Coordinación pueden aplicar plantillas.'; end if;
  select start_date into v_start from seasons where id = p_season and club_id = v_tpl.club_id;
  if not found then raise exception 'La temporada no es de este club.'; end if;
  if v_tpl.kind not in ('morfociclo', 'macrociclo') then raise exception 'Esta plantilla se usa al crear sesiones; no se aplica a los equipos.'; end if;

  for t in
    select * from teams
    where season_id = p_season and not archived
      and (v_tpl.stage = 'todas' or public.stage_of_category(category) = v_tpl.stage)
      -- La Coordinación solo en sus equipos
      and (public.is_admin(v_tpl.club_id) or public.has_team(id, array['coordinador']))
  loop
    if v_tpl.kind = 'morfociclo' then
      insert into morphocycles (team_id, name, match_day, rows, is_default)
      values (t.id, v_tpl.name, coalesce((v_tpl.data ->> 'match_day')::smallint, 6),
              coalesce(v_tpl.data -> 'rows', public.default_morphocycle_rows()), true);
    else
      insert into macrocycles (team_id, season_id, name, area, start_monday, weeks, phases, groups)
      values (t.id, p_season, v_tpl.name, coalesce(v_tpl.data ->> 'area', 'general'),
              (v_start - (extract(isodow from v_start)::int - 1))::date,
              coalesce((v_tpl.data ->> 'weeks')::smallint, 36), '[]'::jsonb, coalesce(v_tpl.data -> 'groups', '[]'::jsonb));
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.apply_template(uuid, uuid) from public, anon;
grant  execute on function public.apply_template(uuid, uuid) to authenticated;
revoke execute on function public.club_template_for(uuid, text, text) from public, anon;
revoke execute on function public.tg_task_status() from public, anon, authenticated;
grant  execute on function public.default_morphocycle_rows() to authenticated;

-- =====================================================================
-- Club Gestor · Migración 006 · Calendario del club e instalaciones (v0.9.0)
--  · Instalaciones del club: campos (divisibles en 1/2 y 1/4), vestuarios y otras.
--  · Reservas de instalación, sueltas o ligadas a una sesión o a un partido
--    (las ligadas siguen la fecha y la hora de su sesión o partido).
--  · Color y horario base de entrenamientos de cada equipo.
--  · generate_week_sessions: crea las sesiones vacías de una semana a partir del horario.
-- Instalaciones: Dirección y Coordinación. Reservas y horario: también el cuerpo técnico del equipo.
-- Idempotente: se puede volver a ejecutar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------
create or replace function public.can_manage_facilities(p_club uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.role_in(p_club) in ('admin', 'coordinador'), false);
$$;

-- Horario y reservas de un equipo: su cuerpo técnico y quien lo supervisa.
create or replace function public.can_schedule_team(p_team uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_plan_team(p_team) or public.can_supervise(p_team);
$$;

-- ---------------------------------------------------------------------
-- Equipos: color y horario base
-- schedule = [{ day: 0 (lunes) … 6 (domingo), start: 'HH:MM', end: 'HH:MM', facility_id, share: 4|2|1 }]
-- ---------------------------------------------------------------------
alter table public.teams add column if not exists color    text not null default '';
alter table public.teams add column if not exists schedule jsonb not null default '[]'::jsonb;
alter table public.teams drop constraint if exists teams_color_check;
alter table public.teams add constraint teams_color_check check (color = '' or color ~ '^#[0-9a-fA-F]{6}$');

-- ---------------------------------------------------------------------
-- Instalaciones
-- ---------------------------------------------------------------------
create table if not exists public.facilities (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references public.clubs (id) on delete cascade,
  name        text not null check (length(name) between 1 and 60),
  kind        text not null default 'campo' check (kind in ('campo', 'vestuario', 'otro')),
  divisible   boolean not null default true,      -- campo que se reserva por 1/2 o 1/4
  notes       text not null default '',
  sort        integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);
create index if not exists facilities_club_idx on public.facilities (club_id, sort);

-- Reservas. share = cuartos de la instalación ocupados: 4 completo, 2 medio, 1 un cuarto.
create table if not exists public.bookings (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references public.clubs (id) on delete cascade,
  facility_id uuid not null references public.facilities (id) on delete cascade,
  team_id     uuid references public.teams (id) on delete cascade,
  session_id  uuid references public.sessions (id) on delete cascade,
  match_id    uuid references public.matches (id) on delete cascade,
  date        date not null,
  start_time  time not null,
  end_time    time not null,
  share       smallint not null default 4 check (share in (1, 2, 4)),
  note        text not null default '',
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  check (end_time > start_time),
  check (session_id is null or match_id is null)
);
create index if not exists bookings_club_date_idx on public.bookings (club_id, date);
create index if not exists bookings_facility_date_idx on public.bookings (facility_id, date);
create index if not exists bookings_session_idx on public.bookings (session_id);
create index if not exists bookings_match_idx on public.bookings (match_id);

do $$
declare t text;
begin
  foreach t in array array['facilities', 'bookings'] loop
    execute format('drop trigger if exists touch on public.%I', t);
    execute format('create trigger touch before insert or update on public.%I for each row execute function public.tg_touch()', t);
  end loop;
end $$;

-- Suma minutos a una hora sin pasar de medianoche (00:00 – 23:59).
create or replace function public.add_minutes(p_time time, p_mins integer)
returns time language sql immutable set search_path = public as $$
  select case
    when extract(epoch from p_time) / 60 + p_mins >= 1439 then time '23:59'
    when extract(epoch from p_time) / 60 + p_mins <= 0 then time '00:00'
    else p_time + make_interval(mins => p_mins)
  end;
$$;

-- Horario de un partido en la instalación: 30 min de calentamiento antes y 15 de descanso.
create or replace function public.match_slot(p_match uuid, out p_date date, out p_start time, out p_end time)
language sql stable security definer set search_path = public as $$
  select m.date,
         public.add_minutes(m.time, -30),
         public.add_minutes(m.time, t.periods * t.period_minutes + 15)
  from matches m join teams t on t.id = m.team_id where m.id = p_match;
$$;

-- Completa la reserva: club de la instalación; equipo, fecha y hora de su sesión o partido.
create or replace function public.tg_booking_fill()
returns trigger language plpgsql security definer set search_path = public as $$
declare f record; s record; m record; tm record;
begin
  select * into f from facilities where id = new.facility_id;
  if f is null then raise exception 'La instalación no existe.'; end if;
  new.club_id := f.club_id;
  if f.kind <> 'campo' or not f.divisible then new.share := 4; end if;

  if new.session_id is not null then
    select * into s from sessions where id = new.session_id;
    if s.time is null then raise exception 'Pon la hora de la sesión antes de reservar la instalación.'; end if;
    new.team_id := s.team_id;
    new.date := s.date;
    new.start_time := s.time;
    new.end_time := public.add_minutes(s.time, coalesce(nullif(s.duration_min, 0), 90));
  elsif new.match_id is not null then
    select * into m from matches where id = new.match_id;
    if m.date is null or m.time is null then raise exception 'Pon la fecha y la hora del partido antes de reservar la instalación.'; end if;
    new.team_id := m.team_id;
    select * into tm from public.match_slot(new.match_id);
    new.date := tm.p_date; new.start_time := tm.p_start; new.end_time := tm.p_end;
  end if;

  if new.team_id is not null and not exists (select 1 from teams where id = new.team_id and club_id = new.club_id) then
    raise exception 'El equipo no es de este club.';
  end if;
  return new;
end;
$$;
drop trigger if exists booking_fill on public.bookings;
create trigger booking_fill before insert or update on public.bookings
  for each row execute function public.tg_booking_fill();

-- Si cambia la fecha u hora de la sesión o del partido, sus reservas la siguen.
-- (Si se quita la hora, las reservas conservan la última.)
create or replace function public.tg_follow_bookings()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'sessions' then
    if new.time is not null then update bookings set updated_at = now() where session_id = new.id; end if;
  elsif new.date is not null and new.time is not null then
    update bookings set updated_at = now() where match_id = new.id;
  end if;
  return null;
end;
$$;
drop trigger if exists follow_bookings on public.sessions;
create trigger follow_bookings after update of date, time, duration_min on public.sessions
  for each row execute function public.tg_follow_bookings();
drop trigger if exists follow_bookings on public.matches;
create trigger follow_bookings after update of date, time on public.matches
  for each row execute function public.tg_follow_bookings();

-- ---------------------------------------------------------------------
-- Seguridad
-- ---------------------------------------------------------------------
alter table public.facilities enable row level security;
alter table public.bookings enable row level security;

drop policy if exists facilities_select on public.facilities;
drop policy if exists facilities_write on public.facilities;
create policy facilities_select on public.facilities for select to authenticated using (public.can_read_club(club_id));
create policy facilities_write on public.facilities for all to authenticated
  using (public.can_manage_facilities(club_id)) with check (public.can_manage_facilities(club_id));

-- Todo el club ve la ocupación (para no solapar); reserva quien gestiona instalaciones
-- o el cuerpo técnico del equipo de la reserva.
drop policy if exists bookings_select on public.bookings;
drop policy if exists bookings_insert on public.bookings;
drop policy if exists bookings_update on public.bookings;
drop policy if exists bookings_delete on public.bookings;
create policy bookings_select on public.bookings for select to authenticated using (public.can_read_club(club_id));
create policy bookings_insert on public.bookings for insert to authenticated
  with check (public.can_manage_facilities(club_id) or (team_id is not null and public.can_schedule_team(team_id)));
create policy bookings_update on public.bookings for update to authenticated
  using (public.can_manage_facilities(club_id) or (team_id is not null and public.can_schedule_team(team_id)))
  with check (public.can_manage_facilities(club_id) or (team_id is not null and public.can_schedule_team(team_id)));
create policy bookings_delete on public.bookings for delete to authenticated
  using (public.can_manage_facilities(club_id) or (team_id is not null and public.can_schedule_team(team_id)));

revoke all on public.facilities, public.bookings from anon;
grant select, insert, update, delete on public.facilities, public.bookings to authenticated;

-- ---------------------------------------------------------------------
-- Horario base y color de un equipo (sin abrir la edición de todo el equipo)
-- ---------------------------------------------------------------------
create or replace function public.set_team_schedule(p_team uuid, p_schedule jsonb, p_color text default null)
returns void language plpgsql security definer set search_path = public as $$
declare slot jsonb;
begin
  if not public.can_schedule_team(p_team) then
    raise exception 'No puedes cambiar el horario de este equipo.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_schedule) <> 'array' then raise exception 'Horario no válido.'; end if;
  for slot in select * from jsonb_array_elements(p_schedule) loop
    if (slot ->> 'day') is null or (slot ->> 'day')::int not between 0 and 6
       or (slot ->> 'start') !~ '^\d{2}:\d{2}$' or (slot ->> 'end') !~ '^\d{2}:\d{2}$'
       or (slot ->> 'end')::time <= (slot ->> 'start')::time then
      raise exception 'Revisa el horario: cada franja necesita día, hora de inicio y hora de fin posterior.';
    end if;
    if nullif(slot ->> 'facility_id', '') is not null and not exists (
      select 1 from facilities f join teams t on t.club_id = f.club_id where f.id = (slot ->> 'facility_id')::uuid and t.id = p_team
    ) then
      raise exception 'La instalación no es de este club.';
    end if;
  end loop;
  update teams set schedule = p_schedule, color = coalesce(p_color, color) where id = p_team;
end;
$$;

-- ---------------------------------------------------------------------
-- Sesiones vacías de una semana a partir del horario base
-- No duplica (misma fecha y hora) ni crea sesiones el día de partido del equipo.
-- ---------------------------------------------------------------------
create or replace function public.generate_week_sessions(p_season uuid, p_monday date, p_team uuid default null)
returns integer language plpgsql security definer set search_path = public as $$
declare
  t record; slot jsonb; d date; st time; en time; sess uuid; n integer := 0; se record;
begin
  select * into se from seasons where id = p_season;
  if se is null or not public.can_read_club(se.club_id) then
    raise exception 'Temporada no encontrada.' using errcode = '42501';
  end if;
  p_monday := p_monday - ((extract(isodow from p_monday)::int) - 1);   -- siempre el lunes
  for t in select * from teams where season_id = p_season and not archived and (p_team is null or id = p_team) loop
    continue when not public.can_plan_team(t.id);
    for slot in select * from jsonb_array_elements(t.schedule) loop
      d := p_monday + (slot ->> 'day')::int;
      continue when d < se.start_date or d > se.end_date;
      st := (slot ->> 'start')::time; en := (slot ->> 'end')::time;
      continue when exists (select 1 from sessions where team_id = t.id and date = d and time = st);
      continue when exists (select 1 from matches where team_id = t.id and date = d);
      insert into sessions (team_id, date, time, duration_min, created_by)
      values (t.id, d, st, (extract(epoch from en - st) / 60)::int, auth.uid()) returning id into sess;
      if nullif(slot ->> 'facility_id', '') is not null then
        insert into bookings (facility_id, session_id, share, date, start_time, end_time)
        values ((slot ->> 'facility_id')::uuid, sess, coalesce((slot ->> 'share')::smallint, 4), d, st, en);
      end if;
      n := n + 1;
    end loop;
  end loop;
  return n;
end;
$$;

revoke execute on function public.can_manage_facilities(uuid) from public, anon;
revoke execute on function public.can_schedule_team(uuid) from public, anon;
revoke execute on function public.match_slot(uuid) from public, anon;
revoke execute on function public.tg_booking_fill() from public, anon, authenticated;
revoke execute on function public.tg_follow_bookings() from public, anon, authenticated;
revoke execute on function public.set_team_schedule(uuid, jsonb, text) from public, anon;
revoke execute on function public.generate_week_sessions(uuid, date, uuid) from public, anon;
grant  execute on function public.can_manage_facilities(uuid) to authenticated;
grant  execute on function public.can_schedule_team(uuid) to authenticated;
grant  execute on function public.match_slot(uuid) to authenticated;
grant  execute on function public.set_team_schedule(uuid, jsonb, text) to authenticated;
grant  execute on function public.generate_week_sessions(uuid, date, uuid) to authenticated;

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

-- =====================================================================
-- Club Gestor · Migración 009 · Periodización y ajustes de seguridad (v0.12.0)
--  · periodizations.options: opciones de la periodización (no contar las vacaciones…).
--  · Ajustes que recomienda el revisor de seguridad de Supabase:
--    - search_path fijo en default_morphocycle_rows();
--    - las funciones internas de permisos solo las ejecutan usuarios con sesión.
-- Idempotente: se puede volver a ejecutar.
-- =====================================================================

alter table public.periodizations add column if not exists options jsonb not null default '{}'::jsonb;

alter function public.default_morphocycle_rows() set search_path = public;

do $$
declare f text;
begin
  foreach f in array array[
    'public.is_member(uuid)', 'public.role_in(uuid)', 'public.is_admin(uuid)', 'public.club_of_team(uuid)',
    'public.is_teacher_of(uuid)', 'public.can_read_club(uuid)', 'public.has_team(uuid, text[])',
    'public.can_edit_team(uuid)', 'public.can_plan_team(uuid)', 'public.can_match_team(uuid)',
    'public.can_supervise(uuid)', 'public.can_read_team(uuid)', 'public.can_see_profile(uuid)',
    'public.can_comment(uuid, uuid)', 'public.can_edit_methodology(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

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
