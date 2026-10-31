import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { Curve, type Point } from "@/components/Curve";
import { Kpi } from "@/components/Kpis";
import { ConsoleSection } from "@/components/ConsoleSection";
import { UnitPicker } from "@/components/UnitPicker";
import { HANDOVER } from "@/lib/handover";
import { fetchAll, loadConstruction } from "@/lib/construction";
import { acts, getMe } from "@/lib/data";
import { date, pct } from "@/lib/format";
import { getScope } from "@/lib/scope";
import { createClient } from "@/lib/supabase/server";
import { setDeliveryDates } from "../actions";

export const metadata: Metadata = { title: "Unit delivery" };

const today = new Date().toISOString().slice(0, 10);
const in90 = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);

// Where a unit is on its way to its owner.
const STEPS = [
  { key: "not_started", label: "Not started", color: "#c9ced3" },
  { key: "building", label: "Under construction", color: "#e2c27c" },
  { key: "ready", label: "Ready for handover", color: "#7fb08f" },
  { key: "booked", label: "In handover", color: "#5d8fc9" },
  { key: "handed_over", label: "Handed over", color: "#2f6f46" },
] as const;
type Step = (typeof STEPS)[number]["key"];

type Handover = { unit_id: string; status: string; scheduled_at: string | null; handed_over_at: string | null };

