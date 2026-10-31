"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CBuilding, COpt, CUnit } from "./UnitConsole";

// A schematic of the site: clusters sit where they are on the masterplan (west, middle, east;
// north to south), each building is a card, and its units are tiles stacked by floor.
type Zone = { id: string; label: string; phase: string; cx: number; cy: number; blocks: Block[]; units: CUnit[] };
type Block = { key: string; label: string; cx: number; cy: number; floors: CUnit[][]; units: CUnit[] };

const centroid = (p: [number, number][]) => [p.reduce((a, q) => a + q[0], 0) / p.length, p.reduce((a, q) => a + q[1], 0) / p.length] as const;
const short = (code: string) => code.slice(code.lastIndexOf("-") + 1) || code;

export function TileMap({ units, buildings, phases, zones, plan, matches, sel, colorOf, onPick, onMany, scale, doneKey }: {
  units: CUnit[]; buildings: CBuilding[]; phases: COpt[]; zones: COpt[]; plan: { w: number; h: number };
  matches: Set<string>; sel: Set<string>; colorOf: (u: CUnit) => string;
  onPick: (id: string, additive: boolean) => void; onMany: (ids: string[], add: boolean) => void;
  scale: number; doneKey: (u: CUnit) => boolean;
}) {
  // Fit the whole site to the width available, then the person's −/+ scales from there.
  const wrap = useRef<HTMLDivElement>(null), inner = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(1);
  useEffect(() => {
    const measure = () => {
      if (!wrap.current || !inner.current) return;
      const natural = inner.current.scrollWidth; // zoom is applied to the parent, so this is the unscaled width
      const avail = wrap.current.clientWidth - 28;
      if (natural > 0) setFit(Math.max(0.4, Math.min(1.3, avail / natural)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, [units.length]);
  const layout = useMemo(() => {
    const pos = new Map<string, readonly [number, number]>();
    for (const u of units) if (u.poly?.length) pos.set(u.id, centroid(u.poly));
    const bmap = new Map(buildings.map((b) => [b.id, b]));
    const zname = new Map(zones.map((z) => [z.id, z.label]));
    const pshort = new Map(phases.map((p) => [p.id, (p.label.match(/Phase\s*0?(\d+)/i)?.[1] ? `PH0${p.label.match(/Phase\s*0?(\d+)/i)![1]}` : p.label.split(" ·")[0]!)]));
    const avg = (us: CUnit[]) => {
      const ps = us.map((u) => pos.get(u.id)).filter(Boolean) as (readonly [number, number])[];
      return ps.length ? [ps.reduce((a, p) => a + p[0], 0) / ps.length, ps.reduce((a, p) => a + p[1], 0) / ps.length] : [plan.w / 2, plan.h / 2];
    };
    const byZone = new Map<string, CUnit[]>();
    for (const u of units) { const k = u.zone ?? `p:${u.phase ?? ""}`; byZone.set(k, [...(byZone.get(k) ?? []), u]); }
    const out: Zone[] = [];
    for (const [zid, us] of byZone) {
      const byB = new Map<string, CUnit[]>();
      for (const u of us) { const k = u.building ?? "none"; byB.set(k, [...(byB.get(k) ?? []), u]); }
      const blocks: Block[] = [...byB.entries()].map(([bk, bu]) => {
        const [cx, cy] = avg(bu);
        const fl = new Map<number, CUnit[]>();
        for (const u of bu) fl.set(u.floor ?? 0, [...(fl.get(u.floor ?? 0) ?? []), u]);
        const floors = [...fl.entries()].sort((a, b) => b[0] - a[0]).map(([, list]) =>
          list.sort((a, b) => (pos.get(a.id)?.[0] ?? 0) - (pos.get(b.id)?.[0] ?? 0) || a.code.localeCompare(b.code, undefined, { numeric: true })));
        const b = bmap.get(bk);
        return { key: bk, label: b ? b.code : "Units", cx, cy, floors, units: bu };
      });
      // Rows of buildings as they sit on the plan: a band of similar height, then west to east.
      const band = plan.h * 0.06;
      blocks.sort((a, b) => Math.round(a.cy / band) - Math.round(b.cy / band) || a.cx - b.cx);
      // A cluster whose buildings sit far apart (a strip at the top and one at the bottom) becomes separate pieces.
      const byY = [...blocks].sort((a, b) => a.cy - b.cy);
      const pieces: Block[][] = [];
      for (const b of byY) {
        const last = pieces.at(-1);
        if (last && b.cy - last.at(-1)!.cy < plan.h * 0.25) last.push(b); else pieces.push([b]);
      }
      pieces.forEach((pc, k) => {
        const pu = pc.flatMap((b) => b.units);
        pc.sort((a, b) => Math.round(a.cy / band) - Math.round(b.cy / band) || a.cx - b.cx);
        const [cx, cy] = avg(pu);
        out.push({ id: `${zid}:${k}`, label: zname.get(zid) ?? "Units", phase: pshort.get(us[0]!.phase ?? "") ?? "", cx, cy, blocks: pc, units: pu });
      });
    }
    // Three columns across the site, each read north to south; clusters at the same height share a row.
    const cols: Zone[][][] = [[], [], []];
    for (let c = 0; c < 3; c++) {
      const list = out.filter((z) => Math.min(2, Math.floor((z.cx / plan.w) * 3)) === c).sort((a, b) => a.cy - b.cy);
      for (const z of list) {
        const last = cols[c]!.at(-1);
        if (last && Math.abs(last[0]!.cy - z.cy) < plan.h * 0.09) last.push(z); else cols[c]!.push([z]);
      }
    }
    return cols.map((rows) => ({ rows, n: rows.flat().reduce((s, z) => s + z.units.length, 0) })).filter((c) => c.n > 0);
  }, [units, buildings, phases, zones, plan.w, plan.h]);

  const pctDone = (us: CUnit[]) => (us.length ? Math.round((us.filter(doneKey).length / us.length) * 100) : 0);

  return (
    <div ref={wrap} className="we-uc__stage we-uc__stage--tiles we-tmap-wrap">
      <div style={{ zoom: fit * scale }}>
      <div ref={inner} className="we-tmap">
        {layout.map((col, ci) => (
          <div key={ci} className="we-tmap__col" style={{ flexGrow: Math.max(1, Math.sqrt(col.n)) }}>
            {col.rows.map((row, ri) => (
              <div key={ri} className="we-tmap__row">
                {row.map((z) => {
                  const shown = z.units.filter((u) => matches.has(u.id));
                  return (
                    <section key={z.id} className={`we-tmap__zone${shown.length ? "" : " is-off"}`}>
                      <header>
                        <button type="button" onClick={(e) => onMany(shown.map((u) => u.id), e.ctrlKey || e.metaKey || e.shiftKey)} title="Select every unit shown in this cluster">
                          <b>{z.phase}</b> · {z.label}
                        </button>
                        <span>{z.units.filter(doneKey).length}/{z.units.length} · {pctDone(z.units)}%</span>
                      </header>
                      <div className="we-tmap__blocks">
                        {z.blocks.map((b) => (
                          <div key={b.key} className="we-tmap__block">
                            <button type="button" className="we-tmap__bname" onClick={(e) => onMany(b.units.filter((u) => matches.has(u.id)).map((u) => u.id), e.ctrlKey || e.metaKey || e.shiftKey)} title="Select this building">
                              {b.label} <span>{pctDone(b.units)}%</span>
                            </button>
                            {b.floors.map((f, fi) => (
                              <div key={fi} className="we-tmap__floor">
                                {f.map((u) => {
                                  const on = matches.has(u.id);
                                  return (
                                    <button key={u.id} type="button"
                                      className={`we-tmap__u${sel.has(u.id) ? " is-sel" : ""}${u.prio ? " is-prio" : ""}${on ? "" : " is-off"}`}
                                      style={{ background: on ? colorOf(u) : undefined }}
                                      disabled={!on}
                                      onClick={(e) => onPick(u.id, e.ctrlKey || e.metaKey || e.shiftKey)}
                                      title={`${u.code} · ${u.type} · built ${u.pct.toFixed(0)}%`}>
                                      {short(u.code)}
                                    </button>
                                  );
                                })}
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            ))}
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}
