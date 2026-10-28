-- WE-estate core schema: projects, phases, units, contracts, progress,
-- payment certificates and the workflow that moves them between departments.

create extension if not exists pgcrypto;

-- Departments ---------------------------------------------------------------
create table public.departments (
  code     text primary key,
  name     text not null,
  name_ar  text not null,
  sort     int  not null default 0
);

insert into public.departments (code, name, name_ar, sort) values
  ('executive',    'Executive',                'الإدارة العليا',        1),
  ('pm',           'Project management',       'إدارة المشروع',         2),
  ('site',         'Site',                     'الموقع',                3),
  ('tech_office',  'Technical office',         'المكتب الفني',          4),
  ('cost_control', 'Planning & cost control',  'التخطيط والتكاليف',     5),
  ('procurement',  'Contracts & procurement',  'العقود والمشتريات',     6),
  ('finance',      'Finance',                  'المالية',               7),
  ('sales',        'Sales',                    'المبيعات',              8),
  ('handover',     'Customer care & handover', 'خدمة العملاء والتسليم', 9);

-- People --------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '',
  email       text not null default '',
  department  text references public.departments (code),
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.my_department()
returns text language sql stable security definer set search_path = public as $$
  select department from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.in_department(variadic codes text[])
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or coalesce(public.my_department() = any (codes), false)
$$;

-- Projects ------------------------------------------------------------------
create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  location    text not null default '',
  budget_egp  numeric(16,2) not null default 0,
  start_date  date,
  finish_date date,
  created_at  timestamptz not null default now()
);

create table public.phases (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  code        text not null,
  name        text not null,
  budget_egp  numeric(16,2) not null default 0,
  start_date  date,
  finish_date date,
  unique (project_id, code)
);

create table public.units (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  phase_id    uuid references public.phases (id) on delete set null,
  code        text not null,
  unit_type   text not null default '',
  area_m2     numeric(10,2),
  status      text not null default 'available'
              check (status in ('available', 'reserved', 'sold', 'handed_over')),
  unique (project_id, code)
);

create table public.contracts (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects (id) on delete cascade,
  phase_id       uuid references public.phases (id) on delete set null,
  code           text not null,
  contractor     text not null,
  scope          text not null default '',
  value_egp      numeric(16,2) not null default 0,
  retention_pct  numeric(5,2) not null default 5,
  start_date     date,
  finish_date    date,
  unique (project_id, code)
);

-- Monthly progress per phase; SPI and CPI are computed from these rows.
create table public.progress_updates (
  id              uuid primary key default gen_random_uuid(),
  phase_id        uuid not null references public.phases (id) on delete cascade,
  period          date not null,
  planned_pct     numeric(5,2) not null check (planned_pct between 0 and 100),
  actual_pct      numeric(5,2) not null check (actual_pct between 0 and 100),
  actual_cost_egp numeric(16,2) not null default 0,
  note            text not null default '',
  created_by      uuid references auth.users (id) default auth.uid(),
  created_at      timestamptz not null default now(),
  unique (phase_id, period)
);

-- Workflows -----------------------------------------------------------------
-- One row per step of each document type. Step 1 is where a document is
-- drafted; the last step completes it.
create table public.workflow_steps (
  doc_type    text not null,
  seq         int  not null,
  name        text not null,
  name_ar     text not null,
  department  text not null references public.departments (code),
  action      text not null,
  due_days    int  not null default 2,
  primary key (doc_type, seq)
);

insert into public.workflow_steps (doc_type, seq, name, name_ar, department, action, due_days) values
  ('payment_certificate', 1, 'Site progress', 'تقدم الموقع',        'site',         'Submit to technical office', 2),
  ('payment_certificate', 2, 'QS measures',   'حصر الكميات',       'tech_office',  'Send to cost control',       3),
  ('payment_certificate', 3, 'Cost check',    'مراجعة التكاليف',   'cost_control', 'Send to project manager',    2),
  ('payment_certificate', 4, 'PM approves',   'اعتماد مدير المشروع', 'pm',          'Approve certificate',        2),
  ('payment_certificate', 5, 'Finance pays',  'الصرف',              'finance',      'Mark as paid',               5);

