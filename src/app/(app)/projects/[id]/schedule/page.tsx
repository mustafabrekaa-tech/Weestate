import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { Kpi } from "@/components/Kpis";
import { getMe } from "@/lib/data";
import { date, money, pct } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { addActivityProgress, addPhaseProgress } from "../actions";

type Activity = { id: string; code: string; name: string; wbs: string; start_date: string | null; finish_date: string | null; is_milestone: boolean; weight: number; version_id: string };
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
  const supabase = await createClient();
  const me = await getMe();
  const [{ data: phases }, { data: updates }, { data: versions }, { data: acts }, { data: ap }] = await Promise.all([
    supabase.from("phases").select("id, code, name").eq("project_id", id).order("code"),
    supabase.from("progress_updates").select("*, phases(name)").eq("project_id", id).order("period", { ascending: false }).limit(60),
    supabase.from("schedule_versions").select("*").eq("project_id", id).order("created_at"),
    supabase.from("activities").select("*").eq("project_id", id).order("start_date").limit(3000),
    supabase.from("activity_progress").select("activity_id, period, actual_pct").eq("project_id", id).order("period"),
  ]);
  const canEnter = me?.is_admin || ["site", "cost_control", "pm"].includes(me?.department ?? "");
  const baseline = (versions ?? []).find((v) => v.is_baseline);
  const activities = ((acts ?? []) as Activity[]).filter((a) => !baseline || a.version_id === baseline.id);
  const latest = new Map<string, AP>();
  for (const r of (ap ?? []) as AP[]) latest.set(r.activity_id, r);

  const totalW = activities.reduce((s, a) => s + Number(a.weight || 1), 0) || 1;
  const planned = activities.reduce((s, a) => s + plannedPct(a, today) * Number(a.weight || 1), 0) / totalW;
  const actual = activities.reduce((s, a) => s + (latest.get(a.id)?.actual_pct ?? 0) * Number(a.weight || 1), 0) / totalW;
  const late = activities.filter((a) => (latest.get(a.id)?.actual_pct ?? 0) < 100 && a.finish_date && a.finish_date < today);

  return (
    <>
      {activities.length > 0 && (
        <div className="we-kpis">
          <Kpi label="Schedule progress" value={pct(actual)} note={`Plan today ${pct(planned)}`} />
          <Kpi label="Schedule SPI" value={planned > 0 ? (actual / planned).toFixed(2) : "–"} note="From activity progress" bad={planned > 0 && actual / planned < 1} />
          <Kpi label="Activities" value={String(activities.length)} note={baseline ? `Baseline: ${baseline.name}` : "No baseline"} />
          <Kpi label="Late activities" value={String(late.length)} note="Past finish, not complete" bad={late.length > 0} />
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
            <div className="we-help">No schedule yet. Import one from Primavera P6, MS Project or Excel on the <Link href={`/projects/${id}/import`}>Import tab</Link>.</div>
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
          <div className="we-table-wrap">
            <table className="we-table">
              <thead><tr><th>Code</th><th>Activity</th><th>Start</th><th>Finish</th><th className="num">Plan today</th><th className="num">Actual</th></tr></thead>
              <tbody>
                {activities.slice(0, 500).map((a) => {
                  const act = latest.get(a.id)?.actual_pct ?? 0;
                  const plan = plannedPct(a, today);
                  return (
                    <tr key={a.id}>
                      <td><span className="we-code">{a.code}</span></td>
                      <td><div className="we-title">{a.is_milestone ? "◆ " : ""}{a.name}</div>{a.wbs && <div className="we-meta">{a.wbs}</div>}</td>
                      <td>{date(a.start_date)}</td>
                      <td>{date(a.finish_date)}</td>
                      <td className="num">{pct(plan)}</td>
                      <td className={`num${act + 0.01 < plan ? " is-bad" : ""}`}>{pct(act)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {activities.length > 500 && <span className="we-help">Showing the first 500 of {activities.length}.</span>}
        </section>
      )}
    </>
  );
}
