import Link from "next/link";
import { projectBase } from "@/lib/slug";
import { ColumnChart, Donut, Sparkline, type Col } from "@/components/Charts";
import type { ProjectStatus } from "@/components/Kpis";
import { SCurve, type CurvePoint } from "@/components/SCurve";
import { fetchAll } from "@/lib/construction";
import { type Profile, type QueueItem, sortQueue } from "@/lib/data";
import { docHref } from "@/lib/docs";
import { date, index2, money, pct } from "@/lib/format";
import { HANDOVER, HANDOVER_BY_KEY } from "@/lib/handover";
import { createClient } from "@/lib/supabase/server";

type Supa = Awaited<ReturnType<typeof createClient>>;
type Phase = { id: string; code: string; name: string; budget_egp: number; finish_date: string | null };
type Progress = { phase_id: string; period: string; planned_pct: number; actual_pct: number };
type U = { id: string; phase_id: string | null; handover_stage: string; handover_stage_at: string | null; delivery_date: string | null; status: string };
type Log = { stage: string; at: string; note: string; created_at: string; units: { code: string } | null };

const MONTH = (d: Date) => d.toLocaleDateString("en-GB", { month: "short" });
const ym = (d: Date) => d.toISOString().slice(0, 7);

// Next owner of each handover stage, so the dashboard can say who acts.
const NEXT_BY: Record<string, string> = {
  not_started: "Site", submitted: "Technical office", submitted_consultant: "Site", snagging_con: "Quality", submitted_qc: "Quality",
  snagging_qc: "Site", qc_approved: "Customer care", initial: "Customer care",
};

// Everything a project dashboard shows, from one round of queries.
export async function loadDash(supabase: Supa, id: string) {
  const [{ data: p }, { data: phases }, { data: progress }, units, { data: log }, { data: queue }] = await Promise.all([
    supabase.from("project_status").select("*").eq("id", id).maybeSingle(),
    supabase.from("phases").select("id, code, name, budget_egp, finish_date").eq("project_id", id).order("code"),
    supabase.from("progress_updates").select("phase_id, period, planned_pct, actual_pct").eq("project_id", id).order("period"),
    fetchAll<U>((a, b) => supabase.from("units").select("id, phase_id, handover_stage, handover_stage_at, delivery_date, status").eq("project_id", id).range(a, b)),
    supabase.from("unit_stage_log").select("stage, at, note, created_at, units(code)").eq("project_id", id).order("at", { ascending: false }).order("created_at", { ascending: false }).limit(8),
    supabase.from("work_queue").select("*").eq("project_id", id),
  ]);
  return {
    p: p as ProjectStatus | null,
    phases: (phases ?? []) as Phase[],
    progress: (progress ?? []) as Progress[],
    units,
    log: (log ?? []) as unknown as Log[],
    queue: sortQueue((queue ?? []) as QueueItem[]),
  };
}

