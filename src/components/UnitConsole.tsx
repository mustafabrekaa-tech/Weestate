"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { ActionResult } from "@/lib/data";
import { HANDOVER, HANDOVER_BY_KEY } from "@/lib/handover";
import { UNIT_STATUS } from "@/lib/site";
import { createClient } from "@/lib/supabase/client";
import { ActionForm } from "./ActionForm";

const Plan3D = dynamic(() => import("./Plan3D").then((m) => m.Plan3D), {
  ssr: false,
  loading: () => <div className="we-uc__loading">Building the 3D view…</div>,
});

export type CUnit = {
  id: string; code: string; type: string; phase: string | null; zone: string | null; building: string | null; floor: number | null;
  status: string; ho: string; hoAt: string | null; prio: boolean; due: string | null; target: string | null; pct: number;
  area: number | null; poly: [number, number][] | null;
};
export type COpt = { id: string; label: string };
export type CBuilding = { id: string; code: string; name: string; zone: string | null; phase: string | null; floors: number };
export type Mode = "handover" | "construction" | "sales" | "delivery";
type View = "plan" | "tiles" | "3d";
type Bucket = { key: string; label: string; color: string };

const today = new Date().toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);
const in30 = addDays(today, 30);
const in90 = addDays(today, 90);

const CONSTRUCTION: Bucket[] = [
  { key: "c0", label: "Not started", color: "#cfd5db" },
  { key: "c1", label: "1–24%", color: "#f4e2b0" },
  { key: "c2", label: "25–49%", color: "#e6c26a" },
  { key: "c3", label: "50–74%", color: "#c9a24e" },
  { key: "c4", label: "75–99%", color: "#86a96f" },
  { key: "c5", label: "Complete", color: "#2f7d4f" },
];
const DELIVERY: Bucket[] = [
  { key: "late", label: "Late", color: "#be123c" },
  { key: "d30", label: "Due in 30 days", color: "#f97316" },
  { key: "d90", label: "Due in 90 days", color: "#eab308" },
  { key: "later", label: "Later", color: "#6b8aa6" },
  { key: "nodate", label: "No date", color: "#cfd5db" },
  { key: "delivered", label: "Delivered", color: "#166534" },
];
const SALES: Bucket[] = Object.entries(UNIT_STATUS).map(([key, v]) => ({ key, label: v.label, color: v.color }));
const HO: Bucket[] = HANDOVER.map((s) => ({ key: s.key, label: s.short, color: s.color }));
const BUCKETS: Record<Mode, Bucket[]> = { handover: HO, construction: CONSTRUCTION, sales: SALES, delivery: DELIVERY };
const MODE_LABEL: Record<Mode, string> = { handover: "Handover stage", construction: "Construction", sales: "Sales status", delivery: "Delivery date" };

function bucketOf(mode: Mode, u: CUnit): string {
  if (mode === "handover") return HANDOVER_BY_KEY[u.ho] ? u.ho : "not_started";
  if (mode === "sales") return u.status;
  if (mode === "construction") {
    const p = u.pct;
    return p <= 0 ? "c0" : p < 25 ? "c1" : p < 50 ? "c2" : p < 75 ? "c3" : p < 99.95 ? "c4" : "c5";
  }
  if (u.ho === "client_delivered") return "delivered";
  if (!u.due) return "nodate";
  return u.due < today ? "late" : u.due <= in30 ? "d30" : u.due <= in90 ? "d90" : "later";
}

const short = (code: string) => code.includes("-") ? code.slice(code.indexOf("-") + 1) : code;
const fmtDate = (d: string | null) => d ? new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const centroid = (p: [number, number][]) => [p.reduce((a, q) => a + q[0], 0) / p.length, p.reduce((a, q) => a + q[1], 0) / p.length] as const;

function toggle<T>(set: Set<T>, v: T) {
  const n = new Set(set);
  if (n.has(v)) n.delete(v); else n.add(v);
  return n;
}

