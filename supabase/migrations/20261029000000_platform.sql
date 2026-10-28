-- WE-estate platform: companies (each developer is a workspace), people,
-- invitations, approval limits, and a workflow engine shared by every document.

-- Companies -------------------------------------------------------------------
create table public.companies (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  name        text not null,
  name_ar     text not null default '',
  logo_url    text not null default '',
  domain      text unique,                 -- optional custom domain, e.g. projects.msquared.com
  currency    text not null default 'EGP',
  created_at  timestamptz not null default now()
);

insert into public.companies (id, slug, name, name_ar)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'msquared', 'M Squared Developments', 'إم سكوير للتطوير');

insert into public.departments (code, name, name_ar, sort) values
  ('quality',   'Quality',                 'الجودة',            10),
  ('legal',     'Legal',                   'الشؤون القانونية',  11),
  ('facility',  'Facility management',     'إدارة المرافق',     12),
  ('community', 'Community management',    'إدارة المجتمع',     13)
on conflict do nothing;

alter table public.profiles
  add column company_id        uuid references public.companies (id) on delete set null,
  add column phone             text not null default '',
  add column is_platform_admin boolean not null default false;

alter table public.projects
  add column company_id   uuid references public.companies (id) on delete cascade,
  add column project_type text not null default 'compound'
             check (project_type in ('compound', 'apartments', 'mixed_use', 'commercial', 'coastal', 'other')),
  add column status       text not null default 'construction'
             check (status in ('planning', 'design', 'construction', 'handover', 'operation', 'closed')),
  add column lat          double precision,
  add column lng          double precision,
  add column map_zoom     int not null default 16,
  add column boundary     jsonb;             -- GeoJSON polygon drawn in the setup wizard

update public.projects set company_id = 'aaaaaaaa-0000-0000-0000-000000000001',
       lat = 30.0131, lng = 31.4913 where code = 'TRIO';
alter table public.projects alter column company_id set not null;
alter table public.projects drop constraint projects_code_key;
alter table public.projects add constraint projects_company_code_key unique (company_id, code);

alter table public.phases add column boundary jsonb;
alter table public.progress_updates add column project_id uuid references public.projects (id) on delete cascade;
update public.progress_updates pu set project_id = ph.project_id from public.phases ph where ph.id = pu.phase_id;
alter table public.progress_updates alter column project_id set not null;

-- Invitations: a person added by an admin is linked to the company the
-- first time they sign in with that email.
create table public.invitations (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  email       text not null,
  full_name   text not null default '',
  department  text references public.departments (code),
  is_admin    boolean not null default false,
  invited_by  uuid references auth.users (id) default auth.uid(),
  created_at  timestamptz not null default now(),
  accepted_at timestamptz,
  unique (company_id, email)
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare inv public.invitations;
begin
  select * into inv from public.invitations
   where lower(email) = lower(new.email) and accepted_at is null
   order by created_at desc limit 1;
  insert into public.profiles (id, email, full_name, company_id, department, is_admin)
  values (new.id, coalesce(new.email, ''),
          coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), inv.full_name, ''),
          inv.company_id, inv.department, coalesce(inv.is_admin, false));
  if inv.id is not null then
    update public.invitations set accepted_at = now() where id = inv.id;
  end if;
  return new;
end $$;

-- Who am I ----------------------------------------------------------------------
create or replace function public.my_company()
returns uuid language sql stable security definer set search_path = public as $$
  select company_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_platform_admin from public.profiles where id = auth.uid()), false)
$$;

-- A company admin (or WE-estate staff).
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin or is_platform_admin from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.in_company(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin() or (c is not null and c = public.my_company())
$$;

create or replace function public.can_see_project(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin()
      or exists (select 1 from public.projects where id = p and company_id = public.my_company())
$$;

create or replace function public.project_company(p uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select company_id from public.projects where id = p
$$;

-- Only admins change departments, admin flags or companies; only platform
-- admins make platform admins.
create or replace function public.profiles_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.is_platform_admin is distinct from old.is_platform_admin and not public.is_platform_admin() then
    raise exception 'Only WE-estate staff can change this';
  end if;
  if (new.department is distinct from old.department or new.is_admin is distinct from old.is_admin
      or new.company_id is distinct from old.company_id) and not public.is_admin() then
    raise exception 'Only an admin can change departments';
  end if;
  if new.company_id is distinct from old.company_id and not public.is_platform_admin()
     and old.company_id is not null then
    raise exception 'People cannot be moved between companies';
  end if;
  return new;
end $$;

-- Approval limits -----------------------------------------------------------------
-- Above the amount (or with any time impact, if set) the executive step applies.
create table public.approval_limits (
  company_id      uuid not null references public.companies (id) on delete cascade,
  doc_type        text not null,
  amount_egp      numeric(16,2) not null,
  any_time_impact boolean not null default false,
  primary key (company_id, doc_type)
);
insert into public.approval_limits values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'payment_certificate', 10000000, false),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'variation_order',      1000000, true),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'purchase_request',     5000000, false),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'budget_revision',            0, false);

