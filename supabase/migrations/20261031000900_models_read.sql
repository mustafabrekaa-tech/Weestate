-- 3D model uploads need a read rule too (the upload reads the new file back), like the branding bucket.
create policy "models read" on storage.objects for select to authenticated
  using (bucket_id = 'models' and public.can_see_project(((storage.foldername(name))[1])::uuid));
