import Link from "next/link";
import { projectBase } from "@/lib/slug";
import { ActionForm } from "@/components/ActionForm";
import { Curve, type Point } from "@/components/Curve";
import { Gantt, type GanttActivity } from "@/components/Gantt";
import { Kpi } from "@/components/Kpis";
import { getMe, acts as actsFor } from "@/lib/data";
import { date, money, pct } from "@/lib/format";
import { getScope, scoped } from "@/lib/scope";
import { createClient } from "@/lib/supabase/server";
import { CATEGORIES, STANDARD } from "@/lib/scheduleTemplate";
import { addActivityProgress, addPhaseProgress } from "../actions";
import { addStandardSchedule, deleteActivity, recalculate, saveActivity } from "./actions";

type Activity = {
  id: string; code: string; name: string; wbs: string; start_date: string | null; finish_date: string | null; is_milestone: boolean; weight: number;
  version_id: string; category: string; phase_id: string | null; milestone_kind: "start" | "finish" | null; total_float: number | null;
  is_critical: boolean; duration_days: number | null;
};
type Link = { pred_id: string; succ_id: string; type: string; lag_days: number };
type AP = { activity_id: string; period: string; actual_pct: number };

const today = new Date().toISOString().slice(0, 10);
const monthEnd = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
};

// Where an activity should be by a date, assuming steady progress between its dates.
function plannedPct(a: Activity, at: string) {
  if (!a.start_date || !a.finish_date) return 0;
  if (at <= a.start_date) return 0;
  if (at >= a.finish_date) return 100;
  const s = Date.parse(a.start_date), f = Date.parse(a.finish_date), t = Date.parse(at);
  return f > s ? ((t - s) / (f - s)) * 100 : 100;
}

