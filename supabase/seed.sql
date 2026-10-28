-- Sample data for trying WE-estate: TRIO Gardens with four phases.
-- Figures are illustrative; replace them with the real October report.
insert into public.projects (id, code, name, location, budget_egp, start_date, finish_date) values
  ('11111111-0000-0000-0000-000000000001', 'TRIO', 'TRIO Gardens', 'New Cairo', 2400000000, '2024-03-01', '2027-12-31');

insert into public.phases (id, project_id, code, name, budget_egp, start_date, finish_date) values
  ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Phase 01', 'Phase 01 · Villas',      520000000, '2024-03-01', '2026-06-30'),
  ('22222222-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'Phase 02', 'Phase 02 · Townhouses',  680000000, '2024-09-01', '2027-03-31'),
  ('22222222-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001', 'Phase 03', 'Phase 03 · Apartments',  760000000, '2025-03-01', '2027-09-30'),
  ('22222222-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001', 'Phase 04', 'Phase 04 · Clubhouse',   440000000, '2025-09-01', '2027-12-31');

insert into public.progress_updates (phase_id, period, planned_pct, actual_pct, actual_cost_egp) values
  ('22222222-0000-0000-0000-000000000001', '2026-10-31', 100.0, 97.5, 470000000),
  ('22222222-0000-0000-0000-000000000002', '2026-10-31',  88.0, 80.0, 500000000),
  ('22222222-0000-0000-0000-000000000003', '2026-10-31',  72.0, 61.0, 425000000),
  ('22222222-0000-0000-0000-000000000004', '2026-10-31',  52.0, 45.0, 180000000);

insert into public.contracts (id, project_id, phase_id, code, contractor, scope, value_egp, retention_pct) values
  ('33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', 'C-02-MC', 'Main contractor',     'Structure and finishes, Phase 02', 410000000, 5),
  ('33333333-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000003', 'C-03-LS', 'Landscape works',     'Hardscape and softscape, Phase 03', 64000000, 5),
  ('33333333-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000004', 'C-04-EL', 'Site lighting',       'External lighting, Phase 04',        21000000, 5),
  ('33333333-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 'C-01-MC', 'Main contractor',     'Close-out works, Phase 01',          38000000, 5);

insert into public.units (project_id, phase_id, code, unit_type, area_m2, status)
select '11111111-0000-0000-0000-000000000001',
       ('22222222-0000-0000-0000-00000000000' || ph)::uuid,
       'A0' || ph || '-' || lpad(n::text, 3, '0'),
       case ph when 1 then 'Villa' when 2 then 'Townhouse' else 'Apartment' end,
       case ph when 1 then 320 when 2 then 210 else 140 end,
       case when n % 7 = 0 then 'available' when n % 5 = 0 then 'reserved' when ph = 1 and n % 2 = 0 then 'handed_over' else 'sold' end
from (values (1, 120), (2, 260), (3, 557)) as t(ph, cnt), generate_series(1, cnt) as n;

-- Certificates at different steps, so the queues have something in them.
insert into public.payment_certificates (id, project_id, contract_id, number, period_end, gross_egp, description) values
  ('44444444-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', 14, '2026-09-30', 18400000, 'September works, Phase 02'),
  ('44444444-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000002',  6, '2026-09-30',  2150000, 'Hardscape, zone B'),
  ('44444444-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000003',  3, '2026-09-30',   640000, 'Poles and cabling'),
  ('44444444-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000004', 15, '2026-10-15',  1120000, 'Close-out, Phase 01');

update public.payment_certificates set step = 5, status = 'approved',  step_entered_at = now() - interval '2 days' where number = 14;
update public.payment_certificates set step = 3, status = 'in_review', step_entered_at = now() - interval '6 days' where number = 6;
update public.payment_certificates set step = 4, status = 'in_review', step_entered_at = now() - interval '1 day'  where number = 3;
