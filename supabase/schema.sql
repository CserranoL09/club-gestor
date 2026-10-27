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
