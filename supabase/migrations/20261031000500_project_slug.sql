-- Readable project addresses: /projects/trio-gardens/... Slug is set once from the name and kept when the project is renamed.
alter table public.projects add column if not exists slug text;

create or replace function public.project_slug_fill() returns trigger language plpgsql set search_path = public as $$
declare base text; cand text; n int := 1;
begin
  if new.slug is not null and new.slug <> '' then
    new.slug := trim(both '-' from lower(regexp_replace(new.slug, '[^a-zA-Z0-9]+', '-', 'g')));
    if new.slug <> '' then return new; end if;
  end if;
  base := trim(both '-' from lower(regexp_replace(coalesce(new.name, 'project'), '[^a-zA-Z0-9]+', '-', 'g')));
  if base = '' or base ~ '^[0-9a-f]{8}-' then base := 'project'; end if;
  if base = 'new' then base := 'new-project'; end if;
  cand := base;
  while exists (select 1 from projects p where p.company_id = new.company_id and p.slug = cand and p.id <> new.id) loop
    n := n + 1; cand := base || '-' || n;
  end loop;
  new.slug := cand;
  return new;
end $$;

create trigger project_slug_fill before insert or update of slug on public.projects
  for each row execute function public.project_slug_fill();

update public.projects set slug = null where slug is null;
create unique index if not exists projects_company_slug on public.projects (company_id, slug);
