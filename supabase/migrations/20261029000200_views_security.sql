-- WE-estate: what every team sees (queues and reports), who may change what
-- (row-level security per company and department), and the setup functions.

-- Views ---------------------------------------------------------------------------------
drop view public.project_status;
drop view public.work_queue;

create view public.work_queue with (security_invoker = true) as
with docs as (
  select 'payment_certificate'::text doc_type, pc.id, pc.project_id, pc.number, pc.title,
         coalesce(ph.code || ' · ', '') || c.contractor as subtitle, pc.gross_egp as amount_egp, pc.status, pc.step, pc.step_entered_at
    from public.payment_certificates pc
    join public.contracts c on c.id = pc.contract_id
    left join public.phases ph on ph.id = c.phase_id
  union all
  select 'variation_order', v.id, v.project_id, v.number, v.title,
         coalesce(c.contractor, '') || case when v.time_impact_days > 0 then ' · +' || v.time_impact_days || ' days' else '' end,
         v.amount_egp, v.status, v.step, v.step_entered_at
    from public.variation_orders v left join public.contracts c on c.id = v.contract_id
  union all
  select 'purchase_request', r.id, r.project_id, r.number, r.title,
         coalesce('Needed by ' || to_char(r.needed_by, 'DD/MM/YYYY'), ''), r.amount_egp, r.status, r.step, r.step_entered_at
    from public.purchase_requests r
  union all
  select 'budget_revision', b.id, b.project_id, b.number, b.title, b.reason, b.amount_egp, b.status, b.step, b.step_entered_at
    from public.budget_revisions b
  union all
  select 'schedule_update', s.id, s.project_id, s.number, s.title,
         coalesce('Data date ' || to_char(s.data_date, 'DD/MM/YYYY'), ''), s.amount_egp, s.status, s.step, s.step_entered_at
    from public.schedule_updates s
  union all
  select 'unit_sale', s.id, s.project_id, s.number, coalesce(nullif(s.title, ''), 'Sale of ' || u.code),
         cu.full_name, s.amount_egp, s.status, s.step, s.step_entered_at
    from public.unit_sales s join public.units u on u.id = s.unit_id join public.customers cu on cu.id = s.customer_id
  union all
  select 'unit_handover', h.id, h.project_id, h.number, coalesce(nullif(h.title, ''), 'Handover of ' || u.code),
         coalesce(cu.full_name, ''), h.amount_egp, h.status, h.step, h.step_entered_at
    from public.unit_handovers h join public.units u on u.id = h.unit_id left join public.customers cu on cu.id = h.customer_id
  union all
  select 'work_order', w.id, w.project_id, w.number, w.title,
         initcap(w.priority) || coalesce(' · ' || u.code, ''), w.amount_egp, w.status, w.step, w.step_entered_at
    from public.work_orders w left join public.units u on u.id = w.unit_id
  union all
  select 'owner_request', o.id, o.project_id, o.number, o.title,
         initcap(replace(o.kind, '_', ' ')) || coalesce(' · ' || u.code, ''), o.amount_egp, o.status, o.step, o.step_entered_at
    from public.owner_requests o left join public.units u on u.id = o.unit_id
)
select
  d.doc_type,
  d.id                                          as doc_id,
  wd.ref_prefix || '-' || lpad(d.number::text, 2, '0') as ref,
  d.title,
  d.subtitle,
  d.project_id,
  p.name                                        as project_name,
  p.company_id,
  d.amount_egp,
  d.status,
  d.step,
  ws.name                                       as step_name,
  ws.department,
  dep.name                                      as department_name,
  d.step_entered_at,
  ws.due_days,
  floor(extract(epoch from now() - d.step_entered_at) / 86400)::int as days_waiting,
  now() > d.step_entered_at + make_interval(days => ws.due_days) as overdue
from docs d
join public.workflow_docs wd on wd.doc_type = d.doc_type
join public.projects p on p.id = d.project_id
join lateral public.wf_step(p.company_id, d.doc_type, d.step) ws on true
join public.departments dep on dep.code = ws.department
where d.status not in ('paid', 'done', 'rejected');

-- Progress per phase: the latest monthly entry, or the schedule's activities
-- weighted when there is a schedule.
create view public.phase_status with (security_invoker = true) as
with latest as (
  select distinct on (pu.phase_id) pu.*
  from public.progress_updates pu
  order by pu.phase_id, pu.period desc
),
budget as (
  select bl.phase_id, sum(bl.amount_egp) amount
  from public.budget_lines bl
  join public.budgets b on b.id = bl.budget_id and b.status = 'approved'
  group by bl.phase_id
),
certified as (
  select c.phase_id, sum(pc.gross_egp) amount
  from public.payment_certificates pc join public.contracts c on c.id = pc.contract_id
  where pc.status not in ('draft', 'rejected')
  group by c.phase_id
)
select ph.id, ph.project_id, ph.code, ph.name,
       coalesce(b.amount, ph.budget_egp)                       as bac_egp,
       coalesce(l.planned_pct, 0)                              as planned_pct,
       coalesce(l.actual_pct, 0)                               as actual_pct,
       round(coalesce(b.amount, ph.budget_egp) * coalesce(l.planned_pct, 0) / 100, 2) as pv_egp,
       round(coalesce(b.amount, ph.budget_egp) * coalesce(l.actual_pct, 0) / 100, 2)  as ev_egp,
       coalesce(nullif(l.actual_cost_egp, 0), cert.amount, 0)  as ac_egp,
       l.period                                                as as_of
