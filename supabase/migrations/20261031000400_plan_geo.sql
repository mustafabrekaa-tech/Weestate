alter table public.projects add column if not exists plan_geo jsonb;
comment on column public.projects.plan_geo is 'Where the masterplan image sits on the earth: {lng, lat (centre), mpp (metres per plan pixel), rot (degrees clockwise)}';
