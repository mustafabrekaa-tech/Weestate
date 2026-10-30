-- WE-estate staff portal: plans and prices, overview figures, and a search
-- across everyone on the platform.

create table if not exists public.plans (
  code          text primary key check (code ~ '^[a-z0-9-]{2,30}$'),
  name          text not null,
  price_egp     numeric(12,2) not null default 0,   -- a month
  max_users     int,
  max_projects  int,
  features      text not null default '',
  sort          int not null default 0,
  active        boolean not null default true
);
insert into public.plans (code, name, price_egp, max_users, max_projects, features, sort) values
  ('starter',    'Starter',    5000,  15,   1,    'One project, core workflows, Excel import', 1),
  ('standard',   'Standard',   15000, 60,   5,    'Up to five projects, 3D site, all workflows, own web address', 2),
  ('enterprise', 'Enterprise', 40000, null, null, 'Unlimited projects and people, own domain, priority support', 3)
on conflict (code) do nothing;
alter table public.plans enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'everyone reads' and tablename = 'plans') then
    create policy "everyone reads" on public.plans for select using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'staff edit' and tablename = 'plans') then
    create policy "staff edit" on public.plans for all using (public.is_platform_admin()) with check (public.is_platform_admin());
  end if;
end $$;
grant select on public.plans to anon, authenticated;
grant insert, update on public.plans to authenticated;

-- Figures for the portal overview over the last p_days days.
create or replace function public.portal_stats(p_days int)
returns table (people int, signed_in int, without_mfa int, projects int, units int, new_companies int, staff int)
language sql stable security definer set search_path = public, auth as $$
  select
    (select count(*)::int from public.profiles where company_id is not null),
    (select count(*)::int from auth.users u join public.profiles p on p.id = u.id
      where p.company_id is not null and u.last_sign_in_at > now() - make_interval(days => p_days)),
    (select count(*)::int from public.profiles p where p.company_id is not null
      and not exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified')),
    (select count(*)::int from public.projects),
    (select count(*)::int from public.units),
    (select count(*)::int from public.companies where created_at > now() - make_interval(days => p_days)),
    (select count(*)::int from public.profiles where is_platform_admin)
  where public.is_platform_admin()
$$;
revoke execute on function public.portal_stats(int) from public, anon;
grant execute on function public.portal_stats(int) to authenticated;

-- Everyone on the platform, searchable by name, email or company.
create or replace function public.portal_users(p_q text, p_staff boolean default false)
returns table (id uuid, email text, full_name text, company_id uuid, company text, department text,
               is_admin boolean, is_platform_admin boolean, last_sign_in timestamptz, has_mfa boolean)
language sql stable security definer set search_path = public, auth as $$
  select p.id, p.email, p.full_name, p.company_id, coalesce(c.name, ''), p.department, p.is_admin, p.is_platform_admin,
         u.last_sign_in_at, exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified')
    from public.profiles p join auth.users u on u.id = p.id left join public.companies c on c.id = p.company_id
   where public.is_platform_admin()
     and (not p_staff or p.is_platform_admin)
     and (coalesce(p_q, '') = '' or (p.full_name || ' ' || p.email || ' ' || coalesce(c.name, '')) ilike '%' || p_q || '%')
   order by u.last_sign_in_at desc nulls last
   limit 300
$$;
revoke execute on function public.portal_users(text, boolean) from public, anon;
grant execute on function public.portal_users(text, boolean) to authenticated;
