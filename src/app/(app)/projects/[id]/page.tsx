import Link from "next/link";
import { Kpis, type ProjectStatus } from "@/components/Kpis";
import { QueueTable } from "@/components/QueueTable";
import { SCurve, type CurvePoint } from "@/components/SCurve";
import { SiteMap } from "@/components/SiteMap";
import { getMe, sortQueue, type QueueItem } from "@/lib/data";
import { date, money, pct } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

type Phase = { id: string; code: string; name: string; budget_egp: number; finish_date: string | null };
type Progress = { phase_id: string; period: string; planned_pct: number; actual_pct: number };
type Check = { step: string; done: boolean; detail: string };

export default async function ProjectOverview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const me = await getMe();
  const [{ data: p }, { data: phases }, { data: progress }, { data: queue }, { data: checks }] = await Promise.all([
    supabase.from("project_status").select("*").eq("id", id).maybeSingle(),
    supabase.from("phases").select("*").eq("project_id", id).order("code"),
    supabase.from("progress_updates").select("phase_id, period, planned_pct, actual_pct").eq("project_id", id).order("period"),
    supabase.from("work_queue").select("*").eq("project_id", id),
    supabase.rpc("setup_checklist", { p_project: id }),
  ]);
  const { data: facts } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
  if (!p) return null;
  const project = p as ProjectStatus;
  const ph = (phases ?? []) as Phase[];
  const rows = (progress ?? []) as Progress[];
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
      <Kpis p={project} full />

      {todo.length > 0 && (
        <section className="we-card we-stack">
          <h2 style={{ margin: 0 }}>Finish setting up <small>{todo.length} left</small></h2>
          <ul className="we-checklist">
            {todo.map((c) => (
              <li key={c.step}><b>{c.step}</b> <span className="we-help">{c.detail}</span></li>
            ))}
          </ul>
          <div><Link className="we-btn we-btn--secondary we-btn--sm" href={`/projects/${id}/settings`}>Open setup</Link></div>
        </section>
      )}

      <div className="we-grid we-grid--wide">
        <section className="we-card we-stack">
          <h2 style={{ margin: 0 }}>Progress <small>planned against actual</small></h2>
          <SCurve points={curve} />
        </section>
        <section className="we-card we-stack">
          <h2 style={{ margin: 0 }}>Site</h2>
          {project.lat != null && project.lng != null ? (
            <SiteMap pins={[{ id, lat: project.lat, lng: project.lng, label: project.name }]} zoom={project.map_zoom} height={380} />
          ) : (
            <div className="we-empty">Not on the map yet. <Link href={`/projects/${id}/settings`}>Place it</Link>.</div>
          )}
        </section>
      </div>

      {facts && (
        <section className="we-card">
          <h2>Project facts <Link className="we-link" style={{ fontSize: 13 }} href={`/projects/${id}/settings`}>Edit</Link></h2>
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

      <section className="we-card we-stack">
        <h2 style={{ margin: 0 }}>Phases <small>latest monthly progress</small></h2>
        <div className="we-table-wrap">
          <table className="we-table">
            <thead><tr><th>Phase</th><th className="num">Actual</th><th className="num">Plan</th><th className="num">SPI</th><th>As of</th></tr></thead>
            <tbody>
              {ph.map((x) => {
                const l = latest.get(x.id);
                return (
                  <tr key={x.id}>
                    <td><div className="we-title">{x.name}</div><div className="we-meta">Finish {date(x.finish_date)}</div></td>
                    <td className="num">{pct(l?.actual_pct)}</td>
                    <td className="num">{pct(l?.planned_pct)}</td>
                    <td className="num">{l && l.planned_pct > 0 ? (l.actual_pct / l.planned_pct).toFixed(2) : "–"}</td>
                    <td>{date(l?.period)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="we-stack">
        <h2 style={{ margin: 0 }}>Waiting items</h2>
        <QueueTable items={sortQueue((queue ?? []) as QueueItem[])} myDepartment={me?.department} />
      </section>
    </>
  );
}
