-- Construction curve in one pass: each update adds its change since the unit's previous figure,
-- and a running total gives the average progress on every date. Access is checked once.
-- The old version recomputed every unit's latest figure for every date (30+ seconds).
create or replace function public.construction_curve(p_project uuid, p_units uuid[] default null)
returns table(as_of date, pct numeric) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_see_project(p_project) then return; end if;
  return query
  with st as (select s.id, s.weight from public.construction_stages s where s.project_id = p_project),
  tw as (select nullif(sum(st.weight), 0) w from st),
  n as (select nullif(count(*), 0)::numeric c from public.units u where u.project_id = p_project and (p_units is null or u.id = any (p_units))),
  day_last as (
    select distinct on (h.unit_id, h.stage_id, h.as_of) h.unit_id, h.stage_id, h.as_of, h.pct
      from public.unit_stage_updates h
     where h.project_id = p_project and (p_units is null or h.unit_id = any (p_units))
     order by h.unit_id, h.stage_id, h.as_of, h.created_at desc
  ),
  deltas as (
    select d.as_of, (d.pct - coalesce(lag(d.pct) over (partition by d.unit_id, d.stage_id order by d.as_of), 0)) * st.weight dw
      from day_last d join st on st.id = d.stage_id
  ),
  per_day as (select x.as_of, sum(x.dw) s from deltas x group by x.as_of)
  select p.as_of, round(sum(p.s) over (order by p.as_of) / (select w from tw) / (select c from n), 2)
    from per_day p order by p.as_of;
end $$;
grant execute on function public.construction_curve(uuid, uuid[]) to authenticated;
