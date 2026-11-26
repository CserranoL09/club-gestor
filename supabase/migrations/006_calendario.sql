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