-- Workflow engine -------------------------------------------------------------------
-- Every workflow document lives in its own table with the same columns:
-- id, project_id, number, title, amount_egp, status, step, step_entered_at.
create table public.workflow_docs (
  doc_type     text primary key,
  table_name   text not null,
  ref_prefix   text not null,
  name         text not null,
  name_ar      text not null,
  done_status  text not null default 'done',
  done_label   text not null default 'Done',
  time_column  text            -- column holding a time impact in days, if any
);
insert into public.workflow_docs values
  ('payment_certificate', 'payment_certificates', 'PC', 'Payment certificate', 'مستخلص',          'paid',  'Paid',          null),
  ('variation_order',     'variation_orders',     'VO', 'Variation order',     'أمر تغيير',       'done',  'Issued',        'time_impact_days'),
  ('purchase_request',    'purchase_requests',    'PR', 'Purchase request',    'طلب شراء',        'done',  'Ordered',       null),
  ('budget_revision',     'budget_revisions',     'BR', 'Budget revision',     'تعديل الموازنة',  'done',  'Approved',      null),
  ('schedule_update',     'schedule_updates',     'SU', 'Schedule update',     'تحديث البرنامج',  'done',  'Approved',      null),
  ('unit_sale',           'unit_sales',           'SA', 'Unit sale',           'بيع وحدة',        'done',  'Contract signed', null),
  ('unit_handover',       'unit_handovers',       'HO', 'Unit handover',       'تسليم وحدة',      'done',  'Handed over',   null),
  ('work_order',          'work_orders',          'WO', 'Work order',          'أمر عمل',         'done',  'Closed',        null),
  ('owner_request',       'owner_requests',       'OR', 'Owner request',       'طلب مالك',        'done',  'Closed',        null);

-- Steps can be set per company; a company without its own steps uses the defaults (company_id null).
alter table public.workflow_steps drop constraint workflow_steps_pkey;
alter table public.workflow_steps
  add column id                uuid primary key default gen_random_uuid(),
  add column company_id        uuid references public.companies (id) on delete cascade,
  add column only_above_limit  boolean not null default false;
create unique index workflow_steps_unique on public.workflow_steps
  (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), doc_type, seq);

-- Payment certificates gain an executive step above the limit, before Finance.
update public.workflow_steps set seq = 6 where doc_type = 'payment_certificate' and seq = 5;
update public.payment_certificates set step = 6 where step = 5;
insert into public.workflow_steps (doc_type, seq, name, name_ar, department, action, due_days, only_above_limit) values
  ('payment_certificate', 5, 'Executive approves', 'اعتماد الإدارة العليا', 'executive', 'Approve for payment', 2, true),

  ('variation_order', 1, 'Raised',              'إنشاء الطلب',          'site',         'Send to technical office', 2, false),
  ('variation_order', 2, 'Priced',              'التسعير',              'tech_office',  'Send to cost control',     3, false),
  ('variation_order', 3, 'Budget check',        'مراجعة الموازنة',      'cost_control', 'Send to project manager',  2, false),
  ('variation_order', 4, 'PM approves',         'اعتماد مدير المشروع',  'pm',           'Approve variation',        2, false),
  ('variation_order', 5, 'Executive approves',  'اعتماد الإدارة العليا', 'executive',    'Approve variation',        3, true),
  ('variation_order', 6, 'Contracts issues',    'إصدار الأمر',          'procurement',  'Issue to contractor',      2, false),

  ('purchase_request', 1, 'Requested',          'الطلب',                'site',         'Send to procurement',      1, false),
  ('purchase_request', 2, 'Quotes',             'عروض الأسعار',         'procurement',  'Send to cost control',     5, false),
  ('purchase_request', 3, 'Budget check',       'مراجعة الموازنة',      'cost_control', 'Send to project manager',  2, false),
  ('purchase_request', 4, 'PM approves',        'اعتماد مدير المشروع',  'pm',           'Approve purchase',         2, false),
  ('purchase_request', 5, 'Executive approves', 'اعتماد الإدارة العليا', 'executive',    'Approve purchase',         2, true),
  ('purchase_request', 6, 'PO issued',          'إصدار أمر الشراء',     'procurement',  'Mark PO issued',           2, false),

  ('budget_revision', 1, 'Proposed',            'الاقتراح',             'cost_control', 'Send to project manager',  2, false),
  ('budget_revision', 2, 'PM reviews',          'مراجعة مدير المشروع',  'pm',           'Send to finance',          3, false),
  ('budget_revision', 3, 'Finance reviews',     'مراجعة المالية',       'finance',      'Send to executive',        3, false),
  ('budget_revision', 4, 'Executive approves',  'اعتماد الإدارة العليا', 'executive',    'Approve revision',         5, false),

  ('schedule_update', 1, 'Updated',             'التحديث',              'cost_control', 'Send to project manager',  3, false),
  ('schedule_update', 2, 'PM approves',         'اعتماد مدير المشروع',  'pm',           'Approve update',           3, false),

  ('unit_sale', 1, 'Reserved',                  'الحجز',                'sales',        'Send to finance',          2, false),
  ('unit_sale', 2, 'Down payment',              'المقدم',               'finance',      'Confirm down payment',     3, false),
  ('unit_sale', 3, 'Contract',                  'العقد',                'legal',        'Mark contract signed',     5, false),

  ('unit_handover', 1, 'Unit ready',            'جاهزية الوحدة',        'site',         'Send to quality',          3, false),
  ('unit_handover', 2, 'Inspection',            'الفحص',                'quality',      'Pass inspection',          3, false),
  ('unit_handover', 3, 'Owner booked',          'حجز موعد المالك',      'handover',     'Mark booked',              5, false),
  ('unit_handover', 4, 'Handover',              'التسليم',              'handover',     'Mark handed over',         7, false),

  ('work_order', 1, 'Reported',                 'البلاغ',               'community',    'Send to facility management', 1, false),
  ('work_order', 2, 'Assigned',                 'التكليف',              'facility',     'Mark fixed',               2, false),
  ('work_order', 3, 'Owner confirms',           'تأكيد المالك',         'community',    'Close',                    2, false),

  ('owner_request', 1, 'Received',              'الاستلام',             'community',    'Send for action',          1, false),
  ('owner_request', 2, 'In action',             'قيد التنفيذ',          'facility',     'Mark done',                3, false),
  ('owner_request', 3, 'Closed with owner',     'الإغلاق مع المالك',    'community',    'Close',                    1, false);

