-- Public website: enquiries from the "Book a demo" form, and finding a
-- workspace by its short name or company name for "Sign in".

create table if not exists public.enquiries (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  company     text not null default '',
  email       text not null,
  phone       text not null default '',
  role        text not null default '',
  projects    text not null default '',
  message     text not null default '',
  source      text not null default 'website',
  status      text not null default 'new',
  staff_notes text not null default '',
  created_at  timestamptz not null default now()
);
alter table public.enquiries enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'anyone sends' and tablename = 'enquiries') then
    create policy "anyone sends" on public.enquiries for insert with check (status = 'new' and staff_notes = '');
  end if;
  if not exists (select 1 from pg_policies where policyname = 'staff read' and tablename = 'enquiries') then
    create policy "staff read" on public.enquiries for select using (public.is_platform_admin());
  end if;
  if not exists (select 1 from pg_policies where policyname = 'staff update' and tablename = 'enquiries') then
    create policy "staff update" on public.enquiries for update using (public.is_platform_admin()) with check (public.is_platform_admin());
  end if;
end $$;
grant insert on public.enquiries to anon, authenticated;
grant select, update on public.enquiries to authenticated;

-- Matches a short name or company name only, so it can't be used to test emails.
create or replace function public.find_workspace(p_text text)
returns text language sql stable security definer set search_path = public as $$
  select c.slug from public.companies c
   where lower(c.slug) = lower(trim(p_text)) or lower(c.name) = lower(trim(p_text)) limit 1
$$;
grant execute on function public.find_workspace(text) to anon, authenticated;
