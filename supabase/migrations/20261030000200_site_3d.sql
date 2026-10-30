-- 3D site: outlines drawn on the map for phases, buildings and units, floor
-- heights for stacking units, and uploaded 3D models of the project.

alter table public.buildings
  add column if not exists floor_height_m numeric(5,2) not null default 3.2,
  add column if not exists base_m         numeric(7,2) not null default 0;

alter table public.units
  add column if not exists footprint jsonb;

create table if not exists public.project_models (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  name         text not null,
  url          text not null,
  size_bytes   bigint,
  lat          double precision,
  lng          double precision,
  rotation_deg numeric(6,2) not null default 0,
  scale        numeric(10,4) not null default 1,
  created_by   uuid references auth.users (id) default auth.uid(),
  created_at   timestamptz not null default now()
);
create index if not exists project_models_project on public.project_models (project_id);
alter table public.project_models enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'project reads' and tablename = 'project_models') then
    create policy "project reads" on public.project_models for select using (public.can_see_project(project_id));
  end if;
  if not exists (select 1 from pg_policies where policyname = 'design writes' and tablename = 'project_models') then
    create policy "design writes" on public.project_models for all
      using (public.can_see_project(project_id) and public.in_department('pm', 'tech_office', 'cost_control', 'sales'))
      with check (public.can_see_project(project_id) and public.in_department('pm', 'tech_office', 'cost_control', 'sales'));
  end if;
end $$;
grant select, insert, update, delete on public.project_models to authenticated;

-- Saves an outline drawn on the map. p_kind is phase, building or unit;
-- p_ring is a GeoJSON polygon ring ([[lng, lat], ...]); null clears it.
create or replace function public.save_outline(p_project uuid, p_kind text, p_id uuid, p_ring jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_see_project(p_project) then raise exception 'Not allowed'; end if;
  if not public.in_department('pm', 'tech_office', 'cost_control', 'sales') then
    raise exception 'Only PM, Technical office, Cost control or Sales can draw on the site plan';
  end if;
  if p_ring is not null and (jsonb_typeof(p_ring) <> 'array' or jsonb_array_length(p_ring) < 4) then
    raise exception 'An outline needs at least three corners';
  end if;
  if p_kind = 'phase' then
    update public.phases set boundary = p_ring where id = p_id and project_id = p_project;
  elsif p_kind = 'building' then
    update public.buildings set footprint = p_ring where id = p_id and project_id = p_project;
  elsif p_kind = 'unit' then
    update public.units set footprint = p_ring where id = p_id and project_id = p_project;
  else
    raise exception 'Unknown outline %', p_kind;
  end if;
  if not found then raise exception 'Not found in this project'; end if;
end $$;
revoke execute on function public.save_outline(uuid, text, uuid, jsonb) from public, anon;
grant execute on function public.save_outline(uuid, text, uuid, jsonb) to authenticated;

-- Model files: one folder per project.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('models', 'models', true, 52428800, null)
on conflict (id) do nothing;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'models upload' and tablename = 'objects') then
    create policy "models upload" on storage.objects for insert to authenticated
      with check (bucket_id = 'models' and public.can_see_project(((storage.foldername(name))[1])::uuid)
                  and public.in_department('pm', 'tech_office', 'cost_control', 'sales'));
  end if;
end $$;