from public.phases ph
left join latest l on l.phase_id = ph.id
left join budget b on b.phase_id = ph.id
left join certified cert on cert.phase_id = ph.id;

create view public.project_status with (security_invoker = true) as
select
  p.id, p.company_id, p.code, p.name, p.location, p.budget_egp, p.status, p.project_type, p.lat, p.lng, p.map_zoom,
  (select count(*) from public.phases x where x.project_id = p.id)::int as phase_count,
  (select count(*) from public.units  x where x.project_id = p.id)::int as unit_count,
  max(s.as_of)                                                          as as_of,
  round(sum(s.ev_egp) / nullif(sum(s.bac_egp), 0) * 100, 1)             as actual_pct,
  round(sum(s.pv_egp) / nullif(sum(s.bac_egp), 0) * 100, 1)             as planned_pct,
  sum(s.bac_egp) as bac_egp, sum(s.pv_egp) as pv_egp, sum(s.ev_egp) as ev_egp, sum(s.ac_egp) as ac_egp,
  round(sum(s.ev_egp) / nullif(sum(s.pv_egp), 0), 2)                    as spi,
  round(sum(s.ev_egp) / nullif(sum(s.ac_egp), 0), 2)                    as cpi,
  round(sum(s.bac_egp) / nullif(sum(s.ev_egp) / nullif(sum(s.ac_egp), 0), 0), 2) as eac_egp,
  (select count(*) from public.work_queue q where q.project_id = p.id and q.overdue)::int as overdue_count,
  (select count(*) from public.work_queue q where q.project_id = p.id)::int as open_count
from public.projects p
left join public.phase_status s on s.project_id = p.id
group by p.id;

-- Budget, commitments, certified and paid per cost code.
create view public.cost_report with (security_invoker = true) as
with b as (
  select bl.project_id, bl.cost_code_id, sum(bl.amount_egp) v
  from public.budget_lines bl join public.budgets bu on bu.id = bl.budget_id and bu.status <> 'superseded'
  group by 1, 2
), c as (
  select project_id, cost_code_id, sum(value_egp) v from public.contracts where status <> 'terminated' and cost_code_id is not null group by 1, 2
), vo as (
  select project_id, cost_code_id, sum(amount_egp) v from public.variation_orders where status = 'done' and cost_code_id is not null group by 1, 2
), po as (
  select project_id, cost_code_id, sum(amount_egp) v from public.purchase_orders where status <> 'cancelled' and cost_code_id is not null group by 1, 2
), cert as (
  select pc.project_id, c.cost_code_id, sum(pc.gross_egp) v
  from public.payment_certificates pc join public.contracts c on c.id = pc.contract_id
  where pc.status not in ('draft', 'rejected') and c.cost_code_id is not null group by 1, 2
), paid as (
  select project_id, cost_code_id, sum(amount_egp) v from public.payments_out where cost_code_id is not null group by 1, 2
), keys as (
  select project_id, cost_code_id from b union select project_id, cost_code_id from c
  union select project_id, cost_code_id from vo union select project_id, cost_code_id from po
  union select project_id, cost_code_id from cert union select project_id, cost_code_id from paid
)
select k.project_id, cc.id as cost_code_id, cc.code, cc.name, cc.parent_code,
       coalesce(b.v, 0) as budget_egp,
       coalesce(c.v, 0) + coalesce(vo.v, 0) + coalesce(po.v, 0) as committed_egp,
       coalesce(cert.v, 0) as certified_egp,
       coalesce(paid.v, 0) as paid_egp,
       coalesce(b.v, 0) - (coalesce(c.v, 0) + coalesce(vo.v, 0) + coalesce(po.v, 0)) as uncommitted_egp
from keys k
join public.cost_codes cc on cc.id = k.cost_code_id
left join b    on b.project_id = k.project_id and b.cost_code_id = k.cost_code_id
left join c    on c.project_id = k.project_id and c.cost_code_id = k.cost_code_id
left join vo   on vo.project_id = k.project_id and vo.cost_code_id = k.cost_code_id
left join po   on po.project_id = k.project_id and po.cost_code_id = k.cost_code_id
left join cert on cert.project_id = k.project_id and cert.cost_code_id = k.cost_code_id
left join paid on paid.project_id = k.project_id and paid.cost_code_id = k.cost_code_id;

