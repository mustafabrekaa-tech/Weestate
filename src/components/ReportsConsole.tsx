"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { EarthMap, type EarthProject } from "@/components/EarthMap";
import { HANDOVER, HANDOVER_BY_KEY } from "@/lib/handover";

export type RUnit = { id: string; code: string; phase: string | null; stage: string; status: string; due: string | null; pct: number };
export type RContractor = { name: string; value: number; certified: number; contracts: number };
export type RIssue = { title: string; ref: string; href: string; days: number; who: string; step: string; overdue: boolean };
type Pt = { period: string; planned: number; actual: number };
export type RPhase = {
  id: string; code: string; name: string; bac: number; pv: number; ev: number; ac: number; actual: number; planned: number; finish: string | null;
  curve: Pt[]; packages: { name: string; pct: number }[];
  groups: { label: string; blds: { code: string; cells: RUnit[] }[] }[];
  contractors: RContractor[];
};
export type RProject = {
  id: string; slug: string; name: string; code: string; location: string; status: string; asOf: string | null;
  bac: number; pv: number; ev: number; ac: number; eac: number | null; actual: number; planned: number; spi: number | null; cpi: number | null; finish: string | null;
  awarded: number; certified: number; paid: number;
  units: RUnit[]; phases: RPhase[]; curve: Pt[]; contractors: RContractor[]; issues: RIssue[]; open: number; overdue: number;
};

const SOLD = new Set(["reserved", "sold", "ready", "handed_over"]);
const IN_HANDOVER = new Set(["submitted", "submitted_consultant", "snagging_con", "submitted_qc", "snagging_qc", "qc_approved", "initial"]);

// Money in millions or billions of EGP.
const M = (v: number | null | undefined) => {
  if (v == null || !isFinite(v)) return "–";
  const a = Math.abs(v);
  return a >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : a >= 1e6 ? `${(v / 1e6).toFixed(a >= 1e8 ? 0 : 1)}M` : a >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : v.toFixed(0);
};
const P = (v: number | null | undefined) => (v == null || !isFinite(v) ? "–" : `${v.toFixed(1)}%`);
const I = (v: number | null | undefined) => (v == null || !isFinite(v) ? "–" : v.toFixed(2));
const ratio = (a: number, b: number) => (b ? a / b : null);
// Health: at or above 0.98 is on track, 0.90 to 0.98 needs watching, below 0.90 is behind.
const health = (v: number | null | undefined) => (v == null ? "" : v >= 0.98 ? "good" : v >= 0.9 ? "warn" : "bad");
const HC: Record<string, string> = { good: "#2E8B57", warn: "#D9962B", bad: "#C0392B", "": "#9AA3AD" };

function unitStats(us: RUnit[], today: string) {
  const y = today.slice(0, 4);
  const open = us.filter((u) => u.stage !== "client_delivered");
  return {
    total: us.length,
    sold: us.filter((u) => SOLD.has(u.status)).length,
    delivered: us.length - open.length,
    handover: us.filter((u) => IN_HANDOVER.has(u.stage)).length,
    building: open.filter((u) => !IN_HANDOVER.has(u.stage)).length,
    late: open.filter((u) => u.due && u.due < today).length,
    dueThis: open.filter((u) => u.due && u.due.slice(0, 4) <= y).length,
    dueNext: open.filter((u) => u.due && u.due.slice(0, 4) === String(Number(y) + 1)).length,
    byStage: HANDOVER.map((h) => ({ ...h, n: us.filter((u) => u.stage === h.key).length })),
  };
}

