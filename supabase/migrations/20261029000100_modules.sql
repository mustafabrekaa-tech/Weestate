-- WE-estate modules: structure, cost codes, budget, schedule, BOQ, contracts,
-- procurement, variations, sales, handover, owners and community, facility management.

create or replace function public.pc_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare c public.contracts;
begin
  select * into c from public.contracts where id = new.contract_id;
  if c.id is null or c.project_id <> new.project_id then
    raise exception 'Contract does not belong to this project';
  end if;
  if new.number is null then
    select coalesce(max(number), 0) + 1 into new.number from public.payment_certificates where contract_id = new.contract_id;
  end if;
  if new.retention_egp = 0 then
    new.retention_egp := round(new.gross_egp * c.retention_pct / 100, 2);
  end if;
  if new.advance_recovery_egp = 0 and c.advance_pct > 0 then
    new.advance_recovery_egp := round(new.gross_egp * c.advance_pct / 100, 2);
  end if;
  if new.title = '' then new.title := 'Payment certificate #' || new.number; end if;
  new.status := 'draft'; new.step := 1; new.step_entered_at := now();
  return new;
end $$;

-- Structure -----------------------------------------------------------------------
create table public.buildings (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  phase_id    uuid references public.phases (id) on delete set null,
  code        text not null,
  name        text not null default '',
  floors      int  not null default 1,
  footprint   jsonb,
  unique (project_id, code)
);

create table public.unit_types (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  code        text not null,
  name        text not null,
  category    text not null default 'apartment'
              check (category in ('villa', 'townhouse', 'twin_house', 'apartment', 'duplex', 'penthouse', 'chalet', 'office', 'retail', 'clinic', 'other')),
  area_m2     numeric(10,2),
  bedrooms    int,
  unique (project_id, code)
);

alter table public.units
  add column building_id    uuid references public.buildings (id) on delete set null,
  add column unit_type_id   uuid references public.unit_types (id) on delete set null,
  add column floor          int,
  add column list_price_egp numeric(16,2),
  add column point          jsonb;          -- [lng, lat] on the map
alter table public.units drop constraint units_status_check;
alter table public.units add constraint units_status_check
  check (status in ('available', 'reserved', 'sold', 'ready', 'handed_over', 'blocked'));

-- Cost codes ------------------------------------------------------------------------
-- company_id null = the WE-estate standard set; a company may add its own.
create table public.cost_codes (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references public.companies (id) on delete cascade,
  code        text not null,
  parent_code text,
  name        text not null,
  name_ar     text not null default '',
  sort        int  not null default 0
);
create unique index cost_codes_unique on public.cost_codes
  (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), code);

