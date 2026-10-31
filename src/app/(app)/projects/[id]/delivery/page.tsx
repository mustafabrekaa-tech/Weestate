import type { Metadata } from "next";
import { projectBase } from "@/lib/slug";
import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { Curve, type Point } from "@/components/Curve";
import { Kpi } from "@/components/Kpis";
import { ConsoleSection } from "@/components/ConsoleSection";
import { UnitPicker } from "@/components/UnitPicker";
import { HANDOVER, HANDOVER_BY_KEY } from "@/lib/handover";
import { ColumnChart, type Col } from "@/components/Charts";
import { fetchAll, loadConstruction } from "@/lib/construction";
import { acts, getMe } from "@/lib/data";
import { date, pct } from "@/lib/format";
import { getScope } from "@/lib/scope";
import { createClient } from "@/lib/supabase/server";
import { setDeliveryDates } from "../actions";

export const metadata: Metadata = { title: "Handover" };

// Who acts to move a unit out of each stage.
const OWNER: Record<string, string> = {
  not_started: "Site plans the submission", submitted: "Technical office submits to the consultant", submitted_consultant: "Consultant inspects; Site follows up",
  snagging_con: "Site closes the consultant's snags", submitted_qc: "Quality inspects", snagging_qc: "Site closes the QC snags",
  qc_approved: "Customer care books the initial handover", initial: "Customer care hands the keys to the client", client_delivered: "Done: the unit is with its owner",
};

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