export function ReportsConsole({ projects, earth, hidden, today, initial }: {
  projects: RProject[]; earth: EarthProject[]; hidden: string[]; today: string; initial?: { p?: string; ph?: string };
}) {
  const off = useMemo(() => new Set(hidden), [hidden]);
  const on = (k: string) => !off.has(k);
  const [pid, setPid] = useState<string>(() => projects.find((p) => p.slug === initial?.p || p.id === initial?.p)?.id ?? "");
  const [phid, setPhid] = useState<string>(() => {
    const p = projects.find((x) => x.slug === initial?.p || x.id === initial?.p);
    return p?.phases.find((x) => x.code === initial?.ph || x.id === initial?.ph)?.id ?? "";
  });
  const project = projects.find((p) => p.id === pid) ?? null;
  const phase = project?.phases.find((x) => x.id === phid) ?? null;

  // Keep the address in step so the view can be shared and Back works.
  useEffect(() => {
    const q = new URLSearchParams();
    if (project) q.set("p", project.slug);
    if (phase) q.set("ph", phase.code);
    const url = `/reports${q.size ? `?${q}` : ""}`;
    if (location.pathname + location.search !== url) history.pushState(null, "", url);
  }, [project, phase]);
  useEffect(() => {
    const back = () => {
      const q = new URLSearchParams(location.search);
      const p = projects.find((x) => x.slug === q.get("p"));
      setPid(p?.id ?? "");
      setPhid(p?.phases.find((x) => x.code === q.get("ph"))?.id ?? "");
    };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, [projects]);

  const pick = (id: string, ph = "") => { setPid(id); setPhid(ph); };
  // Links into a project page, with the phase chosen in its scope bar (or the whole project).
  const go = (p: RProject, to: string, ph?: RPhase | null) => `/scope?p=${p.id}&ph=${ph?.id ?? ""}&to=${encodeURIComponent(`/projects/${p.slug}${to}`)}`;

  const tot = useMemo(() => {
    const s = (f: (p: RProject) => number) => projects.reduce((a, p) => a + (f(p) || 0), 0);
    return { bac: s((p) => p.bac), pv: s((p) => p.pv), ev: s((p) => p.ev), ac: s((p) => p.ac), awarded: s((p) => p.awarded), paid: s((p) => p.paid), certified: s((p) => p.certified) };
  }, [projects]);
  const allUnits = useMemo(() => projects.flatMap((p) => p.units), [projects]);

  return (
    <div className={`rp${on("site") ? "" : " rp--nomap"}`}>
      <header className="rp-top">
        <nav className="rp-crumbs" aria-label="Breadcrumb">
          <button type="button" className={!project ? "on" : ""} onClick={() => pick("")}>Portfolio</button>
          {project && <><i>›</i><button type="button" className={!phase ? "on" : ""} onClick={() => pick(project.id)}>{project.name}</button></>}
          {project && phase && <><i>›</i><button type="button" className="on">{phase.name || phase.code}</button></>}
        </nav>
        <span className="rp-asof">{project?.asOf ? `Figures as of ${project.asOf}` : `Today ${today}`}</span>
        {project && <Link className="we-btn we-btn--secondary we-btn--sm" href={go(project, "", phase)} prefetch={false}>Open {phase ? "phase" : "project"}</Link>}
      </header>

      <aside className="rp-rail" aria-label="Projects">
        <div className="rp-rail__head">
          <h2>Portfolio</h2>
          <div className="rp-sum">
            <div><b>{projects.length}</b><span>Projects</span></div>
            <div><b>{allUnits.length.toLocaleString("en-US")}</b><span>Units</span></div>
            <div><b>{M(tot.bac)}</b><span>Budget</span></div>
          </div>
        </div>
        <div className="rp-plist">
          {projects.map((p) => {
            const s = health(p.spi), c = health(p.cpi);
            return (
              <button key={p.id} type="button" className={`rp-pcard${p.id === pid ? " on" : ""}`} onClick={() => pick(p.id)}>
                <div className="t"><b>{p.name}</b><span>{p.units.length.toLocaleString("en-US")} units</span></div>
                <div className="meta">{[p.code, p.location, `${p.phases.length} phases`].filter(Boolean).join(" · ")}</div>
                {on("construction") && <div className="rp-prog" title={`Built ${P(p.actual)}, plan ${P(p.planned)}`}><i style={{ width: `${Math.min(100, p.actual)}%` }} /><b style={{ left: `${Math.min(100, p.planned)}%` }} /></div>}
                <div className="row">
                  <span>{on("construction") ? `${P(p.actual)} built · plan ${P(p.planned)}` : p.status}</span>
                  <span className="rp-chips">
                    <span className={`rp-chip ${s}`}>SPI {I(p.spi)}</span>
                    {on("planning") && <span className={`rp-chip ${c}`}>CPI {I(p.cpi)}</span>}
                  </span>
                </div>
              </button>
            );
          })}
          {!projects.length && <div className="we-empty">No projects yet.</div>}
        </div>
        <footer>Click a project here or its name on the map. Click a phase to see its SPI, CPI and units.</footer>
      </aside>

      {on("site") && (
        <section className="rp-map">
          <EarthMap projects={earth} height="100%" flyId={pid} onProject={(id) => pick(id)} />
        </section>
      )}

      <section className="rp-panel" aria-live="polite">
        {!project && <PortfolioPanel projects={projects} tot={tot} allUnits={allUnits} today={today} on={on} pick={pick} go={go} />}
        {project && !phase && <ProjectPanel p={project} today={today} on={on} pick={pick} go={go} />}
        {project && phase && <PhasePanel p={project} ph={phase} today={today} on={on} pick={pick} go={go} />}
      </section>
    </div>
  );
}

type Nav = { on: (k: string) => boolean; pick: (id: string, ph?: string) => void; go: (p: RProject, to: string, ph?: RPhase | null) => string };

// ---------- Portfolio ----------
function PortfolioPanel({ projects, tot, allUnits, today, on, pick, go }: Nav & {
  projects: RProject[]; tot: { bac: number; pv: number; ev: number; ac: number; awarded: number; paid: number; certified: number }; allUnits: RUnit[]; today: string;
}) {
  const us = unitStats(allUnits, today);
  const spi = ratio(tot.ev, tot.pv), cpi = ratio(tot.ev, tot.ac);
  const attn = [
    ...projects.filter((p) => (p.spi != null && p.spi < 0.9) || (p.cpi != null && p.cpi < 0.95)).map((p) => ({ key: p.id, label: p.name, sub: "Project", spi: p.spi, cpi: p.cpi, act: () => pick(p.id) })),
    ...projects.flatMap((p) => p.phases.map((ph) => ({ p, ph, spi: ratio(ph.ev, ph.pv), cpi: ratio(ph.ev, ph.ac) })))
      .filter((x) => (x.spi != null && x.spi < 0.9) || (x.cpi != null && x.cpi < 0.95))
      .map((x) => ({ key: x.ph.id, label: `${x.p.name} · ${x.ph.name || x.ph.code}`, sub: "Phase", spi: x.spi, cpi: x.cpi, act: () => pick(x.p.id, x.ph.id) })),
  ];
  const maxMoney = Math.max(1, ...projects.map((p) => Math.max(p.bac, p.awarded, p.paid)));
  return (
    <>
      <PanelHead title="All projects" sub={`${projects.length} projects · ${allUnits.length.toLocaleString("en-US")} units`} />
      <div className="rp-body">
        <div className="rp-kpis k5">
          {on("planning") && <Kpi label="Total budget" value={M(tot.bac)} note="EGP" />}
          {on("construction") && <Kpi label="Awarded" value={M(tot.awarded)} note={tot.bac ? `${P((tot.awarded * 100) / tot.bac)} of budget` : ""} />}
          {on("construction") && <Kpi label="Paid" value={M(tot.paid)} note={`certified ${M(tot.certified)}`} />}
          {on("construction") && <Kpi label="Work value" value={M(tot.ev)} note="earned so far" />}
          <Kpi label="Units" value={allUnits.length.toLocaleString("en-US")} note={on("sales") ? `${us.sold.toLocaleString("en-US")} sold` : ""} />
        </div>
        <Gauges actual={tot.bac ? (tot.ev * 100) / tot.bac : null} planned={tot.bac ? (tot.pv * 100) / tot.bac : null} spi={spi} cpi={on("planning") ? cpi : undefined} />

        <div>
          <Sec title="Projects" em="click one to open its report" />
          <table className="rp-tbl">
            <thead><tr><th>Project</th>{on("construction") && <th>Built</th>}<th className="r">SPI</th>{on("planning") && <th className="r">CPI</th>}<th className="r">Units</th></tr></thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className="click" onClick={() => pick(p.id)}>
                  <td>{p.name}</td>
                  {on("construction") && <td><div className="rp-minibar"><i style={{ width: `${Math.min(100, p.actual)}%` }} /><b style={{ left: `${Math.min(100, p.planned)}%` }} /></div><small>{P(p.actual)}</small></td>}
                  <td className="r" style={{ color: HC[health(p.spi)] }}>{I(p.spi)}</td>
                  {on("planning") && <td className="r" style={{ color: HC[health(p.cpi)] }}>{I(p.cpi)}</td>}
                  <td className="r">{p.units.length.toLocaleString("en-US")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {(on("planning") || on("construction")) && (
          <div>
            <Sec title="Budget, awarded and paid" em="EGP · click to open contracts" />
            <div className="rp-legend"><span><i className="sq" style={{ background: "#C9D6E4" }} />Budget</span><span><i className="sq" style={{ background: "#6F93BA" }} />Awarded</span><span><i className="sq" style={{ background: "#1E3A5C" }} />Paid</span></div>
            <div className="rp-money">
              {projects.map((p) => (
                <Link key={p.id} href={go(p, on("construction") ? "/contracts" : "/budget")} prefetch={false} className="rp-money__row">
                  <span>{p.name}</span>
                  <div>
                    <i style={{ width: `${(p.bac / maxMoney) * 100}%`, background: "#C9D6E4" }} title={`Budget ${M(p.bac)}`} />
                    <i style={{ width: `${(p.awarded / maxMoney) * 100}%`, background: "#6F93BA" }} title={`Awarded ${M(p.awarded)}`} />
                    <i style={{ width: `${(p.paid / maxMoney) * 100}%`, background: "#1E3A5C" }} title={`Paid ${M(p.paid)}`} />
                  </div>
                  <em>{M(p.bac)} · {M(p.awarded)} · {M(p.paid)}</em>
                </Link>
              ))}
            </div>
          </div>
        )}

        {on("handover") && (
          <div>
            <Sec title="Units by delivery stage" em="click a part to open that handover stage" />
            <div className="rp-legend">
              <span><i className="sq" style={{ background: "#166534" }} />Delivered</span>
              <span><i className="sq" style={{ background: "#2563eb" }} />In handover</span>
              <span><i className="sq" style={{ background: "#c9d0d8" }} />Under construction</span>
            </div>
            <div className="rp-stack">
              {projects.map((p) => {
                const s = unitStats(p.units, today);
                const t = s.total || 1;
                return (
                  <div key={p.id} className="rp-stack__row">
                    <span>{p.name}</span>
                    <div className="rp-stack__bar">
                      {s.delivered > 0 && <Link prefetch={false} href={go(p, "/delivery?stage=client_delivered")} style={{ flexGrow: s.delivered / t, background: "#166534" }} title={`Delivered: ${s.delivered}`} />}
                      {s.handover > 0 && <Link prefetch={false} href={go(p, `/delivery?stage=${s.byStage.find((x) => IN_HANDOVER.has(x.key) && x.n)?.key ?? "submitted"}`)} style={{ flexGrow: s.handover / t, background: "#2563eb" }} title={`In handover: ${s.handover}`} />}
                      {s.building > 0 && <Link prefetch={false} href={go(p, on("construction") ? "/construction" : "/delivery?stage=not_started")} style={{ flexGrow: s.building / t, background: "#c9d0d8" }} title={`Under construction: ${s.building}`} />}
                    </div>
                    <em>{s.delivered} · {s.handover} · {s.building}</em>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <Sec title="Needs attention" em="SPI under 0.90 or CPI under 0.95" />
          <div className="rp-attn">
            {attn.map((a) => (
              <button key={a.key} type="button" onClick={a.act}>
                <span>{a.label}<br /><small>{a.sub}</small></span>
                <span className={`rp-chip ${health(a.spi)}`}>SPI {I(a.spi)}</span>
                {on("planning") ? <span className={`rp-chip ${health(a.cpi)}`}>CPI {I(a.cpi)}</span> : <span />}
              </button>
            ))}
            {!attn.length && <p className="rp-note">Nothing behind plan or over budget.</p>}
          </div>
        </div>
      </div>
    </>
  );
}

// ---------- Project ----------
function ProjectPanel({ p, today, on, pick, go }: Nav & { p: RProject; today: string }) {
  const us = unitStats(p.units, today);
  const y = Number(today.slice(0, 4));
  return (
    <>
      <PanelHead title={p.name} sub={[p.code, p.location, p.finish ? `finish ${p.finish}` : ""].filter(Boolean).join(" · ")} back={() => pick("")} />
      <div className="rp-body">
        <div className="rp-kpis k5">
          {on("planning") && <Kpi label="Budget" value={M(p.bac)} note={p.eac ? `forecast ${M(p.eac)}` : "EGP"} href={go(p, "/budget")} />}
          {on("construction") && <Kpi label="Awarded" value={M(p.awarded)} note={`${p.contractors.length} contractors`} href={go(p, "/contracts")} />}
          {on("construction") && <Kpi label="Paid" value={M(p.paid)} note={`certified ${M(p.certified)}`} href={go(p, on("planning") ? "/cashflow" : "/contracts")} />}
          {on("construction") && <Kpi label="Work value" value={M(p.ev)} note="earned value" href={go(p, "/construction")} />}
          <Kpi label="Units" value={us.total.toLocaleString("en-US")} note={on("handover") ? `${us.delivered} delivered` : ""} href={go(p, on("sales") ? "/units" : "/console")} />
        </div>
        <Gauges actual={p.actual} planned={p.planned} spi={p.spi} cpi={on("planning") ? p.cpi : undefined}
          links={{ actual: go(p, "/construction"), spi: go(p, "/schedule"), cpi: go(p, "/budget") }} />

        {on("construction") && (
          <div>
            <Sec title="Construction progress vs planned" em="click a phase" link={{ href: go(p, "/construction"), label: "Construction" }} />
            <div className="rp-bars">
              {p.phases.map((ph) => (
                <button type="button" key={ph.id} className="r click" onClick={() => pick(p.id, ph.id)}>
                  <span>{ph.name || ph.code}</span>
                  <span className="bar"><i style={{ width: `${Math.min(100, ph.actual)}%`, background: HC[health(ratio(ph.ev, ph.pv))] || "#1E3A5C" }} /><b style={{ left: `${Math.min(100, ph.planned)}%` }} /></span>
                  <span className="n">{P(ph.actual)} <em>/ {P(ph.planned)}</em></span>
                </button>
              ))}
              {!p.phases.length && <p className="rp-note">No phases yet.</p>}
            </div>
            <p className="rp-note">Bar is built so far, the red tick is where the plan says it should be today.</p>
          </div>
        )}

        <div>
          <Sec title="S-curve" em="planned, actual and forecast" link={{ href: go(p, "/schedule"), label: "Schedule" }} />
          <SCurveChart points={p.curve} today={today} />
        </div>

        {on("planning") && <Evm bac={p.bac} pv={p.pv} ev={p.ev} ac={p.ac} eac={p.eac} href={go(p, "/budget")} />}

        {on("handover") && (
          <>
            <div>
              <Sec title="Delivery status tracker" em="by phase · click a row" link={{ href: go(p, "/delivery"), label: "Handover" }} />
              <table className="rp-tbl">
                <thead><tr><th>Phase</th><th className="r">Units</th>{on("sales") && <th className="r">Sold</th>}<th className="r">Late</th><th className="r">Delivered</th><th className="r">Building</th></tr></thead>
                <tbody>
                  {p.phases.map((ph) => {
                    const s = unitStats(p.units.filter((u) => u.phase === ph.id), today);
                    return (
                      <tr key={ph.id} className="click" onClick={() => { location.href = go(p, "/delivery", ph); }}>
                        <td>{ph.name || ph.code}</td><td className="r">{s.total}</td>{on("sales") && <td className="r">{s.sold}</td>}
                        <td className="r" style={{ color: s.late ? HC.bad : undefined }}>{s.late}</td><td className="r">{s.delivered}</td><td className="r">{s.building}</td>
                      </tr>
                    );
                  })}
                  <tr><td>Total</td><td className="r">{us.total}</td>{on("sales") && <td className="r">{us.sold}</td>}<td className="r" style={{ color: us.late ? HC.bad : undefined }}>{us.late}</td><td className="r">{us.delivered}</td><td className="r">{us.building}</td></tr>
                </tbody>
              </table>
            </div>
            <Pipeline stats={us} hrefOf={(k) => go(p, `/delivery?stage=${k}`)} />
            <div className="rp-kpis k3">
              <Kpi label={`Due by end ${y}`} value={String(us.dueThis)} note="not yet delivered" href={go(p, "/delivery")} />
              <Kpi label={`Due in ${y + 1}`} value={String(us.dueNext)} note="contract dates" href={go(p, "/delivery")} />
              <Kpi label="Late now" value={String(us.late)} note="past contract date" bad={us.late > 0} href={go(p, "/delivery")} />
            </div>
          </>
        )}

        {on("construction") && <Contractors list={p.contractors} href={go(p, "/contracts")} />}
        <Issues list={p.issues} open={p.open} overdue={p.overdue} />
      </div>
    </>
  );
}

// ---------- Phase ----------
function PhasePanel({ p, ph, today, on, pick, go }: Nav & { p: RProject; ph: RPhase; today: string }) {
  const i = p.phases.findIndex((x) => x.id === ph.id);
  const prev = p.phases[i - 1], next = p.phases[i + 1];
  const us = unitStats(p.units.filter((u) => u.phase === ph.id), today);
  const spi = ratio(ph.ev, ph.pv), cpi = ratio(ph.ev, ph.ac);
  const hist = ph.curve.slice(-6).map((r) => ({ period: r.period, v: r.planned ? r.actual / r.planned : null }));
  const [color, setColor] = useState<"handover" | "construction">(on("handover") ? "handover" : "construction");
  return (
    <>
      <PanelHead title={ph.name || ph.code} sub={`${p.name} · ${us.total} units${ph.finish ? ` · finish ${ph.finish}` : ""}`} back={() => pick(p.id)} />
      <div className="rp-body">
        <div className="rp-kpis">
          {on("planning") && <Kpi label="Budget" value={M(ph.bac)} note="EGP" href={go(p, "/budget", ph)} />}
          {on("construction") && <Kpi label="Progress" value={P(ph.actual)} note={`plan ${P(ph.planned)}`} href={go(p, "/construction", ph)} />}
          <Kpi label="SPI" value={I(spi)} tone={health(spi)} note="schedule" href={go(p, "/schedule", ph)} />
          {on("planning") && <Kpi label="CPI" value={I(cpi)} tone={health(cpi)} note="cost" href={go(p, "/budget", ph)} />}
        </div>
        <Gauges actual={ph.actual} planned={ph.planned} spi={spi} cpi={on("planning") ? cpi : undefined}
          links={{ actual: go(p, "/construction", ph), spi: go(p, "/schedule", ph), cpi: go(p, "/budget", ph) }} />
        {on("planning") && <Evm bac={ph.bac} pv={ph.pv} ev={ph.ev} ac={ph.ac} eac={cpi ? ph.bac / cpi : null} href={go(p, "/budget", ph)} />}
        <div>
          <Sec title="S-curve" em="this phase" link={{ href: go(p, "/schedule", ph), label: "Schedule" }} />
          <SCurveChart points={ph.curve} today={today} />
        </div>
        {hist.some((h) => h.v != null) && (
          <div>
            <Sec title="SPI over the last 6 months" em="1.00 is on plan" />
            <Spark points={hist} />
          </div>
        )}
        {on("construction") && ph.packages.length > 0 && (
          <div>
            <Sec title="Progress by work stage" em="average over the phase's units" link={{ href: go(p, "/construction", ph), label: "Construction" }} />
            <div className="rp-bars">
              {ph.packages.map((k) => (
                <Link key={k.name} prefetch={false} className="r click" href={go(p, "/construction", ph)}>
                  <span>{k.name}</span><span className="bar"><i style={{ width: `${Math.min(100, k.pct)}%`, background: "#1E3A5C" }} /></span><span className="n">{P(k.pct)}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
        <div>
          <Sec title="Units and buildings" em="click a unit to open it on the map" />
          {on("handover") && on("construction") && (
            <div className="we-seg we-seg--light rp-seg">
              <button type="button" className={color === "handover" ? "is-on" : ""} onClick={() => setColor("handover")}>Handover stage</button>
              <button type="button" className={color === "construction" ? "is-on" : ""} onClick={() => setColor("construction")}>Built %</button>
            </div>
          )}
          <div className="rp-legend">
            {color === "handover"
              ? HANDOVER.filter((h) => us.byStage.find((x) => x.key === h.key)?.n).map((h) => <span key={h.key}><i className="sq" style={{ background: h.color }} />{h.short}</span>)
              : [0, 25, 50, 75, 100].map((v) => <span key={v}><i className="sq" style={{ background: builtColor(v) }} />{v}%</span>)}
          </div>
          <div className="rp-units">
            {ph.groups.map((g) => (
              <div key={g.label} className="rp-ugrp">
                <b>{g.label}</b>
                <div className="rp-ublds">
                  {g.blds.map((b) => (
                    <div key={b.code} className="rp-ubld">
                      <span>{b.code}</span>
                      <div className="rp-ucells">
                        {b.cells.map((u) => (
                          <Link key={u.id} prefetch={false} href={go(p, `/console?mode=${color === "handover" ? "handover" : "construction"}&q=${encodeURIComponent(u.code)}`, ph)}
                            style={{ background: color === "handover" ? HANDOVER_BY_KEY[u.stage]?.color ?? "#c9d0d8" : builtColor(u.pct) }}
                            title={`${u.code}\n${HANDOVER_BY_KEY[u.stage]?.label ?? u.stage} · built ${u.pct}%${u.due ? `\ncontract date ${u.due}` : ""}`} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {!ph.groups.length && <p className="rp-note">No units in this phase yet.</p>}
          </div>
        </div>
        {on("handover") && (
          <>
            <div className="rp-kpis">
              <Kpi label="Delivered" value={String(us.delivered)} note={`of ${us.total}`} href={go(p, "/delivery?stage=client_delivered", ph)} />
              <Kpi label="In handover" value={String(us.handover)} note="consultant to initial" href={go(p, "/delivery", ph)} />
              {on("sales") ? <Kpi label="Sold" value={String(us.sold)} note={us.total ? P((us.sold * 100) / us.total) : ""} href={go(p, "/units", ph)} /> : <Kpi label="Building" value={String(us.building)} note="not in handover" />}
              <Kpi label="Late" value={String(us.late)} note="past contract date" bad={us.late > 0} href={go(p, "/delivery", ph)} />
            </div>
            <Pipeline stats={us} hrefOf={(k) => go(p, `/delivery?stage=${k}`, ph)} />
          </>
        )}
        {on("construction") && <Contractors list={ph.contractors} href={go(p, "/contracts", ph)} />}
        <Issues list={p.issues} open={p.open} overdue={p.overdue} />
        <div className="rp-prevnext">
          {prev ? <button type="button" className="we-btn we-btn--secondary we-btn--sm" onClick={() => pick(p.id, prev.id)}>‹ {prev.name || prev.code}</button> : <span />}
          {next ? <button type="button" className="we-btn we-btn--secondary we-btn--sm" onClick={() => pick(p.id, next.id)}>{next.name || next.code} ›</button> : <span />}
        </div>
      </div>
    </>
  );
}

// ---------- Pieces ----------
function builtColor(v: number) {
  if (v <= 0) return "#E6EBF0";
  if (v >= 100) return "#2E8B57";
  const t = v / 100, mix = (a: number, b: number) => Math.round(a + (b - a) * t);
  return `rgb(${mix(200, 30)},${mix(214, 58)},${mix(228, 92)})`;
}

function PanelHead({ title, sub, back }: { title: string; sub: string; back?: () => void }) {
  return (
    <div className="rp-ph">
      <span className="sw" />
      <div><h1>{title}</h1><p>{sub}</p></div>
      {back && <button type="button" className="back" onClick={back}>Back</button>}
    </div>
  );
}

function Sec({ title, em, link }: { title: string; em?: string; link?: { href: string; label: string } }) {
  return (
    <h3 className="rp-sec">
      <span>{title}{em && <em> · {em}</em>}</span>
      {link && <Link prefetch={false} href={link.href}>{link.label} ›</Link>}
    </h3>
  );
}

function Kpi({ label, value, note, href, bad, tone }: { label: string; value: string; note?: string; href?: string; bad?: boolean; tone?: string }) {
  const cls = `rp-kpi ${tone ?? (bad ? "bad" : "")}`;
  const body = <><b>{value}</b><span>{label}</span>{note ? <small>{note}</small> : null}</>;
  return href ? <Link prefetch={false} className={`${cls} link`} href={href}>{body}</Link> : <div className={cls}>{body}</div>;
}

function Gauges({ actual, planned, spi, cpi, links }: { actual: number | null; planned: number | null; spi: number | null; cpi?: number | null; links?: { actual?: string; spi?: string; cpi?: string } }) {
  const wrap = (href: string | undefined, el: React.ReactNode, k: string) =>
    href ? <Link key={k} prefetch={false} href={href} className="rp-gauge link">{el}</Link> : <div key={k} className="rp-gauge">{el}</div>;
  return (
    <div className={`rp-gauges${cpi === undefined ? " g2" : ""}`}>
      {wrap(links?.actual, <><Donut v={actual ?? 0} plan={planned ?? 0} /><span>Progress</span></>, "a")}
      {wrap(links?.spi, <><Arc v={spi} /><span>SPI · schedule</span></>, "s")}
      {cpi !== undefined && wrap(links?.cpi, <><Arc v={cpi} /><span>CPI · cost</span></>, "c")}
    </div>
  );
}

function Donut({ v, plan }: { v: number; plan: number }) {
  const r = 38, c = 2 * Math.PI * r, a = Math.max(0, Math.min(100, v)), pl = Math.max(0, Math.min(100, plan));
  const ang = (pl / 100) * 2 * Math.PI - Math.PI / 2;
  return (
    <svg viewBox="0 0 100 100" role="img" aria-label={`Built ${a.toFixed(1)}%, plan ${pl.toFixed(1)}%`}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="#E6EBF0" strokeWidth="11" />
      <circle cx="50" cy="50" r={r} fill="none" stroke="#1E3A5C" strokeWidth="11" strokeDasharray={`${(a / 100) * c} ${c}`} transform="rotate(-90 50 50)" />
      <line x1={50 + (r - 8) * Math.cos(ang)} y1={50 + (r - 8) * Math.sin(ang)} x2={50 + (r + 8) * Math.cos(ang)} y2={50 + (r + 8) * Math.sin(ang)} stroke="#8E0E0B" strokeWidth="2.5" />
      <text x="50" y="50" textAnchor="middle" fontSize="17" fontWeight="700" fill="#121417">{a.toFixed(0)}%</text>
      <text x="50" y="65" textAnchor="middle" fontSize="9" fill="#7B848F">plan {pl.toFixed(0)}%</text>
    </svg>
  );
}

// A half dial from 0.6 to 1.2 with the 1.00 mark.
function Arc({ v }: { v: number | null }) {
  const lo = 0.6, hi = 1.2, r = 38, cx = 50, cy = 56;
  const t = v == null ? 0 : (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo);
  const pt = (f: number) => [cx - r * Math.cos(Math.PI * f), cy - r * Math.sin(Math.PI * f)];
  const [x0, y0] = pt(0), [x1, y1] = pt(1), [xv, yv] = pt(t), [xm, ym] = pt((1 - lo) / (hi - lo));
  return (
    <svg viewBox="0 0 100 70" role="img" aria-label={`Index ${v == null ? "not known" : v.toFixed(2)}`}>
      <path d={`M${x0},${y0} A${r},${r} 0 0 1 ${x1},${y1}`} fill="none" stroke="#E6EBF0" strokeWidth="10" />
      {v != null && <path d={`M${x0},${y0} A${r},${r} 0 0 1 ${xv},${yv}`} fill="none" stroke={HC[health(v)]} strokeWidth="10" />}
      <line x1={xm} y1={ym - 7} x2={xm + (xm - cx) * 0.25} y2={ym + (ym - cy) * 0.25 - 7} stroke="#8E0E0B" strokeWidth="2" />
      <text x="50" y="54" textAnchor="middle" fontSize="17" fontWeight="700" fill={HC[health(v)] || "#121417"}>{v == null ? "–" : v.toFixed(2)}</text>
    </svg>
  );
}

function Evm({ bac, pv, ev, ac, eac, href }: { bac: number; pv: number; ev: number; ac: number; eac: number | null; href: string }) {
  const max = Math.max(1, bac, pv, ev, ac);
  const rows: [string, number, string][] = [["BAC · budget", bac, "#C9D6E4"], ["PV · planned", pv, "#6F93BA"], ["EV · earned", ev, "#1E3A5C"], ["AC · actual cost", ac, "#8E0E0B"]];
  return (
    <div>
      <Sec title="Earned value" em="EGP" link={{ href, label: "Budget" }} />
      <div className="rp-bars">
        {rows.map(([l, v, c]) => (
          <div className="r" key={l}><span>{l}</span><span className="bar"><i style={{ width: `${(v / max) * 100}%`, background: c }} /></span><span className="n">{M(v)}</span></div>
        ))}
      </div>
      <div className="rp-kpis k3" style={{ marginTop: 8 }}>
        <Kpi label="SV · schedule" value={M(ev - pv)} tone={ev - pv < 0 ? "bad" : "good"} />
        <Kpi label="CV · cost" value={M(ev - ac)} tone={ev - ac < 0 ? "bad" : "good"} />
        <Kpi label="EAC · forecast" value={M(eac)} tone={eac != null && eac > bac * 1.02 ? "bad" : ""} />
      </div>
    </div>
  );
}

function Pipeline({ stats, hrefOf }: { stats: ReturnType<typeof unitStats>; hrefOf: (k: string) => string }) {
  const max = Math.max(1, ...stats.byStage.map((s) => s.n));
  return (
    <div>
      <Sec title="Unit delivery stages" em="click a stage to open it in Handover" />
      <div className="rp-bars">
        {stats.byStage.map((s) => (
          <Link key={s.key} prefetch={false} href={hrefOf(s.key)} className="r click">
            <span><i className="rp-dot" style={{ background: s.color }} />{s.short}</span>
            <span className="bar"><i style={{ width: `${(s.n / max) * 100}%`, background: s.color }} /></span>
            <span className="n">{s.n.toLocaleString("en-US")}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Contractors({ list, href }: { list: RContractor[]; href: string }) {
  if (!list.length) return null;
  return (
    <div>
      <Sec title="Contractors" em="awarded and certified" link={{ href, label: "Contracts" }} />
      <table className="rp-tbl">
        <thead><tr><th>Contractor</th><th className="r">Awarded</th><th>Certified</th></tr></thead>
        <tbody>
          {list.slice(0, 8).map((c) => (
            <tr key={c.name} className="click" onClick={() => { location.href = href; }}>
              <td>{c.name}{c.contracts > 1 && <small> · {c.contracts}</small>}</td>
              <td className="r">{M(c.value)}</td>
              <td><div className="rp-minibar"><i style={{ width: `${c.value ? Math.min(100, (c.certified * 100) / c.value) : 0}%` }} /></div><small>{c.value ? P((c.certified * 100) / c.value) : "–"}</small></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Issues({ list, open, overdue }: { list: RIssue[]; open: number; overdue: number }) {
  return (
    <div>
      <Sec title="Issues and actions" em={`${open} waiting · ${overdue} overdue`} />
      <div className="rp-issues">
        {list.map((x) => (
          <Link key={x.href} prefetch={false} href={x.href} className={x.overdue ? "late" : ""}>
            <b>{x.ref} · {x.title}</b>
            <span>{x.step} · {x.who} · {x.days} days{x.overdue ? " · overdue" : ""}</span>
          </Link>
        ))}
        {!list.length && <p className="rp-note">Nothing waiting in workflows.</p>}
      </div>
    </div>
  );
}

const mon = (d: string) => new Date(`${d.slice(0, 7)}-01T00:00:00Z`).getTime();
const addMonths = (t: number, k: number) => { const d = new Date(t); d.setUTCMonth(d.getUTCMonth() + k); return d.getTime(); };

// Planned and actual by month, a dashed forecast from the recent pace, and today.
function SCurveChart({ points, today }: { points: Pt[]; today: string }) {
  if (!points.length) return <p className="rp-note">No monthly progress yet. Add it on the Schedule page.</p>;
  const W = 440, H = 190, L = 32, R = 8, T = 8, B = 22;
  const last = points[points.length - 1]!;
  const k = Math.min(3, points.length - 1);
  const pace = k > 0 ? (last.actual - points[points.length - 1 - k]!.actual) / k : 0;
  const fc: { t: number; v: number }[] = [];
  if (last.actual < 100 && pace > 0.05) {
    let v = last.actual, t = mon(last.period);
    fc.push({ t, v });
    for (let i = 0; i < 48 && v < 100; i++) { t = addMonths(t, 1); v = Math.min(100, v + pace); fc.push({ t, v }); }
  }
  const t0 = mon(points[0]!.period), t1 = Math.max(mon(last.period), fc.at(-1)?.t ?? 0, mon(today));
  const x = (t: number) => L + (t1 === t0 ? (W - L - R) / 2 : ((t - t0) / (t1 - t0)) * (W - L - R));
  const y = (v: number) => T + (1 - v / 100) * (H - T - B);
  const line = (arr: { t: number; v: number }[]) => arr.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
  const plan = points.map((p) => ({ t: mon(p.period), v: p.planned }));
  const act = points.map((p) => ({ t: mon(p.period), v: p.actual }));
  const ticks = Array.from({ length: 5 }, (_, i) => t0 + ((t1 - t0) * i) / 4);
  const tx = x(mon(today));
  return (
    <>
      <div className="rp-legend"><span><i style={{ background: "#6F93BA" }} />Planned</span><span><i style={{ background: "#1E3A5C" }} />Actual</span>{fc.length > 0 && <span><i style={{ background: "repeating-linear-gradient(90deg,#1E3A5C 0 4px,transparent 4px 7px)" }} />Forecast</span>}<span><i style={{ background: "#8E0E0B" }} />Today</span></div>
      <svg className="rp-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Planned, actual and forecast progress by month">
        {[0, 25, 50, 75, 100].map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#E6EBF0" /><text x={L - 5} y={y(v) + 3} textAnchor="end">{v}%</text></g>)}
        {ticks.map((t) => <text key={t} x={x(t)} y={H - 6} textAnchor="middle">{new Date(t).toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" })}</text>)}
        <path d={line(plan)} fill="none" stroke="#6F93BA" strokeWidth="2" />
        <path d={line(act)} fill="none" stroke="#1E3A5C" strokeWidth="2.5" />
        {fc.length > 0 && <path d={line(fc)} fill="none" stroke="#1E3A5C" strokeWidth="1.6" strokeDasharray="4 3" />}
        {tx >= L && tx <= W - R && <><line x1={tx} x2={tx} y1={T} y2={H - B} stroke="#8E0E0B" strokeWidth="1.5" /><text x={tx + 3} y={T + 9} textAnchor="start" style={{ fill: "#8E0E0B" }}>Today</text></>}
        {act.map((p, i) => <circle key={i} cx={x(p.t)} cy={y(p.v)} r="2.4" fill="#1E3A5C"><title>{`${points[i]!.period.slice(0, 7)}: actual ${p.v.toFixed(1)}%, plan ${points[i]!.planned.toFixed(1)}%`}</title></circle>)}
      </svg>
      {fc.length > 0 && <p className="rp-note">At the pace of the last {k} months it reaches 100% around {new Date(fc.at(-1)!.t).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" })}.</p>}
    </>
  );
}

function Spark({ points }: { points: { period: string; v: number | null }[] }) {
  const W = 440, H = 70, L = 30, R = 8, T = 6, B = 16;
  const vals = points.map((p) => p.v ?? 1);
  const lo = Math.min(0.8, ...vals), hi = Math.max(1.1, ...vals);
  const x = (i: number) => L + (points.length === 1 ? 0 : (i * (W - L - R)) / (points.length - 1));
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  return (
    <svg className="rp-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="SPI by month">
      <line x1={L} x2={W - R} y1={y(1)} y2={y(1)} stroke="#8E0E0B" strokeDasharray="3 3" />
      <text x={L - 4} y={y(1) + 3} textAnchor="end">1.00</text>
      <path d={points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.v ?? 1)}`).join("")} fill="none" stroke="#1E3A5C" strokeWidth="2" />
      {points.map((p, i) => (
        <g key={p.period}>
          <circle cx={x(i)} cy={y(p.v ?? 1)} r="3" fill={HC[health(p.v)]}><title>{`${p.period.slice(0, 7)}: SPI ${I(p.v)}`}</title></circle>
          <text x={x(i)} y={H - 3} textAnchor="middle">{new Date(`${p.period.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })}</text>
        </g>
      ))}
    </svg>
  );
}
