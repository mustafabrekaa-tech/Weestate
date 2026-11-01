-- Masterplan images uploaded from Project setup, one folder per project.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('plans', 'plans', true, 15728640, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'plans upload' and tablename = 'objects') then
    create policy "plans upload" on storage.objects for insert to authenticated
      with check (bucket_id = 'plans' and public.can_see_project(((storage.foldername(name))[1])::uuid)
                  and public.in_department('pm', 'tech_office', 'cost_control', 'sales'));
  end if;
end $$;

-- Saves where units sit on the masterplan (pixel polygons), many at once.
create or replace function public.set_plan_polys(p_project uuid, p_items jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare n int;
begin
  if not (public.can_see_project(p_project) and public.in_department('pm', 'tech_office', 'cost_control', 'sales')) then
    raise exception 'Only Project management, Technical office, Cost control or Sales can mark units on the masterplan';
  end if;
  update public.units u
     set plan_poly = case when jsonb_typeof(i->'poly') = 'array' then i->'poly' else null end
    from jsonb_array_elements(p_items) i
   where u.project_id = p_project and u.id = (i->>'id')::uuid;
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on function public.set_plan_polys(uuid, jsonb) to authenticated;
