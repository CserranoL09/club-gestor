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