create view public.contractor_balance with (security_invoker = true) as
select c.id as contract_id, c.project_id, c.code, c.contractor, c.value_egp,
       coalesce((select sum(v.amount_egp) from public.variation_orders v where v.contract_id = c.id and v.status = 'done'), 0) as variations_egp,
       c.value_egp + coalesce((select sum(v.amount_egp) from public.variation_orders v where v.contract_id = c.id and v.status = 'done'), 0) as revised_value_egp,
       coalesce(sum(pc.gross_egp), 0)              as certified_egp,
       coalesce(sum(pc.retention_egp), 0)          as retention_held_egp,
       coalesce(sum(pc.advance_recovery_egp), 0)   as advance_recovered_egp,
       coalesce((select sum(po.amount_egp) from public.payments_out po join public.payment_certificates x on x.id = po.certificate_id
                  where x.contract_id = c.id), 0)  as paid_egp,
       round(coalesce(sum(pc.gross_egp), 0) / nullif(c.value_egp, 0) * 100, 1) as certified_pct
from public.contracts c
left join public.payment_certificates pc on pc.contract_id = c.id and pc.status not in ('draft', 'rejected')
group by c.id;

create view public.cash_flow with (security_invoker = true) as
with m as (
  select project_id, date_trunc('month', period_end)::date as month, sum(gross_egp - retention_egp - advance_recovery_egp - penalty_egp - other_deductions_egp) out_due, 0::numeric out_paid, 0::numeric in_due, 0::numeric in_paid
    from public.payment_certificates where status not in ('draft', 'rejected') group by 1, 2
  union all
  select project_id, date_trunc('month', paid_on)::date, 0, sum(amount_egp), 0, 0 from public.payments_out group by 1, 2
  union all
  select project_id, date_trunc('month', due_date)::date, 0, 0, sum(amount_egp), 0 from public.instalments group by 1, 2
  union all
  select project_id, date_trunc('month', paid_on)::date, 0, 0, 0, sum(paid_egp) from public.instalments where paid_on is not null group by 1, 2
)
select project_id, month, sum(out_due) as outflow_due_egp, sum(out_paid) as outflow_paid_egp,
       sum(in_due) as inflow_due_egp, sum(in_paid) as inflow_received_egp
from m group by 1, 2;

create view public.unit_summary with (security_invoker = true) as
select project_id, phase_id, status, count(*)::int as units, sum(area_m2) as area_m2
from public.units group by 1, 2, 3;

-- Row-level security -----------------------------------------------------------------------
-- Drop the first version's policies; everything is scoped to the company now.
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- Tables that belong to a project: everyone in the company reads; the listed
-- departments (and admins) write.
do $$
declare
  t record;
begin
  for t in select * from (values
    ('phases',                array['pm','cost_control']),
    ('buildings',             array['pm','cost_control']),
    ('unit_types',            array['pm','cost_control','sales']),
    ('units',                 array['pm','cost_control','sales','handover']),
    ('contracts',             array['procurement','pm']),
    ('contract_items',        array['procurement','tech_office']),
    ('tenders',               array['procurement']),
    ('bids',                  array['procurement','tech_office']),
    ('purchase_orders',       array['procurement']),
    ('progress_updates',      array['site','cost_control','pm']),
    ('activity_progress',     array['site','cost_control','pm']),
    ('budgets',               array['cost_control','finance']),
    ('budget_lines',          array['cost_control','finance']),
    ('schedule_versions',     array['cost_control','pm']),
    ('activities',            array['cost_control','pm']),
    ('activity_links',        array['cost_control','pm']),
    ('boq_items',             array['tech_office','cost_control']),
    ('certificate_lines',     array['site','tech_office']),
    ('payments_out',          array['finance']),
    ('site_reports',          array['site','quality','pm']),
    ('ncrs',                  array['site','quality','pm']),
    ('price_lists',           array['sales']),
    ('price_list_items',      array['sales']),
    ('instalments',           array['sales','finance']),
    ('unit_checks',           array['site','quality','handover']),
    ('snags',                 array['site','quality','handover']),
    ('unit_occupants',        array['handover','community','sales']),
    ('service_charges',       array['community','finance']),
    ('announcements',         array['community']),
    ('gate_passes',           array['community']),
    ('assets',                array['facility']),
    ('pm_plans',              array['facility']),
    ('budget_revision_lines', array['cost_control']),
    ('pr_lines',              array['site','pm','facility','procurement'])
  ) as v(tbl, depts) loop
    execute format('alter table public.%I enable row level security', t.tbl);
    execute format('create policy "company reads" on public.%I for select to authenticated using (public.can_see_project(project_id))', t.tbl);
    execute format('create policy "departments write" on public.%I for all to authenticated using (public.can_see_project(project_id) and public.in_department(variadic %L::text[])) with check (public.can_see_project(project_id) and public.in_department(variadic %L::text[]))', t.tbl, t.depts, t.depts);
  end loop;
end $$;