insert into public.cost_codes (code, parent_code, name, name_ar, sort) values
  ('01', null, 'Land and approvals',            'الأرض والتراخيص',          100),
  ('01.01', '01', 'Land price and instalments',  'ثمن الأرض وأقساطها',      101),
  ('01.02', '01', 'Permits, licences and fees',  'التراخيص والرسوم',        102),
  ('01.03', '01', 'Surveys and soil tests',      'الرفع المساحي والجسات',   103),
  ('02', null, 'Design and consultancy',        'التصميم والاستشارات',      200),
  ('02.01', '02', 'Master plan and architecture','المخطط العام والمعماري',  201),
  ('02.02', '02', 'Structural and MEP design',   'التصميم الإنشائي والكهروميكانيكي', 202),
  ('02.03', '02', 'Supervision consultant',      'استشاري الإشراف',         203),
  ('03', null, 'Infrastructure',                'البنية التحتية',           300),
  ('03.01', '03', 'Earthworks and roads',        'أعمال الحفر والطرق',      301),
  ('03.02', '03', 'Water, sewage and irrigation','المياه والصرف والري',     302),
  ('03.03', '03', 'Power, lighting and telecom', 'الكهرباء والإنارة والاتصالات', 303),
  ('04', null, 'Construction',                  'الإنشاءات',                400),
  ('04.01', '04', 'Substructure',                'الأساسات',                401),
  ('04.02', '04', 'Superstructure',              'الهيكل الخرساني',         402),
  ('04.03', '04', 'Masonry and plaster',         'المباني والمحارة',        403),
  ('04.04', '04', 'Finishes',                    'التشطيبات',               404),
  ('04.05', '04', 'Facades and glazing',         'الواجهات والزجاج',        405),
  ('05', null, 'MEP works',                     'الأعمال الكهروميكانيكية', 500),
  ('05.01', '05', 'Electrical',                  'الكهرباء',                501),
  ('05.02', '05', 'Plumbing and drainage',       'السباكة والصرف',          502),
  ('05.03', '05', 'HVAC',                        'التكييف والتهوية',        503),
  ('05.04', '05', 'Fire fighting',               'مكافحة الحريق',           504),
  ('05.05', '05', 'Lifts',                       'المصاعد',                 505),
  ('06', null, 'Landscape and amenities',       'اللاندسكيب والخدمات',      600),
  ('06.01', '06', 'Hardscape',                   'الهاردسكيب',              601),
  ('06.02', '06', 'Softscape',                   'السوفتسكيب',              602),
  ('06.03', '06', 'Clubhouse, pools and sports', 'النادي وحمامات السباحة والملاعب', 603),
  ('07', null, 'Sales and marketing',           'المبيعات والتسويق',        700),
  ('07.01', '07', 'Marketing and advertising',   'التسويق والإعلان',        701),
  ('07.02', '07', 'Sales commissions',           'عمولات المبيعات',         702),
  ('08', null, 'Overheads',                     'المصروفات العامة',         800),
  ('08.01', '08', 'Project team and site office','فريق المشروع ومكتب الموقع', 801),
  ('08.02', '08', 'Insurance and finance costs', 'التأمين وتكاليف التمويل', 802),
  ('09', null, 'Contingency',                   'الاحتياطي',                900),
  ('10', null, 'Operation and facility management', 'التشغيل وإدارة المرافق', 1000),
  ('10.01', '10', 'Maintenance',                 'الصيانة',                 1001),
  ('10.02', '10', 'Security and cleaning',       'الأمن والنظافة',          1002),
  ('10.03', '10', 'Utilities for common areas',  'مرافق المناطق المشتركة',  1003);

-- Budget ----------------------------------------------------------------------------
create table public.budgets (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  version     int  not null default 1,
  name        text not null default 'Original budget',
  status      text not null default 'draft' check (status in ('draft', 'approved', 'superseded')),
  approved_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (project_id, version)
);

create table public.budget_lines (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  budget_id     uuid not null references public.budgets (id) on delete cascade,
  phase_id      uuid references public.phases (id) on delete cascade,
  cost_code_id  uuid not null references public.cost_codes (id),
  amount_egp    numeric(16,2) not null default 0,
  note          text not null default ''
);
create unique index budget_lines_unique on public.budget_lines
  (budget_id, coalesce(phase_id, '00000000-0000-0000-0000-000000000000'::uuid), cost_code_id);

create table public.budget_revisions (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects (id) on delete cascade,
  budget_id       uuid not null references public.budgets (id) on delete cascade,
  number          int,
  title           text not null,
  reason          text not null default '',
  amount_egp      numeric(16,2) not null default 0,   -- net change, kept from the lines
  status          text not null default 'draft' check (status in ('draft', 'in_review', 'returned', 'approved', 'done', 'rejected')),
  step            int  not null default 1,
  step_entered_at timestamptz not null default now(),
  created_by      uuid references auth.users (id) default auth.uid(),
  created_at      timestamptz not null default now(),
  unique (project_id, number)
);

create table public.budget_revision_lines (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  revision_id   uuid not null references public.budget_revisions (id) on delete cascade,
  phase_id      uuid references public.phases (id) on delete cascade,
  cost_code_id  uuid not null references public.cost_codes (id),
  change_egp    numeric(16,2) not null
);

create or replace function public.budget_revision_total()
returns trigger language plpgsql security definer set search_path = public as $$
declare rid uuid := coalesce(new.revision_id, old.revision_id);
begin
  update public.budget_revisions
     set amount_egp = coalesce((select sum(abs(change_egp)) from public.budget_revision_lines where revision_id = rid), 0)
   where id = rid;
  return null;
end $$;
create trigger budget_revision_total after insert or update or delete on public.budget_revision_lines
  for each row execute function public.budget_revision_total();