export default async function SchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const base = await projectBase(id);
  const supabase = await createClient();
  const me = await getMe();
  const [{ data: phases }, { data: updates }, { data: versions }, { data: acts }, { data: ap }, { data: lk }] = await Promise.all([
    supabase.from("phases").select("id, code, name").eq("project_id", id).order("code"),
    supabase.from("progress_updates").select("*, phases(name)").eq("project_id", id).order("period", { ascending: false }).limit(60),
    supabase.from("schedule_versions").select("*").eq("project_id", id).order("created_at"),
    scoped(supabase.from("activities").select("*").eq("project_id", id).order("start_date").limit(3000), await getScope(id), { building: true }),
    supabase.from("activity_progress").select("activity_id, period, actual_pct").eq("project_id", id).order("period"),
    supabase.from("activity_links").select("pred_id, succ_id, type:kind, lag_days").eq("project_id", id).limit(20000),
  ]);
  const canPlan = actsFor(me, ["cost_control", "pm", "tech_office"]);
  const canEnter = actsFor(me, ["site", "cost_control", "pm"]);
  const baseline = (versions ?? []).find((v) => v.is_baseline);
  const activities = ((acts ?? []) as Activity[]).filter((a) => !baseline || a.version_id === baseline.id);
  const latest = new Map<string, AP>();
  for (const r of (ap ?? []) as AP[]) latest.set(r.activity_id, r);

  const totalW = activities.reduce((s, a) => s + Number(a.weight || 1), 0) || 1;
  const planned = activities.reduce((s, a) => s + plannedPct(a, today) * Number(a.weight || 1), 0) / totalW;
  const actual = activities.reduce((s, a) => s + (latest.get(a.id)?.actual_pct ?? 0) * Number(a.weight || 1), 0) / totalW;
  const late = activities.filter((a) => (latest.get(a.id)?.actual_pct ?? 0) < 100 && a.finish_date && a.finish_date < today);
  const links = ((lk ?? []) as Link[]);
  const phaseName = new Map((phases ?? []).map((p) => [p.id, p.name as string]));
  const codeOf = new Map(activities.map((a) => [a.id, a.code]));
  const predText = (id: string) =>
    links.filter((l) => l.succ_id === id && codeOf.has(l.pred_id))
      .map((l) => `${codeOf.get(l.pred_id)}${l.type === "FS" && !l.lag_days ? "" : ` ${l.type}`}${l.lag_days ? (l.lag_days > 0 ? "+" : "") + l.lag_days : ""}`).join(", ");
  const gantt: GanttActivity[] = activities.map((a) => ({
    id: a.id, code: a.code, name: a.name, category: a.category, wbs: a.wbs, phase: phaseName.get(a.phase_id ?? "") ?? "",
    start: a.start_date, finish: a.finish_date, milestone: a.is_milestone ? (a.milestone_kind ?? "finish") : null,
    critical: a.is_critical, float: a.total_float, actual: latest.get(a.id)?.actual_pct ?? 0, plan: plannedPct(a, today),
  }));
  const milestones = activities.filter((a) => a.is_milestone).sort((a, b) => (a.start_date ?? "").localeCompare(b.start_date ?? ""));

  // Planned and actual curves, month by month.
  const ends: string[] = [];
  const first = activities.map((a) => a.start_date).filter(Boolean).sort()[0];
  const last = activities.map((a) => a.finish_date ?? a.start_date).filter(Boolean).sort().at(-1);
  if (first && last) {
    for (let d = new Date(`${first.slice(0, 7)}-01T00:00:00Z`); ; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
      const e = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
      ends.push(e);
      if (e >= last || ends.length > 240) break;
    }
  }
  const planCurve: Point[] = ends.map((e) => [e, activities.reduce((s, a) => s + plannedPct(a, e) * Number(a.weight || 1), 0) / totalW]);
  const hist = new Map<string, AP[]>();
  for (const r of (ap ?? []) as AP[]) hist.set(r.activity_id, [...(hist.get(r.activity_id) ?? []), r]);
  const actualAt = (e: string) =>
    activities.reduce((s, a) => s + ((hist.get(a.id) ?? []).filter((r) => r.period <= e).at(-1)?.actual_pct ?? 0) * Number(a.weight || 1), 0) / totalW;
  const actualCurve: Point[] = (ap ?? []).length ? [...ends.filter((e) => e < today), today].map((e) => [e, actualAt(e)]) : [];

  return (
    <>
      {activities.length > 0 && (
        <div className="we-kpis">
          <Kpi label="Schedule progress" value={pct(actual)} note={`Plan today ${pct(planned)}`} />
          <Kpi label="Schedule SPI" value={planned > 0 ? (actual / planned).toFixed(2) : "–"} note="From activity progress" bad={planned > 0 && actual / planned < 1} />
          <Kpi label="Activities" value={String(activities.length)} note={baseline ? `Baseline: ${baseline.name}` : "No baseline"} />
          <Kpi label="Late activities" value={String(late.length)} note="Past finish, not complete" bad={late.length > 0} />
          <Kpi label="Critical activities" value={String(activities.filter((a) => a.is_critical && !a.is_milestone).length)} note={last ? `Finish ${date(last)}` : ""} />
        </div>
      )}

      {activities.length > 0 && (
        <section className="we-stack">
          <div className="we-row" style={{ justifyContent: "space-between" }}>
            <h2 style={{ margin: 0 }}>Gantt chart</h2>
            {canPlan && links.length > 0 && (
              <ActionForm action={recalculate.bind(null, id)} className="we-row"><button className="we-btn we-btn--secondary we-btn--sm">Recalculate dates and critical path</button></ActionForm>
            )}
          </div>
          <Gantt activities={gantt} links={links.map((l) => ({ pred: l.pred_id, succ: l.succ_id, type: l.type, lag: l.lag_days }))} today={today} />
        </section>
      )}

      {activities.length > 0 && (
        <div className="we-grid">
          <section className="we-card">
            <h2>Planned against actual</h2>
            <Curve plan={planCurve} actual={actualCurve} today={today} />
          </section>
          <section className="we-card">
            <h2>Milestones</h2>
            {milestones.length === 0 ? <div className="we-help">No milestones yet.</div> : (
              <div className="we-table-wrap">
                <table className="we-table">
                  <thead><tr><th>Milestone</th><th>Date</th><th className="num">Float</th><th></th></tr></thead>
                  <tbody>
                    {milestones.map((m) => {
                      const doneM = (latest.get(m.id)?.actual_pct ?? 0) >= 100;
                      return (
                        <tr key={m.id}>
                          <td><div className="we-title">{m.milestone_kind === "start" ? "◇" : "◆"} {m.name}</div><div className="we-meta">{m.code}{m.category ? ` · ${m.category}` : ""}</div></td>
                          <td>{date(m.start_date)}</td>
                          <td className="num">{m.total_float ?? "–"}{m.total_float != null ? "d" : ""}</td>
                          <td>{doneM ? <span className="we-chip we-chip--done">Reached</span> : m.start_date && m.start_date < today ? <span className="we-chip we-chip--overdue">Late</span> : m.is_critical ? <span className="we-chip">Critical</span> : null}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {canPlan && (
        <div className="we-grid">
          <section className="we-card we-stack">
            <h2 style={{ margin: 0 }}>Add or change an activity</h2>
            <p className="we-help" style={{ margin: 0 }}>Typing an existing code changes that activity. Dates are worked out from the links; give a start date only to an activity with no predecessors.</p>
            <ActionForm action={saveActivity.bind(null, id)} className="we-form-grid" resetOnOk>
              <div className="we-field"><label htmlFor="code">Code</label><input id="code" name="code" className="we-input we-mono" placeholder="X130" required /></div>
              <div className="we-field" style={{ gridColumn: "span 2" }}><label htmlFor="name">Name</label><input id="name" name="name" className="we-input" placeholder="Concrete structure B01" required /></div>
              <div className="we-field">
                <label htmlFor="kind">Type</label>
                <select id="kind" name="kind" className="we-input we-select"><option value="task">Activity</option><option value="start">Start milestone</option><option value="finish">Finish milestone</option></select>
              </div>
              <div className="we-field">
                <label htmlFor="category">Category</label>
                <select id="category" name="category" className="we-input we-select">{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
              </div>
              <div className="we-field"><label htmlFor="duration">Duration (days)</label><input id="duration" name="duration" className="we-input we-mono" inputMode="numeric" placeholder="30" /></div>
              <div className="we-field" style={{ gridColumn: "span 2" }}>
                <label htmlFor="preds">Predecessors <span className="we-help">· e.g. X120 SS+40, E110 FS, X180 FF</span></label>
                <input id="preds" name="preds" className="we-input we-mono" placeholder="X120 SS+40" />
              </div>
              <div className="we-field">
                <label htmlFor="sphase">Phase</label>
                <select id="sphase" name="phase_id" className="we-input we-select"><option value="">Whole project</option>{(phases ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
              </div>
              <div className="we-field"><label htmlFor="swbs">WBS</label><input id="swbs" name="wbs" className="we-input" placeholder="PH01.Execution" /></div>
              <div className="we-field"><label htmlFor="sstart">Start (optional)</label><input id="sstart" name="start_date" type="date" className="we-input" /></div>
              <div className="we-field" style={{ alignSelf: "end" }}><button className="we-btn we-btn--primary">Save activity</button></div>
            </ActionForm>
          </section>

          <section className="we-card we-stack">
            <h2 style={{ margin: 0 }}>Start from the standard schedule</h2>
            <p className="we-help" style={{ margin: 0 }}>
              Adds {STANDARD.length} activities and milestones for a phase: design, permits, tender and award, procurement, excavation through finishes and external works,
              snagging and handover, already linked (finish-to-start, start-to-start and finish-to-finish with lags). Change any of them afterwards.
            </p>
            <ActionForm action={addStandardSchedule.bind(null, id)} className="we-form-grid">
              <div className="we-field">
                <label htmlFor="tphase">Phase</label>
                <select id="tphase" name="phase_id" className="we-input we-select"><option value="">Whole project</option>{(phases ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
              </div>
              <div className="we-field"><label htmlFor="tstart">Notice to proceed</label><input id="tstart" name="start_date" type="date" className="we-input" defaultValue={today} required /></div>
              <div className="we-field" style={{ alignSelf: "end" }}><button className="we-btn we-btn--secondary">Add standard schedule</button></div>
            </ActionForm>
          </section>
        </div>
      )}

      <div className="we-grid">
        <section className="we-card">
          <h2>Monthly progress by phase</h2>
          <p className="we-help" style={{ marginTop: 0 }}>This drives SPI, CPI and earned value on the overview.</p>
          {canEnter ? (
            <ActionForm action={addPhaseProgress.bind(null, id)} className="we-form-grid" resetOnOk>
              <div className="we-field">
                <label htmlFor="phase_id">Phase</label>
                <select id="phase_id" name="phase_id" className="we-input we-select" required>
                  {(phases ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="we-field"><label htmlFor="period">Month ending</label><input id="period" name="period" type="date" className="we-input" defaultValue={monthEnd()} required /></div>
              <div className="we-field"><label htmlFor="planned_pct">Planned %</label><input id="planned_pct" name="planned_pct" className="we-input we-mono" inputMode="decimal" required /></div>
              <div className="we-field"><label htmlFor="actual_pct">Actual %</label><input id="actual_pct" name="actual_pct" className="we-input we-mono" inputMode="decimal" required /></div>
              <div className="we-field"><label htmlFor="actual_cost_egp">Actual cost to date (EGP)</label><input id="actual_cost_egp" name="actual_cost_egp" className="we-input we-mono" inputMode="decimal" /></div>
              <div className="we-field"><label htmlFor="note">Note</label><input id="note" name="note" className="we-input" /></div>
              <div className="we-field" style={{ alignSelf: "end" }}><button className="we-btn we-btn--primary">Save progress</button></div>
            </ActionForm>
          ) : (
            <div className="we-help">Site, Cost control and the PM enter progress.</div>
          )}
        </section>

        <section className="we-card we-stack">
          <h2 style={{ margin: 0 }}>Schedules</h2>
          {(versions ?? []).length === 0 ? (
            <div className="we-help">No schedule yet. Import one from Primavera P6, MS Project or Excel on the <Link href={`${base}/import`}>Import tab</Link>.</div>
          ) : (
            <ul className="we-checklist">
              {(versions ?? []).map((v) => (
                <li key={v.id}><b>{v.name}</b> <span className="we-help">{v.is_baseline ? "Baseline · " : ""}{v.source} · {date(v.created_at)}</span></li>
              ))}
            </ul>
          )}
          <div><Link className="we-btn we-btn--secondary we-btn--sm" href={`/docs/schedule-updates/new?project=${id}`}>Send a schedule update for approval</Link></div>
        </section>
      </div>

      <section className="we-stack">
        <h2 style={{ margin: 0 }}>Progress history</h2>
        <div className="we-table-wrap">
          <table className="we-table">
            <thead><tr><th>Month</th><th>Phase</th><th className="num">Plan</th><th className="num">Actual</th><th className="num">SPI</th><th className="num">Cost to date (EGP)</th></tr></thead>
            <tbody>
              {(updates ?? []).length === 0 && <tr><td colSpan={6} className="we-empty">No progress entered yet.</td></tr>}
              {(updates ?? []).map((u) => (
                <tr key={u.id}>
                  <td>{date(u.period)}</td>
                  <td>{(u.phases as { name: string } | null)?.name}</td>
                  <td className="num">{pct(u.planned_pct)}</td>
                  <td className="num">{pct(u.actual_pct)}</td>
                  <td className="num">{u.planned_pct > 0 ? (u.actual_pct / u.planned_pct).toFixed(2) : "–"}</td>
                  <td className="num">{money(u.actual_cost_egp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {activities.length > 0 && (
        <section className="we-stack">
          <div className="we-pagehead">
            <h2 style={{ margin: 0 }}>Activities <small>{activities.length}</small></h2>
          </div>
          {canEnter && (
            <ActionForm action={addActivityProgress.bind(null, id)} className="we-card we-form-grid" resetOnOk>
              <div className="we-field" style={{ gridColumn: "span 2" }}>
                <label htmlFor="activity_id">Activity</label>
                <select id="activity_id" name="activity_id" className="we-input we-select" required>
                  {activities.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                </select>
              </div>
              <div className="we-field"><label htmlFor="aperiod">As of</label><input id="aperiod" name="period" type="date" className="we-input" defaultValue={today} required /></div>
              <div className="we-field"><label htmlFor="aactual">Complete %</label><input id="aactual" name="actual_pct" className="we-input we-mono" inputMode="decimal" required /></div>
              <div className="we-field" style={{ alignSelf: "end" }}><button className="we-btn we-btn--primary">Update activity</button></div>
            </ActionForm>
          )}
          <details className="we-card">
            <summary>Activity list with links</summary>
            <div className="we-table-wrap">
              <table className="we-table">
                <thead><tr><th>Code</th><th>Activity</th><th>Start</th><th>Finish</th><th className="num">Days</th><th>Predecessors</th><th className="num">Float</th><th className="num">Plan today</th><th className="num">Actual</th>{canPlan && <th></th>}</tr></thead>
                <tbody>
                  {activities.slice(0, 500).map((a) => {
                    const act = latest.get(a.id)?.actual_pct ?? 0;
                    const plan = plannedPct(a, today);
                    return (
                      <tr key={a.id}>
                        <td><span className="we-code">{a.code}</span></td>
                        <td><div className="we-title">{a.is_milestone ? (a.milestone_kind === "start" ? "◇ " : "◆ ") : ""}{a.name}</div><div className="we-meta">{[a.category, a.wbs].filter(Boolean).join(" · ")}</div></td>
                        <td>{date(a.start_date)}</td>
                        <td>{a.is_milestone ? "" : date(a.finish_date)}</td>
                        <td className="num">{a.is_milestone ? 0 : a.duration_days ?? ""}</td>
                        <td className="we-mono" style={{ fontSize: 12 }}>{predText(a.id)}</td>
                        <td className={`num${a.is_critical ? " is-bad" : ""}`}>{a.total_float ?? ""}</td>
                        <td className="num">{pct(plan)}</td>
                        <td className={`num${act + 0.01 < plan ? " is-bad" : ""}`}>{pct(act)}</td>
                        {canPlan && <td><ActionForm action={deleteActivity.bind(null, id, a.id)} className="we-row"><button className="we-btn we-btn--ghost we-btn--sm" title="Delete">Delete</button></ActionForm></td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
          {activities.length > 500 && <span className="we-help">Showing the first 500 of {activities.length}.</span>}
        </section>
      )}
    </>
  );
}
