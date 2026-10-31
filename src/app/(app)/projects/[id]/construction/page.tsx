import type { Metadata } from "next";
import { ActionForm } from "@/components/ActionForm";
import { ConsoleSection } from "@/components/ConsoleSection";
import { Curve, type Point } from "@/components/Curve";
import { Kpi } from "@/components/Kpis";
import { UnitPicker } from "@/components/UnitPicker";
import { heat, loadConstruction } from "@/lib/construction";
import { acts, getMe } from "@/lib/data";
import { date, pct } from "@/lib/format";
import { getScope } from "@/lib/scope";
import { createClient } from "@/lib/supabase/server";
import { recordConstruction, saveStages } from "../actions";

export const metadata: Metadata = { title: "Construction progress" };

const today = new Date().toISOString().slice(0, 10);

export default async function ConstructionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ by?: string }> }) {
  const { id } = await params;
  const { by = "phase" } = await searchParams;
  const supabase = await createClient();
  const me = await getMe();
  const scope = await getScope(id);
  const [c, { data: phases }, { data: zones }, { data: buildings }, { data: plans }] = await Promise.all([
    loadConstruction(supabase, id, scope),
    supabase.from("phases").select("id, code, name").eq("project_id", id).order("code"),
    supabase.from("zones").select("id, code, name").eq("project_id", id).order("code"),
    supabase.from("buildings").select("id, code, name, phase_id").eq("project_id", id).order("code"),
    supabase.from("progress_updates").select("period, planned_pct, phase_id").eq("project_id", id).order("period"),
  ]);
  const { stages, units, unitPct, stagePct, lastUpdate } = c;
  const canRecord = acts(me, ["site", "tech_office", "quality", "pm", "cost_control"]);
  const canStages = acts(me, ["pm", "tech_office", "cost_control"]);
  const name = (list: { id: string; code: string; name: string }[] | null, v: string | null) => (list ?? []).find((x) => x.id === v)?.name || (list ?? []).find((x) => x.id === v)?.code || "";

  const overall = units.length ? units.reduce((s, u) => s + unitPct.get(u.id)!, 0) / units.length : 0;
  const complete = units.filter((u) => unitPct.get(u.id)! >= 99.99).length;
  const started = units.filter((u) => unitPct.get(u.id)! > 0).length;

  // Rows of the stage matrix: phases, buildings, zones or unit types.
  const keyOf = (u: (typeof units)[number]) =>
    by === "building" ? name(buildings, u.building_id) || "No building"
    : by === "zone" ? name(zones, u.zone_id) || "No zone"
    : by === "type" ? u.unit_type || "Other"
    : name(phases, u.phase_id) || "No phase";
  const groups = new Map<string, string[]>();
  for (const u of units) groups.set(keyOf(u), [...(groups.get(keyOf(u)) ?? []), u.id]);
  const rows = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));

  // Average progress over time, worked out in the database from every entry recorded.
  const filtered = !!(scope.phase || scope.zone || scope.building);
  const { data: curve } = await supabase.rpc("construction_curve", { p_project: id, p_units: filtered ? units.map((u) => u.id) : null });
  const points: Point[] = ((curve ?? []) as { as_of: string; pct: number }[]).map((r) => [r.as_of, Number(r.pct)]);
  const planMonths = new Map<string, number[]>();
  for (const p of plans ?? []) {
    if (scope.phase && p.phase_id !== scope.phase) continue;
    planMonths.set(p.period, [...(planMonths.get(p.period) ?? []), Number(p.planned_pct)]);
  }
  const planPoints: Point[] = [...planMonths.entries()].map(([d, v]) => [d, v.reduce((a, b) => a + b, 0) / v.length]);
  const types = [...new Set(units.map((u) => u.unit_type).filter(Boolean))].sort();

  return (
    <>
      <div className="we-kpis">
        <Kpi label="Construction progress" value={pct(overall)} note={scope.label || "Whole project"} />
        <Kpi label="Units complete" value={`${complete} / ${units.length}`} note="All stages at 100%" />
        <Kpi label="Units started" value={String(started)} note={`${units.length - started} not started`} />
        <Kpi label="Last update" value={lastUpdate ? date(lastUpdate) : "–"} note={`${stages.length} stages`} />
      </div>

      <div className="we-dash">
        <section className="we-panel we-span-6">
          <div className="we-panel__head"><h2>By phase</h2><small>dark bar built · gold line monthly plan</small></div>
          <div className="we-bars">
            {(phases ?? []).map((ph) => {
              const ids = units.filter((u) => u.phase_id === ph.id).map((u) => u.id);
              if (!ids.length) return null;
              const a = ids.reduce((s2, u) => s2 + unitPct.get(u)!, 0) / ids.length;
              const pl = Number([...(plans ?? [])].filter((x) => x.phase_id === ph.id).at(-1)?.planned_pct ?? 0);
              return (
                <a key={ph.id} className="we-barrow" href="?by=zone">
                  <div><div className="we-barrow__name">{ph.name || ph.code}</div><div className="we-barrow__meta">{ids.length} units · {ids.filter((u) => unitPct.get(u)! >= 99.99).length} complete</div></div>
                  <div><div className="we-barrow__val">{pct(a)}</div>{pl > 0 && <div className="we-barrow__var" style={{ color: a + 1 < pl ? "var(--status-overdue)" : "var(--status-done)" }}>{a + 1 < pl ? `${(pl - a).toFixed(1)} pts behind` : "on plan"}</div>}</div>
                  <div className="we-track"><i style={{ width: `${Math.min(100, a)}%` }} />{pl > 0 && <b style={{ left: `${Math.min(100, pl)}%` }} />}</div>
                </a>
              );
            })}
          </div>
        </section>
        <section className="we-panel we-span-6">
          <div className="we-panel__head"><h2>By work stage</h2><small>average of {units.length} units</small></div>
          <div className="we-bars">
            {stages.map((st) => {
              const v = stagePct(units.map((u) => u.id), st.id);
              return (
                <div key={st.id} className="we-barrow">
                  <div><div className="we-barrow__name">{st.name}</div><div className="we-barrow__meta">counts {st.weight}% of a unit</div></div>
                  <div className="we-barrow__val">{pct(v)}</div>
                  <div className="we-track"><i style={{ width: `${Math.min(100, v)}%`, background: v >= 99.99 ? "var(--status-done)" : undefined }} /></div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <ConsoleSection projectId={id} mode="construction" title="Pick units and record progress" height={560} />

      <section className="we-card we-stack">
        <div className="we-row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>Progress by stage</h2>
          <div className="we-toggle" role="group" aria-label="Rows">
            {([["phase", "Phases"], ["building", "Buildings"], ["zone", "Zones"], ["type", "Unit types"]] as const).map(([k, l]) => (
              <a key={k} href={`?by=${k}`} className={by === k ? "is-on" : ""}>{l}</a>
            ))}
          </div>
        </div>
        {units.length === 0 ? <div className="we-empty">No units here yet.</div> : (
          <div className="we-table-wrap">
            <table className="we-heat">
              <thead><tr><th style={{ writingMode: "horizontal-tb", transform: "none", height: "auto" }}></th>{stages.map((s) => <th key={s.id}>{s.name} <span style={{ opacity: 0.6 }}>{s.weight}%</span></th>)}<th>Overall</th></tr></thead>
              <tbody>
                {rows.map(([k, ids]) => {
                  const all = ids.reduce((s, u) => s + unitPct.get(u)!, 0) / ids.length;
                  return (
                    <tr key={k}>
                      <th>{k} <span className="we-help">{ids.length}</span></th>
                      {stages.map((s) => { const v = stagePct(ids, s.id); return <td key={s.id} style={heat(v)}>{v ? Math.round(v) : ""}</td>; })}
                      <td className="total">{Math.round(all)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="we-grid">
        <section className="we-card">
          <h2>Progress over time</h2>
          <Curve plan={planPoints} actual={points} today={today} labels={["Planned (monthly phase plan)", "Actual (units)"]} />
        </section>
        {canRecord && (
          <section className="we-card we-stack">
            <h2 style={{ margin: 0 }}>Record by phase or building</h2>
            <p className="we-help" style={{ margin: 0 }}>Set a stage&apos;s % for many units at once, for example all villas in a phase. Each entry is kept, so the curve shows progress over time.</p>
            <ActionForm action={recordConstruction.bind(null, id)} className="we-form-grid" resetOnOk>
              <UnitPicker phases={(phases ?? []).map((p) => ({ id: p.id, name: p.name || p.code }))} zones={(zones ?? []).map((z) => ({ id: z.id, name: z.name || z.code }))}
                buildings={(buildings ?? []).map((b) => ({ id: b.id, name: b.name || b.code }))} types={types} />
              <div className="we-field" style={{ gridColumn: "1 / -1" }}>
                <label>Stages</label>
                <div className="we-checks">{stages.map((s) => <label key={s.id}><input type="checkbox" name="stage_id" value={s.id} /> {s.name}</label>)}</div>
              </div>
              <div className="we-field"><label htmlFor="cpct">Complete %</label><input id="cpct" name="pct" className="we-input we-mono" inputMode="decimal" required /></div>
              <div className="we-field"><label htmlFor="casof">As of</label><input id="casof" name="as_of" type="date" className="we-input" defaultValue={today} /></div>
              <div className="we-field" style={{ alignSelf: "end" }}><button className="we-btn we-btn--primary">Record</button></div>
            </ActionForm>
          </section>
        )}
      </div>

      {canStages && (
        <details className="we-card">
          <summary>Stages and weights</summary>
          <ActionForm action={saveStages.bind(null, id)} className="we-stack">
            <p className="we-help" style={{ margin: 0 }}>Weights say how much each stage counts towards a unit&apos;s overall progress. They don&apos;t need to add up to 100.</p>
            {stages.map((s) => (
              <div key={s.id} className="we-row" style={{ gap: 8 }}>
                <input type="hidden" name="sid" value={s.id} />
                <input name="sname" className="we-input" defaultValue={s.name} style={{ flex: 1 }} />
                <input name="sweight" className="we-input we-mono" defaultValue={s.weight} style={{ width: 90 }} inputMode="decimal" />
              </div>
            ))}
            <div className="we-row" style={{ gap: 8 }}>
              <input name="new_name" className="we-input" placeholder="Add a stage" style={{ flex: 1 }} />
              <input name="new_weight" className="we-input we-mono" placeholder="Weight" style={{ width: 90 }} inputMode="decimal" />
            </div>
            <div><button className="we-btn we-btn--secondary">Save stages</button></div>
          </ActionForm>
        </details>
      )}
    </>
  );
}