-- Workflow documents: the first step's departments raise them and edit drafts;
-- after that they only move through workflow_action().
do $$
declare t record;
begin
  for t in select * from (values
    ('payment_certificates', array['site','tech_office']),
    ('variation_orders',     array['site','tech_office','pm']),
    ('purchase_requests',    array['site','pm','facility','procurement']),
    ('budget_revisions',     array['cost_control']),
    ('schedule_updates',     array['cost_control']),
    ('unit_sales',           array['sales']),
    ('unit_handovers',       array['site','handover']),
    ('work_orders',          array['community','facility']),
    ('owner_requests',       array['community','handover'])
  ) as v(tbl, depts) loop
    execute format('alter table public.%I enable row level security', t.tbl);
    execute format('create policy "company reads" on public.%I for select to authenticated using (public.can_see_project(project_id))', t.tbl);
    execute format('create policy "first step raises" on public.%I for insert to authenticated with check (public.can_see_project(project_id) and public.in_department(variadic %L::text[]))', t.tbl, t.depts);
    execute format('create policy "edit own draft" on public.%I for update to authenticated using (step = 1 and status in (''draft'', ''returned'') and public.can_see_project(project_id) and public.in_department(variadic %L::text[])) with check (step = 1 and status in (''draft'', ''returned''))', t.tbl, t.depts);
    execute format('create policy "delete own draft" on public.%I for delete to authenticated using (step = 1 and status = ''draft'' and public.can_see_project(project_id) and public.in_department(variadic %L::text[]))', t.tbl, t.depts);
  end loop;
end $$;

-- Status and step only move through workflow_action(): the draft policy above
-- pins step 1, and wf_before_insert() starts every document as a draft.

alter table public.workflow_events enable row level security;
create policy "company reads" on public.workflow_events for select to authenticated using (public.can_see_project(project_id));

alter table public.attachments enable row level security;
create policy "company reads" on public.attachments for select to authenticated using (public.can_see_project(project_id));
create policy "company adds" on public.attachments for insert to authenticated with check (public.can_see_project(project_id));
create policy "own delete" on public.attachments for delete to authenticated using (created_by = auth.uid() or public.is_admin());

alter table public.projects enable row level security;
create policy "company reads" on public.projects for select to authenticated using (public.in_company(company_id));
create policy "pm and planning manage" on public.projects for all to authenticated
  using (public.in_company(company_id) and public.in_department('pm', 'cost_control'))
  with check (public.in_company(company_id) and public.in_department('pm', 'cost_control'));

-- Company-wide tables.
alter table public.companies enable row level security;
create policy "members read" on public.companies for select to authenticated using (public.in_company(id));
create policy "admins edit" on public.companies for update to authenticated using (public.in_company(id) and public.is_admin()) with check (public.in_company(id) and public.is_admin());
create policy "staff create" on public.companies for insert to authenticated with check (public.is_platform_admin());
create policy "staff delete" on public.companies for delete to authenticated using (public.is_platform_admin());

create policy "company reads" on public.profiles for select to authenticated
  using (id = auth.uid() or public.in_company(company_id));
create policy "self update" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy "admins manage people" on public.profiles for update to authenticated
  using (public.is_admin() and public.in_company(company_id)) with check (public.is_admin() and public.in_company(company_id));

alter table public.invitations enable row level security;
create policy "admins manage" on public.invitations for all to authenticated
  using (public.is_admin() and public.in_company(company_id)) with check (public.is_admin() and public.in_company(company_id));

alter table public.approval_limits enable row level security;
create policy "company reads" on public.approval_limits for select to authenticated using (public.in_company(company_id));
create policy "admins manage" on public.approval_limits for all to authenticated
  using (public.is_admin() and public.in_company(company_id)) with check (public.is_admin() and public.in_company(company_id));

create policy "read defaults and own" on public.workflow_steps for select to authenticated
  using (company_id is null or public.in_company(company_id));
create policy "admins manage own" on public.workflow_steps for all to authenticated
  using (company_id is not null and public.is_admin() and public.in_company(company_id))
  with check (company_id is not null and public.is_admin() and public.in_company(company_id));

alter table public.workflow_docs enable row level security;
create policy "everyone reads" on public.workflow_docs for select to authenticated using (true);
create policy "everyone reads" on public.departments for select to authenticated using (true);

do $$
declare t record;
begin
  for t in select * from (values
    ('cost_codes',          array['cost_control','finance']),
    ('project_templates',   array['pm']),
    ('checklist_templates', array['quality','handover'])
  ) as v(tbl, depts) loop
    execute format('alter table public.%I enable row level security', t.tbl);
    execute format('create policy "read standard and own" on public.%I for select to authenticated using (company_id is null or public.in_company(company_id))', t.tbl);
    execute format('create policy "company manages own" on public.%I for all to authenticated using (company_id is not null and public.in_company(company_id) and public.in_department(variadic %L::text[])) with check (company_id is not null and public.in_company(company_id) and public.in_department(variadic %L::text[]))', t.tbl, t.depts, t.depts);
  end loop;
  for t in select * from (values
    ('suppliers', array['procurement','pm','facility']),
    ('customers', array['sales','handover','community'])
  ) as v(tbl, depts) loop
    execute format('alter table public.%I enable row level security', t.tbl);
    execute format('create policy "company reads" on public.%I for select to authenticated using (public.in_company(company_id))', t.tbl);
    execute format('create policy "departments write" on public.%I for all to authenticated using (public.in_company(company_id) and public.in_department(variadic %L::text[])) with check (public.in_company(company_id) and public.in_department(variadic %L::text[]))', t.tbl, t.depts, t.depts);
  end loop;