-- Applying an approved revision: its lines are added to the budget.
create or replace function public.budget_revision_apply()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'done' and old.status <> 'done' then
    insert into public.budget_lines (project_id, budget_id, phase_id, cost_code_id, amount_egp, note)
    select l.project_id, new.budget_id, l.phase_id, l.cost_code_id, l.change_egp, 'Revision ' || new.number
      from public.budget_revision_lines l where l.revision_id = new.id
    on conflict (budget_id, coalesce(phase_id, '00000000-0000-0000-0000-000000000000'::uuid), cost_code_id)
    do update set amount_egp = public.budget_lines.amount_egp + excluded.amount_egp;
  end if;
  return new;
end $$;
create trigger budget_revision_apply after update on public.budget_revisions
  for each row execute function public.budget_revision_apply();

-- Schedule ---------------------------------------------------------------------------
create table public.schedule_versions (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  name        text not null,
  is_baseline boolean not null default false,
  source      text not null default 'excel' check (source in ('p6', 'msproject', 'excel', 'manual')),
  data_date   date,
  created_at  timestamptz not null default now()
);
create unique index one_baseline_per_project on public.schedule_versions (project_id) where is_baseline;

create table public.activities (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  version_id    uuid not null references public.schedule_versions (id) on delete cascade,
  code          text not null,
  name          text not null,
  wbs           text not null default '',
  phase_id      uuid references public.phases (id) on delete set null,
  building_id   uuid references public.buildings (id) on delete set null,
  cost_code_id  uuid references public.cost_codes (id),
  start_date    date,
  finish_date   date,
  is_milestone  boolean not null default false,
  weight        numeric(12,4) not null default 1,   -- share of the phase's progress (budget or manhours)
  unique (version_id, code)
);

create table public.activity_links (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  pred_id     uuid not null references public.activities (id) on delete cascade,
  succ_id     uuid not null references public.activities (id) on delete cascade,
  kind        text not null default 'FS' check (kind in ('FS', 'SS', 'FF', 'SF')),
  lag_days    int  not null default 0
);

create table public.activity_progress (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  activity_id  uuid not null references public.activities (id) on delete cascade,
  period       date not null,
  actual_pct   numeric(5,2) not null check (actual_pct between 0 and 100),
  note         text not null default '',
  created_by   uuid references auth.users (id) default auth.uid(),
  unique (activity_id, period)
);

create table public.schedule_updates (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects (id) on delete cascade,
  version_id      uuid references public.schedule_versions (id) on delete set null,
  number          int,
  title           text not null,
  data_date       date,
  amount_egp      numeric(16,2) not null default 0,
  status          text not null default 'draft' check (status in ('draft', 'in_review', 'returned', 'approved', 'done', 'rejected')),
  step            int  not null default 1,
  step_entered_at timestamptz not null default now(),
  created_by      uuid references auth.users (id) default auth.uid(),
  created_at      timestamptz not null default now(),
  unique (project_id, number)
);

-- BOQ and contracts -------------------------------------------------------------------
create table public.boq_items (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  phase_id      uuid references public.phases (id) on delete set null,
  building_id   uuid references public.buildings (id) on delete set null,
  cost_code_id  uuid references public.cost_codes (id),
  section       text not null default '',
  code          text not null,
  description   text not null,
  unit          text not null default 'm3',
  quantity      numeric(16,3) not null default 0,
  rate_egp      numeric(16,2) not null default 0,
  amount_egp    numeric(18,2) generated always as (round(quantity * rate_egp, 2)) stored,
  sort          int not null default 0,
  unique (project_id, code)
);

create table public.suppliers (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  name        text not null,
  name_ar     text not null default '',
  kind        text not null default 'contractor' check (kind in ('contractor', 'supplier', 'consultant', 'facility', 'other')),
  tax_id      text not null default '',
  phone       text not null default '',
  email       text not null default '',
  address     text not null default '',
  created_at  timestamptz not null default now(),
  unique (company_id, name)
);

alter table public.contracts
  add column supplier_id      uuid references public.suppliers (id),
  add column kind             text not null default 'main'
             check (kind in ('main', 'subcontract', 'supply', 'consultancy', 'facility', 'other')),
  add column cost_code_id     uuid references public.cost_codes (id),
  add column advance_pct      numeric(5,2) not null default 0,
  add column penalty_cap_pct  numeric(5,2) not null default 10,
  add column status           text not null default 'active' check (status in ('draft', 'active', 'completed', 'closed', 'terminated')),
  add column signed_on        date;

