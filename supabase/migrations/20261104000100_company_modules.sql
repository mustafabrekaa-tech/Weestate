-- Modules WE-estate staff switch off for a whole company (tenant). Hidden for everyone in it, admins included.
alter table public.companies add column if not exists modules_off text[] not null default '{}';

create or replace function public.companies_guard()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if not public.is_platform_admin()
     and (new.slug is distinct from old.slug or new.domain is distinct from old.domain or new.domain_status is distinct from old.domain_status
          or new.status is distinct from old.status or new.plan is distinct from old.plan or new.max_users is distinct from old.max_users
          or new.max_projects is distinct from old.max_projects or new.trial_ends is distinct from old.trial_ends
          or new.staff_notes is distinct from old.staff_notes or new.modules_off is distinct from old.modules_off) then
    raise exception 'Only WE-estate staff can change this';
  end if;
  if new.brand_color <> '' and new.brand_color !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'Colour must look like #8a6420';
  end if;
  return new;
end $function$;
notify pgrst, 'reload schema';
