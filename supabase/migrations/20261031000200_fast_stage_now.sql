-- Latest construction progress per unit and stage, in one fast call.
-- The unit_stage_now view checked access row by row over every update and was read 1000 rows at a time,
-- which took 15+ seconds for a 900-unit project and timed out the construction, delivery and unit pages.

create index if not exists unit_stage_updates_project_unit
  on public.unit_stage_updates (project_id, unit_id, stage_id, as_of desc, created_at desc);

create or replace function public.unit_stage_latest(p_project uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.can_see_project(p_project) then
    return '[]'::jsonb;
  end if;
  select coalesce(jsonb_agg(jsonb_build_array(x.unit_id, x.stage_id, x.pct, x.as_of)), '[]'::jsonb) into r
  from (
    select distinct on (u.unit_id, u.stage_id) u.unit_id, u.stage_id, u.pct, u.as_of
    from public.unit_stage_updates u
    where u.project_id = p_project
    order by u.unit_id, u.stage_id, u.as_of desc, u.created_at desc
  ) x;
  return r;
end $$;

grant execute on function public.unit_stage_latest(uuid) to authenticated;
notify pgrst, 'reload schema';
