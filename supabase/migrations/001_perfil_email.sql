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
