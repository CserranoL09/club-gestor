-- 011 · Panel del profesor (Prompt 17)
-- Resumen de los clubes de una clase para su profesor: solo lectura y solo de sus propias clases.

create or replace function public.class_overview(p_class uuid)
returns table (
  club_id uuid, club_name text, short_name text, students text, teams text, team_count int,
  players int, sessions int, matches int, reports_done int, open_comments int, last_activity timestamptz
)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.short_name,
    (select string_agg(coalesce(nullif(p.full_name, ''), p.email, '—'), ', ' order by p.full_name)
       from club_members m join profiles p on p.id = m.user_id where m.club_id = c.id and m.role = 'admin'),
    (select string_agg(t.name, ', ' order by t.name) from teams t where t.club_id = c.id and not t.archived),
    (select count(*) from teams t where t.club_id = c.id and not t.archived)::int,
    (select count(*) from players x join teams t on t.id = x.team_id where t.club_id = c.id and x.active)::int,
    (select count(*) from sessions x join teams t on t.id = x.team_id where t.club_id = c.id)::int,
    (select count(*) from matches x join teams t on t.id = x.team_id where t.club_id = c.id)::int,
    (select count(*) from matches x join teams t on t.id = x.team_id where t.club_id = c.id and x.report_done)::int,
    (select count(*) from comments x where x.club_id = c.id and x.parent_id is null and not x.resolved and x.author_id = k.teacher_id)::int,
    greatest(
      c.updated_at,
      (select max(x.updated_at) from sessions x join teams t on t.id = x.team_id where t.club_id = c.id),
      (select max(x.updated_at) from matches x join teams t on t.id = x.team_id where t.club_id = c.id),
      (select max(x.updated_at) from players x join teams t on t.id = x.team_id where t.club_id = c.id),
      (select max(x.updated_at) from periodizations x join teams t on t.id = x.team_id where t.club_id = c.id),
      (select max(x.updated_at) from macrocycles x join teams t on t.id = x.team_id where t.club_id = c.id),
      (select max(x.updated_at) from morphocycles x join teams t on t.id = x.team_id where t.club_id = c.id),
      (select max(x.created_at) from comments x where x.club_id = c.id and x.author_id <> k.teacher_id)
    )
  from clubs c join classes k on k.id = c.class_id
  where k.id = p_class and k.teacher_id = auth.uid()
  order by c.name;
$$;

revoke execute on function public.class_overview(uuid) from public, anon;
grant  execute on function public.class_overview(uuid) to authenticated;
