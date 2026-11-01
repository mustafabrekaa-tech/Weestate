-- Bring unit handover stages and their history in from a delivery-console JSON export.
-- p_rows: [{unit_id, stage, at, priority, target, events: [{stage, at, note}]}]
-- Events already in the log (same unit, stage, date and note) are not added twice.
-- With p_replace, the earlier history of the units in the file is cleared first.
create or replace function public.import_handover(p_project uuid, p_rows jsonb, p_replace boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare n_units int; n_events int;
begin
  if not (public.can_see_project(p_project) and public.in_department('pm', 'handover', 'quality', 'site', 'tech_office')) then
    raise exception 'Only Project management, Customer care, Quality, Site or Technical office can import handover stages';
  end if;

  create temp table _ho on commit drop as
  select (r->>'unit_id')::uuid as unit_id, r->>'stage' as stage, nullif(r->>'at', '')::date as at,
         (r->>'priority')::boolean as priority, nullif(r->>'target', '')::date as target, r->'events' as events
    from jsonb_array_elements(p_rows) r
    join public.units u on u.id = (r->>'unit_id')::uuid and u.project_id = p_project
   where r->>'stage' in ('not_started','submitted','submitted_consultant','snagging_con','submitted_qc','snagging_qc','qc_approved','initial','client_delivered');

  update public.units u
     set handover_stage = h.stage,
         handover_stage_at = coalesce(h.at, u.handover_stage_at, current_date),
         priority = coalesce(h.priority, u.priority),
         target_date = coalesce(h.target, u.target_date),
         status = case when h.stage = 'client_delivered' then 'handed_over' when u.status = 'handed_over' then 'sold' else u.status end
    from _ho h
   where u.id = h.unit_id;
  get diagnostics n_units = row_count;

  if p_replace then
    delete from public.unit_stage_log l using _ho h where l.unit_id = h.unit_id and l.project_id = p_project;
  end if;

  insert into public.unit_stage_log (project_id, unit_id, stage, at, note)
  select p_project, h.unit_id, e->>'stage', (e->>'at')::date, coalesce(e->>'note', '')
    from _ho h, jsonb_array_elements(coalesce(h.events, '[]'::jsonb)) e
   where e->>'stage' in ('not_started','submitted','submitted_consultant','snagging_con','submitted_qc','snagging_qc','qc_approved','initial','client_delivered')
     and nullif(e->>'at', '') is not null
     and not exists (
       select 1 from public.unit_stage_log l
        where l.unit_id = h.unit_id and l.stage = e->>'stage' and l.at = (e->>'at')::date and coalesce(l.note, '') = coalesce(e->>'note', ''));
  get diagnostics n_events = row_count;

  return jsonb_build_object('units', n_units, 'events', n_events);
end $$;

grant execute on function public.import_handover(uuid, jsonb, boolean) to authenticated;
