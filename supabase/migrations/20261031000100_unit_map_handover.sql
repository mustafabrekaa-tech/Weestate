-- Unit map on the project's masterplan image, and the handover (delivery) workflow per unit.

alter table public.projects
  add column if not exists plan_image text,
  add column if not exists plan_w integer,
  add column if not exists plan_h integer;

-- plan_poly: the unit's outline on the masterplan image, in image pixels [[x,y],...].
alter table public.units
  add column if not exists plan_poly jsonb,
  add column if not exists handover_stage text not null default 'not_started',
  add column if not exists handover_stage_at date,
  add column if not exists priority boolean not null default false,
  add column if not exists target_date date;

do $$ begin
  alter table public.units add constraint units_handover_stage_check check (handover_stage in (
    'not_started', 'submitted', 'submitted_consultant', 'snagging_con', 'submitted_qc', 'snagging_qc', 'qc_approved', 'initial', 'client_delivered'));
exception when duplicate_object then null; end $$;

-- Every move of a unit through the handover stages.
create table if not exists public.unit_stage_log (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  stage text not null,
  at date not null default current_date,
  note text not null default '',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists unit_stage_log_unit on public.unit_stage_log (unit_id, at desc);
alter table public.unit_stage_log enable row level security;
do $$ begin
  create policy "company reads" on public.unit_stage_log for select using (public.can_see_project(project_id));
exception when duplicate_object then null; end $$;

create or replace function public.set_handover_stage(p_project uuid, p_units uuid[], p_stage text, p_at date default null, p_note text default '')
returns integer language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not (public.can_see_project(p_project) and public.in_department('pm', 'handover', 'quality', 'site', 'tech_office')) then
    raise exception 'Only Project management, Customer care, Quality, Site or Technical office can move units through handover';
  end if;
  update public.units set handover_stage = p_stage, handover_stage_at = coalesce(p_at, current_date),
    status = case when p_stage = 'client_delivered' then 'handed_over' when status = 'handed_over' then 'sold' else status end
   where project_id = p_project and id = any (p_units);
  get diagnostics n = row_count;
  insert into public.unit_stage_log (project_id, unit_id, stage, at, note)
  select p_project, u.id, p_stage, coalesce(p_at, current_date), coalesce(p_note, '')
    from public.units u where u.project_id = p_project and u.id = any (p_units);
  return n;
end $$;

create or replace function public.set_unit_priority(p_project uuid, p_units uuid[], p_on boolean)
returns integer language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not (public.can_see_project(p_project) and public.in_department('pm', 'handover', 'quality', 'site', 'tech_office', 'cost_control')) then
    raise exception 'You cannot change unit priority';
  end if;
  update public.units set priority = p_on where project_id = p_project and id = any (p_units);
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on function public.set_handover_stage(uuid, uuid[], text, date, text) to authenticated;
grant execute on function public.set_unit_priority(uuid, uuid[], boolean) to authenticated;

notify pgrst, 'reload schema';