alter table public.workflow_events add column project_id uuid references public.projects (id) on delete cascade;
update public.workflow_events e set project_id = pc.project_id
  from public.payment_certificates pc where pc.id = e.doc_id;
alter table public.workflow_events drop constraint workflow_events_action_check;
alter table public.workflow_events add constraint workflow_events_action_check
  check (action in ('create', 'submit', 'forward', 'skip', 'return', 'reject', 'pay', 'done', 'comment'));

-- The company whose steps apply (its own if it has any, else the defaults).
create or replace function public.wf_owner(p_company uuid, p_doc_type text)
returns uuid language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from public.workflow_steps where company_id = p_company and doc_type = p_doc_type)
              then p_company end
$$;

create or replace function public.wf_step(p_company uuid, p_doc_type text, p_seq int)
returns public.workflow_steps language sql stable security definer set search_path = public as $$
  select * from public.workflow_steps
   where doc_type = p_doc_type and seq = p_seq
     and company_id is not distinct from public.wf_owner(p_company, p_doc_type)
$$;

-- Moves any workflow document: forward, return (to step 1), reject or comment.
-- Checks the caller's department owns the current step, skips executive steps
-- below the company's limit, and records every move.
create or replace function public.workflow_action(p_doc_type text, p_id uuid, p_action text, p_comment text default '')
returns text language plpgsql security definer set search_path = public as $$
declare
  d        public.workflow_docs;
  r        record;
  comp     uuid;
  cur      public.workflow_steps;
  nxt      public.workflow_steps;
  last_s   int;
  lim      public.approval_limits;
  t_days   numeric := 0;
  new_status text;
