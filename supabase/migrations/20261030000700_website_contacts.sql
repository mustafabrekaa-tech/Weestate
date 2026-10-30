-- Contact details, social links and legal pages for the public website footer.
alter table public.platform_settings
  add column if not exists sales_email text not null default '',
  add column if not exists phone text not null default '',
  add column if not exists whatsapp text not null default '',
  add column if not exists address text not null default '',
  add column if not exists map_url text not null default '',
  add column if not exists hours text not null default '',
  add column if not exists linkedin text not null default '',
  add column if not exists facebook text not null default '',
  add column if not exists instagram text not null default '',
  add column if not exists x_url text not null default '',
  add column if not exists youtube text not null default '',
  add column if not exists privacy_text text not null default '',
  add column if not exists terms_text text not null default '';
alter table public.platform_settings
  add column if not exists tiktok text not null default '',
  add column if not exists about_text text not null default '',
  add column if not exists refund_text text not null default '';
-- Parts of the website switched off in the admin portal.
alter table public.platform_settings add column if not exists site_hidden text[] not null default '{}';