create table public.contract_items (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  contract_id  uuid not null references public.contracts (id) on delete cascade,
  boq_item_id  uuid references public.boq_items (id) on delete set null,
  code         text not null default '',
  description  text not null,
  unit         text not null default '',
  quantity     numeric(16,3) not null default 0,
  rate_egp     numeric(16,2) not null default 0,
  amount_egp   numeric(18,2) generated always as (round(quantity * rate_egp, 2)) stored
);

create table public.certificate_lines (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects (id) on delete cascade,
  certificate_id   uuid not null references public.payment_certificates (id) on delete cascade,
  contract_item_id uuid not null references public.contract_items (id),
  previous_qty     numeric(16,3) not null default 0,
  this_qty         numeric(16,3) not null default 0,
  rate_egp         numeric(16,2) not null default 0,
  amount_egp       numeric(18,2) generated always as (round(this_qty * rate_egp, 2)) stored,
  unique (certificate_id, contract_item_id)
);

-- Lines decide the certificate's gross amount when there are any.
create or replace function public.certificate_gross()
returns trigger language plpgsql security definer set search_path = public as $$
declare cid uuid := coalesce(new.certificate_id, old.certificate_id); c public.contracts; g numeric;
begin
  select coalesce(sum(amount_egp), 0) into g from public.certificate_lines where certificate_id = cid;
  select ct.* into c from public.contracts ct join public.payment_certificates pc on pc.contract_id = ct.id where pc.id = cid;
  update public.payment_certificates
     set gross_egp = g,
         retention_egp = round(g * c.retention_pct / 100, 2),
         advance_recovery_egp = round(g * c.advance_pct / 100, 2)
   where id = cid;
  return null;
end $$;
create trigger certificate_gross after insert or update or delete on public.certificate_lines
  for each row execute function public.certificate_gross();

create table public.variation_orders (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects (id) on delete cascade,
  contract_id      uuid references public.contracts (id) on delete set null,
  cost_code_id     uuid references public.cost_codes (id),
  number           int,
  title            text not null,
  reason           text not null default 'client_change'
                   check (reason in ('client_change', 'design_change', 'site_condition', 'design_error', 'authority', 'other')),
  description      text not null default '',
  amount_egp       numeric(16,2) not null default 0,   -- cost impact; negative for an omission
  time_impact_days int not null default 0,
  status           text not null default 'draft' check (status in ('draft', 'in_review', 'returned', 'approved', 'done', 'rejected')),
  step             int  not null default 1,
  step_entered_at  timestamptz not null default now(),
  created_by       uuid references auth.users (id) default auth.uid(),
  created_at       timestamptz not null default now(),
  unique (project_id, number)
);

-- Procurement -------------------------------------------------------------------------
create table public.purchase_requests (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects (id) on delete cascade,
  cost_code_id    uuid references public.cost_codes (id),
  supplier_id     uuid references public.suppliers (id),
  number          int,
  title           text not null,
  needed_by       date,
  amount_egp      numeric(16,2) not null default 0,
  status          text not null default 'draft' check (status in ('draft', 'in_review', 'returned', 'approved', 'done', 'rejected')),
  step            int  not null default 1,
  step_entered_at timestamptz not null default now(),
  created_by      uuid references auth.users (id) default auth.uid(),
  created_at      timestamptz not null default now(),
  unique (project_id, number)
);

create table public.pr_lines (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  pr_id        uuid not null references public.purchase_requests (id) on delete cascade,
  description  text not null,
  unit         text not null default 'no',
  quantity     numeric(16,3) not null default 1,
  rate_egp     numeric(16,2) not null default 0,
  amount_egp   numeric(18,2) generated always as (round(quantity * rate_egp, 2)) stored
);

create or replace function public.pr_total()
returns trigger language plpgsql security definer set search_path = public as $$
declare rid uuid := coalesce(new.pr_id, old.pr_id);
begin
  update public.purchase_requests set amount_egp = coalesce((select sum(amount_egp) from public.pr_lines where pr_id = rid), 0) where id = rid;
  return null;
end $$;
create trigger pr_total after insert or update or delete on public.pr_lines
  for each row execute function public.pr_total();