begin
  select * into d from public.workflow_docs where doc_type = p_doc_type;
  if d.doc_type is null then raise exception 'Unknown document type %', p_doc_type; end if;

  execute format('select id, project_id, step, status, amount_egp %s from public.%I where id = $1 for update',
                 case when d.time_column is not null then format(', coalesce(%I, 0) as t_days', d.time_column) else ', 0 as t_days' end,
                 d.table_name)
    into r using p_id;
  if r.id is null then raise exception '% not found', d.name; end if;
  if r.status in (d.done_status, 'rejected') then raise exception '% is already closed', d.name; end if;
  if not public.can_see_project(r.project_id) then raise exception 'Not allowed'; end if;

  comp := public.project_company(r.project_id);
  cur  := public.wf_step(comp, p_doc_type, r.step);
  select max(seq) into last_s from public.workflow_steps
   where doc_type = p_doc_type and company_id is not distinct from public.wf_owner(comp, p_doc_type);

  if not public.in_department(cur.department) then
    raise exception 'This step belongs to %', (select name from public.departments where code = cur.department);
  end if;
  p_comment := coalesce(trim(p_comment), '');

  if p_action = 'forward' then
    if r.step = last_s then
      execute format('update public.%I set status = $1, step_entered_at = now() where id = $2', d.table_name)
        using d.done_status, p_id;
      insert into public.workflow_events (doc_type, doc_id, project_id, from_step, to_step, action, comment)
      values (p_doc_type, p_id, r.project_id, cur.seq, cur.seq,
              case when p_doc_type = 'payment_certificate' then 'pay' else 'done' end, p_comment);
      return d.done_status;
    end if;

    select * into lim from public.approval_limits where company_id = comp and doc_type = p_doc_type;
    nxt := public.wf_step(comp, p_doc_type, r.step + 1);
    while nxt.only_above_limit and nxt.seq < last_s
          and lim.company_id is not null
          and r.amount_egp <= lim.amount_egp
          and not (lim.any_time_impact and r.t_days > 0) loop
      insert into public.workflow_events (doc_type, doc_id, project_id, from_step, to_step, action, comment)
      values (p_doc_type, p_id, r.project_id, nxt.seq, nxt.seq + 1, 'skip', 'Below the approval limit');
      nxt := public.wf_step(comp, p_doc_type, nxt.seq + 1);
    end loop;

    new_status := case when nxt.seq = last_s then 'approved' else 'in_review' end;
    execute format('update public.%I set step = $1, status = $2, step_entered_at = now() where id = $3', d.table_name)
      using nxt.seq, new_status, p_id;
    insert into public.workflow_events (doc_type, doc_id, project_id, from_step, to_step, action, comment)
    values (p_doc_type, p_id, r.project_id, cur.seq, nxt.seq, case when cur.seq = 1 then 'submit' else 'forward' end, p_comment);
    return new_status;

  elsif p_action = 'return' then
    if r.step = 1 then raise exception 'A draft cannot be returned'; end if;
    if p_comment = '' then raise exception 'Say why it is being returned'; end if;
    execute format('update public.%I set step = 1, status = ''returned'', step_entered_at = now() where id = $1', d.table_name)
      using p_id;
    insert into public.workflow_events (doc_type, doc_id, project_id, from_step, to_step, action, comment)
    values (p_doc_type, p_id, r.project_id, cur.seq, 1, 'return', p_comment);
    return 'returned';

  elsif p_action = 'reject' then
    if p_comment = '' then raise exception 'Say why it is being rejected'; end if;
    execute format('update public.%I set status = ''rejected'', step_entered_at = now() where id = $1', d.table_name)
      using p_id;
    insert into public.workflow_events (doc_type, doc_id, project_id, from_step, to_step, action, comment)
    values (p_doc_type, p_id, r.project_id, cur.seq, cur.seq, 'reject', p_comment);
    return 'rejected';

  elsif p_action = 'comment' then
    if p_comment = '' then raise exception 'Write a comment first'; end if;
    insert into public.workflow_events (doc_type, doc_id, project_id, from_step, to_step, action, comment)
    values (p_doc_type, p_id, r.project_id, cur.seq, cur.seq, 'comment', p_comment);
    return r.status;
  end if;
  raise exception 'Unknown action %', p_action;
end $$;

-- Kept for the screens built on it.
create or replace function public.certificate_action(p_id uuid, p_action text, p_comment text default '')
returns public.payment_certificates
language plpgsql security definer set search_path = public as $$
declare pc public.payment_certificates;
begin
  perform public.workflow_action('payment_certificate', p_id, p_action, p_comment);
  select * into pc from public.payment_certificates where id = p_id;
  return pc;
end $$;

-- New documents start as drafts at step 1, numbered per project, and log their creation.
create or replace function public.wf_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.number is null then
    execute format('select coalesce(max(number), 0) + 1 from public.%I where project_id = $1', TG_TABLE_NAME)
      into new.number using new.project_id;
  end if;
  new.status := 'draft'; new.step := 1; new.step_entered_at := now();
  return new;
end $$;

create or replace function public.wf_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.workflow_events (doc_type, doc_id, project_id, from_step, to_step, action, actor)
  values (TG_ARGV[0], new.id, new.project_id, null, 1, 'create', auth.uid());
  return new;
end $$;

-- Payment certificates use the shared triggers from now on.
drop trigger pc_after_insert on public.payment_certificates;
drop function public.pc_after_insert();
alter table public.payment_certificates alter column number drop not null;
alter table public.payment_certificates
  add column title                 text not null default '',
  add column amount_egp            numeric(16,2) generated always as (gross_egp) stored,
  add column advance_recovery_egp  numeric(16,2) not null default 0,
  add column penalty_egp           numeric(16,2) not null default 0,
  add column other_deductions_egp  numeric(16,2) not null default 0;
create trigger wf_after_insert after insert on public.payment_certificates
  for each row execute function public.wf_after_insert('payment_certificate');
