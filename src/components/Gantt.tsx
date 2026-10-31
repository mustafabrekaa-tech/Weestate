"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Select } from "@/components/Select";

export type GanttActivity = {
  id: string; code: string; name: string; category: string; wbs: string; phase: string;
  start: string | null; finish: string | null; milestone: "start" | "finish" | null;
  critical: boolean; float: number | null; actual: number; plan: number;
};
export type GanttLink = { pred: string; succ: string; type: string; lag: number };

const DAY = 86400000;
const day = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / DAY);
const ROW = 30, LEFT = 470;
const ZOOM = { week: 9, month: 3, quarter: 1.1 } as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmt = (d: string | null) => (d ? `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(2, 4)}` : "–");

type Group = "category" | "wbs" | "phase" | "none";
type Show = "all" | "critical" | "late" | "milestones";

// An interactive Gantt chart: bars for planned dates with actual progress inside,
// milestones as diamonds, links between activities, today's line and the critical path.
export function Gantt({ activities, links, today }: { activities: GanttActivity[]; links: GanttLink[]; today: string }) {
  const [zoom, setZoom] = useState<keyof typeof ZOOM>("month");
  const [group, setGroup] = useState<Group>("category");
  const [show, setShow] = useState<Show>("all");
  const [q, setQ] = useState("");
  const [arrows, setArrows] = useState(true);
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const dated = activities.filter((a) => a.start);
  const t0 = useMemo(() => {
    const ds = dated.map((a) => day(a.start!));
    const d = new Date((Math.min(...ds, day(today)) - 14) * DAY);
    return Math.round(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / DAY);
  }, [dated, today]);
  const t1 = useMemo(() => Math.max(...dated.map((a) => day(a.finish ?? a.start!)), day(today)) + 45, [dated, today]);
  const px = ZOOM[zoom];
  const width = Math.max(600, (t1 - t0) * px);
  const x = (d: string) => (day(d) - t0) * px;

  const late = (a: GanttActivity) => a.actual < 100 && !!a.finish && a.finish < today;
  const visible = activities.filter((a) => {
    if (show === "critical" && !a.critical) return false;
    if (show === "late" && !late(a)) return false;
    if (show === "milestones" && !a.milestone) return false;
    if (q && !`${a.code} ${a.name}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  const keyOf = (a: GanttActivity) => (group === "category" ? a.category || "Other" : group === "wbs" ? a.wbs || "No WBS" : group === "phase" ? a.phase || "No phase" : "");
  const groups = new Map<string, GanttActivity[]>();
  for (const a of visible) groups.set(keyOf(a), [...(groups.get(keyOf(a)) ?? []), a]);
  const order = ["Engineering", "Procurement", "Execution", "Handover"];
  const keys = [...groups.keys()].sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99) || a.localeCompare(b));

  type Line = { kind: "group"; key: string; list: GanttActivity[] } | { kind: "act"; a: GanttActivity };
  const lines: Line[] = [];
  for (const k of keys) {
    if (group !== "none") lines.push({ kind: "group", key: k, list: groups.get(k)! });
    if (!closed.has(k)) for (const a of groups.get(k)!) lines.push({ kind: "act", a });
  }
  const rowOf = new Map<string, number>();
  lines.forEach((l, i) => l.kind === "act" && rowOf.set(l.a.id, i));

  // Month (or quarter) ticks across the top.
  const ticks: { x: number; label: string; year: boolean }[] = [];
  for (let d = new Date(t0 * DAY); d.getTime() / DAY < t1; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + (zoom === "quarter" ? 3 : 1), 1))) {
    const m = d.getUTCMonth();
    ticks.push({ x: (d.getTime() / DAY - t0) * px, label: zoom === "quarter" ? `Q${Math.floor(m / 3) + 1} ${d.getUTCFullYear()}` : `${MONTHS[m]}${m === 0 || ticks.length === 0 ? ` ${d.getUTCFullYear()}` : ""}`, year: m === 0 });
  }

  const span = (list: GanttActivity[]) => {
    const s = list.filter((a) => a.start).map((a) => a.start!).sort()[0];
    const f = list.map((a) => a.finish ?? a.start).filter(Boolean).sort().at(-1);
    const w = list.reduce((t, a) => t + (a.milestone ? 0 : 1), 0) || 1;
    const done = list.reduce((t, a) => t + (a.milestone ? 0 : a.actual), 0) / w;
    return { s, f, done };
  };

  const paths = arrows
    ? links.flatMap((l) => {
        const pi = rowOf.get(l.pred), si = rowOf.get(l.succ);
        if (pi == null || si == null) return [];
        const p = activities.find((a) => a.id === l.pred)!, s = activities.find((a) => a.id === l.succ)!;
        if (!p.start || !s.start) return [];
        const pEnd = x(p.finish ?? p.start) + (p.milestone ? 0 : px), pStart = x(p.start);
        const sEnd = x(s.finish ?? s.start) + (s.milestone ? 0 : px), sStart = x(s.start);
        const fromX = l.type === "SS" || l.type === "SF" ? pStart : pEnd;
        const toX = l.type === "FF" || l.type === "SF" ? sEnd : sStart;
        const y1 = pi * ROW + ROW / 2, y2 = si * ROW + ROW / 2;
        const into = l.type === "FF" || l.type === "SF" ? 1 : -1; // arrive from the right for finish links
        const midX = into < 0 ? Math.min(fromX + 6, toX - 6) : Math.max(fromX + 6, toX + 6);
        const d = `M${fromX},${y1} H${midX} V${y2} H${toX + into * -1}`;
        return [{ d, crit: p.critical && s.critical, on: !!sel && (l.pred === sel || l.succ === sel), key: `${l.pred}-${l.succ}` }];
      })
    : [];

  const toToday = () => { if (box.current) box.current.scrollTo({ left: Math.max(0, x(today) - 240), behavior: "smooth" }); };
  // Open on today rather than the start of the project.
  useEffect(() => { if (box.current) box.current.scrollLeft = Math.max(0, x(today) - 240); }, [zoom]); // eslint-disable-line react-hooks/exhaustive-deps
  const picked = sel ? activities.find((a) => a.id === sel) : undefined;
  const preds = picked ? links.filter((l) => l.succ === picked.id).map((l) => ({ l, a: activities.find((a) => a.id === l.pred) })).filter((r) => r.a) : [];
  const succs = picked ? links.filter((l) => l.pred === picked.id).map((l) => ({ l, a: activities.find((a) => a.id === l.succ) })).filter((r) => r.a) : [];
  const days = (a: GanttActivity) => (a.start && a.finish ? day(a.finish) - day(a.start) + 1 : 0);
  const linkName: Record<string, string> = { FS: "finish to start", SS: "start to start", FF: "finish to finish", SF: "start to finish" };

  if (!dated.length) return <div className="we-card we-empty">No activities with dates yet.</div>;

  return (
    <div className="we-gantt-wrap">
      <div className="we-gantt-bar">
        <div className="we-toggle" role="group" aria-label="Zoom">
          {(["week", "month", "quarter"] as const).map((z) => <button key={z} type="button" className={zoom === z ? "is-on" : ""} onClick={() => setZoom(z)}>{z === "week" ? "Weeks" : z === "month" ? "Months" : "Quarters"}</button>)}
        </div>
        <div className="we-toggle" role="group" aria-label="Show">
          {([["all", "All"], ["critical", "Critical path"], ["late", "Late"], ["milestones", "Milestones"]] as const).map(([k, l]) => (
            <button key={k} type="button" className={show === k ? "is-on" : ""} onClick={() => setShow(k)}>{l}</button>
          ))}
        </div>
        <label className="we-gantt-ctl" style={{ whiteSpace: "nowrap" }}>Group by
          <Select className="we-input we-select" value={group} onChange={(e) => { setGroup(e.target.value as Group); setClosed(new Set()); }}>
            <option value="category">Engineering / execution</option><option value="wbs">WBS</option><option value="phase">Phase</option><option value="none">Nothing</option>
          </Select>
        </label>
        <button type="button" className="we-btn we-btn--secondary we-btn--sm" onClick={toToday}>Today</button>
        <label className="we-gantt-ctl"><input type="checkbox" checked={arrows} onChange={(e) => setArrows(e.target.checked)} /> Links</label>
        <input className="we-input" placeholder="Find an activity" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 220 }} />
        <span className="we-gantt-legend">
          <i className="lg-plan" /> Planned <i className="lg-done" /> Done <i className="lg-crit" /> Critical <i className="lg-late" /> Late <b>◆</b> Milestone
        </span>
      </div>

      {picked && (
        <div className="we-gantt-detail" role="region" aria-label="Selected activity">
          <div className="we-gantt-detail__head">
            <div>
              <div className="we-eyebrow">{[picked.category, picked.phase, picked.wbs].filter(Boolean).join(" · ")}</div>
              <h3 className="we-h3"><span className="we-code">{picked.code}</span> {picked.name}</h3>
            </div>
            <div className="we-row" style={{ gap: 8 }}>
              {picked.critical && <span className="we-chip we-chip--overdue">Critical path</span>}
              {late(picked) && <span className="we-chip we-chip--overdue">Late</span>}
              {!picked.critical && picked.float != null && <span className="we-chip we-chip--draft">Float {picked.float} days</span>}
              <button type="button" className="we-btn we-btn--ghost we-btn--sm" onClick={() => setSel(null)} aria-label="Close">Close</button>
            </div>
          </div>
          <dl className="we-dl we-dl--cols">
            <div><dt>Start</dt><dd className="we-mono">{fmt(picked.start)}</dd></div>
            <div><dt>Finish</dt><dd className="we-mono">{picked.milestone ? "Milestone" : fmt(picked.finish)}</dd></div>
            <div><dt>Duration</dt><dd className="we-mono">{picked.milestone ? "–" : `${days(picked)} days`}</dd></div>
            <div><dt>Done / plan today</dt><dd className="we-mono">{Math.round(picked.actual)}% / {Math.round(picked.plan)}%</dd></div>
          </dl>
          <div className="we-track" style={{ height: 10 }}><i style={{ width: `${picked.actual}%` }} /><b style={{ left: `${Math.min(100, picked.plan)}%` }} /></div>
          <div className="we-gantt-detail__links">
            <div><b>Comes after</b>{preds.length === 0 ? <p className="we-help">Nothing: it can start on its own date.</p> : <ul>{preds.map(({ l, a }) => <li key={a!.id}><button type="button" className="we-link" onClick={() => setSel(a!.id)}>{a!.code} {a!.name}</button> <span className="we-help">{linkName[l.type] ?? l.type}{l.lag ? `, lag ${l.lag} d` : ""}</span></li>)}</ul>}</div>
            <div><b>Holds up</b>{succs.length === 0 ? <p className="we-help">Nothing waits on it.</p> : <ul>{succs.map(({ l, a }) => <li key={a!.id}><button type="button" className="we-link" onClick={() => setSel(a!.id)}>{a!.code} {a!.name}</button> <span className="we-help">{linkName[l.type] ?? l.type}{l.lag ? `, lag ${l.lag} d` : ""}</span></li>)}</ul>}</div>
          </div>
        </div>
      )}

      <div className="we-gantt" ref={box} style={{ ["--gw" as string]: `${width}px`, ["--left" as string]: `${LEFT}px` }}>
        <div className="we-gantt__head">
          <div className="we-gantt__cols"><span>Activity</span><span>Start</span><span>Finish</span><span className="num">Done</span></div>
          <div className="we-gantt__scale" style={{ width }}>
            {ticks.map((t) => <span key={t.x} style={{ left: t.x }} className={t.year ? "is-year" : ""}>{t.label}</span>)}
          </div>
        </div>
        <div className="we-gantt__body" style={{ height: lines.length * ROW }}>
          <div className="we-gantt__grid" style={{ width, height: lines.length * ROW }}>
            {ticks.map((t) => <i key={t.x} style={{ left: t.x }} className={t.year ? "is-year" : ""} />)}
            <b className="we-gantt__today" style={{ left: x(today) }} title={`Today ${fmt(today)}`} />
            <svg className="we-gantt__links" width={width} height={lines.length * ROW} aria-hidden="true">
              <defs>
                <marker id="ga" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#8a96a0" /></marker>
                <marker id="gc" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#c0392b" /></marker>
              </defs>
              {paths.map((p) => <path key={p.key} d={p.d} className={`${p.crit ? "is-crit" : ""}${p.on ? " is-on" : ""}`} markerEnd={`url(#${p.crit ? "gc" : "ga"})`} />)}
            </svg>
          </div>
          {lines.map((l, i) => {
            if (l.kind === "group") {
              const sp = span(l.list);
              const open = !closed.has(l.key);
              return (
                <div key={`g-${l.key}`} className="we-gantt__row is-group" style={{ top: i * ROW }}>
                  <button type="button" className="we-gantt__left" onClick={() => setClosed((c) => { const n = new Set(c); if (n.has(l.key)) n.delete(l.key); else n.add(l.key); return n; })}>
                    <span className="we-gantt__name"><span className="caret">{open ? "▾" : "▸"}</span> {l.key} <small>{l.list.length}</small></span>
                    <span>{fmt(sp.s ?? null)}</span><span>{fmt(sp.f ?? null)}</span><span className="num">{Math.round(sp.done)}%</span>
                  </button>
                  {sp.s && sp.f && <span className="we-gantt__sum" style={{ left: x(sp.s), width: Math.max(4, x(sp.f) - x(sp.s) + px) }} />}
                </div>
              );
            }
            const a = l.a;
            const isLate = late(a);
            const tip = `${a.code} · ${a.name}\n${fmt(a.start)} → ${fmt(a.finish)}${a.float != null ? ` · float ${a.float}d` : ""}\nPlan today ${Math.round(a.plan)}% · done ${Math.round(a.actual)}%`;
            return (
              <div key={a.id} className={`we-gantt__row${a.critical ? " is-crit" : ""}${isLate ? " is-late" : ""}${sel === a.id ? " is-sel" : ""}`} style={{ top: i * ROW }} title={tip}
                onClick={() => setSel(sel === a.id ? null : a.id)}>
                <div className="we-gantt__left">
                  <span className="we-gantt__name"><span className="we-code">{a.code}</span> {a.name}</span>
                  <span>{fmt(a.start)}</span><span>{a.milestone ? "" : fmt(a.finish)}</span>
                  <span className={`num${a.actual + 0.5 < a.plan ? " is-bad" : ""}`}>{Math.round(a.actual)}%</span>
                </div>
                {a.start && (a.milestone ? (
                  <span className={`we-gantt__ms${a.actual >= 100 ? " is-done" : ""}`} style={{ left: x(a.start) - 7 }} />
                ) : (
                  <span className="we-gantt__bar" style={{ left: x(a.start), width: Math.max(3, x(a.finish ?? a.start) - x(a.start) + px) }}>
                    <span style={{ width: `${a.actual}%` }} />
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
