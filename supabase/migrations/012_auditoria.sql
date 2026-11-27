-- 012 · Correcciones de la auditoría (Prompt 18)

-- 1) Funciones internas que devolvían datos de cualquier club o partido a quien conociera su id.
--    Solo las usan otras funciones del servidor (create_team y el trigger de reservas), que siguen pudiendo llamarlas.
revoke execute on function public.club_template_for(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.match_slot(uuid) from public, anon, authenticated;

-- 2) Archivos del club: ver y subir, cualquier miembro; sustituir o borrar, solo la Dirección o quien subió el archivo.
drop policy if exists club_files_update on storage.objects;
drop policy if exists club_files_delete on storage.objects;

create policy club_files_update on storage.objects for update to authenticated
  using (bucket_id = 'club-files' and (
    public.is_admin(public.storage_club(name))
    or (public.is_member(public.storage_club(name)) and owner_id = (select auth.uid())::text)))
  with check (bucket_id = 'club-files' and public.is_member(public.storage_club(name)));

create policy club_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'club-files' and (
    public.is_admin(public.storage_club(name))
    or (public.is_member(public.storage_club(name)) and owner_id = (select auth.uid())::text)));
