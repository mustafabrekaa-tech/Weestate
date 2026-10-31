-- Where an uploaded 3D model stands on the satellite map: {lng, lat, rot (deg clockwise), scale, alt (m)}.
alter table public.project_models add column if not exists placement jsonb;
