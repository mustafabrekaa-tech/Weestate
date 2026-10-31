-- Uploading with upsert/returning needs read access to the branding files; they are public anyway.
create policy "branding read" on storage.objects for select using (bucket_id = 'branding');
-- Extra brand colours beside brand_color: {"accent": "#rrggbb", "dark": "#rrggbb"}.
alter table public.companies add column if not exists brand_colors jsonb;