export function UnitConsole({
  projectId, units, phases, zones, buildings, stages, stagePct, plan, initialMode = "handover", initialView,
  can, actions, title = "Unit console", height = 620, initial,
}: {
  projectId: string;
  units: CUnit[];
  phases: COpt[];
  zones: COpt[];
  buildings: CBuilding[];
  stages: { id: string; name: string }[];
  stagePct: Record<string, number[]>;
  plan: { image: string; w: number; h: number } | null;
  initialMode?: Mode;
  initialView?: View;
  can: { handover: boolean; build: boolean; dates: boolean; priority: boolean };
  actions: {
    handover: (prev: ActionResult, f: FormData) => Promise<ActionResult>;
    construction: (prev: ActionResult, f: FormData) => Promise<ActionResult>;
    delivery: (prev: ActionResult, f: FormData) => Promise<ActionResult>;
    priority: (ids: string[], on: boolean) => Promise<ActionResult>;
  };
  title?: string;
  height?: number;
  initial?: { phase?: string; zone?: string };
}) {
  const hasPlan = !!plan && units.some((u) => u.poly);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [view, setView] = useState<View>(initialView && (initialView === "tiles" || hasPlan) ? initialView : hasPlan ? "plan" : "tiles");
  const [fPhase, setFPhase] = useState<Set<string>>(new Set(initial?.phase ? [initial.phase] : []));
  const [fZone, setFZone] = useState<Set<string>>(new Set(initial?.zone ? [initial.zone] : []));
  const [fType, setFType] = useState<Set<string>>(new Set());
  const [fBucket, setFBucket] = useState<Set<string>>(new Set());
  const [prioOnly, setPrioOnly] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState<string | null>(null);
  const [multi, setMulti] = useState(false);
  const [tab, setTab] = useState<"handover" | "construction" | "delivery">(initialMode === "construction" ? "construction" : initialMode === "delivery" ? "delivery" : "handover");
  const [note, setNote] = useState<ActionResult>(null);
  const [pending, start] = useTransition();

  const byId = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  const bById = useMemo(() => new Map(buildings.map((b) => [b.id, b])), [buildings]);
  const phaseName = useMemo(() => new Map(phases.map((p) => [p.id, p.label])), [phases]);
  const zoneName = useMemo(() => new Map(zones.map((z) => [z.id, z.label])), [zones]);
  const types = useMemo(() => [...new Set(units.map((u) => u.type).filter(Boolean))].sort(), [units]);
  const zonesShown = useMemo(() => {
    const used = new Set(units.filter((u) => !fPhase.size || fPhase.has(u.phase ?? "")).map((u) => u.zone));
    return zones.filter((z) => used.has(z.id));
  }, [zones, units, fPhase]);
  const buckets = BUCKETS[mode];
  const colorOf = useMemo(() => {
    const m = new Map(buckets.map((b) => [b.key, b.color]));
    return (u: CUnit) => m.get(bucketOf(mode, u)) ?? "#cfd5db";
  }, [buckets, mode]);

  const needle = q.trim().toLowerCase();
  const matches = useMemo(() => {
    const ok = new Set<string>();
    for (const u of units) {
      if (fPhase.size && !fPhase.has(u.phase ?? "")) continue;
      if (fZone.size && !fZone.has(u.zone ?? "")) continue;
      if (fType.size && !fType.has(u.type)) continue;
      if (fBucket.size && !fBucket.has(bucketOf(mode, u))) continue;
      if (prioOnly && !u.prio) continue;
      if (needle) {
        const b = bById.get(u.building ?? "");
        const hay = `${u.code} ${b?.code ?? ""} ${zoneName.get(u.zone ?? "") ?? ""} ${u.type}`.toLowerCase();
        if (!needle.split(/[\s,]+/).filter(Boolean).some((n) => hay.includes(n))) continue;
      }
      ok.add(u.id);
    }
    return ok;
  }, [units, fPhase, fZone, fType, fBucket, prioOnly, needle, mode, bById, zoneName]);

  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const u of units) {
      if (fPhase.size && !fPhase.has(u.phase ?? "")) continue;
      if (fZone.size && !fZone.has(u.zone ?? "")) continue;
      if (fType.size && !fType.has(u.type)) continue;
      const k = bucketOf(mode, u);
      c.set(k, (c.get(k) ?? 0) + 1);
    }
    return c;
  }, [units, fPhase, fZone, fType, mode]);

  const shown = useMemo(() => units.filter((u) => matches.has(u.id)), [units, matches]);
  const kpi = useMemo(() => {
    const n = shown.length || 1;
    return {
      n: shown.length,
      pct: shown.reduce((s, u) => s + u.pct, 0) / n,
      delivered: shown.filter((u) => u.ho === "client_delivered").length,
      inHandover: shown.filter((u) => u.ho !== "not_started" && u.ho !== "client_delivered").length,
      late: shown.filter((u) => u.due && u.due < today && u.ho !== "client_delivered").length,
      prio: shown.filter((u) => u.prio).length,
    };
  }, [shown]);

  // Clicking: plain click picks one unit; with Ctrl/Shift (or multi-select on) it adds or removes.
  const pick = (id: string, additive: boolean) => {
    setNote(null);
    if (additive || multi) {
      setSel((s) => toggle(s, id));
      setFocus(id);
    } else {
      setSel((s) => (s.size === 1 && s.has(id) ? new Set() : new Set([id])));
      setFocus((f) => (f === id && sel.size === 1 ? null : id));
    }
  };
  const selectMany = (ids: string[], add: boolean) => {
    setSel((s) => {
      const n = add ? new Set(s) : new Set<string>();
      ids.forEach((i) => n.add(i));
      return n;
    });
    if (ids.length === 1) setFocus(ids[0]!);
  };
  const clear = () => { setSel(new Set()); setFocus(null); };
  const resetFilters = () => { setFPhase(new Set()); setFZone(new Set()); setFType(new Set()); setFBucket(new Set()); setPrioOnly(false); setQ(""); };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) clear();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const selIds = [...sel].filter((i) => byId.has(i));
  const focusUnit = focus ? byId.get(focus) : undefined;

  const exportCsv = () => {
    const list = selIds.length ? selIds.map((i) => byId.get(i)!) : shown;
    const head = ["Unit", "Type", "Phase", "Cluster", "Building", "Floor", "Handover stage", "Stage date", "Construction %", "Sales status", "Planned delivery", "Priority"];
    const rows = list.map((u) => [u.code, u.type, phaseName.get(u.phase ?? "") ?? "", zoneName.get(u.zone ?? "") ?? "", bById.get(u.building ?? "")?.code ?? "", u.floor ?? "",
      HANDOVER_BY_KEY[u.ho]?.label ?? u.ho, u.hoAt ?? "", u.pct.toFixed(1), UNIT_STATUS[u.status]?.label ?? u.status, u.due ?? "", u.prio ? "Yes" : ""]);
    const csv = [head, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
    a.download = `units-${today}.csv`;
    a.click();
  };

  const chip = (on: boolean, label: React.ReactNode, onClick: () => void, key: string, dot?: string, count?: number) => (
    <button key={key} type="button" className={`we-uc__chip${on ? " is-on" : ""}`} aria-pressed={on} onClick={onClick}>
      {dot && <span className="we-uc__dot" style={{ background: dot }} />}
      {label}
      {count != null && <span className="we-uc__n">{count}</span>}
    </button>
  );

  return (
    <section className="we-uc" aria-label={title}>
      <div className="we-uc__top">
        <div className="we-uc__title">
          <h2 className="we-section-title" style={{ margin: 0 }}>{title}</h2>
          <span className="we-help">{kpi.n} of {units.length} units shown</span>
        </div>
        <div className="we-uc__tools">
          <label className="we-uc__search">
            <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M9 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM13.5 13.5 17 17" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" /></svg>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find unit, building, cluster" aria-label="Find units" />
          </label>
          <div className="we-seg we-seg--light" role="group" aria-label="Colour units by">
            {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
              <button key={m} type="button" aria-pressed={mode === m} className={mode === m ? "is-on" : ""} onClick={() => { setMode(m); setFBucket(new Set()); }}>{MODE_LABEL[m]}</button>
            ))}
          </div>
          <div className="we-seg we-seg--light" role="group" aria-label="View">
            {hasPlan && <button type="button" aria-pressed={view === "plan"} className={view === "plan" ? "is-on" : ""} onClick={() => setView("plan")}>Masterplan</button>}
            {hasPlan && <button type="button" aria-pressed={view === "3d"} className={view === "3d" ? "is-on" : ""} onClick={() => setView("3d")}>3D</button>}
            <button type="button" aria-pressed={view === "tiles"} className={view === "tiles" ? "is-on" : ""} onClick={() => setView("tiles")}>Tiles</button>
          </div>
        </div>
      </div>

      <div className="we-uc__kpis">
        <div><span>Avg. construction</span><b>{kpi.pct.toFixed(1)}%</b><i className="we-uc__bar"><i style={{ width: `${Math.min(100, kpi.pct)}%` }} /></i></div>
        <div><span>Delivered to client</span><b>{kpi.delivered}</b><small>{kpi.n ? Math.round((kpi.delivered / kpi.n) * 100) : 0}% of shown</small></div>
        <div><span>In handover</span><b>{kpi.inHandover}</b><small>submitted → initial</small></div>
        <button type="button" className={`we-uc__kpibtn${kpi.late ? " is-bad" : ""}`} onClick={() => { setMode("delivery"); setFBucket(new Set(["late"])); }}>
          <span>Late for delivery</span><b>{kpi.late}</b><small>show them</small>
        </button>
        <button type="button" className={`we-uc__kpibtn${prioOnly ? " is-on" : ""}`} onClick={() => setPrioOnly((v) => !v)}>
          <span>Priority</span><b>{kpi.prio}</b><small>{prioOnly ? "showing only these" : "bold frame · show only"}</small>
        </button>
      </div>

      <div className="we-uc__filters">
        <div className="we-uc__frow">
          <span className="we-uc__flabel">Phase</span>
          {phases.map((p) => chip(fPhase.has(p.id), p.label, () => { setFPhase((s) => toggle(s, p.id)); setFZone(new Set()); }, p.id))}
        </div>
        {zonesShown.length > 1 && (
          <div className="we-uc__frow">
            <span className="we-uc__flabel">Cluster</span>
            {zonesShown.map((z) => chip(fZone.has(z.id), z.label.replace(/^Cluster /, ""), () => setFZone((s) => toggle(s, z.id)), z.id))}
          </div>
        )}
        {types.length > 1 && (
          <div className="we-uc__frow">
            <span className="we-uc__flabel">Type</span>
            {types.map((t) => chip(fType.has(t), t, () => setFType((s) => toggle(s, t)), t))}
          </div>
        )}
        <div className="we-uc__frow">
          <span className="we-uc__flabel">{MODE_LABEL[mode]}</span>
          {buckets.filter((b) => counts.get(b.key)).map((b) => chip(fBucket.has(b.key), b.label, () => setFBucket((s) => toggle(s, b.key)), b.key, b.color, counts.get(b.key)))}
          {(fPhase.size + fZone.size + fType.size + fBucket.size > 0 || prioOnly || q) && (
            <button type="button" className="we-link we-uc__reset" onClick={resetFilters}>Clear filters</button>
          )}
        </div>
      </div>

      <div className="we-uc__body" style={{ ["--uc-h" as string]: `${height}px` }}>
        <div className="we-uc__stagewrap">
          <div className="we-uc__selbar">
            <label className="we-uc__multi">
              <input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} /> Multi-select
            </label>
            <button type="button" className="we-btn we-btn--secondary we-btn--sm" onClick={() => selectMany(shown.map((u) => u.id), false)} disabled={!shown.length}>
              Select all {shown.length} shown
            </button>
            {sel.size > 0 && <button type="button" className="we-btn we-btn--ghost we-btn--sm" onClick={clear}>Clear selection</button>}
            <span className="we-uc__hint">{view === "plan" ? "Drag to move · scroll to zoom · Shift-drag to box-select · Ctrl-click to add" : view === "3d" ? "Drag to orbit · right-drag to pan · scroll to zoom · click a unit" : "Click tiles · Ctrl-click to add · click a building name to take all of it"}</span>
          </div>
          {view === "plan" && plan && (
            <PlanView plan={plan} units={units} matches={matches} sel={sel} colorOf={colorOf} onPick={pick} onBox={selectMany} focus={focus} />
          )}
          {view === "3d" && plan && (
            <Plan3D image={plan.image} w={plan.w} h={plan.h} units={units} buildings={buildings} matches={matches} sel={sel} colorOf={colorOf} onPick={pick} />
          )}
          {view === "tiles" && (
            <TileView units={units} buildings={buildings} phases={phases} zones={zones} matches={matches} sel={sel} colorOf={colorOf} onPick={pick} onMany={selectMany} />
          )}
          <div className="we-uc__legend">
            {buckets.filter((b) => counts.get(b.key)).map((b) => (
              <span key={b.key}><i style={{ background: b.color }} />{b.label}</span>
            ))}
            <span><i className="we-uc__prio" />Priority</span>
          </div>
        </div>

        <aside className="we-uc__side">
          <div className="we-uc__selhead">
            <div><b>{sel.size}</b> unit{sel.size === 1 ? "" : "s"} selected</div>
            <div className="we-row" style={{ gap: 6 }}>
              <button type="button" className="we-btn we-btn--ghost we-btn--sm" onClick={exportCsv}>Download {selIds.length ? "selection" : "shown"} (CSV)</button>
            </div>
          </div>

          {focusUnit && (
            <UnitRecord u={focusUnit} b={bById.get(focusUnit.building ?? "")} phase={phaseName.get(focusUnit.phase ?? "")} zone={zoneName.get(focusUnit.zone ?? "")}
              stages={stages} pcts={stagePct[focusUnit.id]} onClose={() => setFocus(null)} />
          )}

          {sel.size === 0 && !focusUnit && (
            <div className="we-uc__empty">
              <p><b>Pick units on the map</b> to see their record and update them together.</p>
              <ul>
                <li>Click a unit to open it.</li>
                <li>Ctrl-click, or turn on Multi-select, to pick several.</li>
                <li>Shift-drag on the masterplan to box-select a block.</li>
                <li>Filter above, then <b>Select all shown</b>.</li>
              </ul>
              <StageBars shown={shown} mode={mode} buckets={buckets} />
            </div>
          )}

          {sel.size > 0 && (can.handover || can.build || can.dates) && (
            <div className="we-uc__bulk">
              <div className="we-uc__tabs" role="tablist">
                {can.handover && <button type="button" role="tab" aria-selected={tab === "handover"} className={tab === "handover" ? "is-on" : ""} onClick={() => setTab("handover")}>Handover</button>}
                {can.build && <button type="button" role="tab" aria-selected={tab === "construction"} className={tab === "construction" ? "is-on" : ""} onClick={() => setTab("construction")}>Construction</button>}
                {can.dates && <button type="button" role="tab" aria-selected={tab === "delivery"} className={tab === "delivery" ? "is-on" : ""} onClick={() => setTab("delivery")}>Delivery date</button>}
              </div>
              {tab === "handover" && can.handover && (
                <ActionForm action={actions.handover}>
                  <input type="hidden" name="ids" value={selIds.join(",")} />
                  <div className="we-uc__stagepick">
                    {HANDOVER.map((s) => (
                      <label key={s.key} className="we-uc__stageopt">
                        <input type="radio" name="stage" value={s.key} required />
                        <span style={{ background: s.color, color: s.ink }}>{s.short}</span>
                      </label>
                    ))}
                  </div>
                  <div className="we-row">
                    <div className="we-field" style={{ flex: 1 }}><label htmlFor="uc-at">Date</label><input id="uc-at" name="at" type="date" className="we-input" defaultValue={today} /></div>
                  </div>
                  <div className="we-field"><label htmlFor="uc-note">Note <span className="we-help">· optional</span></label><input id="uc-note" name="note" className="we-input" placeholder="Snag list sent, keys handed…" /></div>
                  <button className="we-btn we-btn--primary">Move {sel.size} unit{sel.size === 1 ? "" : "s"}</button>
                </ActionForm>
              )}
              {tab === "construction" && can.build && (
                <ActionForm action={actions.construction}>
                  <input type="hidden" name="ids" value={selIds.join(",")} />
                  <fieldset className="we-uc__stagechecks">
                    <legend className="we-help">Stages</legend>
                    {stages.map((s) => (
                      <label key={s.id}><input type="checkbox" name="stage_id" value={s.id} /> {s.name}</label>
                    ))}
                  </fieldset>
                  <div className="we-row">
                    <div className="we-field" style={{ width: 110 }}><label htmlFor="uc-pct">Done %</label><input id="uc-pct" name="pct" type="number" min={0} max={100} step={5} className="we-input" required defaultValue={100} /></div>
                    <div className="we-field" style={{ flex: 1 }}><label htmlFor="uc-asof">As of</label><input id="uc-asof" name="as_of" type="date" className="we-input" defaultValue={today} /></div>
                  </div>
                  <button className="we-btn we-btn--primary">Record for {sel.size} unit{sel.size === 1 ? "" : "s"}</button>
                </ActionForm>
              )}
              {tab === "delivery" && can.dates && (
                <ActionForm action={actions.delivery}>
                  <input type="hidden" name="ids" value={selIds.join(",")} />
                  <div className="we-field"><label htmlFor="uc-dd">Planned delivery date</label><input id="uc-dd" name="delivery_date" type="date" className="we-input" required /></div>
                  <button className="we-btn we-btn--primary">Set for {sel.size} unit{sel.size === 1 ? "" : "s"}</button>
                </ActionForm>
              )}
              {can.priority && (
                <div className="we-row" style={{ gap: 6 }}>
                  <button type="button" className="we-btn we-btn--secondary we-btn--sm" disabled={pending} onClick={() => start(async () => setNote(await actions.priority(selIds, true)))}>Mark priority</button>
                  <button type="button" className="we-btn we-btn--ghost we-btn--sm" disabled={pending} onClick={() => start(async () => setNote(await actions.priority(selIds, false)))}>Remove priority</button>
                </div>
              )}
              {note?.ok && <div className="we-banner we-banner--ok" role="status">{note.ok}</div>}
              {note?.error && <div className="we-banner we-banner--error" role="alert">{note.error}</div>}
              {sel.size > 1 && (
                <details className="we-uc__sellist">
                  <summary>Selected units</summary>
                  <div>{selIds.slice(0, 400).map((i) => <button key={i} type="button" className="we-uc__selitem" onClick={() => setFocus(i)}>{byId.get(i)?.code}</button>)}</div>
                </details>
              )}
            </div>
          )}
          <input type="hidden" value={projectId} readOnly />
        </aside>
      </div>
    </section>
  );
}

