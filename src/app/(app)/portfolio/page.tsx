import Link from "next/link";
import { Donut } from "@/components/Charts";
import { EarthMap, type EarthProject } from "@/components/EarthMap";
import type { ProjectStatus } from "@/components/Kpis";
import { fetchAll } from "@/lib/construction";
import { getMe } from "@/lib/data";
import { index2, money, pct } from "@/lib/format";
import { readGeo } from "@/lib/geo";
import { type ModelPlacement, UNIT_STATUS } from "@/lib/site";
import { projectSlugs } from "@/lib/slug";
import { createClient } from "@/lib/supabase/server";

type U = { project_id: string; status: string; handover_stage: string; delivery_date: string | null };
const M = (n: number | null | undefined) => (n == null ? "–" : `${money(Number(n) / 1e6)}M`);

// Every project of the company side by side: progress, money, units and what is late.
export default async function Portfolio() {
  const supabase = await createClient();
  const me = await getMe();
  const company = me?.company_id ?? "";
  const [{ data: rows }, { data: plans }, { data: blds }, { data: mods }, { data: queue }, units] = await Promise.all([
    supabase.from("project_status").select("*").eq("company_id", company).order("name"),
    supabase.from("projects").select("id, plan_image, plan_w, plan_h, plan_geo, finish_date").eq("company_id", company),
    supabase.from("buildings").select("project_id, footprint, floors, floor_height_m, base_m").not("footprint", "is", null).limit(5000),
    supabase.from("project_models").select("id, project_id, url, placement").not("placement", "is", null),
    supabase.from("work_queue").select("project_id, overdue").eq("company_id", company),
    fetchAll<U>((a, b) => supabase.from("units").select("project_id, status, handover_stage, delivery_date").range(a, b)),
  ]);
  const list = (rows ?? []) as (ProjectStatus & { project_type?: string })[];
  const slugs = await projectSlugs();
  const at = (id: string) => `/projects/${slugs.get(id) ?? id}`;
  const today = new Date().toISOString().slice(0, 10);
  const planOf = new Map((plans ?? []).map((x) => [x.id as string, x]));

  // Per project: units by sales status, delivered, late; workflow items.
  const stats = new Map(list.map((p) => {
    const us = units.filter((u) => u.project_id === p.id);
    const q = (queue ?? []).filter((x) => x.project_id === p.id);
    return [p.id, {
      units: us.length,
      sold: us.filter((u) => ["sold", "ready", "handed_over"].includes(u.status)).length,
      delivered: us.filter((u) => u.handover_stage === "client_delivered").length,
      late: us.filter((u) => u.delivery_date && u.delivery_date < today && u.handover_stage !== "client_delivered").length,
      open: q.length, overdue: q.filter((x) => x.overdue).length,
    }];
  }));
  const sum = (f: (p: (typeof list)[number]) => number) => list.reduce((s, p) => s + (Number(f(p)) || 0), 0);
  const bac = sum((p) => Number(p.bac_egp) || Number(p.budget_egp));
  const ev = sum((p) => p.ev_egp ?? 0), pv = sum((p) => p.pv_egp ?? 0), ac = sum((p) => p.ac_egp ?? 0);
  const allUnits = units.filter((u) => list.some((p) => p.id === u.project_id));
  const tot = [...stats.values()].reduce((a, s) => ({ units: a.units + s.units, sold: a.sold + s.sold, delivered: a.delivered + s.delivered, late: a.late + s.late, open: a.open + s.open, overdue: a.overdue + s.overdue }),
    { units: 0, sold: 0, delivered: 0, late: 0, open: 0, overdue: 0 });
  const byStatus = Object.entries(UNIT_STATUS).map(([k, v]) => ({ label: v.label, color: v.color, value: allUnits.filter((u) => u.status === k).length }));

  type Bld = { project_id: string; footprint: [number, number][]; floors: number | null; floor_height_m: number | null; base_m: number | null };
  type Mod = { id: string; project_id: string; url: string; placement: ModelPlacement };
  const earth: EarthProject[] = list.filter((p) => p.lat != null && p.lng != null).map((p) => {
    const x = planOf.get(p.id);
    return {
      id: p.id, name: p.name, lat: p.lat!, lng: p.lng!, href: `${at(p.id)}/console?view=earth`,
      plan: x?.plan_image && x.plan_w && x.plan_h ? { image: x.plan_image, w: Number(x.plan_w), h: Number(x.plan_h) } : null,
      geo: readGeo(x?.plan_geo),
      blocks: ((blds ?? []) as Bld[]).filter((b) => b.project_id === p.id).map((b) => {
        const base = Number(b.base_m ?? 0);
        return { ring: b.footprint, base, top: base + Math.max(1, b.floors ?? 1) * Number(b.floor_height_m || 3.2) };
      }),
      models: ((mods ?? []) as Mod[]).filter((m) => m.project_id === p.id).map((m) => ({ id: m.id, url: m.url, placement: m.placement })),
    };
  });

  return (
    <div className="we-dash">
      <div className="we-pagehead we-pagehead--intro">
        <div>
          <div className="we-eyebrow we-eyebrow--brand">Portfolio</div>
          <h1>All projects</h1>
          <p className="we-purpose">Every project side by side: how far it is built against plan, what it costs, how many units are sold and handed over, and what is late.</p>
        </div>
      </div>

      <div className="we-kcards">
        <div className="we-kcard"><span className="we-kcard__label">Projects</span><span className="we-kcard__value">{list.length}</span><span className="we-kcard__note">{tot.units} units in all</span></div>
        <div className="we-kcard"><span className="we-kcard__label">Built</span><span className="we-kcard__value">{pct(bac ? (ev * 100) / bac : null)}</span>
          <span className={`we-kcard__note${pv && ev < pv * 0.98 ? " is-bad" : " is-good"}`}>plan {pct(bac ? (pv * 100) / bac : null)} · weighted by budget</span></div>
        <div className="we-kcard"><span className="we-kcard__label">Schedule index (SPI)</span><span className="we-kcard__value">{index2(pv ? ev / pv : null)}</span><span className="we-kcard__note">below 1.00 is behind plan</span></div>
        <div className="we-kcard"><span className="we-kcard__label">Cost index (CPI)</span><span className="we-kcard__value">{index2(ac ? ev / ac : null)}</span><span className="we-kcard__note">below 1.00 is over budget</span></div>
        <div className="we-kcard"><span className="we-kcard__label">Budget (EGP)</span><span className="we-kcard__value">{M(bac)}</span><span className="we-kcard__note">spent {M(ac)}</span></div>
        <div className="we-kcard"><span className="we-kcard__label">Sold</span><span className="we-kcard__value">{tot.sold}</span><span className="we-kcard__note">of {tot.units} units · {tot.units ? pct((tot.sold * 100) / tot.units) : "–"}</span></div>
        <div className="we-kcard"><span className="we-kcard__label">Delivered to clients</span><span className="we-kcard__value">{tot.delivered}</span>
          <span className={`we-kcard__note${tot.late ? " is-bad" : " is-good"}`}>{tot.late ? `${tot.late} late for delivery` : "none late"}</span></div>
        <Link className="we-kcard" href="/my-work"><span className="we-kcard__label">Waiting in workflows</span><span className="we-kcard__value">{tot.open}</span>
          <span className={`we-kcard__note${tot.overdue ? " is-bad" : ""}`}>{tot.overdue} overdue</span></Link>
      </div>

      <section className="we-panel">
        <div className="we-panel__head"><h2>Projects</h2><small>click a project to open it</small></div>
        <div className="we-table-wrap">
          <table className="we-table">
            <thead>
              <tr><th>Project</th><th>Built against plan</th><th>SPI</th><th>CPI</th><th>Budget</th><th>Spent</th><th>Units</th><th>Sold</th><th>Delivered</th><th>Late</th><th>Overdue items</th></tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const s = stats.get(p.id)!;
                const a = Number(p.actual_pct ?? 0), pl = Number(p.planned_pct ?? 0);
                const behind = pl - a > 1;
                return (
                  <tr key={p.id}>
                    <td><Link href={at(p.id)} className="we-link"><b>{p.name}</b></Link><br /><small className="we-help">{[p.code, p.location].filter(Boolean).join(" · ")}</small></td>
                    <td style={{ minWidth: 200 }}>
                      <div className="we-row" style={{ justifyContent: "space-between", gap: 8 }}>
                        <span className="we-mono">{pct(a)}</span>
                        <small style={{ color: behind ? "var(--status-overdue)" : "var(--status-done)" }}>{behind ? `${(pl - a).toFixed(1)} pts behind` : "on plan"}</small>
                      </div>
                      <div className="we-track"><i style={{ width: `${Math.min(100, a)}%` }} /><b style={{ left: `${Math.min(100, pl)}%` }} /></div>
                    </td>
                    <td className="we-mono" style={{ color: p.spi != null && p.spi < 0.95 ? "var(--status-overdue)" : undefined }}>{index2(p.spi)}</td>
                    <td className="we-mono" style={{ color: p.cpi != null && p.cpi < 0.95 ? "var(--status-overdue)" : undefined }}>{index2(p.cpi)}</td>
                    <td className="we-mono">{M(Number(p.bac_egp) || Number(p.budget_egp))}</td>
                    <td className="we-mono">{M(p.ac_egp)}</td>
                    <td className="we-mono">{s.units}</td>
                    <td className="we-mono">{s.sold}{s.units ? <small className="we-help"> · {pct((s.sold * 100) / s.units)}</small> : null}</td>
                    <td className="we-mono">{s.delivered}</td>
                    <td className="we-mono" style={{ color: s.late ? "var(--status-overdue)" : undefined }}>{s.late}</td>
                    <td className="we-mono" style={{ color: s.overdue ? "var(--status-overdue)" : undefined }}>{s.overdue}<small className="we-help"> of {s.open}</small></td>
                  </tr>
                );
              })}
              {list.length === 0 && <tr><td colSpan={11}>No projects yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="we-panel we-span-8">
        <div className="we-panel__head"><h2>On the map</h2><small>click a name to fly there · Tour projects visits each one</small></div>
        <EarthMap projects={earth} height={480} />
      </section>

      <section className="we-panel we-span-4">
        <div className="we-panel__head"><h2>Units by sales status</h2><small>all projects</small></div>
        <div className="we-row" style={{ gap: 24, alignItems: "center", flexWrap: "wrap" }}>
          <Donut parts={byStatus} label="Units by sales status, all projects" />
          <ul className="we-legend" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
            {byStatus.map((s) => (
              <li key={s.label} className="we-row" style={{ gap: 8 }}>
                <i style={{ width: 10, height: 10, borderRadius: 2, background: s.color, display: "inline-block" }} />
                <span>{s.label}</span><b className="we-mono" style={{ marginLeft: "auto" }}>{s.value}</b>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