create table public.purchase_orders (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  pr_id         uuid references public.purchase_requests (id) on delete set null,
  supplier_id   uuid not null references public.suppliers (id),
  cost_code_id  uuid references public.cost_codes (id),
  number        text not null,
  amount_egp    numeric(16,2) not null default 0,
  status        text not null default 'issued' check (status in ('issued', 'partly_received', 'received', 'closed', 'cancelled')),
  issued_on     date not null default current_date,
  delivery_date date,
  unique (project_id, number)
);

create table public.tenders (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null references public.projects (id) on delete cascade,
  number               text not null,
  title                text not null,
  scope                text not null default '',
  status               text not null default 'open' check (status in ('draft', 'open', 'evaluating', 'awarded', 'cancelled')),
  closes_on            date,
  awarded_supplier_id  uuid references public.suppliers (id),
  contract_id          uuid references public.contracts (id),
  unique (project_id, number)
);

create table public.bids (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects (id) on delete cascade,
  tender_id       uuid not null references public.tenders (id) on delete cascade,
  supplier_id     uuid not null references public.suppliers (id),
  amount_egp      numeric(16,2) not null,
  duration_days   int,
  technical_score numeric(5,2),
  notes           text not null default '',
  submitted_on    date not null default current_date,
  unique (tender_id, supplier_id)
);

create table public.payments_out (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects (id) on delete cascade,
  certificate_id  uuid references public.payment_certificates (id) on delete set null,
  po_id           uuid references public.purchase_orders (id) on delete set null,
  supplier_id     uuid references public.suppliers (id),
  cost_code_id    uuid references public.cost_codes (id),
  amount_egp      numeric(16,2) not null,
  paid_on         date not null default current_date,
  reference       text not null default '',
  created_by      uuid references auth.users (id) default auth.uid()
);

-- Site ------------------------------------------------------------------------------------
create table public.site_reports (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  phase_id     uuid references public.phases (id) on delete set null,
  report_date  date not null default current_date,
  weather      text not null default '',
  manpower     int  not null default 0,
  equipment    text not null default '',
  work_done    text not null default '',
  issues       text not null default '',
  created_by   uuid references auth.users (id) default auth.uid(),
  created_at   timestamptz not null default now()
);

create table public.ncrs (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  contract_id  uuid references public.contracts (id) on delete set null,
  unit_id      uuid references public.units (id) on delete set null,
  number       int,
  title        text not null,
  description  text not null default '',
  severity     text not null default 'minor' check (severity in ('minor', 'major', 'critical')),
  status       text not null default 'open' check (status in ('open', 'fixed', 'closed')),
  due_on       date,
  created_by   uuid references auth.users (id) default auth.uid(),
  created_at   timestamptz not null default now()
);

create table public.attachments (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  doc_type    text not null,
  doc_id      uuid not null,
  name        text not null,
  url         text not null,
  taken_at    timestamptz,
  lat         double precision,
  lng         double precision,
  created_by  uuid references auth.users (id) default auth.uid(),
  created_at  timestamptz not null default now()
);
create index on public.attachments (doc_type, doc_id);

-- Sales ---------------------------------------------------------------------------------
create table public.customers (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies (id) on delete cascade,
  full_name    text not null,
  national_id  text not null default '',
  phone        text not null default '',
  email        text not null default '',
  address      text not null default '',
  nationality  text not null default '',
  user_id      uuid references auth.users (id) on delete set null,   -- set when the owner app is used
  created_at   timestamptz not null default now()
);

create table public.price_lists (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  name        text not null,
  valid_from  date not null default current_date,
  valid_to    date
);

create table public.price_list_items (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects (id) on delete cascade,
  price_list_id  uuid not null references public.price_lists (id) on delete cascade,
  unit_type_id   uuid references public.unit_types (id) on delete cascade,
  price_per_m2   numeric(16,2),
  price_egp      numeric(16,2)
);

create table public.unit_sales (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects (id) on delete cascade,
  unit_id          uuid not null references public.units (id),
  customer_id      uuid not null references public.customers (id),
  number           int,
  title            text not null default '',
  price_egp        numeric(16,2) not null,
  discount_egp     numeric(16,2) not null default 0,
  amount_egp       numeric(16,2) generated always as (price_egp - discount_egp) stored,
  down_payment_egp numeric(16,2) not null default 0,
  years            int not null default 8,
  signed_on        date,
  status           text not null default 'draft' check (status in ('draft', 'in_review', 'returned', 'approved', 'done', 'rejected')),
  step             int  not null default 1,
  step_entered_at  timestamptz not null default now(),
  created_by       uuid references auth.users (id) default auth.uid(),
  created_at       timestamptz not null default now(),
  unique (project_id, number)
);