export async function ProjectDashboard({ id, me, greeting }: { id: string; me: Profile | null; greeting?: boolean }) {
  const supabase = await createClient();
  const d = await loadDash(supabase, id);
  if (!d.p) return null;
  const p = d.p;
  const base = await projectBase(id);
  const today = new Date().toISOString().slice(0, 10);

  // Progress per phase (latest) and the project curve weighted by phase budget.
  const latest = new Map<string, Progress>();
  for (const r of d.progress) latest.set(r.phase_id, r);
  const weight = new Map(d.phases.map((x) => [x.id, Number(x.budget_egp) || 1]));
  const totalW = [...weight.values()].reduce((a, b) => a + b, 0) || 1;
  const periods = [...new Set(d.progress.map((r) => r.period))].sort();
  const seen = new Map<string, Progress>();
  const curve: CurvePoint[] = periods.map((period) => {
    for (const r of d.progress.filter((x) => x.period === period)) seen.set(r.phase_id, r);
    let planned = 0, actual = 0;
    for (const [ph, r] of seen) { const w = (weight.get(ph) ?? 1) / totalW; planned += r.planned_pct * w; actual += r.actual_pct * w; }
    return { period, planned, actual };
  });
  const builtNow = curve.at(-1)?.actual ?? Number(p.actual_pct ?? 0);
  const planNow = curve.at(-1)?.planned ?? Number(p.planned_pct ?? 0);

  // Handover.
  const stageCount = new Map<string, number>();
  for (const u of d.units) stageCount.set(u.handover_stage, (stageCount.get(u.handover_stage) ?? 0) + 1);
  const n = (k: string) => stageCount.get(k) ?? 0;
  const delivered = n("client_delivered");
  const inHandover = HANDOVER.slice(1, 8).reduce((s, h) => s + n(h.key), 0);
  const late = d.units.filter((u) => u.delivery_date && u.delivery_date < today && u.handover_stage !== "client_delivered").length;
  const due30 = d.units.filter((u) => u.delivery_date && u.delivery_date >= today && u.delivery_date <= new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10) && u.handover_stage !== "client_delivered").length;

  // Deliveries per month: planned (contract date) against delivered (date it reached the client).
  const now = new Date(); now.setDate(1);
  const cols: Col[] = [];
  for (let k = -5; k <= 6; k++) {
    const m = new Date(now.getFullYear(), now.getMonth() + k, 15);
    const key = ym(m);
    cols.push({
      label: MONTH(m),
      a: d.units.filter((u) => u.handover_stage === "client_delivered" && (u.handover_stage_at ?? "").startsWith(key)).length,
      b: d.units.filter((u) => (u.delivery_date ?? "").startsWith(key)).length,
      now: k === 0,
    });
  }

  // What needs someone today.
  const mine = me?.department ? d.queue.filter((q) => q.department === me.department) : [];
  const needs: { chip: string; tone: string; title: string; who: string; href: string; btn: string }[] = [];
  for (const q of mine.slice(0, 2)) {
    needs.push({ chip: q.overdue ? `Overdue · ${q.days_waiting} days` : "Your turn", tone: q.overdue ? "overdue" : "waiting", title: `${q.ref} · ${q.title}`, who: `${q.step_name} · waiting ${q.days_waiting} days`, href: docHref(q.doc_type, q.doc_id), btn: "Open" });
  }
  if (n("qc_approved")) needs.push({ chip: "Ready", tone: "waiting", title: `${n("qc_approved")} units are approved by QC and wait for initial handover`, who: "Customer care · book the client visits", href: `${base}/delivery?stage=qc_approved`, btn: "Open in handover" });
  if (n("snagging_qc") + n("snagging_con")) needs.push({ chip: "Snagging", tone: "overdue", title: `${n("snagging_qc") + n("snagging_con")} units have open snags`, who: `Site · ${n("snagging_con")} from the consultant, ${n("snagging_qc")} from Quality`, href: `${base}/delivery?stage=snagging_qc`, btn: "See the units" });
  if (n("submitted_qc")) needs.push({ chip: "With Quality", tone: "waiting", title: `${n("submitted_qc")} units wait for QC inspection`, who: "Quality · inspect or return with snags", href: `${base}/delivery?stage=submitted_qc`, btn: "Open in handover" });
  if (late) needs.push({ chip: "Late", tone: "overdue", title: `${late} units are past their contract delivery date`, who: "Project management · agree new dates or speed up handover", href: `${base}/console?mode=delivery`, btn: "Show on the map" });
  const behind = d.phases.map((x) => ({ x, r: latest.get(x.id) })).filter(({ r }) => r && r.planned_pct - r.actual_pct > 2).sort((a, b) => (b.r!.planned_pct - b.r!.actual_pct) - (a.r!.planned_pct - a.r!.actual_pct));
  if (behind[0]) needs.push({ chip: "Behind plan", tone: "overdue", title: `${behind[0].x.name || behind[0].x.code} is ${(behind[0].r!.planned_pct - behind[0].r!.actual_pct).toFixed(1)} pts behind plan`, who: "Site · see which work stage is behind", href: `${base}/construction`, btn: "Open construction" });
  const firstName = (me?.full_name || "").split(" ")[0];
  const hour = new Date().getUTCHours() + 2;
  const hello = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const spark = curve.slice(-12);

  return (
    <div className="we-dash">
      {greeting && (
        <div className="we-pagehead we-pagehead--intro">
          <div>
            <div className="we-eyebrow we-eyebrow--brand">{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })} · {p.name}</div>
            <h1>{hello}{firstName ? `, ${firstName}` : ""}</h1>
            <p className="we-purpose">What needs you today, then where {p.name} stands. Every number opens the page behind it.</p>
          </div>
          <div className="we-row">
            <Link className="we-btn we-btn--secondary" href={`${base}/schedule`}>Gantt chart</Link>
            <Link className="we-btn we-btn--primary" href={`${base}/console`}>Open the unit map</Link>
          </div>
        </div>
      )}

      <section className="we-panel we-span-8">
        <div className="we-panel__head"><h2>Needs you</h2><small>{needs.length ? `${needs.length} open` : "all clear"}</small></div>
        {needs.length === 0 ? <p className="we-help" style={{ margin: 0 }}>Nothing is waiting on you right now.</p> : (
          <div className="we-needs">
            {needs.slice(0, 5).map((x, i) => (
              <div key={i} className="we-need">
                <span className={`we-chip we-chip--${x.tone}`}>{x.chip}</span>
                <div className="we-need__body"><div className="we-need__title">{x.title}</div><div className="we-need__who">{x.who}</div></div>
                <Link className="we-btn we-btn--primary we-btn--sm" href={x.href}>{x.btn}</Link>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="we-panel we-span-4">
        <div className="we-panel__head"><h2>Handover</h2><Link className="we-link" href={`${base}/delivery`}>Pipeline</Link></div>
        <div className="we-row" style={{ alignItems: "center", flexWrap: "nowrap", gap: 16 }}>
          <Donut label="Units by handover stage" parts={HANDOVER.map((h) => ({ label: h.label, value: n(h.key), color: h.color }))} />
          <ul className="we-legendlist" style={{ flex: 1, minWidth: 0 }}>
            {HANDOVER.filter((h) => n(h.key)).map((h) => (
              <li key={h.key}><Link href={`${base}/delivery?stage=${h.key}`}><i style={{ background: h.color }} />{h.short}<b>{n(h.key)}</b></Link></li>
            ))}
          </ul>
        </div>
      </section>

      <div className="we-kcards">
        <Link className="we-kcard" href={`${base}/construction`}>
          <span className="we-kcard__label">Built</span>
          <span className="we-kcard__value">{pct(builtNow)}</span>
          <span className={`we-kcard__note${builtNow + 1 < planNow ? " is-bad" : " is-good"}`}>plan {pct(planNow)} · {builtNow + 1 < planNow ? `${(planNow - builtNow).toFixed(1)} pts behind` : "on plan"}</span>
          <Sparkline values={spark.map((c) => c.actual)} plan={spark.map((c) => c.planned)} />
        </Link>
        <Link className="we-kcard" href={`${base}/schedule`}>
          <span className="we-kcard__label">Schedule index (SPI)</span>
          <span className="we-kcard__value">{index2(p.spi)}</span>
          <span className={`we-kcard__note${p.spi != null && p.spi < 0.95 ? " is-bad" : ""}`}>below 1.00 is behind plan</span>
        </Link>
        <Link className="we-kcard" href={`${base}/budget`}>
          <span className="we-kcard__label">Cost index (CPI)</span>
          <span className="we-kcard__value">{index2(p.cpi)}</span>
          <span className={`we-kcard__note${p.cpi != null && p.cpi < 0.95 ? " is-bad" : ""}`}>below 1.00 is over budget</span>
        </Link>
        <Link className="we-kcard" href={`${base}/delivery?stage=client_delivered`}>
          <span className="we-kcard__label">Delivered to clients</span>
          <span className="we-kcard__value">{delivered}</span>
          <span className="we-kcard__note">of {d.units.length} units · {d.units.length ? pct((delivered * 100) / d.units.length) : "–"}</span>
        </Link>
        <Link className="we-kcard" href={`${base}/delivery`}>
          <span className="we-kcard__label">In handover now</span>
          <span className="we-kcard__value">{inHandover}</span>
          <span className="we-kcard__note">{due30} more due in 30 days</span>
        </Link>
        <Link className="we-kcard" href={`${base}/console?mode=delivery`}>
          <span className="we-kcard__label">Late for delivery</span>
          <span className="we-kcard__value">{late}</span>
          <span className={`we-kcard__note${late ? " is-bad" : " is-good"}`}>{late ? "past the contract date" : "none late"}</span>
        </Link>
        <Link className="we-kcard" href="/my-work">
          <span className="we-kcard__label">Waiting in workflows</span>
          <span className="we-kcard__value">{d.queue.length}</span>
          <span className={`we-kcard__note${d.queue.some((q) => q.overdue) ? " is-bad" : ""}`}>{d.queue.filter((q) => q.overdue).length} overdue</span>
        </Link>
        {p.budget_egp != null && (
          <Link className="we-kcard" href={`${base}/budget`}>
            <span className="we-kcard__label">Budget (EGP)</span>
            <span className="we-kcard__value">{money(Number(p.budget_egp) / 1e6)}M</span>
            <span className="we-kcard__note">spent {p.ac_egp != null ? `${money(Number(p.ac_egp) / 1e6)}M` : "–"}</span>
          </Link>
        )}
      </div>

      <section className="we-panel we-span-6">
        <div className="we-panel__head"><h2>Phases</h2><small>dark bar built · gold line plan today</small></div>
        <div className="we-bars">
          {d.phases.map((x) => {
            const r = latest.get(x.id);
            const a = Number(r?.actual_pct ?? 0), pl = Number(r?.planned_pct ?? 0);
            const v = a - pl;
            const us = d.units.filter((u) => u.phase_id === x.id);
            return (
              <Link key={x.id} className="we-barrow" href={`${base}/construction`}>
                <div><div className="we-barrow__name">{x.name || x.code}</div><div className="we-barrow__meta">{us.length} units · {us.filter((u) => u.handover_stage === "client_delivered").length} delivered{x.finish_date ? ` · finish ${date(x.finish_date)}` : ""}</div></div>
                <div><div className="we-barrow__val">{pct(a)}</div><div className="we-barrow__var" style={{ color: v < -1 ? "var(--status-overdue)" : "var(--status-done)" }}>{v < -1 ? `${(-v).toFixed(1)} pts behind` : "on plan"}</div></div>
                <div className="we-track"><i style={{ width: `${Math.min(100, a)}%` }} /><b style={{ left: `${Math.min(100, pl)}%` }} /></div>
              </Link>
            );
          })}
          {d.phases.length === 0 && <p className="we-help">No phases yet. Add them in project setup.</p>}
        </div>
      </section>

      <section className="we-panel we-span-6">
        <div className="we-panel__head"><h2>Deliveries by month</h2><Link className="we-link" href={`${base}/delivery`}>Open handover</Link></div>
        <ColumnChart cols={cols} aLabel="Delivered" bLabel="Due by contract" title="Units delivered and due per month" />
      </section>

      <section className="we-panel we-span-8">
        <div className="we-panel__head"><h2>Progress over time</h2><small>planned against built, whole project</small></div>
        <SCurve points={curve} />
      </section>

      <section className="we-panel we-span-4">
        <div className="we-panel__head"><h2>Latest on site</h2></div>
        {d.log.length === 0 ? <p className="we-help" style={{ margin: 0 }}>Moves through handover show here.</p> : (
          <ul className="we-feed">
            {d.log.map((l, i) => (
              <li key={i}>
                <i style={{ background: HANDOVER_BY_KEY[l.stage]?.color ?? "var(--steel)" }} />
                <div><b className="we-mono">{l.units?.code ?? "Unit"}</b> moved to {HANDOVER_BY_KEY[l.stage]?.label ?? l.stage}{l.note && l.note !== "Sample history" ? ` · ${l.note}` : ""}<br /><small className="we-help">next: {NEXT_BY[l.stage] ?? "done"}</small></div>
                <time>{date(l.at)}</time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