export default async function DeliveryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const me = await getMe();
  const scope = await getScope(id);
  const [c, { data: phases }, { data: zones }, { data: buildings }, handovers, stagesNow] = await Promise.all([
    loadConstruction(supabase, id, scope),
    supabase.from("phases").select("id, code, name").eq("project_id", id).order("code"),
    supabase.from("zones").select("id, code, name").eq("project_id", id).order("code"),
    supabase.from("buildings").select("id, code, name").eq("project_id", id).order("code"),
    fetchAll<Handover>((a, b) => supabase.from("unit_handovers").select("unit_id, status, scheduled_at, handed_over_at").eq("project_id", id).range(a, b)),
    fetchAll<{ id: string; handover_stage: string; handover_stage_at: string | null }>((a, b) =>
      supabase.from("units").select("id, handover_stage, handover_stage_at").eq("project_id", id).range(a, b)),
  ]);
  const stageOf = new Map(stagesNow.map((r) => [r.id, r]));
  const { units, unitPct } = c;
  const canPlan = acts(me, ["pm", "cost_control", "handover", "sales"]);
  const phaseName = (v: string | null) => (phases ?? []).find((p) => p.id === v)?.name || (phases ?? []).find((p) => p.id === v)?.code || "No phase";

  const ho = new Map<string, Handover>();
  for (const h of handovers) if (h.status !== "rejected") ho.set(h.unit_id, h);
  const handedAt = (u: { id: string; status: string; delivery_date: string | null }) => {
    const st = stageOf.get(u.id);
    if (st?.handover_stage === "client_delivered") return st.handover_stage_at ?? today;
    const h = ho.get(u.id);
    if (h?.status === "done") return (h.handed_over_at ?? h.scheduled_at ?? today).slice(0, 10);
    // Marked handed over without a handover record: count it on its planned date.
    return u.status === "handed_over" ? (u.delivery_date && u.delivery_date < today ? u.delivery_date : today) : null;
  };
  const stepOf = (u: (typeof units)[number]): Step => {
    if (handedAt(u)) return "handed_over";
    if (ho.has(u.id) || (stageOf.get(u.id)?.handover_stage ?? "not_started") !== "not_started") return "booked";
    const p = unitPct.get(u.id) ?? 0;
    if (p >= 99.99 || u.status === "ready") return "ready";
    return p > 0 ? "building" : "not_started";
  };
  const rows = units.map((u) => ({ ...u, step: stepOf(u), pct: unitPct.get(u.id) ?? 0, handed: handedAt(u) }));
  const count = (k: Step) => rows.filter((r) => r.step === k).length;
  const delivered = count("handed_over");
  const dueNow = rows.filter((r) => r.delivery_date && r.delivery_date <= today).length;
  const late = rows.filter((r) => r.step !== "handed_over" && r.delivery_date && r.delivery_date < today)
    .sort((a, b) => a.delivery_date!.localeCompare(b.delivery_date!));
  const soon = rows.filter((r) => r.step !== "handed_over" && r.delivery_date && r.delivery_date >= today && r.delivery_date <= in90)
    .sort((a, b) => a.delivery_date!.localeCompare(b.delivery_date!));
  const sold = rows.filter((r) => ["sold", "reserved", "handed_over"].includes(r.status));
  const withDates = rows.filter((r) => r.delivery_date).length;

  // Cumulative units: planned by delivery date, actual by handover date.
  const cum = (dates: string[]): Point[] => {
    const sorted = dates.sort();
    const out: Point[] = [];
    sorted.forEach((d, i) => { if (sorted[i + 1] !== d) out.push([d, i + 1]); });
    return out;
  };
  const planCurve = cum(rows.map((r) => r.delivery_date).filter(Boolean) as string[]);
  const actualCurve = cum(rows.map((r) => r.handed).filter(Boolean) as string[]);
  if (actualCurve.length) actualCurve.push([today, actualCurve.at(-1)![1]]);

  const byPhase = new Map<string, typeof rows>();
  for (const r of rows) byPhase.set(phaseName(r.phase_id), [...(byPhase.get(phaseName(r.phase_id)) ?? []), r]);

  const unitTable = (list: typeof rows, empty: string) => (
    <div className="we-table-wrap" style={{ maxHeight: 360 }}>
      <table className="we-table">
        <thead><tr><th>Unit</th><th>Phase</th><th>Planned delivery</th><th>Construction</th><th>Handover stage</th></tr></thead>
        <tbody>
          {list.length === 0 && <tr><td colSpan={5} className="we-empty">{empty}</td></tr>}
          {list.slice(0, 200).map((r) => (
            <tr key={r.id}>
              <td><span className="we-code">{r.code}</span> <span className="we-meta">{r.unit_type}</span></td>
              <td>{phaseName(r.phase_id)}</td>
              <td>{date(r.delivery_date)}</td>
              <td><div className="we-row" style={{ gap: 8, flexWrap: "nowrap" }}><div className="we-prog" style={{ flex: 1 }}><span style={{ width: `${r.pct}%` }} /></div>{Math.round(r.pct)}%</div></td>
              <td>{HANDOVER.find((h) => h.key === (stageOf.get(r.id)?.handover_stage ?? "not_started"))?.label ?? STEPS.find((s) => s.key === r.step)!.label}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      <div className="we-kpis">
        <Kpi label="Handed over" value={`${delivered} / ${rows.length}`} note={rows.length ? pct((delivered / rows.length) * 100) : ""} />
        <Kpi label="Due by today" value={String(dueNow)} note={`${withDates} units have a planned date`} />
        <Kpi label="Late" value={String(late.length)} note="Past planned delivery, not handed over" bad={late.length > 0} />
        <Kpi label="Due in 90 days" value={String(soon.length)} note={`${sold.length} units sold or reserved`} />
      </div>

      <section className="we-funnel">
        {STEPS.map((s) => (
          <div key={s.key}><i style={{ background: s.color }} /><b>{count(s.key)}</b><small>{s.label}</small></div>
        ))}
      </section>

      <section className="we-card we-stack">
        <h2 style={{ margin: 0 }}>Handover pipeline</h2>
        <div className="we-pipe">
          {HANDOVER.map((h) => {
            const n = rows.filter((r) => (stageOf.get(r.id)?.handover_stage ?? "not_started") === h.key).length;
            return (
              <div key={h.key} className="we-pipe__step" style={{ ["--c" as string]: h.color }}>
                <b>{n}</b><small>{h.label}</small>
                <i style={{ width: `${rows.length ? (n / rows.length) * 100 : 0}%` }} />
              </div>
            );
          })}
        </div>
      </section>

      <ConsoleSection projectId={id} mode="handover" title="Pick units and move them through handover" height={560} />

      <div className="we-grid">
        <section className="we-card">
          <h2>Deliveries: planned against actual</h2>
          {planCurve.length === 0 ? (
            <div className="we-help">No planned delivery dates yet.{canPlan ? " Set them below for a phase, building or unit type." : ""}</div>
          ) : (
            <Curve plan={planCurve} actual={actualCurve} today={today} unit="" max={rows.length} labels={["Planned (units)", "Handed over (units)"]} />
          )}
        </section>
        <section className="we-card">
          <h2>By phase</h2>
          <div className="we-table-wrap">
            <table className="we-table">
              <thead><tr><th>Phase</th><th className="num">Units</th><th>Construction</th><th className="num">Due by today</th><th className="num">Handed over</th><th className="num">Late</th></tr></thead>
              <tbody>
                {[...byPhase.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true })).map(([ph, list]) => {
                  const avg = list.reduce((s, r) => s + r.pct, 0) / list.length;
                  const lateN = list.filter((r) => r.step !== "handed_over" && r.delivery_date && r.delivery_date < today).length;
                  return (
                    <tr key={ph}>
                      <td>{ph}</td>
                      <td className="num">{list.length}</td>
                      <td><div className="we-row" style={{ gap: 8, flexWrap: "nowrap" }}><div className="we-prog" style={{ flex: 1 }}><span style={{ width: `${avg}%` }} /></div>{Math.round(avg)}%</div></td>
                      <td className="num">{list.filter((r) => r.delivery_date && r.delivery_date <= today).length}</td>
                      <td className="num">{list.filter((r) => r.step === "handed_over").length}</td>
                      <td className={`num${lateN ? " is-bad" : ""}`}>{lateN}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="we-grid">
        <section className="we-card we-stack">
          <h2 style={{ margin: 0 }}>Late units <small>{late.length}</small></h2>
          {unitTable(late, "Nothing late.")}
        </section>
        <section className="we-card we-stack">
          <h2 style={{ margin: 0 }}>Due in the next 90 days <small>{soon.length}</small></h2>
          {unitTable(soon, "Nothing due in the next 90 days.")}
        </section>
      </div>

      <div className="we-grid">
        {canPlan && (
          <section className="we-card we-stack">
            <h2 style={{ margin: 0 }}>Set planned delivery dates</h2>
            <p className="we-help" style={{ margin: 0 }}>Usually the date in the sales contract. Set it for a whole phase, building or unit type at once, then adjust single units.</p>
            <ActionForm action={setDeliveryDates.bind(null, id)} className="we-form-grid" resetOnOk>
              <UnitPicker phases={(phases ?? []).map((p) => ({ id: p.id, name: p.name || p.code }))} zones={(zones ?? []).map((z) => ({ id: z.id, name: z.name || z.code }))}
                buildings={(buildings ?? []).map((b) => ({ id: b.id, name: b.name || b.code }))} types={[...new Set(units.map((u) => u.unit_type).filter(Boolean))].sort()} />
              <div className="we-field"><label htmlFor="ddate">Planned delivery</label><input id="ddate" name="delivery_date" type="date" className="we-input" required /></div>
              <div className="we-field" style={{ alignSelf: "end" }}><button className="we-btn we-btn--primary">Set date</button></div>
            </ActionForm>
          </section>
        )}
        <section className="we-card we-stack">
          <h2 style={{ margin: 0 }}>How a unit moves</h2>
          <p className="we-help" style={{ margin: 0 }}>
            Construction progress comes from the <Link href={`/projects/${id}/construction`}>Construction progress</Link> tab. A unit is ready when every stage is at 100%.
            Then it moves through the handover stages above (planned to submit, consultant, snagging, QC, initial handover, client) from the unit console, or when Customer care finishes a <Link href={`/docs/handovers/new?project=${id}`}>unit handover</Link>.
          </p>
        </section>
      </div>
    </>
  );
}