create table public.payment_certificates (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects (id) on delete cascade,
  contract_id      uuid not null references public.contracts (id) on delete restrict,
  number           int  not null,
  period_end       date not null,
  gross_egp        numeric(16,2) not null check (gross_egp >= 0),
  retention_egp    numeric(16,2) not null default 0,
  net_egp          numeric(16,2) generated always as (gross_egp - retention_egp) stored,
  description      text not null default '',
  status           text not null default 'draft'
                   check (status in ('draft', 'in_review', 'returned', 'approved', 'paid', 'rejected')),
  step             int  not null default 1,
  step_entered_at  timestamptz not null default now(),
  created_by       uuid references auth.users (id) default auth.uid(),
  created_at       timestamptz not null default now(),
  unique (contract_id, number)
);

create table public.workflow_events (
  id          bigint generated always as identity primary key,
  doc_type    text not null,
  doc_id      uuid not null,
  from_step   int,
  to_step     int,
  action      text not null check (action in ('create', 'submit', 'forward', 'return', 'reject', 'pay', 'comment')),
  comment     text not null default '',
  actor       uuid references auth.users (id) default auth.uid(),
  created_at  timestamptz not null default now()
);
create index on public.workflow_events (doc_type, doc_id, created_at);

-- Fill in retention from the contract and log the creation.
create or replace function public.pc_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare c public.contracts;
begin
  select * into c from public.contracts where id = new.contract_id;
  if c.id is null or c.project_id <> new.project_id then
    raise exception 'Contract does not belong to this project';
  end if;
  if new.retention_egp = 0 then
    new.retention_egp := round(new.gross_egp * c.retention_pct / 100, 2);
  end if;
  new.status := 'draft'; new.step := 1; new.step_entered_at := now();
  return new;
end $$;
create trigger pc_before_insert before insert on public.payment_certificates
  for each row execute function public.pc_before_insert();

create or replace function public.pc_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.workflow_events (doc_type, doc_id, from_step, to_step, action, actor)
  values ('payment_certificate', new.id, null, 1, 'create', auth.uid());
  return new;
end $$;
create trigger pc_after_insert after insert on public.payment_certificates
  for each row execute function public.pc_after_insert();

-- The only way a certificate moves. Checks that the caller's department owns
-- the current step, then forwards, returns, rejects or pays it.
create or replace function public.certificate_action(p_id uuid, p_action text, p_comment text default '')
returns public.payment_certificates
language plpgsql security definer set search_path = public as $$
declare
  pc     public.payment_certificates;
  cur    public.workflow_steps;
  last_s int;
  nxt    int;
