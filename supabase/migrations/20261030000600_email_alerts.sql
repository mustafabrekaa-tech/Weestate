-- Email alerts: who to tell when a document moves on, and a way to turn them off.

alter table public.profiles add column if not exists email_alerts boolean not null default true;

-- The people a document now waits on (its current step's department), or the
-- person who raised it once it is returned, rejected or finished. Only for
-- someone who can see the project, and never the person who just acted.
create or replace function public.doc_mail_targets(p_doc_type text, p_id uuid)
returns table (email text, full_name text, why text, doc_name text, ref text, title text, project text, step_name text, status text)
language plpgsql stable security definer set search_path = public as $$
declare
  d    public.workflow_docs;
  r    record;
  comp uuid;
  cur  public.workflow_steps;
begin
  select * into d from public.workflow_docs where doc_type = p_doc_type;
  if d.doc_type is null then return; end if;
  execute format('select id, project_id, step, status, number, title, created_by from public.%I where id = $1', d.table_name)
    into r using p_id;
  if r.id is null or not public.can_see_project(r.project_id) then return; end if;
  comp := public.project_company(r.project_id);
  cur  := public.wf_step(comp, p_doc_type, r.step);

  if r.status in ('returned', 'rejected', d.done_status) then
    return query
      select p.email, p.full_name, r.status::text, d.name, r.number::text, coalesce(r.title, '')::text, pr.name, coalesce(cur.name, ''), r.status::text
        from public.profiles p, public.projects pr
       where p.id = r.created_by and pr.id = r.project_id
         and p.id is distinct from auth.uid() and p.email_alerts;
  else
    return query
      select p.email, p.full_name, 'waiting'::text, d.name, r.number::text, coalesce(r.title, '')::text, pr.name, coalesce(cur.name, ''), r.status::text
        from public.profiles p, public.projects pr
       where pr.id = r.project_id and p.company_id = comp
         and p.id is distinct from auth.uid() and p.email_alerts and not p.read_only
         and (p.department = cur.department or cur.department = any (p.extra_roles))
         and (p.all_projects or p.is_admin
              or exists (select 1 from public.project_access a where a.user_id = p.id and a.project_id = r.project_id));
  end if;
end $$;
revoke execute on function public.doc_mail_targets(text, uuid) from public, anon;
grant execute on function public.doc_mail_targets(text, uuid) to authenticated;
