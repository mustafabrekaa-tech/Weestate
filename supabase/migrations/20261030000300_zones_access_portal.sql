-- Zones between phases and buildings, finer access control (extra roles,
-- view-only people, project access, sections hidden per department), a
-- saved site layout, and the WE-estate staff portal (company status, plan,
-- limits and contacts).

-- Zones --------------------------------------------------------------------------------------------
create table if not exists public.zones (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  phase_id   uuid references public.phases (id) on delete set null,
  code       text not null,
  name       text not null default '',
  boundary   jsonb,
  unique (project_id, code)
);
alter table public.zones enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'project reads' and tablename = 'zones') then
    create policy "project reads" on public.zones for select using (public.can_see_project(project_id));
  end if;
  if not exists (select 1 from pg_policies where policyname = 'setup writes' and tablename = 'zones') then
    create policy "setup writes" on public.zones for all
      using (public.can_see_project(project_id) and public.in_department('pm', 'tech_office', 'cost_control'))
      with check (public.can_see_project(project_id) and public.in_department('pm', 'tech_office', 'cost_control'));
  end if;
end $$;
grant select, insert, update, delete on public.zones to authenticated;

alter table public.buildings add column if not exists zone_id uuid references public.zones (id) on delete set null;
alter table public.units     add column if not exists zone_id uuid references public.zones (id) on delete set null;
create index if not exists buildings_zone on public.buildings (zone_id);
create index if not exists units_zone on public.units (zone_id);
create index if not exists units_building on public.units (building_id);

-- Access -------------------------------------------------------------------------------------------
alter table public.profiles
  add column if not exists read_only    boolean not null default false,
  add column if not exists all_projects boolean not null default true,
  add column if not exists extra_roles  text[]  not null default '{}';

create table if not exists public.project_access (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  primary key (user_id, project_id)
);
alter table public.project_access enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'own or admin reads' and tablename = 'project_access') then
    create policy "own or admin reads" on public.project_access for select
      using (user_id = auth.uid() or (public.is_admin() and public.in_company(public.project_company(project_id))));
  end if;
  if not exists (select 1 from pg_policies where policyname = 'admin writes' and tablename = 'project_access') then
    create policy "admin writes" on public.project_access for all
      using (public.is_admin() and public.in_company(public.project_company(project_id)))
      with check (public.is_admin() and public.in_company(public.project_company(project_id)));
  end if;
end $$;
grant select, insert, delete on public.project_access to authenticated;

-- Sections of the app a department does not see.
create table if not exists public.hidden_modules (
  company_id uuid not null references public.companies (id) on delete cascade,
  department text not null references public.departments (code) on delete cascade,
  module     text not null,
  primary key (company_id, department, module)
);
alter table public.hidden_modules enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'company reads' and tablename = 'hidden_modules') then
    create policy "company reads" on public.hidden_modules for select using (public.in_company(company_id));
  end if;
  if not exists (select 1 from pg_policies where policyname = 'admin writes' and tablename = 'hidden_modules') then
    create policy "admin writes" on public.hidden_modules for all
      using (public.is_admin() and public.in_company(company_id))
      with check (public.is_admin() and public.in_company(company_id));
  end if;
end $$;
grant select, insert, delete on public.hidden_modules to authenticated;

-- Acting for a department: the main one or any extra role. View-only people act for none.
create or replace function public.in_department(variadic codes text[])
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select (p.is_admin or p.is_platform_admin)
        or (not p.read_only and (p.department = any (codes) or p.extra_roles && codes))
      from public.profiles p where p.id = auth.uid()), false)
$$;