begin
  select * into pc from public.payment_certificates where id = p_id for update;
  if pc.id is null then raise exception 'Certificate not found'; end if;
  if pc.status in ('paid', 'rejected') then
    raise exception 'Certificate is already %', pc.status;
  end if;

  select * into cur from public.workflow_steps where doc_type = 'payment_certificate' and seq = pc.step;
  select max(seq) into last_s from public.workflow_steps where doc_type = 'payment_certificate';

  if not public.in_department(cur.department) then
    raise exception 'This step belongs to %', (select name from public.departments where code = cur.department);
  end if;

  p_comment := coalesce(trim(p_comment), '');

  if p_action = 'forward' then
    if pc.step = last_s then
      update public.payment_certificates set status = 'paid', step_entered_at = now() where id = p_id returning * into pc;
      insert into public.workflow_events (doc_type, doc_id, from_step, to_step, action, comment)
      values ('payment_certificate', p_id, cur.seq, cur.seq, 'pay', p_comment);
    else
      nxt := pc.step + 1;
      update public.payment_certificates
         set step = nxt,
             status = case when nxt = last_s then 'approved' else 'in_review' end,
             step_entered_at = now()
       where id = p_id returning * into pc;
      insert into public.workflow_events (doc_type, doc_id, from_step, to_step, action, comment)
      values ('payment_certificate', p_id, cur.seq, nxt, case when cur.seq = 1 then 'submit' else 'forward' end, p_comment);
    end if;
  elsif p_action = 'return' then
    if pc.step = 1 then raise exception 'A draft cannot be returned'; end if;
    if p_comment = '' then raise exception 'Say why it is being returned'; end if;
    update public.payment_certificates set step = 1, status = 'returned', step_entered_at = now()
     where id = p_id returning * into pc;
    insert into public.workflow_events (doc_type, doc_id, from_step, to_step, action, comment)
    values ('payment_certificate', p_id, cur.seq, 1, 'return', p_comment);
  elsif p_action = 'reject' then
    if p_comment = '' then raise exception 'Say why it is being rejected'; end if;
    update public.payment_certificates set status = 'rejected', step_entered_at = now()
     where id = p_id returning * into pc;
    insert into public.workflow_events (doc_type, doc_id, from_step, to_step, action, comment)
    values ('payment_certificate', p_id, cur.seq, cur.seq, 'reject', p_comment);
  elsif p_action = 'comment' then
    if p_comment = '' then raise exception 'Write a comment first'; end if;
    insert into public.workflow_events (doc_type, doc_id, from_step, to_step, action, comment)
    values ('payment_certificate', p_id, cur.seq, cur.seq, 'comment', p_comment);
  else
    raise exception 'Unknown action %', p_action;
  end if;

  return pc;
end $$;

-- Views -----------------------------------------------------------------------
-- Every open item with the department holding it and how long it has waited.
create or replace view public.work_queue with (security_invoker = true) as
select
  'payment_certificate'::text                as doc_type,
  pc.id                                      as doc_id,
  'PC-' || lpad(pc.number::text, 2, '0')     as ref,
  'Payment certificate #' || pc.number       as title,
  coalesce(ph.code || ' · ', '') || c.contractor as subtitle,
  pc.project_id,
  p.name                                     as project_name,
  pc.gross_egp                               as amount_egp,
  pc.status,
  pc.step,
  ws.name                                    as step_name,
  ws.department,
  d.name                                     as department_name,
  pc.step_entered_at,
  ws.due_days,
  floor(extract(epoch from now() - pc.step_entered_at) / 86400)::int as days_waiting,
  now() > pc.step_entered_at + make_interval(days => ws.due_days) as overdue
from public.payment_certificates pc
join public.projects p   on p.id = pc.project_id
join public.contracts c  on c.id = pc.contract_id
left join public.phases ph on ph.id = c.phase_id
join public.workflow_steps ws on ws.doc_type = 'payment_certificate' and ws.seq = pc.step
join public.departments d on d.code = ws.department
where pc.status not in ('paid', 'rejected');

-- Latest progress per phase, rolled up per project with SPI and CPI.
create or replace view public.project_status with (security_invoker = true) as
with latest as (
  select distinct on (pu.phase_id) pu.*
  from public.progress_updates pu
  order by pu.phase_id, pu.period desc
),
ph as (
  select p.id as project_id, ph.budget_egp,
         coalesce(l.planned_pct, 0) as planned_pct,
         coalesce(l.actual_pct, 0)  as actual_pct,
         coalesce(l.actual_cost_egp, 0) as actual_cost_egp,
         l.period
  from public.projects p
  join public.phases ph on ph.project_id = p.id
  left join latest l on l.phase_id = ph.id
)
select
  p.id, p.code, p.name, p.location, p.budget_egp,
  (select count(*) from public.phases x where x.project_id = p.id)::int as phase_count,
  (select count(*) from public.units  x where x.project_id = p.id)::int as unit_count,
  max(ph.period) as as_of,
  round(sum(ph.budget_egp * ph.actual_pct)  / nullif(sum(ph.budget_egp), 0), 1) as actual_pct,
  round(sum(ph.budget_egp * ph.planned_pct) / nullif(sum(ph.budget_egp), 0), 1) as planned_pct,
  round(sum(ph.budget_egp * ph.actual_pct) / nullif(sum(ph.budget_egp * ph.planned_pct), 0), 2) as spi,
  round(sum(ph.budget_egp * ph.actual_pct / 100) / nullif(sum(ph.actual_cost_egp), 0), 2) as cpi,
  (select count(*) from public.work_queue q where q.project_id = p.id and q.overdue)::int as overdue_count,
  (select count(*) from public.work_queue q where q.project_id = p.id)::int as open_count