create table public.instalments (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  sale_id      uuid not null references public.unit_sales (id) on delete cascade,
  seq          int  not null,
  due_date     date not null,
  amount_egp   numeric(16,2) not null,
  paid_egp     numeric(16,2) not null default 0,
  paid_on      date,
  unique (sale_id, seq)
);

-- A sale moves the unit: reserved while in progress, sold when signed,
-- available again if rejected. A signed sale gets quarterly instalments.
create or replace function public.unit_sale_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare q int; i int; rest numeric;
begin
  if tg_op = 'INSERT' then
    update public.units set status = 'reserved' where id = new.unit_id and status = 'available';
    return new;
  end if;
  if new.status = 'done' and old.status <> 'done' then
    update public.units set status = 'sold' where id = new.unit_id;
    update public.unit_sales set signed_on = coalesce(signed_on, current_date) where id = new.id;
    if not exists (select 1 from public.instalments where sale_id = new.id) then
      insert into public.instalments (project_id, sale_id, seq, due_date, amount_egp)
      values (new.project_id, new.id, 0, current_date, new.down_payment_egp);
      q := greatest(new.years * 4, 1);
      rest := new.price_egp - new.discount_egp - new.down_payment_egp;
      for i in 1..q loop
        insert into public.instalments (project_id, sale_id, seq, due_date, amount_egp)
        values (new.project_id, new.id, i, (current_date + make_interval(months => 3 * i))::date, round(rest / q, 2));
      end loop;
    end if;
  elsif new.status = 'rejected' and old.status <> 'rejected' then
    update public.units set status = 'available' where id = new.unit_id and status = 'reserved';
  end if;
  return new;
end $$;
create trigger unit_sale_status after insert or update of status on public.unit_sales
  for each row execute function public.unit_sale_status();

-- Handover ----------------------------------------------------------------------------
create table public.checklist_templates (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references public.companies (id) on delete cascade,
  kind        text not null check (kind in ('unit_readiness', 'handover', 'inspection')),
  name        text not null,
  items       jsonb not null default '[]'
);
insert into public.checklist_templates (kind, name, items) values
  ('unit_readiness', 'Unit readiness (standard)', '["Civil works complete","Doors and windows installed","Sanitary ware installed","Kitchen installed","Electrical tested","Plumbing pressure-tested","Air conditioning tested","Paint final coat","Meters installed","Final cleaning"]'),
  ('handover', 'Handover with owner (standard)', '["Owner walk-through done","Snags recorded","Keys handed over","Meter readings recorded","Handover certificate signed","Owner manual and warranties given"]');

create table public.unit_checks (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  unit_id     uuid not null references public.units (id) on delete cascade,
  kind        text not null default 'unit_readiness',
  item        text not null,
  ok          boolean not null default false,
  note        text not null default '',
  checked_by  uuid references auth.users (id) default auth.uid(),
  checked_at  timestamptz not null default now(),
  unique (unit_id, kind, item)
);

create table public.snags (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  unit_id      uuid not null references public.units (id) on delete cascade,
  contract_id  uuid references public.contracts (id) on delete set null,
  location     text not null default '',
  description  text not null,
  photo_url    text not null default '',
  status       text not null default 'open' check (status in ('open', 'fixed', 'verified')),
  created_by   uuid references auth.users (id) default auth.uid(),
  created_at   timestamptz not null default now(),
  fixed_at     timestamptz
);

create table public.unit_handovers (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects (id) on delete cascade,
  unit_id          uuid not null references public.units (id),
  customer_id      uuid references public.customers (id),
  number           int,
  title            text not null default '',
  amount_egp       numeric(16,2) not null default 0,
  scheduled_at     timestamptz,
  handed_over_at   timestamptz,
  meter_electric   text not null default '',
  meter_water      text not null default '',
  meter_gas        text not null default '',
  keys             int  not null default 0,
  notes            text not null default '',
  status           text not null default 'draft' check (status in ('draft', 'in_review', 'returned', 'approved', 'done', 'rejected')),
  step             int  not null default 1,
  step_entered_at  timestamptz not null default now(),
  created_by       uuid references auth.users (id) default auth.uid(),
  created_at       timestamptz not null default now(),
  unique (project_id, number)
);

