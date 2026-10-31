import Link from "next/link";
import { projectBase } from "@/lib/slug";
import type { ProjectStatus } from "@/components/Kpis";
import { ProjectDashboard } from "@/components/ProjectDashboard";
import { QueueTable } from "@/components/QueueTable";
import { SCurve, type CurvePoint } from "@/components/SCurve";
import { SiteMap } from "@/components/SiteMap";
import { getMe, sortQueue, type QueueItem } from "@/lib/data";
import { date, money, pct } from "@/lib/format";
import { getScope, scoped } from "@/lib/scope";
import { UNIT_STATUS } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

type Phase = { id: string; code: string; name: string; budget_egp: number; finish_date: string | null };
type Progress = { phase_id: string; period: string; planned_pct: number; actual_pct: number };
type Check = { step: string; done: boolean; detail: string };

export default async function ProjectOverview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const base = await projectBase(id);
  const supabase = await createClient();
  const [me, scope] = await Promise.all([getMe(), getScope(id)]);
  const [{ data: p }, { data: phases }, { data: progress }, { data: queue }, { data: checks }, { data: unitRows }] = await Promise.all([
    supabase.from("project_status").select("*").eq("id", id).maybeSingle(),
    supabase.from("phases").select("*").eq("project_id", id).order("code"),
    supabase.from("progress_updates").select("phase_id, period, planned_pct, actual_pct").eq("project_id", id).order("period"),
    supabase.from("work_queue").select("*").eq("project_id", id),
    supabase.rpc("setup_checklist", { p_project: id }),
    scoped(supabase.from("units").select("status, list_price_egp, area_m2").eq("project_id", id).limit(20000), scope, { zone: true, building: true }),
  ]);
  const { data: facts } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
  if (!p) return null;
  const project = p as ProjectStatus;
  const ph = ((phases ?? []) as Phase[]).filter((x) => !scope.phase || x.id === scope.phase);
  const rows = ((progress ?? []) as Progress[]).filter((r) => !scope.phase || r.phase_id === scope.phase);
  const units = (unitRows ?? []) as { status: string; list_price_egp: number | null; area_m2: number | null }[];
  const byStatus = Object.keys(UNIT_STATUS).map((k) => {
    const list = units.filter((u) => u.status === k);
    return { k, n: list.length, value: list.reduce((a, u) => a + Number(u.list_price_egp ?? 0), 0) };
  });
  const soldShare = units.length ? units.filter((u) => u.status !== "available" && u.status !== "blocked").length / units.length : 0;
  const todo = ((checks ?? []) as Check[]).filter((c) => !c.done);

  // Latest figures per phase, and the project curve weighted by phase budget.
  const latest = new Map<string, Progress>();
  for (const r of rows) latest.set(r.phase_id, r);
  const weight = new Map(ph.map((x) => [x.id, Number(x.budget_egp) || 1]));
  const total = [...weight.values()].reduce((a, b) => a + b, 0) || 1;
  const periods = [...new Set(rows.map((r) => r.period))].sort();
  const lastSeen = new Map<string, Progress>();
  const curve: CurvePoint[] = periods.map((period) => {
    for (const r of rows.filter((x) => x.period === period)) lastSeen.set(r.phase_id, r);
    let planned = 0, actual = 0;
    for (const [phase, r] of lastSeen) {
      const w = (weight.get(phase) ?? 1) / total;
      planned += r.planned_pct * w;
      actual += r.actual_pct * w;
    }
    return { period, planned, actual };
  });

  return (
    <>
      <ProjectDashboard id={id} me={me} />

      {todo.length > 0 && (
        <section className="we-card we-stack">
          <h2 style={{ margin: 0 }}>Finish setting up <small>{todo.length} left</small></h2>
          <ul className="we-checklist">
            {todo.map((c) => (
              <li key={c.step}><b>{c.step}</b> <span className="we-help">{c.detail}</span></li>
            ))}
          </ul>
          <div><Link className="we-btn we-btn--secondary we-btn--sm" href={`${base}/settings`}>Open setup</Link></div>
        </section>
      )}

      <section className="we-card we-stack">
        <div className="we-row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>Units <small>{scope.label || "whole project"}</small></h2>
          <Link className="we-link" href={`${base}/units`}>Open units</Link>
        </div>
        {units.length ? (
          <>
            <div className="we-statbar" role="img" aria-label="Units by status">
              {byStatus.filter((b) => b.n).map((b) => (
                <span key={b.k} style={{ flexGrow: b.n, background: UNIT_STATUS[b.k]!.color }} title={`${UNIT_STATUS[b.k]!.label}: ${b.n}`} />
              ))}
            </div>
            <div className="we-tiles">
              <div className="we-tile"><span>Units</span><b>{units.length.toLocaleString("en-US")}</b><small>{pct(soldShare * 100)} reserved or sold</small></div>
              {byStatus.filter((b) => b.n).map((b) => (
                <div className="we-tile" key={b.k}>
                  <span><i className="we-dot" style={{ background: UNIT_STATUS[b.k]!.color }} />{UNIT_STATUS[b.k]!.label}</span>
                  <b>{b.n.toLocaleString("en-US")}</b>
                  <small>{b.value ? `EGP ${money(b.value)}` : "–"}</small>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="we-empty">No units here yet. <Link href={`${base}/import?kind=units`}>Upload units from Excel</Link>.</div>
        )}
      </section>

      <div className="we-grid we-grid--wide">
        <section className="we-card we-stack">
          <h2 style={{ margin: 0 }}>Site</h2>
          {project.lat != null && project.lng != null ? (
            <SiteMap pins={[{ id, lat: project.lat, lng: project.lng, label: project.name }]} zoom={project.map_zoom} height={380} />
          ) : (
            <div className="we-empty">Not on the map yet. <Link href={`${base}/settings`}>Place it</Link>.</div>
          )}
        </section>
      </div>

      {facts && (
        <section className="we-card">
          <h2>Project facts <Link className="we-link" style={{ fontSize: 13 }} href={`${base}/settings`}>Edit</Link></h2>
          <dl className="we-dl we-dl--cols">
            {([
              ["City", [facts.city, facts.district].filter(Boolean).join(", ") || facts.location],
              ["Plot", facts.plot_no],
              ["Land area", facts.land_area_m2 ? `${money(facts.land_area_m2)} m²` : ""],
              ["Built-up area", facts.bua_m2 ? `${money(facts.bua_m2)} m²` : ""],
              ["Units planned", facts.units_planned ? String(facts.units_planned) : ""],
              ["Permit", [facts.permit_no, facts.permit_date ? date(facts.permit_date) : ""].filter(Boolean).join(" · ")],
              ["Land owner or partner", facts.owner_entity],
              ["Consultant", facts.consultant],
              ["Main contractor", facts.main_contractor],
              ["Start to finish", facts.start_date || facts.finish_date ? `${date(facts.start_date)} to ${date(facts.finish_date)}` : ""],
              ["First handover", facts.handover_date ? date(facts.handover_date) : ""],
            ] as [string, string][]).map(([k, v]) => (
              <div key={k}><dt>{k}</dt><dd>{v || <span className="we-help">Not set</span>}</dd></div>
            ))}
          </dl>
          {facts.description && <p style={{ margin: "16px 0 0" }}>{facts.description}</p>}
        </section>
      )}

      <section className="we-stack">
        <h2 style={{ margin: 0 }}>Waiting items</h2>
        <QueueTable items={sortQueue((queue ?? []) as QueueItem[])} myDepartment={me?.department} />
      </section>
    </>
  );
}