end $$;

-- Setup and admin functions ------------------------------------------------------------------

-- WE-estate staff: open a workspace for a new developer.
create or replace function public.create_company(p_slug text, p_name text, p_name_ar text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if not public.is_platform_admin() then raise exception 'Only WE-estate staff can open a workspace'; end if;
  insert into public.companies (slug, name, name_ar) values (lower(trim(p_slug)), trim(p_name), coalesce(p_name_ar, ''))
  returning id into cid;
  insert into public.approval_limits (company_id, doc_type, amount_egp, any_time_impact) values
    (cid, 'payment_certificate', 10000000, false), (cid, 'variation_order', 1000000, true),
    (cid, 'purchase_request', 5000000, false), (cid, 'budget_revision', 0, false);
  return cid;
end $$;

-- Admins: add a person with a temporary password. They change it after signing in.
create or replace function public.admin_create_user(
  p_email text, p_full_name text, p_department text, p_is_admin boolean default false,
  p_company uuid default null, p_password text default null)
returns table (user_id uuid, temp_password text)
language plpgsql security definer set search_path = public, extensions, auth as $$
declare
  uid  uuid := gen_random_uuid();
  pw   text := coalesce(nullif(p_password, ''), 'We-' || substr(md5(random()::text || clock_timestamp()::text), 1, 10));
  comp uuid := coalesce(p_company, public.my_company());
begin
  if not public.is_admin() then raise exception 'Only an admin can add people'; end if;
  if comp is distinct from public.my_company() and not public.is_platform_admin() then
    raise exception 'People can only be added to your own company';
  end if;
  if comp is null then raise exception 'Choose a company'; end if;
  p_email := lower(trim(p_email));
  if p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'That email address does not look right'; end if;
  if exists (select 1 from auth.users where lower(email) = p_email) then
    raise exception 'Someone with this email already has an account';
  end if;
  if length(pw) < 8 then raise exception 'Passwords need at least 8 characters'; end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, email_change, email_change_token_new, recovery_token)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', p_email,
          crypt(pw, gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', p_full_name),
          now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text,
          jsonb_build_object('sub', uid::text, 'email', p_email, 'email_verified', true),
          'email', now(), now(), now());

  update public.profiles
     set company_id = comp, department = p_department, is_admin = coalesce(p_is_admin, false),
         full_name = coalesce(nullif(p_full_name, ''), full_name)
   where id = uid;
  return query select uid, pw;
end $$;