-- Projects: everyone in the company, unless an admin limited the person to some.
create or replace function public.can_see_project(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin()
      or exists (
        select 1 from public.projects pr, public.profiles me
         where pr.id = p and me.id = auth.uid() and pr.company_id = me.company_id
           and (me.all_projects or me.is_admin
                or exists (select 1 from public.project_access a where a.user_id = me.id and a.project_id = p)))
$$;

create or replace function public.profiles_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.is_platform_admin is distinct from old.is_platform_admin and not public.is_platform_admin() then
    raise exception 'Only WE-estate staff can change this';
  end if;
  if (new.department is distinct from old.department or new.is_admin is distinct from old.is_admin
      or new.company_id is distinct from old.company_id or new.read_only is distinct from old.read_only
      or new.all_projects is distinct from old.all_projects or new.extra_roles is distinct from old.extra_roles)
     and not public.is_admin() then
    raise exception 'Only an admin can change roles and access';
  end if;
  if new.company_id is distinct from old.company_id and not public.is_platform_admin()
     and old.company_id is not null then
    raise exception 'People cannot be moved between companies';
  end if;
  return new;
end $$;

-- Lost phone: an admin clears someone's authenticator so they set it up again.
create or replace function public.admin_reset_mfa(p_user uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare comp uuid;
begin
  select company_id into comp from public.profiles where id = p_user;
  if not (public.is_admin() and public.in_company(comp)) then raise exception 'Only an admin of this company can do that'; end if;
  -- Unverified factors no longer count; the person sets up a new one at sign-in.
  update auth.mfa_factors set status = 'unverified', updated_at = now() where user_id = p_user;
end $$;
revoke execute on function public.admin_reset_mfa(uuid) from public, anon;
grant execute on function public.admin_reset_mfa(uuid) to authenticated;

-- Site layout ---------------------------------------------------------------------------------------
-- Saves a suggested or edited layout in one go:
-- {"phases":[{"id","ring"}], "zones":[{"id","ring"}], "units":[{"id","ring"}],
--  "buildings":[{"id"?, "code", "phase_id", "zone_id", "floors", "ring", "units":[{"id","floor"}]}]}
create or replace function public.save_layout(p_project uuid, p_data jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare
  r jsonb; u jsonb; bid uuid; n int := 0;
begin
  if not public.can_see_project(p_project) then raise exception 'Not allowed'; end if;
  if not public.in_department('pm', 'tech_office', 'cost_control') then
    raise exception 'Only PM, Technical office or Cost control can change the site layout';
  end if;
  for r in select * from jsonb_array_elements(coalesce(p_data -> 'phases', '[]')) loop
    update public.phases set boundary = r -> 'ring' where id = (r ->> 'id')::uuid and project_id = p_project;
    n := n + 1;
  end loop;
  for r in select * from jsonb_array_elements(coalesce(p_data -> 'zones', '[]')) loop
    update public.zones set boundary = r -> 'ring' where id = (r ->> 'id')::uuid and project_id = p_project;
    n := n + 1;
  end loop;
  for r in select * from jsonb_array_elements(coalesce(p_data -> 'units', '[]')) loop
    update public.units set footprint = r -> 'ring' where id = (r ->> 'id')::uuid and project_id = p_project;
    n := n + 1;
  end loop;
  for r in select * from jsonb_array_elements(coalesce(p_data -> 'buildings', '[]')) loop
    if r ->> 'id' is not null then
      bid := (r ->> 'id')::uuid;
      update public.buildings set footprint = r -> 'ring' where id = bid and project_id = p_project;
    else
      insert into public.buildings (project_id, phase_id, zone_id, code, name, floors, footprint)
      values (p_project, nullif(r ->> 'phase_id', '')::uuid, nullif(r ->> 'zone_id', '')::uuid, r ->> 'code', r ->> 'code',
              coalesce(nullif(r ->> 'floors', '')::int, 1), r -> 'ring')
      on conflict (project_id, code) do update set footprint = excluded.footprint
      returning id into bid;
    end if;
    for u in select * from jsonb_array_elements(coalesce(r -> 'units', '[]')) loop
      update public.units set building_id = bid, floor = coalesce(floor, nullif(u ->> 'floor', '')::int)
       where id = (u ->> 'id')::uuid and project_id = p_project;
    end loop;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.save_layout(uuid, jsonb) from public, anon;
grant execute on function public.save_layout(uuid, jsonb) to authenticated;

-- Staff portal --------------------------------------------------------------------------------------
alter table public.companies
  add column if not exists status        text not null default 'active',
  add column if not exists plan          text not null default 'standard',
  add column if not exists max_users     int,
  add column if not exists max_projects  int,
  add column if not exists trial_ends    date,
  add column if not exists contact_name  text not null default '',
  add column if not exists contact_email text not null default '',
  add column if not exists contact_phone text not null default '',
  add column if not exists staff_notes   text not null default '';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'companies_status_check') then
    alter table public.companies add constraint companies_status_check check (status in ('trial', 'active', 'suspended'));
  end if;
end $$;

-- Addresses, status, plan and limits are WE-estate's to set.
create or replace function public.companies_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin()
     and (new.slug is distinct from old.slug or new.domain is distinct from old.domain or new.domain_status is distinct from old.domain_status
          or new.status is distinct from old.status or new.plan is distinct from old.plan or new.max_users is distinct from old.max_users
          or new.max_projects is distinct from old.max_projects or new.trial_ends is distinct from old.trial_ends
          or new.staff_notes is distinct from old.staff_notes) then
    raise exception 'Only WE-estate staff can change this';
  end if;
  if new.brand_color <> '' and new.brand_color !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'Colour must look like #8a6420';
  end if;
  return new;
end $$;

create or replace function public.portal_companies()
returns table (id uuid, slug text, name text, created_at timestamptz, people int, projects int, units int,
               domain text, domain_status text, logo_url text, brand_color text, status text, plan text,
               max_users int, max_projects int, trial_ends date, contact_name text, contact_email text,
               contact_phone text, staff_notes text, last_active timestamptz)
language sql stable security definer set search_path = public, auth as $$
  select c.id, c.slug, c.name, c.created_at,
         (select count(*)::int from public.profiles p where p.company_id = c.id),
         (select count(*)::int from public.projects p where p.company_id = c.id),
         (select count(*)::int from public.units u join public.projects p on p.id = u.project_id where p.company_id = c.id),
         coalesce(c.domain, ''), c.domain_status, coalesce(c.logo_url, ''), c.brand_color, c.status, c.plan,
         c.max_users, c.max_projects, c.trial_ends, c.contact_name, c.contact_email, c.contact_phone, c.staff_notes,
         (select max(u.last_sign_in_at) from auth.users u join public.profiles p on p.id = u.id where p.company_id = c.id)
    from public.companies c
   where public.is_platform_admin()
   order by c.name
$$;
revoke execute on function public.portal_companies() from public, anon;
grant execute on function public.portal_companies() to authenticated;

-- People of any company, for staff.
create or replace function public.portal_people(p_company uuid)
returns table (id uuid, email text, full_name text, department text, is_admin boolean, last_sign_in timestamptz, has_mfa boolean)
language sql stable security definer set search_path = public, auth as $$
  select p.id, p.email, p.full_name, p.department, p.is_admin, u.last_sign_in_at,
         exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified')
    from public.profiles p join auth.users u on u.id = p.id
   where public.is_platform_admin() and p.company_id = p_company
   order by p.is_admin desc, p.email
$$;
revoke execute on function public.portal_people(uuid) from public, anon;
grant execute on function public.portal_people(uuid) to authenticated;

-- The signed-in person's workspace state, for blocking suspended workspaces.
create or replace function public.my_workspace()
returns table (status text, trial_ends date, slug text, domain text)
language sql stable security definer set search_path = public as $$
  select c.status, c.trial_ends, c.slug, coalesce(c.domain, '')
    from public.companies c join public.profiles p on p.company_id = c.id
   where p.id = auth.uid()
$$;
revoke execute on function public.my_workspace() from public, anon;
grant execute on function public.my_workspace() to authenticated;

-- People with MFA state for company admins.
create or replace function public.company_people_mfa()
returns table (id uuid, has_mfa boolean, last_sign_in timestamptz)
language sql stable security definer set search_path = public, auth as $$
  select p.id, exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified'), u.last_sign_in_at
    from public.profiles p join auth.users u on u.id = p.id
   where public.is_admin() and public.in_company(p.company_id)
$$;
revoke execute on function public.company_people_mfa() from public, anon;
grant execute on function public.company_people_mfa() to authenticated;
