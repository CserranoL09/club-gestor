-- 014 · Consulta diaria para que el plan gratuito de Supabase no pause el proyecto por inactividad.
-- La llama .github/workflows/keepalive.yml una vez al día con la clave pública. No lee ni cambia datos.
create or replace function public.keepalive()
returns boolean
language sql stable security invoker set search_path = public as $$
  select true;
$$;
revoke execute on function public.keepalive() from public;
grant  execute on function public.keepalive() to anon, authenticated;