function StageBars({ shown, mode, buckets }: { shown: CUnit[]; mode: Mode; buckets: Bucket[] }) {
  const c = new Map<string, number>();
  shown.forEach((u) => { const k = bucketOf(mode, u); c.set(k, (c.get(k) ?? 0) + 1); });
  const n = shown.length || 1;
  return (
    <div className="we-uc__dist">
      <div className="we-uc__stack">{buckets.map((b) => c.get(b.key) ? <i key={b.key} style={{ width: `${(c.get(b.key)! / n) * 100}%`, background: b.color }} title={`${b.label}: ${c.get(b.key)}`} /> : null)}</div>
      <ul>{buckets.filter((b) => c.get(b.key)).map((b) => <li key={b.key}><i style={{ background: b.color }} />{b.label}<b>{c.get(b.key)}</b></li>)}</ul>
    </div>
  );
}

function UnitRecord({ u, b, phase, zone, stages, pcts, onClose }: {
  u: CUnit; b?: CBuilding; phase?: string; zone?: string; stages: { id: string; name: string }[]; pcts?: number[]; onClose: () => void;
}) {
  const [log, setLog] = useState<{ stage: string; at: string; note: string }[] | null>(null);
  useEffect(() => {
    let live = true;
    setLog(null);
    createClient().from("unit_stage_log").select("stage, at, note").eq("unit_id", u.id).order("at", { ascending: false }).order("created_at", { ascending: false }).limit(12)
      .then(({ data }) => { if (live) setLog((data ?? []) as { stage: string; at: string; note: string }[]); });
    return () => { live = false; };
  }, [u.id, u.ho, u.hoAt]);
  const st = HANDOVER_BY_KEY[u.ho] ?? HANDOVER_BY_KEY.not_started!;
  const late = u.due && u.due < today && u.ho !== "client_delivered";
  const days = u.due ? Math.round((Date.parse(u.due) - Date.parse(today)) / 86400000) : null;
  return (
    <div className="we-uc__record">
      <div className="we-uc__rhead">
        <div>
          <div className="we-eyebrow">{[phase, zone, b?.code].filter(Boolean).join(" · ")}</div>
          <h3>{u.code}{u.prio && <span className="we-uc__star" title="Priority">★</span>}</h3>
        </div>
        <button type="button" className="we-uc__x" onClick={onClose} aria-label="Close unit">×</button>
      </div>
      <div className="we-uc__steps" aria-label="Handover progress">
        {HANDOVER.slice(1).map((s, i) => (
          <i key={s.key} title={s.label} style={{ background: i + 1 <= st.i ? s.color : undefined }} className={i + 1 <= st.i ? "is-done" : ""} />
        ))}
      </div>
      <div className="we-row" style={{ gap: 8 }}>
        <span className="we-uc__pill" style={{ background: st.color, color: st.ink }}>{st.label}</span>
        {u.hoAt && <span className="we-help">since {fmtDate(u.hoAt)}</span>}
      </div>
      <dl className="we-uc__dl">
        <div><dt>Type</dt><dd>{u.type || "—"}</dd></div>
        <div><dt>Floor</dt><dd>{u.floor == null ? "—" : u.floor === 0 ? "Ground" : `Level ${u.floor}`}</dd></div>
        <div><dt>Sales</dt><dd>{UNIT_STATUS[u.status]?.label ?? u.status}</dd></div>
        <div><dt>Area</dt><dd>{u.area ? `${u.area} m²` : "—"}</dd></div>
        <div><dt>Planned delivery</dt><dd className={late ? "we-uc__late" : ""}>{fmtDate(u.due)}{days != null && u.ho !== "client_delivered" && <small> {days < 0 ? `${-days} days late` : `in ${days} days`}</small>}</dd></div>
        <div><dt>Ready target</dt><dd>{fmtDate(u.target)}</dd></div>
      </dl>
      <div className="we-uc__con">
        <div className="we-row" style={{ justifyContent: "space-between" }}><b>Construction</b><b className="we-mono">{u.pct.toFixed(1)}%</b></div>
        {stages.map((s, i) => {
          const p = pcts?.[i] ?? 0;
          return (
            <div key={s.id} className="we-uc__cstage">
              <span>{s.name}</span>
              <i><i style={{ width: `${p}%`, background: p >= 100 ? "#2f7d4f" : "#c9a24e" }} /></i>
              <em className="we-mono">{Math.round(p)}%</em>
            </div>
          );
        })}
      </div>
      <div className="we-uc__log">
        <b>Handover history</b>
        {log === null ? <p className="we-help">Loading…</p> : log.length === 0 ? <p className="we-help">No handover steps recorded yet.</p> : (
          <ol>{log.map((l, i) => {
            const s = HANDOVER_BY_KEY[l.stage];
            return <li key={i}><i style={{ background: s?.color }} /><span>{s?.label ?? l.stage}</span><time>{fmtDate(l.at)}</time>{l.note && l.note !== "Sample history" && <small>{l.note}</small>}</li>;
          })}</ol>
        )}
      </div>
    </div>
  );
}

