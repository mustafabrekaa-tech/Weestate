-- Admins give someone a new temporary password when they forget theirs.
create or replace function public.admin_reset_password(p_user uuid, p_password text default null)
returns text language plpgsql security definer set search_path = public, extensions, auth as $$
declare
  pw   text := coalesce(nullif(p_password, ''), 'We-' || substr(md5(random()::text || clock_timestamp()::text), 1, 10));
  comp uuid;
begin
  select company_id into comp from public.profiles where id = p_user;
  if not (public.is_admin() and public.in_company(comp)) then raise exception 'Only an admin of this company can do that'; end if;
  if length(pw) < 8 then raise exception 'Passwords need at least 8 characters'; end if;
  update auth.users set encrypted_password = crypt(pw, gen_salt('bf')), updated_at = now() where id = p_user;
  return pw;
end $$;

-- Staff overview of every workspace.
create or replace function public.platform_workspaces()
returns table (id uuid, slug text, name text, created_at timestamptz, people int, projects int, units int)
language sql stable security definer set search_path = public as $$
  select c.id, c.slug, c.name, c.created_at,
         (select count(*)::int from public.profiles p where p.company_id = c.id),
         (select count(*)::int from public.projects p where p.company_id = c.id),
         (select count(*)::int from public.units u join public.projects p on p.id = u.project_id where p.company_id = c.id)
    from public.companies c
   where public.is_platform_admin()
   order by c.created_at
$$;

revoke execute on function public.admin_reset_password(uuid, text), public.platform_workspaces() from public, anon;
grant execute on function public.admin_reset_password(uuid, text), public.platform_workspaces() to authenticated;
