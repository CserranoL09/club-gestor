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