-- Handed over: the unit and its owner record follow, and warranty starts.
create or replace function public.unit_handover_done()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'done' and old.status <> 'done' then
    update public.units set status = 'handed_over' where id = new.unit_id;
    update public.unit_handovers set handed_over_at = coalesce(handed_over_at, now()) where id = new.id;
    if new.customer_id is not null and not exists
       (select 1 from public.unit_occupants where unit_id = new.unit_id and customer_id = new.customer_id and to_date is null) then
      insert into public.unit_occupants (project_id, unit_id, customer_id, role, from_date)
      values (new.project_id, new.unit_id, new.customer_id, 'owner', current_date);
    end if;
  elsif new.step >= 3 and old.step < 3 then
    update public.units set status = 'ready' where id = new.unit_id and status in ('sold', 'available', 'reserved');
  end if;
  return new;
end $$;

-- Owners and community ----------------------------------------------------------------
create table public.unit_occupants (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  unit_id      uuid not null references public.units (id) on delete cascade,
  customer_id  uuid not null references public.customers (id) on delete cascade,
  role         text not null default 'owner' check (role in ('owner', 'co_owner', 'tenant', 'family')),
  from_date    date not null default current_date,
  to_date      date
);

create trigger unit_handover_done after update on public.unit_handovers
  for each row execute function public.unit_handover_done();

create table public.service_charges (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  unit_id     uuid not null references public.units (id) on delete cascade,
  period      date not null,
  amount_egp  numeric(16,2) not null,
  paid_egp    numeric(16,2) not null default 0,
  paid_on     date,
  unique (unit_id, period)
);

create table public.announcements (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  title         text not null,
  body          text not null default '',
  published_at  timestamptz not null default now(),
  created_by    uuid references auth.users (id) default auth.uid()
);

create table public.owner_requests (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects (id) on delete cascade,
  unit_id          uuid references public.units (id) on delete set null,
  customer_id      uuid references public.customers (id) on delete set null,
  number           int,
  kind             text not null default 'other' check (kind in ('modification', 'complaint', 'move_in', 'move_out', 'document', 'other')),
  title            text not null,
  description      text not null default '',
  amount_egp       numeric(16,2) not null default 0,
  status           text not null default 'draft' check (status in ('draft', 'in_review', 'returned', 'approved', 'done', 'rejected')),
  step             int  not null default 1,
  step_entered_at  timestamptz not null default now(),
  created_by       uuid references auth.users (id) default auth.uid(),
  created_at       timestamptz not null default now(),
  unique (project_id, number)
);

create table public.gate_passes (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  unit_id       uuid references public.units (id) on delete set null,
  visitor_name  text not null,
  kind          text not null default 'visitor' check (kind in ('visitor', 'delivery', 'contractor', 'moving')),
  plate         text not null default '',
  valid_from    timestamptz not null default now(),
  valid_to      timestamptz not null default now() + interval '1 day',
  created_by    uuid references auth.users (id) default auth.uid()
);

-- Facility management ------------------------------------------------------------------
create table public.assets (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects (id) on delete cascade,
  building_id     uuid references public.buildings (id) on delete set null,
  unit_id         uuid references public.units (id) on delete set null,
  contract_id     uuid references public.contracts (id) on delete set null,
  category        text not null default 'other'
                  check (category in ('lift', 'pump', 'generator', 'hvac', 'fire', 'electrical', 'irrigation', 'pool', 'landscape', 'security', 'other')),
  tag             text not null,
  name            text not null,
  manufacturer    text not null default '',
  model           text not null default '',
  install_date    date,
  warranty_until  date,
  status          text not null default 'working' check (status in ('working', 'faulty', 'out_of_service', 'retired')),
  unique (project_id, tag)
);

create table public.pm_plans (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  asset_id    uuid not null references public.assets (id) on delete cascade,
  task        text not null,
  every_days  int  not null default 30,
  next_due    date not null default current_date,
  last_done   date
);

