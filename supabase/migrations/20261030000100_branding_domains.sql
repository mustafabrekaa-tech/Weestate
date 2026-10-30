-- Branding for WE-estate itself and for each company, company web addresses
-- (name.weestate.app or the company's own domain), and the company switch
-- that makes authenticator-app codes compulsory.

alter table public.companies
  add column if not exists brand_color   text not null default '',
  add column if not exists tagline       text not null default '',
  add column if not exists domain_status text not null default '',
  add column if not exists require_mfa   boolean not null default false;

create unique index if not exists companies_domain_key on public.companies (lower(domain)) where domain is not null and domain <> '';

-- Web addresses are WE-estate's to give out, so only WE-estate staff change them.
create or replace function public.companies_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin()
     and (new.slug is distinct from old.slug or new.domain is distinct from old.domain or new.domain_status is distinct from old.domain_status) then
    raise exception 'Only WE-estate staff can change a company web address';
  end if;
  if new.brand_color <> '' and new.brand_color !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'Colour must look like #8a6420';
  end if;
  return new;
end $$;
create or replace trigger companies_guard before update on public.companies for each row execute function public.companies_guard();

-- One row: how WE-estate presents itself.
create table if not exists public.platform_settings (
  id            boolean primary key default true check (id),
  app_name      text not null default 'WE-estate',
  tagline       text not null default 'Every department enters its own work. WE-estate shows where every project stands.',
  logo_url      text not null default '',
  brand_color   text not null default '' check (brand_color = '' or brand_color ~ '^#[0-9a-fA-F]{6}$'),
  support_email text not null default '',
  root_domain   text not null default 'weestate.app',
  updated_at    timestamptz not null default now()
);
insert into public.platform_settings (id) values (true) on conflict do nothing;
alter table public.platform_settings enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'everyone reads' and tablename = 'platform_settings') then
    create policy "everyone reads" on public.platform_settings for select using (true);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'staff edit' and tablename = 'platform_settings') then
    create policy "staff edit" on public.platform_settings for update using (public.is_platform_admin()) with check (public.is_platform_admin());
  end if;
end $$;
grant select on public.platform_settings to anon, authenticated;
grant update on public.platform_settings to authenticated;

-- Which company a web address belongs to, for the sign-in page before anyone
-- is signed in. Returns only what the sign-in page shows.
create or replace function public.company_by_host(p_host text)
returns table (id uuid, slug text, name text, logo_url text, brand_color text, tagline text, require_mfa boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.slug, c.name, coalesce(c.logo_url, ''), c.brand_color, c.tagline, c.require_mfa
    from public.companies c, public.platform_settings s
   where lower(c.domain) = lower(p_host)
      or lower(p_host) = lower(c.slug || '.' || s.root_domain)
   limit 1
$$;
revoke execute on function public.company_by_host(text) from public;
grant execute on function public.company_by_host(text) to anon, authenticated;

-- Every company, with its address, for the WE-estate portal.
create or replace function public.platform_companies()
returns table (id uuid, slug text, name text, created_at timestamptz, people int, projects int, units int,
               domain text, domain_status text, logo_url text, brand_color text, require_mfa boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.slug, c.name, c.created_at,
         (select count(*)::int from public.profiles p where p.company_id = c.id),
         (select count(*)::int from public.projects p where p.company_id = c.id),
         (select count(*)::int from public.units u join public.projects p on p.id = u.project_id where p.company_id = c.id),
         coalesce(c.domain, ''), c.domain_status, coalesce(c.logo_url, ''), c.brand_color, c.require_mfa
    from public.companies c
   where public.is_platform_admin()
   order by c.created_at
$$;
revoke execute on function public.platform_companies() from public, anon;
grant execute on function public.platform_companies() to authenticated;

-- Logos ------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', true, 2097152, array['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'])
on conflict (id) do nothing;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'branding upload' and tablename = 'objects') then
    create policy "branding upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'branding' and (public.is_platform_admin()
    or ((storage.foldername(name))[1] = public.my_company()::text and public.is_admin())));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'branding replace' and tablename = 'objects') then
    create policy "branding replace" on storage.objects for update to authenticated
  using (bucket_id = 'branding' and (public.is_platform_admin()
    or ((storage.foldername(name))[1] = public.my_company()::text and public.is_admin())));
  end if;
end $$;