-- Wizard step 1-2: the project, its place on the map and its phases, from a template.
create or replace function public.setup_project(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  pid  uuid;
  comp uuid := coalesce((p ->> 'company_id')::uuid, public.my_company());
  tpl  public.project_templates;
  ph   text;
  i    int := 0;
  ut   jsonb;
begin
  if not (public.in_company(comp) and public.in_department('pm', 'cost_control')) then
    raise exception 'Only project management or planning can set up a project';
  end if;
  insert into public.projects (company_id, code, name, location, project_type, budget_egp, start_date, finish_date, lat, lng, map_zoom, boundary)
  values (comp, upper(trim(p ->> 'code')), trim(p ->> 'name'), coalesce(p ->> 'location', ''),
          coalesce(p ->> 'project_type', 'compound'), coalesce((p ->> 'budget_egp')::numeric, 0),
          (p ->> 'start_date')::date, (p ->> 'finish_date')::date,
          (p ->> 'lat')::float8, (p ->> 'lng')::float8, coalesce((p ->> 'map_zoom')::int, 16), p -> 'boundary')
  returning id into pid;

  if p ? 'template_id' and nullif(p ->> 'template_id', '') is not null then
    select * into tpl from public.project_templates where id = (p ->> 'template_id')::uuid;
  end if;

  if jsonb_typeof(p -> 'phases') = 'array' and jsonb_array_length(p -> 'phases') > 0 then
    insert into public.phases (project_id, code, name, budget_egp, start_date, finish_date)
    select pid, coalesce(x ->> 'code', 'Phase ' || lpad(n::text, 2, '0')), coalesce(x ->> 'name', x ->> 'code', 'Phase ' || lpad(n::text, 2, '0')),
           coalesce((x ->> 'budget_egp')::numeric, 0), (x ->> 'start_date')::date, (x ->> 'finish_date')::date
      from jsonb_array_elements(p -> 'phases') with ordinality as e(x, n);
  elsif tpl.id is not null then
    for ph in select jsonb_array_elements_text(tpl.payload -> 'phases') loop
      i := i + 1;
      insert into public.phases (project_id, code, name) values (pid, ph, ph);
    end loop;
  end if;

  if tpl.id is not null then
    for ut in select jsonb_array_elements(tpl.payload -> 'unit_types') loop
      insert into public.unit_types (project_id, code, name, category, area_m2, bedrooms)
      values (pid, ut ->> 'code', ut ->> 'name', coalesce(ut ->> 'category', 'other'), (ut ->> 'area_m2')::numeric, (ut ->> 'bedrooms')::int);
    end loop;
  end if;

  insert into public.budgets (project_id, version, name, status) values (pid, 1, 'Original budget', 'draft');
  return pid;
end $$;

-- Wizard step 3: buildings and units from counts. Codes look like P02-B07-0503.
create or replace function public.generate_units(
  p_project uuid, p_phase uuid, p_buildings int, p_floors int, p_per_floor int,
  p_unit_type uuid default null, p_building_prefix text default 'B', p_start int default 1)
returns int language plpgsql security definer set search_path = public as $$
declare
  ph   public.phases;
  ut   public.unit_types;
  bid  uuid;
  b    int; f int; u int; made int := 0;
  pcode text;
begin
  if not (public.can_see_project(p_project) and public.in_department('pm', 'cost_control', 'sales')) then
    raise exception 'Not allowed';
  end if;
  if p_buildings * p_floors * p_per_floor > 20000 then raise exception 'That is more than 20,000 units; add them in parts'; end if;
  select * into ph from public.phases where id = p_phase and project_id = p_project;
  if ph.id is null then raise exception 'Choose a phase of this project'; end if;
  select * into ut from public.unit_types where id = p_unit_type;
  pcode := 'P' || lpad(coalesce(nullif(regexp_replace(ph.code, '\D', '', 'g'), ''), '1'), 2, '0');
  for b in p_start .. p_start + p_buildings - 1 loop
    insert into public.buildings (project_id, phase_id, code, name, floors)
    values (p_project, p_phase, pcode || '-' || p_building_prefix || lpad(b::text, 2, '0'),
            'Building ' || p_building_prefix || lpad(b::text, 2, '0'), p_floors)
    on conflict (project_id, code) do update set floors = excluded.floors
    returning id into bid;
    for f in 0 .. p_floors - 1 loop
      for u in 1 .. p_per_floor loop
        insert into public.units (project_id, phase_id, building_id, unit_type_id, code, unit_type, area_m2, floor, status)
        values (p_project, p_phase, bid, ut.id,
                pcode || '-' || p_building_prefix || lpad(b::text, 2, '0') || '-' || lpad(f::text, 2, '0') || lpad(u::text, 2, '0'),
                coalesce(ut.name, ''), ut.area_m2, f, 'available')
        on conflict (project_id, code) do nothing;
        if found then made := made + 1; end if;
      end loop;
    end loop;
  end loop;
  return made;
end $$;

-- Wizard step 1 alternative: copy another project's phases, unit types,
-- budget lines (as zero) and contracts' structure.
create or replace function public.copy_project_structure(p_src uuid, p_dst uuid)
returns void language plpgsql security definer set search_path = public as $$
declare bud uuid;
begin
  if not (public.can_see_project(p_src) and public.can_see_project(p_dst) and public.in_department('pm', 'cost_control')) then
    raise exception 'Not allowed';
  end if;
  insert into public.phases (project_id, code, name)
  select p_dst, code, name from public.phases where project_id = p_src
  on conflict (project_id, code) do nothing;
  insert into public.unit_types (project_id, code, name, category, area_m2, bedrooms)
  select p_dst, code, name, category, area_m2, bedrooms from public.unit_types where project_id = p_src
  on conflict (project_id, code) do nothing;
  select id into bud from public.budgets where project_id = p_dst order by version limit 1;
  if bud is not null then
    insert into public.budget_lines (project_id, budget_id, phase_id, cost_code_id, amount_egp)
    select distinct p_dst, bud, dph.id, bl.cost_code_id, 0::numeric
      from public.budget_lines bl
      left join public.phases sph on sph.id = bl.phase_id
      left join public.phases dph on dph.project_id = p_dst and dph.code = sph.code
     where bl.project_id = p_src
    on conflict do nothing;
  end if;
end $$;

-- Excel import: rows already read from the sheet in the browser, checked here and saved together.
-- p_kind: units | boq | contracts | budget | activities | suppliers | customers
create or replace function public.import_rows(p_project uuid, p_kind text, p_rows jsonb, p_version uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  comp uuid := public.project_company(p_project);
  bud  uuid;
  n    int := 0;
begin
  if not public.can_see_project(p_project) then raise exception 'Not allowed'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'No rows to import'; end if;

  if p_kind = 'units' then
    if not public.in_department('pm', 'cost_control', 'sales') then raise exception 'Not allowed'; end if;
    insert into public.units (project_id, phase_id, building_id, unit_type_id, code, unit_type, area_m2, floor, status, list_price_egp)
    select p_project, ph.id, b.id, ut.id, r.code, coalesce(r.unit_type, ut.name, ''), r.area_m2, r.floor,
           coalesce(nullif(lower(r.status), ''), 'available'), r.list_price_egp
      from jsonb_to_recordset(p_rows) as r(code text, phase text, building text, unit_type text, area_m2 numeric, floor int, status text, list_price_egp numeric)
      left join public.phases ph on ph.project_id = p_project and ph.code = r.phase
      left join public.buildings b on b.project_id = p_project and b.code = r.building
      left join public.unit_types ut on ut.project_id = p_project and (ut.code = r.unit_type or ut.name = r.unit_type)
     where coalesce(r.code, '') <> ''
    on conflict (project_id, code) do update
       set area_m2 = excluded.area_m2, status = excluded.status, list_price_egp = excluded.list_price_egp,
           unit_type = excluded.unit_type, phase_id = coalesce(excluded.phase_id, units.phase_id);
    get diagnostics n = row_count;

  elsif p_kind = 'boq' then
    if not public.in_department('tech_office', 'cost_control') then raise exception 'Not allowed'; end if;
    insert into public.boq_items (project_id, phase_id, cost_code_id, section, code, description, unit, quantity, rate_egp, sort)
    select p_project, ph.id, cc.id, coalesce(r.section, ''), r.code, r.description, coalesce(r.unit, ''),
           coalesce(r.quantity, 0), coalesce(r.rate_egp, 0), row_number() over ()
      from jsonb_to_recordset(p_rows) as r(code text, description text, unit text, quantity numeric, rate_egp numeric, section text, phase text, cost_code text)
      left join public.phases ph on ph.project_id = p_project and ph.code = r.phase
      left join public.cost_codes cc on cc.code = r.cost_code and (cc.company_id is null or cc.company_id = comp)
     where coalesce(r.code, '') <> '' and coalesce(r.description, '') <> ''
    on conflict (project_id, code) do update
       set description = excluded.description, unit = excluded.unit, quantity = excluded.quantity,
           rate_egp = excluded.rate_egp, section = excluded.section, cost_code_id = coalesce(excluded.cost_code_id, boq_items.cost_code_id);
    get diagnostics n = row_count;

  elsif p_kind = 'suppliers' then
    if not public.in_department('procurement', 'pm', 'facility') then raise exception 'Not allowed'; end if;
    insert into public.suppliers (company_id, name, kind, tax_id, phone, email)
    select comp, r.name, coalesce(nullif(lower(r.kind), ''), 'contractor'), coalesce(r.tax_id, ''), coalesce(r.phone, ''), coalesce(r.email, '')
      from jsonb_to_recordset(p_rows) as r(name text, kind text, tax_id text, phone text, email text)
     where coalesce(r.name, '') <> ''
    on conflict (company_id, name) do update set phone = excluded.phone, email = excluded.email;
    get diagnostics n = row_count;

  elsif p_kind = 'contracts' then
    if not public.in_department('procurement', 'pm') then raise exception 'Not allowed'; end if;
    insert into public.suppliers (company_id, name)
    select distinct comp, r.contractor from jsonb_to_recordset(p_rows) as r(contractor text)
     where coalesce(r.contractor, '') <> ''
    on conflict (company_id, name) do nothing;
    insert into public.contracts (project_id, phase_id, code, contractor, supplier_id, scope, value_egp, retention_pct, advance_pct, start_date, finish_date, cost_code_id, kind)
    select p_project, ph.id, r.code, r.contractor, s.id, coalesce(r.scope, ''), coalesce(r.value_egp, 0),
           coalesce(r.retention_pct, 5), coalesce(r.advance_pct, 0), r.start_date, r.finish_date, cc.id, coalesce(nullif(lower(r.kind), ''), 'main')
      from jsonb_to_recordset(p_rows) as r(code text, contractor text, scope text, value_egp numeric, retention_pct numeric,
                                           advance_pct numeric, start_date date, finish_date date, phase text, cost_code text, kind text)
      left join public.phases ph on ph.project_id = p_project and ph.code = r.phase
      left join public.suppliers s on s.company_id = comp and s.name = r.contractor
      left join public.cost_codes cc on cc.code = r.cost_code and (cc.company_id is null or cc.company_id = comp)
     where coalesce(r.code, '') <> ''
    on conflict (project_id, code) do update
       set value_egp = excluded.value_egp, scope = excluded.scope, retention_pct = excluded.retention_pct;
    get diagnostics n = row_count;

  elsif p_kind = 'budget' then
    if not public.in_department('cost_control', 'finance') then raise exception 'Not allowed'; end if;
    select id into bud from public.budgets where project_id = p_project and status <> 'superseded' order by version desc limit 1;
    if bud is null then
      insert into public.budgets (project_id) values (p_project) returning id into bud;
    end if;
    insert into public.budget_lines (project_id, budget_id, phase_id, cost_code_id, amount_egp, note)
    select p_project, bud, ph.id, cc.id, coalesce(r.amount_egp, 0), coalesce(r.note, '')
      from jsonb_to_recordset(p_rows) as r(cost_code text, phase text, amount_egp numeric, note text)
      join public.cost_codes cc on cc.code = r.cost_code and (cc.company_id is null or cc.company_id = comp)
      left join public.phases ph on ph.project_id = p_project and ph.code = r.phase
    on conflict (budget_id, coalesce(phase_id, '00000000-0000-0000-0000-000000000000'::uuid), cost_code_id)
    do update set amount_egp = excluded.amount_egp;
    get diagnostics n = row_count;

  elsif p_kind = 'activities' then
    if not public.in_department('cost_control', 'pm') then raise exception 'Not allowed'; end if;
    if p_version is null then
      insert into public.schedule_versions (project_id, name, is_baseline, source)
      values (p_project, 'Baseline', not exists (select 1 from public.schedule_versions where project_id = p_project and is_baseline), 'excel')
      returning id into p_version;
    end if;
    insert into public.activities (project_id, version_id, code, name, wbs, phase_id, start_date, finish_date, is_milestone, weight)
    select p_project, p_version, r.code, r.name, coalesce(r.wbs, ''), ph.id, r.start_date, r.finish_date,
           coalesce(r.is_milestone, r.start_date = r.finish_date, false), coalesce(r.weight, 1)
      from jsonb_to_recordset(p_rows) as r(code text, name text, wbs text, phase text, start_date date, finish_date date, is_milestone boolean, weight numeric)
      left join public.phases ph on ph.project_id = p_project and ph.code = r.phase
     where coalesce(r.code, '') <> ''
    on conflict (version_id, code) do update
       set name = excluded.name, start_date = excluded.start_date, finish_date = excluded.finish_date, weight = excluded.weight;
    get diagnostics n = row_count;

  elsif p_kind = 'customers' then
    if not public.in_department('sales', 'handover', 'community') then raise exception 'Not allowed'; end if;
    insert into public.customers (company_id, full_name, national_id, phone, email, address)
    select comp, r.full_name, coalesce(r.national_id, ''), coalesce(r.phone, ''), coalesce(r.email, ''), coalesce(r.address, '')
      from jsonb_to_recordset(p_rows) as r(full_name text, national_id text, phone text, email text, address text)
     where coalesce(r.full_name, '') <> '';
    get diagnostics n = row_count;
  else
    raise exception 'Unknown import %', p_kind;
  end if;
  return n;
end $$;

-- What a project still needs, for the checklist on its page.
create or replace function public.setup_checklist(p_project uuid)
returns table (step text, done boolean, detail text)
language sql stable security definer set search_path = public as $$
  select * from (values
    ('Map',       (select lat is not null from public.projects where id = p_project), 'Place the project on the satellite map'),
    ('Phases',    exists (select 1 from public.phases where project_id = p_project), 'Add phases'),
    ('Units',     exists (select 1 from public.units where project_id = p_project), 'Generate or import units'),
    ('Budget',    exists (select 1 from public.budget_lines where project_id = p_project), 'Enter the budget by cost code'),
    ('Schedule',  exists (select 1 from public.schedule_versions where project_id = p_project and is_baseline), 'Import a baseline schedule, so SPI can be calculated'),
    ('BOQ',       exists (select 1 from public.boq_items where project_id = p_project), 'Import the BOQ'),
    ('Contracts', exists (select 1 from public.contracts where project_id = p_project), 'Add contracts'),
    ('People',    (select count(*) > 1 from public.profiles where company_id = public.project_company(p_project)), 'Invite the team')
  ) as t(step, done, detail)
  where public.can_see_project(p_project)
$$;

-- Function access ----------------------------------------------------------------------------
revoke execute on function public.wf_before_insert(), public.wf_after_insert(), public.budget_revision_total(),
  public.budget_revision_apply(), public.certificate_gross(), public.pr_total(), public.unit_sale_status(),
  public.unit_handover_done(), public.handle_new_user(), public.pc_before_insert(), public.profiles_guard()
  from public, anon, authenticated;
revoke execute on function public.my_company(), public.is_platform_admin(), public.in_company(uuid),
  public.can_see_project(uuid), public.project_company(uuid), public.wf_owner(uuid, text), public.wf_step(uuid, text, int),
  public.workflow_action(text, uuid, text, text), public.create_company(text, text, text),
  public.admin_create_user(text, text, text, boolean, uuid, text), public.setup_project(jsonb),
  public.generate_units(uuid, uuid, int, int, int, uuid, text, int), public.copy_project_structure(uuid, uuid),
  public.import_rows(uuid, text, jsonb, uuid), public.setup_checklist(uuid)
  from public, anon;
grant execute on function public.my_company(), public.is_platform_admin(), public.in_company(uuid),
  public.can_see_project(uuid), public.project_company(uuid), public.wf_owner(uuid, text), public.wf_step(uuid, text, int),
  public.workflow_action(text, uuid, text, text), public.create_company(text, text, text),
  public.admin_create_user(text, text, text, boolean, uuid, text), public.setup_project(jsonb),
  public.generate_units(uuid, uuid, int, int, int, uuid, text, int), public.copy_project_structure(uuid, uuid),
  public.import_rows(uuid, text, jsonb, uuid), public.setup_checklist(uuid)
  to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.variation_orders, public.purchase_requests, public.work_orders, public.owner_requests;
  end if;
end $$;
