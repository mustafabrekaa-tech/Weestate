-- Dashboard KPIs also come from what people import: the schedule's activity progress (when no monthly
-- progress update exists for a phase), the budget being prepared (until one is approved) and payments made
-- (when no certificates exist).
create or replace view public.phase_status with (security_invoker = true) as
 WITH latest AS (
         SELECT DISTINCT ON (pu.phase_id) pu.phase_id, pu.period, pu.planned_pct, pu.actual_pct, pu.actual_cost_egp
           FROM progress_updates pu
          ORDER BY pu.phase_id, pu.period DESC
        ), cur_budget AS (
         -- the approved budget, or while there is none yet the newest one being prepared
         SELECT DISTINCT ON (b.project_id) b.id, b.project_id
           FROM budgets b
          WHERE b.status <> 'superseded'
          ORDER BY b.project_id, (b.status = 'approved') DESC, b.version DESC
        ), budget AS (
         SELECT bl.phase_id, sum(bl.amount_egp) AS amount
           FROM budget_lines bl JOIN cur_budget cb ON cb.id = bl.budget_id
          GROUP BY bl.phase_id
        ), certified AS (
         SELECT c.phase_id, sum(pc.gross_egp) AS amount
           FROM payment_certificates pc JOIN contracts c ON c.id = pc.contract_id
          WHERE pc.status <> ALL (ARRAY['draft'::text, 'rejected'::text])
          GROUP BY c.phase_id
        ), acts AS (
         -- imported schedule: weighted progress of the baseline activities, as of the last progress date
         SELECT a.phase_id, a.weight, a.start_date, a.finish_date,
                (SELECT ap.actual_pct FROM activity_progress ap WHERE ap.activity_id = a.id ORDER BY ap.period DESC LIMIT 1) AS pct,
                (SELECT max(ap.period) FROM activity_progress ap WHERE ap.project_id = a.project_id) AS as_of
           FROM activities a JOIN schedule_versions v ON v.id = a.version_id AND v.is_baseline
          WHERE a.phase_id IS NOT NULL AND COALESCE(a.weight, 0) > 0
        ), sched AS (
         SELECT acts.phase_id, max(acts.as_of) AS as_of,
                round(sum(acts.weight * COALESCE(acts.pct, 0)) / NULLIF(sum(acts.weight), 0), 1) AS actual_pct,
                round(100 * sum(acts.weight * CASE
                    WHEN acts.as_of >= acts.finish_date THEN 1
                    WHEN acts.as_of <= acts.start_date OR acts.start_date IS NULL OR acts.finish_date IS NULL THEN 0
                    ELSE (acts.as_of - acts.start_date)::numeric / NULLIF(acts.finish_date - acts.start_date, 0) END)
                  / NULLIF(sum(acts.weight), 0), 1) AS planned_pct
           FROM acts
          GROUP BY acts.phase_id
         HAVING max(acts.as_of) IS NOT NULL
        )
 SELECT ph.id, ph.project_id, ph.code, ph.name,
    COALESCE(b.amount, ph.budget_egp) AS bac_egp,
    COALESCE(l.planned_pct, s.planned_pct, 0::numeric) AS planned_pct,
    COALESCE(l.actual_pct, s.actual_pct, 0::numeric) AS actual_pct,
    round(COALESCE(b.amount, ph.budget_egp) * COALESCE(l.planned_pct, s.planned_pct, 0::numeric) / 100::numeric, 2) AS pv_egp,
    round(COALESCE(b.amount, ph.budget_egp) * COALESCE(l.actual_pct, s.actual_pct, 0::numeric) / 100::numeric, 2) AS ev_egp,
    COALESCE(NULLIF(l.actual_cost_egp, 0::numeric), cert.amount, 0::numeric) AS ac_egp,
    COALESCE(l.period, s.as_of) AS as_of
   FROM phases ph
     LEFT JOIN latest l ON l.phase_id = ph.id
     LEFT JOIN budget b ON b.phase_id = ph.id
     LEFT JOIN certified cert ON cert.phase_id = ph.id
     LEFT JOIN sched s ON s.phase_id = ph.id;

create or replace view public.project_status with (security_invoker = true) as
 SELECT p.id, p.company_id, p.code, p.name, p.location, p.budget_egp, p.status, p.project_type, p.lat, p.lng, p.map_zoom,
    (( SELECT count(*) FROM phases x WHERE x.project_id = p.id))::integer AS phase_count,
    (( SELECT count(*) FROM units x WHERE x.project_id = p.id))::integer AS unit_count,
    max(s.as_of) AS as_of,
    round(sum(s.ev_egp) / NULLIF(sum(s.bac_egp), 0::numeric) * 100::numeric, 1) AS actual_pct,
    round(sum(s.pv_egp) / NULLIF(sum(s.bac_egp), 0::numeric) * 100::numeric, 1) AS planned_pct,
    sum(s.bac_egp) AS bac_egp,
    sum(s.pv_egp) AS pv_egp,
    sum(s.ev_egp) AS ev_egp,
    COALESCE(NULLIF(sum(s.ac_egp), 0::numeric), pay.amount, 0::numeric) AS ac_egp,
    round(sum(s.ev_egp) / NULLIF(sum(s.pv_egp), 0::numeric), 2) AS spi,
    round(sum(s.ev_egp) / NULLIF(COALESCE(NULLIF(sum(s.ac_egp), 0::numeric), pay.amount), 0::numeric), 2) AS cpi,
    round(sum(s.bac_egp) / NULLIF(sum(s.ev_egp) / NULLIF(COALESCE(NULLIF(sum(s.ac_egp), 0::numeric), pay.amount), 0::numeric), 0::numeric), 2) AS eac_egp,
    (( SELECT count(*) FROM work_queue q WHERE q.project_id = p.id AND q.overdue))::integer AS overdue_count,
    (( SELECT count(*) FROM work_queue q WHERE q.project_id = p.id))::integer AS open_count
   FROM projects p
     LEFT JOIN phase_status s ON s.project_id = p.id
     LEFT JOIN LATERAL (SELECT sum(po.amount_egp) AS amount FROM payments_out po WHERE po.project_id = p.id) pay ON true
  GROUP BY p.id, pay.amount;