from public.projects p
left join ph on ph.project_id = p.id
group by p.id;

-- Row-level security ----------------------------------------------------------
alter table public.departments          enable row level security;
alter table public.profiles             enable row level security;
alter table public.projects             enable row level security;
alter table public.phases               enable row level security;
alter table public.units                enable row level security;
alter table public.contracts            enable row level security;
alter table public.progress_updates     enable row level security;
alter table public.workflow_steps       enable row level security;
alter table public.payment_certificates enable row level security;
alter table public.workflow_events      enable row level security;

-- Everyone signed in can read; what they can change depends on department.
create policy "read" on public.departments          for select to authenticated using (true);
create policy "read" on public.profiles             for select to authenticated using (true);
create policy "read" on public.projects             for select to authenticated using (true);
create policy "read" on public.phases               for select to authenticated using (true);
create policy "read" on public.units                for select to authenticated using (true);
create policy "read" on public.contracts            for select to authenticated using (true);
create policy "read" on public.progress_updates     for select to authenticated using (true);
create policy "read" on public.workflow_steps       for select to authenticated using (true);
create policy "read" on public.payment_certificates for select to authenticated using (true);
create policy "read" on public.workflow_events      for select to authenticated using (true);

create policy "self update name" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy "admin manages people" on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Only admins can change the department or admin flag, even on their own row.
-- (auth.uid() is null for the SQL editor and service key, which may.)
create or replace function public.profiles_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.department is distinct from old.department or new.is_admin is distinct from old.is_admin)
     and auth.uid() is not null and not public.is_admin() then
    raise exception 'Only an admin can change departments';
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

create policy "pm and planning manage" on public.projects for all to authenticated
  using (public.in_department('pm', 'cost_control')) with check (public.in_department('pm', 'cost_control'));
create policy "pm and planning manage" on public.phases for all to authenticated
  using (public.in_department('pm', 'cost_control')) with check (public.in_department('pm', 'cost_control'));
create policy "sales and handover manage" on public.units for all to authenticated
  using (public.in_department('sales', 'handover', 'pm')) with check (public.in_department('sales', 'handover', 'pm'));
create policy "procurement manages" on public.contracts for all to authenticated
  using (public.in_department('procurement', 'pm')) with check (public.in_department('procurement', 'pm'));
create policy "site and planning report" on public.progress_updates for all to authenticated
  using (public.in_department('site', 'cost_control', 'pm')) with check (public.in_department('site', 'cost_control', 'pm'));

-- Site and the technical office raise certificates; after that they only
-- move through certificate_action().
create policy "site raises" on public.payment_certificates for insert to authenticated
  with check (public.in_department('site', 'tech_office'));
create policy "edit own draft" on public.payment_certificates for update to authenticated
  using (step = 1 and status in ('draft', 'returned') and public.in_department('site', 'tech_office'))
  with check (step = 1 and status in ('draft', 'returned'));

revoke all on function public.certificate_action(uuid, text, text) from public, anon;
grant execute on function public.certificate_action(uuid, text, text) to authenticated;

-- Live updates for queues and dashboards.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.payment_certificates, public.workflow_events;
  end if;
end $$;
