-- Construction progress by unit and stage, and unit delivery.

-- The stages every unit goes through on a project, with how much each counts.
create table if not exists public.construction_stages (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  seq        int not null,
  name       text not null,
  weight     numeric(6,2) not null default 10 check (weight >= 0),
  unique (project_id, seq)
);

-- Every progress entry, so we can draw progress over time. The latest per
-- unit and stage is the current position.
create table if not exists public.unit_stage_updates (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  unit_id    uuid not null references public.units(id) on delete cascade,
  stage_id   uuid not null references public.construction_stages(id) on delete cascade,
  pct        numeric(5,2) not null check (pct between 0 and 100),
  as_of      date not null default current_date,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists unit_stage_updates_unit on public.unit_stage_updates (unit_id, stage_id, as_of desc, created_at desc);
create index if not exists unit_stage_updates_project on public.unit_stage_updates (project_id, as_of);

alter table public.construction_stages enable row level security;
alter table public.unit_stage_updates enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'construction_stages' and policyname = 'company reads') then
    create policy "company reads" on public.construction_stages for select using (public.can_see_project(project_id));
    create policy "departments write" on public.construction_stages for all
      using (public.can_see_project(project_id) and public.in_department('pm', 'tech_office', 'cost_control'))
      with check (public.can_see_project(project_id) and public.in_department('pm', 'tech_office', 'cost_control'));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'unit_stage_updates' and policyname = 'company reads') then
    create policy "company reads" on public.unit_stage_updates for select using (public.can_see_project(project_id));
    create policy "site records" on public.unit_stage_updates for insert
      with check (public.can_see_project(project_id) and public.in_department('site', 'tech_office', 'quality', 'pm', 'cost_control'));
  end if;
end $$;
grant select, insert, update, delete on public.construction_stages to authenticated;
grant select, insert on public.unit_stage_updates to authenticated;

-- Standard stages for a project that has none yet.
create or replace function public.ensure_stages(p_project uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_see_project(p_project) then raise exception 'Not allowed'; end if;
  if exists (select 1 from public.construction_stages where project_id = p_project) then return; end if;
  insert into public.construction_stages (project_id, seq, name, weight) values
    (p_project, 1, 'Excavation and foundations', 10),
    (p_project, 2, 'Concrete structure', 25),
    (p_project, 3, 'Masonry', 10),
    (p_project, 4, 'MEP rough-in', 10),
    (p_project, 5, 'Plaster and screed', 8),
    (p_project, 6, 'Facade', 10),
    (p_project, 7, 'Finishes', 15),
    (p_project, 8, 'MEP fit-out', 7),
    (p_project, 9, 'External works and landscape', 5)
  on conflict do nothing;
end $$;
revoke execute on function public.ensure_stages(uuid) from public, anon;
grant execute on function public.ensure_stages(uuid) to authenticated;

-- Where each unit stands now: one row per unit and stage (latest entry).
create or replace view public.unit_stage_now with (security_invoker = true) as
  select distinct on (u.unit_id, u.stage_id) u.project_id, u.unit_id, u.stage_id, u.pct, u.as_of
    from public.unit_stage_updates u
   order by u.unit_id, u.stage_id, u.as_of desc, u.created_at desc;
grant select on public.unit_stage_now to authenticated;

-- Records one stage's progress for many units at once.
create or replace function public.record_unit_progress(p_project uuid, p_units uuid[], p_stage uuid, p_pct numeric, p_as_of date)
returns int language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  if p_pct < 0 or p_pct > 100 then raise exception 'Progress is between 0 and 100'; end if;
  insert into public.unit_stage_updates (project_id, unit_id, stage_id, pct, as_of)
  select p_project, u.id, p_stage, p_pct, coalesce(p_as_of, current_date)
    from public.units u where u.project_id = p_project and u.id = any (p_units);
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.record_unit_progress(uuid, uuid[], uuid, numeric, date) to authenticated;

-- Sets the planned delivery date of many units at once.
create or replace function public.set_delivery_dates(p_project uuid, p_units uuid[], p_date date)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not (public.can_see_project(p_project) and public.in_department('pm', 'cost_control', 'handover', 'sales')) then
    raise exception 'Only Project management, Cost control, Sales or Customer care can set delivery dates';
  end if;
  update public.units set delivery_date = p_date where project_id = p_project and id = any (p_units);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.set_delivery_dates(uuid, uuid[], date) from public, anon;
grant execute on function public.set_delivery_dates(uuid, uuid[], date) to authenticated;

-- Activities can also be entered by hand, by the technical office too.
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'activities' and policyname = 'technical office writes') then
    create policy "technical office writes" on public.activities for all
      using (public.can_see_project(project_id) and public.in_department('tech_office'))
      with check (public.can_see_project(project_id) and public.in_department('tech_office'));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'schedule_versions' and policyname = 'technical office writes') then
    create policy "technical office writes" on public.schedule_versions for all
      using (public.can_see_project(project_id) and public.in_department('tech_office'))
      with check (public.can_see_project(project_id) and public.in_department('tech_office'));
  end if;