create table public.work_orders (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null references public.projects (id) on delete cascade,
  unit_id              uuid references public.units (id) on delete set null,
  asset_id             uuid references public.assets (id) on delete set null,
  assigned_contract_id uuid references public.contracts (id) on delete set null,
  customer_id          uuid references public.customers (id) on delete set null,
  number               int,
  source               text not null default 'owner' check (source in ('owner', 'inspection', 'preventive', 'security', 'staff')),
  priority             text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  title                text not null,
  description          text not null default '',
  is_warranty          boolean not null default false,
  amount_egp           numeric(16,2) not null default 0,   -- cost of the fix
  due_at               timestamptz,
  status               text not null default 'draft' check (status in ('draft', 'in_review', 'returned', 'approved', 'done', 'rejected')),
  step                 int  not null default 1,
  step_entered_at      timestamptz not null default now(),
  created_by           uuid references auth.users (id) default auth.uid(),
  created_at           timestamptz not null default now(),
  unique (project_id, number)
);

-- Templates for the setup wizard -----------------------------------------------------------
create table public.project_templates (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references public.companies (id) on delete cascade,
  name        text not null,
  project_type text not null default 'compound',
  payload     jsonb not null default '{}'
);
insert into public.project_templates (name, project_type, payload) values
  ('Villas compound', 'compound', '{"phases":["Phase 01","Phase 02","Phase 03"],"unit_types":[{"code":"V-A","name":"Standalone villa","category":"villa","area_m2":320,"bedrooms":5},{"code":"TW","name":"Twin house","category":"twin_house","area_m2":260,"bedrooms":4},{"code":"TH","name":"Townhouse","category":"townhouse","area_m2":210,"bedrooms":3}],"cost_codes":["01","02","03","04","05","06","07","08","09"]}'),
  ('Apartments compound', 'apartments', '{"phases":["Phase 01","Phase 02"],"unit_types":[{"code":"A2","name":"Apartment, 2 bedrooms","category":"apartment","area_m2":120,"bedrooms":2},{"code":"A3","name":"Apartment, 3 bedrooms","category":"apartment","area_m2":160,"bedrooms":3},{"code":"DX","name":"Duplex","category":"duplex","area_m2":230,"bedrooms":4},{"code":"PH","name":"Penthouse","category":"penthouse","area_m2":200,"bedrooms":3}],"cost_codes":["01","02","03","04","05","06","07","08","09"]}'),
  ('Mixed use', 'mixed_use', '{"phases":["Residential","Commercial"],"unit_types":[{"code":"A2","name":"Apartment, 2 bedrooms","category":"apartment","area_m2":120,"bedrooms":2},{"code":"RT","name":"Retail","category":"retail","area_m2":80},{"code":"OF","name":"Office","category":"office","area_m2":100},{"code":"CL","name":"Clinic","category":"clinic","area_m2":60}],"cost_codes":["01","02","03","04","05","06","07","08","09"]}'),
  ('Coastal resort', 'coastal', '{"phases":["Phase 01","Phase 02"],"unit_types":[{"code":"CH","name":"Chalet","category":"chalet","area_m2":90,"bedrooms":2},{"code":"TV","name":"Twin villa","category":"twin_house","area_m2":220,"bedrooms":4},{"code":"SV","name":"Standalone villa","category":"villa","area_m2":300,"bedrooms":5}],"cost_codes":["01","02","03","04","05","06","07","08","09"]}'),
  ('Commercial mall', 'commercial', '{"phases":["Mall"],"unit_types":[{"code":"RT","name":"Retail","category":"retail","area_m2":80},{"code":"FB","name":"Food and beverage","category":"retail","area_m2":150},{"code":"OF","name":"Office","category":"office","area_m2":120}],"cost_codes":["01","02","03","04","05","06","07","08","09"]}');

-- Workflow triggers on every workflow table ------------------------------------------------
do $$
declare t record;
begin
  for t in select doc_type, table_name from public.workflow_docs where doc_type <> 'payment_certificate' loop
    execute format('create trigger wf_before_insert before insert on public.%I for each row execute function public.wf_before_insert()', t.table_name);
    execute format('create trigger wf_after_insert after insert on public.%I for each row execute function public.wf_after_insert(%L)', t.table_name, t.doc_type);
  end loop;
end $$;
