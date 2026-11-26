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