end $$;

-- Schedule logic: categories, durations, milestones that start or finish
-- something, and links between activities (FS, SS, FF, SF with lag).
alter table public.activities
  add column if not exists category text not null default '',
  add column if not exists duration_days int,
  add column if not exists milestone_kind text check (milestone_kind in ('start', 'finish')),
  add column if not exists total_float int,
  add column if not exists is_critical boolean not null default false;

-- activity_links already exists (kind = FS/SS/FF/SF); add the pair key and tech office access.
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.activity_links'::regclass and conname = 'activity_links_pair') then
    alter table public.activity_links add constraint activity_links_pair unique (pred_id, succ_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'activity_links' and policyname = 'technical office writes') then
    create policy "technical office writes" on public.activity_links for all
      using (public.can_see_project(project_id) and public.in_department('tech_office'))
      with check (public.can_see_project(project_id) and public.in_department('tech_office'));
  end if;
end $$;
create index if not exists activity_links_succ on public.activity_links (succ_id);

-- Links from an import: activity codes in the newest schedule that has them.
create or replace function public.import_links(p_project uuid, p_links jsonb)
returns int language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  with v as (
    select a.version_id from public.activities a join public.schedule_versions s on s.id = a.version_id
     where a.project_id = p_project order by s.created_at desc limit 1
  )
  insert into public.activity_links (project_id, pred_id, succ_id, kind, lag_days)
  select distinct on (p.id, s.id) p_project, p.id, s.id, upper(coalesce(nullif(l.type, ''), 'FS')), coalesce(l.lag, 0)
    from jsonb_to_recordset(p_links) as l(pred text, succ text, type text, lag int)
    join v on true
    join public.activities p on p.version_id = v.version_id and p.code = l.pred
    join public.activities s on s.version_id = v.version_id and s.code = l.succ
   where p.id <> s.id and upper(coalesce(nullif(l.type, ''), 'FS')) in ('FS', 'SS', 'FF', 'SF')
  on conflict (pred_id, succ_id) do update set kind = excluded.kind, lag_days = excluded.lag_days;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.import_links(uuid, jsonb) to authenticated;

-- Average construction progress of some units (all if null) on every date something was recorded.
create or replace function public.construction_curve(p_project uuid, p_units uuid[] default null)
returns table (as_of date, pct numeric)
language sql stable security invoker set search_path = public as $$
  with st as (select id, weight from public.construction_stages where project_id = p_project),
  tw as (select nullif(sum(weight), 0) w from st),
  us as (select id from public.units where project_id = p_project and (p_units is null or id = any (p_units))),
  n as (select count(*)::numeric c from us),
  d as (select distinct u.as_of from public.unit_stage_updates u where u.project_id = p_project),
  latest as (
    select d.as_of, x.unit_id, x.stage_id, x.pct
      from d cross join lateral (
        select distinct on (h.unit_id, h.stage_id) h.unit_id, h.stage_id, h.pct
          from public.unit_stage_updates h
         where h.project_id = p_project and h.as_of <= d.as_of
         order by h.unit_id, h.stage_id, h.as_of desc, h.created_at desc
      ) x
  )
  select l.as_of, round(sum(l.pct * st.weight) / (select w from tw) / nullif((select c from n), 0), 2)
    from latest l join st on st.id = l.stage_id join us on us.id = l.unit_id
   group by l.as_of order by l.as_of
$$;
grant execute on function public.construction_curve(uuid, uuid[]) to authenticated;