export default async function DeliveryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ stage?: string }> }) {
  const { id } = await params;
  const base = await projectBase(id);
  const { stage: stageParam } = await searchParams;
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

  const hoKey = (uid: string) => stageOf.get(uid)?.handover_stage ?? "not_started";
  const hoCount = (k: string) => rows.filter((r) => hoKey(r.id) === k).length;
  const inPipe = HANDOVER.slice(1, 8).reduce((s2, h) => s2 + hoCount(h.key), 0);
  const firstBusy = ["qc_approved", "snagging_qc", "submitted_qc", "snagging_con", "submitted_consultant", "submitted", "initial"].find((k) => hoCount(k) > 0) ?? "not_started";
  const sel = stageParam && HANDOVER_BY_KEY[stageParam] ? stageParam : firstBusy;
  const selRows = rows.filter((r) => hoKey(r.id) === sel).sort((a, b) => (stageOf.get(a.id)?.handover_stage_at ?? "").localeCompare(stageOf.get(b.id)?.handover_stage_at ?? "") || a.code.localeCompare(b.code));
  const zoneName = (v: string | null) => (zones ?? []).find((z) => z.id === v)?.code ?? "–";
  const cols: Col[] = [];
  {
    const m0 = new Date(); m0.setDate(15);
    for (let k = -5; k <= 6; k++) {
      const m = new Date(m0.getFullYear(), m0.getMonth() + k, 15);
      const key = m.toISOString().slice(0, 7);
      cols.push({ label: m.toLocaleDateString("en-GB", { month: "short" }), now: k === 0,
        a: rows.filter((r) => (r.handed ?? "").startsWith(key)).length,
        b: rows.filter((r) => (r.delivery_date ?? "").startsWith(key)).length });
    }
  }

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
      <div className="we-kcards">
        <div className="we-kcard"><span className="we-kcard__label">Delivered to clients</span><span className="we-kcard__value">{delivered}</span><span className="we-kcard__note">of {rows.length} units · {rows.length ? pct((delivered / rows.length) * 100) : "–"}</span></div>
        <div className="we-kcard"><span className="we-kcard__label">In handover now</span><span className="we-kcard__value">{inPipe}</span><span className="we-kcard__note">submitted, snagging or approved</span></div>
        <div className="we-kcard"><span className="we-kcard__label">Late</span><span className="we-kcard__value">{late.length}</span><span className={`we-kcard__note${late.length ? " is-bad" : " is-good"}`}>past the contract date</span></div>
        <div className="we-kcard"><span className="we-kcard__label">Due in 90 days</span><span className="we-kcard__value">{soon.length}</span><span className="we-kcard__note">{withDates} units have a contract date</span></div>
      </div>

      <section className="we-panel">
        <div className="we-panel__head"><h2>Handover pipeline</h2><small>click a stage to list its units</small></div>
        <div className="we-scrollx">
          <div className="we-pipe2">
            {HANDOVER.map((h, i) => (
              <Link key={h.key} href={`?stage=${h.key}`} scroll={false} aria-current={h.key === sel ? "true" : undefined}>
                <i style={{ background: h.color }} />
                <b>{hoCount(h.key)}</b>
                <span>{h.label}</span>
                <small>{i < HANDOVER.length - 1 ? `Next: ${OWNER[h.key]!.split(" ")[0]}` : "Finished"}</small>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="we-panel">
        <div className="we-panel__head">
          <div>
            <h2>{HANDOVER_BY_KEY[sel]!.label} <span className="we-help">· {selRows.length} units</span></h2>
            <div className="we-help">{OWNER[sel]}</div>
          </div>
          {selRows.length > 0 && <Link className="we-btn we-btn--primary we-btn--sm" href={`${base}/console?stage=${sel}`}>Select them on the map</Link>}
        </div>
        <div className="we-table-wrap" style={{ maxHeight: 420 }}>
          <table className="we-table">
            <thead><tr><th>Unit</th><th>Cluster</th><th>Type</th><th>In this stage since</th><th>Contract date</th><th>Built</th><th></th></tr></thead>
            <tbody>
              {selRows.length === 0 && <tr><td colSpan={7} className="we-empty">No unit is in this stage today.</td></tr>}
              {selRows.slice(0, 150).map((r) => {
                const isLate = r.delivery_date && r.delivery_date < today && sel !== "client_delivered";
                return (
                  <tr key={r.id}>
                    <td className="we-mono">{r.code}</td>
                    <td>{zoneName(r.zone_id)}</td>
                    <td>{r.unit_type}</td>
                    <td className="we-mono">{date(stageOf.get(r.id)?.handover_stage_at ?? null)}</td>
                    <td>{isLate ? <span className="we-chip we-chip--overdue">Late · {date(r.delivery_date)}</span> : <span className="we-mono">{date(r.delivery_date)}</span>}</td>
                    <td className="we-mono">{Math.round(r.pct)}%</td>
                    <td style={{ textAlign: "right" }}><Link className="we-link" href={`${base}/console?q=${encodeURIComponent(r.code)}`}>Open on map</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {selRows.length > 150 && <p className="we-help" style={{ margin: 0 }}>Showing 150 of {selRows.length}. Select them on the map to see and move them all.</p>}
      </section>

      <div className="we-dash">
        <section className="we-panel we-span-6">
          <div className="we-panel__head"><h2>Deliveries by month</h2><small>delivered against due by contract</small></div>
          <ColumnChart cols={cols} aLabel="Delivered" bLabel="Due by contract" title="Units delivered and due per month" />
        </section>
        <section className="we-panel we-span-6">
          <div className="we-panel__head"><h2>Cumulative deliveries</h2><small>planned against handed over</small></div>
          {planCurve.length === 0 ? <div className="we-help">No contract delivery dates yet.</div> : (
            <Curve plan={planCurve} actual={actualCurve} today={today} unit="" max={rows.length} labels={["Planned (units)", "Handed over (units)"]} />
          )}
        </section>
      </div>

      <ConsoleSection projectId={id} mode="handover" title="Pick units on the map and move them through handover" height={560} />

      <div className="we-grid">
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
            Construction progress comes from the <Link href={`${base}/construction`}>Construction progress</Link> tab. A unit is ready when every stage is at 100%.
            Then it moves through the handover stages above (planned to submit, consultant, snagging, QC, initial handover, client) from the unit console, or when Customer care finishes a <Link href={`/docs/handovers/new?project=${id}`}>unit handover</Link>.
          </p>
        </section>
      </div>
    </>
  );
}