// The masterplan image with every unit drawn on it.
function PlanView({ plan, units, matches, sel, colorOf, onPick, onBox, focus }: {
  plan: { image: string; w: number; h: number };
  units: CUnit[]; matches: Set<string>; sel: Set<string>; colorOf: (u: CUnit) => string;
  onPick: (id: string, additive: boolean) => void; onBox: (ids: string[], add: boolean) => void; focus: string | null;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const view = useRef({ s: 0.3, x: 0, y: 0 });
  const [scale, setScale] = useState(0.3);
  const [box, setBox] = useState<null | { x0: number; y0: number; x1: number; y1: number }>(null);
  const [tip, setTip] = useState<null | { x: number; y: number; u: CUnit }>(null);
  const drag = useRef<null | { kind: "pan" | "box"; sx: number; sy: number; vx: number; vy: number; moved: boolean; add: boolean }>(null);

  const apply = () => {
    const v = view.current;
    if (inner.current) inner.current.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.s})`;
  };
  const fit = () => {
    const el = stage.current;
    if (!el) return;
    const s = Math.min(el.clientWidth / plan.w, el.clientHeight / plan.h);
    view.current = { s, x: (el.clientWidth - plan.w * s) / 2, y: (el.clientHeight - plan.h * s) / 2 };
    apply();
    setScale(s);
  };
  const zoomAt = (factor: number, mx: number, my: number) => {
    const v = view.current;
    const el = stage.current!;
    const min = Math.min(el.clientWidth / plan.w, el.clientHeight / plan.h) * 0.8;
    const s = Math.max(min, Math.min(6, v.s * factor));
    view.current = { s, x: mx - ((mx - v.x) * s) / v.s, y: my - ((my - v.y) * s) / v.s };
    apply();
    setScale(s);
  };
  useEffect(() => {
    fit();
    const el = stage.current!;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    const ro = new ResizeObserver(() => { if (!drag.current) fit(); });
    ro.observe(el);
    return () => { el.removeEventListener("wheel", wheel); ro.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.w, plan.h]);

  // Bring the picked unit into view when it is off-screen.
  useEffect(() => {
    const u = focus ? units.find((x) => x.id === focus) : null;
    const el = stage.current;
    if (!u?.poly || !el) return;
    const [cx, cy] = centroid(u.poly);
    const v = view.current;
    const sx = v.x + cx * v.s, sy = v.y + cy * v.s;
    if (sx < 0 || sy < 0 || sx > el.clientWidth || sy > el.clientHeight) {
      view.current = { ...v, x: el.clientWidth / 2 - cx * v.s, y: el.clientHeight / 2 - cy * v.s };
      apply();
    }
  }, [focus, units]);

  const toPlan = (cx: number, cy: number) => {
    const r = stage.current!.getBoundingClientRect();
    const v = view.current;
    return [(cx - r.left - v.x) / v.s, (cy - r.top - v.y) / v.s] as const;
  };

  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const boxMode = e.shiftKey;
    drag.current = { kind: boxMode ? "box" : "pan", sx: e.clientX, sy: e.clientY, vx: view.current.x, vy: view.current.y, moved: false, add: e.ctrlKey || e.metaKey };
    if (boxMode) {
      const [x, y] = toPlan(e.clientX, e.clientY);
      setBox({ x0: x, y0: y, x1: x, y1: y });
    }
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (d) {
      const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
      if (Math.abs(dx) + Math.abs(dy) > 4) {
        if (!d.moved) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        d.moved = true;
      }
      if (d.kind === "pan" && d.moved) {
        view.current = { ...view.current, x: d.vx + dx, y: d.vy + dy };
        apply();
      } else if (d.kind === "box") {
        const [x, y] = toPlan(e.clientX, e.clientY);
        setBox((b) => (b ? { ...b, x1: x, y1: y } : b));
      }
      if (tip) setTip(null);
      return;
    }
    const id = (e.target as Element).getAttribute?.("data-id");
    const u = id ? units.find((x) => x.id === id) : undefined;
    if (!u) { if (tip) setTip(null); return; }
    const r = stage.current!.getBoundingClientRect();
    setTip({ x: e.clientX - r.left, y: e.clientY - r.top, u });
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.kind === "box" && box) {
      const [xa, xb] = [Math.min(box.x0, box.x1), Math.max(box.x0, box.x1)];
      const [ya, yb] = [Math.min(box.y0, box.y1), Math.max(box.y0, box.y1)];
      const ids = units.filter((u) => u.poly && matches.has(u.id)).filter((u) => {
        const [cx, cy] = centroid(u.poly!);
        return cx >= xa && cx <= xb && cy >= ya && cy <= yb;
      }).map((u) => u.id);
      setBox(null);
      if (ids.length) onBox(ids, true);
      return;
    }
    if (!d.moved) {
      const id = (e.target as Element).getAttribute?.("data-id");
      if (id && matches.has(id)) onPick(id, e.ctrlKey || e.metaKey || e.shiftKey);
    }
  };

  const showLabels = scale > 0.75;
  const sw = 1.3 / scale;
  const shapes = useMemo(() => units.filter((u) => u.poly).map((u) => {
    const on = matches.has(u.id);
    const picked = sel.has(u.id);
    const pts = u.poly!.map((p) => p.join(",")).join(" ");
    return (
      <polygon key={u.id} data-id={u.id} points={pts}
        className={`we-uc__poly${on ? "" : " is-off"}${picked ? " is-sel" : ""}`}
        fill={on ? colorOf(u) : "#d9dde2"} fillOpacity={on ? (picked ? 1 : 0.86) : 0.35}
        stroke={picked ? "#111827" : u.prio && on ? "#0b1220" : "#ffffff"}
        strokeWidth={picked ? sw * 2.6 : u.prio && on ? sw * 2.2 : sw * 0.8} />
    );
  }), [units, matches, sel, colorOf, sw]);
  const labels = useMemo(() => !showLabels ? null : units.filter((u) => u.poly && matches.has(u.id)).map((u) => {
    const [cx, cy] = centroid(u.poly!);
    const xs = u.poly!.map((p) => p[0]), ys = u.poly!.map((p) => p[1]);
    const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
    const fs = Math.min(w / 3.2, h / 2.2, 11);
    return <text key={u.id} x={cx} y={cy} fontSize={fs} className="we-uc__lbl">{short(u.code)}</text>;
  }), [units, matches, showLabels]);

  return (
    <div className="we-uc__stage" ref={stage} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
      onPointerLeave={() => setTip(null)} style={{ cursor: drag.current?.kind === "pan" ? "grabbing" : "grab" }}>
      <div className="we-uc__inner" ref={inner} style={{ width: plan.w, height: plan.h }}>
        <img src={plan.image} width={plan.w} height={plan.h} alt="Masterplan" draggable={false} />
        <svg viewBox={`0 0 ${plan.w} ${plan.h}`} width={plan.w} height={plan.h}>
          {shapes}
          {labels}
          {box && <rect x={Math.min(box.x0, box.x1)} y={Math.min(box.y0, box.y1)} width={Math.abs(box.x1 - box.x0)} height={Math.abs(box.y1 - box.y0)} className="we-uc__box" strokeWidth={sw * 1.5} />}
        </svg>
      </div>
      <div className="we-uc__zoom">
        <button type="button" onClick={() => { const el = stage.current!; zoomAt(1.4, el.clientWidth / 2, el.clientHeight / 2); }} aria-label="Zoom in">+</button>
        <button type="button" onClick={() => { const el = stage.current!; zoomAt(1 / 1.4, el.clientWidth / 2, el.clientHeight / 2); }} aria-label="Zoom out">−</button>
        <button type="button" onClick={fit} aria-label="Fit to screen" className="we-uc__fit">Fit</button>
      </div>
      {tip && (
        <div className="we-uc__tip" style={{ left: tip.x + 14, top: tip.y + 12 }}>
          <b>{tip.u.code}</b> · {tip.u.type}<br />
          {HANDOVER_BY_KEY[tip.u.ho]?.label} · built {tip.u.pct.toFixed(0)}%{tip.u.due ? ` · due ${fmtDate(tip.u.due)}` : ""}
        </div>
      )}
    </div>
  );
}

// Every unit as a tile, grouped by phase, cluster and building. Works without a masterplan.
function TileView({ units, buildings, phases, zones, matches, sel, colorOf, onPick, onMany }: {
  units: CUnit[]; buildings: CBuilding[]; phases: COpt[]; zones: COpt[]; matches: Set<string>; sel: Set<string>;
  colorOf: (u: CUnit) => string; onPick: (id: string, additive: boolean) => void; onMany: (ids: string[], add: boolean) => void;
}) {
  const groups = useMemo(() => {
    const byB = new Map<string, CUnit[]>();
    for (const u of units) {
      if (!matches.has(u.id)) continue;
      const k = u.building ?? `z:${u.zone ?? ""}:${u.phase ?? ""}`;
      byB.set(k, [...(byB.get(k) ?? []), u]);
    }
    const bmap = new Map(buildings.map((b) => [b.id, b]));
    const out: { phase: string; zone: string; blocks: { key: string; label: string; units: CUnit[] }[] }[] = [];
    const pOrder = new Map(phases.map((p, i) => [p.id, i]));
    const zOrder = new Map(zones.map((z, i) => [z.id, i]));
    const entries = [...byB.entries()].map(([k, us]) => {
      const b = bmap.get(k);
      const sorted = [...us].sort((a, c) => (c.floor ?? 0) - (a.floor ?? 0) || a.code.localeCompare(c.code, undefined, { numeric: true }));
      return { key: k, label: b ? (b.name !== b.code && !b.name.startsWith(b.code) ? `${b.code} · ${b.name}` : b.name || b.code) : "Units", units: sorted, phase: us[0]!.phase ?? "", zone: us[0]!.zone ?? "" };
    }).sort((a, b) => (pOrder.get(a.phase) ?? 99) - (pOrder.get(b.phase) ?? 99) || (zOrder.get(a.zone) ?? 99) - (zOrder.get(b.zone) ?? 99) || a.label.localeCompare(b.label, undefined, { numeric: true }));
    for (const e of entries) {
      let g = out.find((x) => x.phase === e.phase && x.zone === e.zone);
      if (!g) { g = { phase: e.phase, zone: e.zone, blocks: [] }; out.push(g); }
      g.blocks.push(e);
    }
    return out;
  }, [units, buildings, phases, zones, matches]);
  const pn = new Map(phases.map((p) => [p.id, p.label]));
  const zn = new Map(zones.map((z) => [z.id, z.label]));
  if (!groups.length) return <div className="we-uc__stage we-uc__stage--tiles"><p className="we-help" style={{ padding: 24 }}>No units match these filters.</p></div>;
  return (
    <div className="we-uc__stage we-uc__stage--tiles">
      {groups.map((g) => (
        <section key={g.phase + g.zone} className="we-uc__tgroup">
          <h4>{[pn.get(g.phase), zn.get(g.zone)].filter(Boolean).join(" · ") || "Units"}</h4>
          <div className="we-uc__tblocks">
            {g.blocks.map((b) => (
              <div key={b.key} className="we-uc__tblock">
                <button type="button" className="we-uc__tname" onClick={(e) => onMany(b.units.map((u) => u.id), e.ctrlKey || e.metaKey || e.shiftKey)} title="Select this whole building">
                  {b.label} <span>{b.units.length}</span>
                </button>
                <div className="we-uc__tiles" style={{ gridTemplateColumns: `repeat(${Math.min(6, Math.max(2, ...Object.values(b.units.reduce<Record<string, number>>((m, u) => { const k = String(u.floor ?? 0); m[k] = (m[k] ?? 0) + 1; return m; }, {}))))}, 38px)` }}>
                  {b.units.map((u) => (
                    <button key={u.id} type="button" className={`we-uc__tile${sel.has(u.id) ? " is-sel" : ""}${u.prio ? " is-prio" : ""}`}
                      style={{ background: colorOf(u) }} onClick={(e) => onPick(u.id, e.ctrlKey || e.metaKey || e.shiftKey)}
                      title={`${u.code} · ${HANDOVER_BY_KEY[u.ho]?.label ?? ""} · built ${u.pct.toFixed(0)}%`}>
                      {short(u.code)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
