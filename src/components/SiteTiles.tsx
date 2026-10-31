"use client";

import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import type { CBuilding, CUnit } from "./UnitConsole";

// A hand-made tile map: regions on a grid, rows of building cards in site order, annexes between
// them, and each unit tile placed by its floor and column. Saved per project in projects.tile_layout.
export type TileSlot = { b: string; annex?: string[]; wide?: boolean; kind?: "grid" | "town" | "twin" | "flats"; asc?: boolean };
export type TileRow = { label?: string; vertical?: boolean; slots: TileSlot[] };
export type TileLayout = {
  version: 1; columns: number; mirrored?: string[]; duplex?: Record<string, string>;
  regions: { col: string; row: string; spread?: boolean; park?: boolean; rows: TileRow[] }[];
};

type Tile = { u: CUnit; col: number; row: number; span?: number; lab: string };
type Card = { key: string; name: string; units: CUnit[]; cols: number; tiles: Tile[]; annex: boolean; wide: boolean };

const suffix = (code: string) => code.slice(code.indexOf("-") + 1);
const pad2 = (n: number) => String(n).padStart(2, "0");

function place(slot: TileSlot, b: CBuilding, list: CUnit[], L: TileLayout): Card[] {
  const card = (name: string, units: CUnit[], cols: number, tiles: Tile[], annex = false): Card =>
    ({ key: `${b.code}:${name}:${slot.annex?.join(",") ?? ""}`, name, units, cols: Math.max(1, cols), tiles, annex, wide: cols > 6 });
  if (slot.annex) {
    const us = slot.annex.map((s) => list.find((u) => suffix(u.code) === s)).filter(Boolean) as CUnit[];
    if (!us.length) return [];
    const n = slot.wide ? 2 : slot.annex.length;
    return [card(slot.annex.map((s) => s.slice(-2)).join("·"), us, n,
      us.map((u, i) => ({ u, col: slot.wide ? 1 : slot.annex!.length - i, row: 1, span: slot.wide ? 2 : 1, lab: suffix(u.code) })), true)];
  }
  if (slot.kind === "town" || slot.kind === "twin") {
    // One card per terrace (T19, T18 …) or per pair of twins, each a single line.
    const town = slot.kind === "town";
    const groups = new Map<string, { sort: number; items: { u: CUnit; n: number; lab: string }[] }>();
    for (const u of list) {
      const m = town ? /T(\d+)-(\d+)$/.exec(u.code) : /V(\d+)-([AB])$/.exec(u.code);
      if (!m) continue;
      const key = town ? `T${m[1]}` : `V${pad2(+m[1]!)}`;
      const g = groups.get(key) ?? { sort: town ? -m[1]! : +m[1]!, items: [] };
      g.items.push({ u, n: town ? +m[2]! : m[2] === "A" ? 1 : 2, lab: m[2]! });
      groups.set(key, g);
    }
    return [...groups.entries()].sort((a, c) => a[1].sort - c[1].sort).map(([key, g]) => {
      g.items.sort((x, y) => x.n - y.n);
      const n = g.items.length;
      return card(key, g.items.map((x) => x.u), n, g.items.map((x, i) => ({ u: x.u, col: town && !slot.asc ? n - i : i + 1, row: 1, lab: x.lab })));
    });
  }
  if (slot.kind === "flats") {
    const p = list.map((u) => {
      const s = suffix(u.code);
      const g = /^G(\d+)$/.exec(s);
      return g ? { u, fl: 0, c: +g[1]! } : { u, fl: u.floor ?? +s.slice(0, -2), c: +s.slice(-2) || 1 };
    });
    const cols = Math.max(1, ...p.map((x) => x.c)), top = Math.max(0, ...p.map((x) => x.fl));
    return [card(b.code, list, cols, p.map((x) => ({ u: x.u, col: cols - x.c + 1, row: top - x.fl + 1, lab: suffix(x.u.code) })))];
  }
  // Villas and apartment blocks: the code's last two digits are floor then column (V21 = level 2, column 1).
  // The site reads right to left, so column 1 is on the right unless the block is mirrored.
  const mirrored = L.mirrored?.includes(b.code);
  const dupCode = Object.entries(L.duplex ?? {}).find(([pre]) => b.code.startsWith(pre))?.[1];
  const p = list.map((u) => { const d = suffix(u.code).replace(/\D/g, ""); return d.length >= 2 ? { u, fl: +d[d.length - 2]!, c: +d[d.length - 1]! } : null; });
  if (p.some((x) => !x)) {
    return [card(b.code, list, Math.min(6, list.length), list.map((u, i) => ({ u, col: (i % 6) + 1, row: Math.floor(i / 6) + 1, lab: suffix(u.code) })))];
  }
  const ok = p as { u: CUnit; fl: number; c: number }[];
  const cols = Math.max(...ok.map((x) => x.c));
  const floors = [...new Set(ok.map((x) => x.fl))].sort((a, c) => c - a);
  return [card(b.code, list, cols, ok.map((x) => {
    const dup = dupCode && suffix(x.u.code) === dupCode;
    const row = Math.max(0, floors.indexOf(dup ? x.fl + 1 : x.fl)) + 1;
    return { u: x.u, col: mirrored ? x.c : cols - x.c + 1, row, span: undefined, rspan: dup ? 2 : 1, lab: suffix(x.u.code) } as Tile & { rspan: number };
  }))];
}

export function SiteTiles({ layout, units, buildings, matches, sel, colorOf, onPick, onMany, scale, doneKey }: {
  layout: TileLayout; units: CUnit[]; buildings: CBuilding[];
  matches: Set<string>; sel: Set<string>; colorOf: (u: CUnit) => string;
  onPick: (id: string, additive: boolean) => void; onMany: (ids: string[], add: boolean) => void;
  scale: number; doneKey: (u: CUnit) => boolean;
}) {
  const built = useMemo(() => {
    const byCode = new Map(buildings.map((b) => [b.code, b]));
    const byB = new Map<string, CUnit[]>();
    for (const u of units) if (u.building) byB.set(u.building, [...(byB.get(u.building) ?? []), u]);
    return layout.regions.map((r) => ({
      ...r,
      rows: r.rows.map((row) => {
        const cards = row.slots.flatMap((s) => {
          const b = byCode.get(s.b);
          return b ? place(s, b, byB.get(b.id) ?? [], layout) : [];
        });
        return { ...row, cards, units: [...new Set(cards.flatMap((c) => c.units))] };
      }).filter((row) => row.cards.length),
    })).filter((r) => r.rows.length);
  }, [layout, units, buildings]);

  // Fit the whole site to the width available; − / + scale from there.
  const wrap = useRef<HTMLDivElement>(null), inner = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(1);
  useEffect(() => {
    const measure = () => {
      if (!wrap.current || !inner.current) return;
      const natural = inner.current.scrollWidth;
      if (natural > 0) setFit(Math.max(0.35, Math.min(1.4, (wrap.current.clientWidth - 28) / natural)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, [built]);

  const add = (e: React.MouseEvent) => e.ctrlKey || e.metaKey || e.shiftKey;
  const pct = (us: CUnit[]) => (us.length ? Math.round((us.filter(doneKey).length / us.length) * 100) : 0);

  return (
    <div ref={wrap} className="we-uc__stage we-uc__stage--tiles we-tmap-wrap">
      <div style={{ zoom: fit * scale }}>
        <div ref={inner} className="we-site" style={{ gridTemplateColumns: `repeat(${layout.columns}, auto)` }}>
          {built.map((r, ri) => (
            <div key={ri} className={`we-site__region${r.spread ? " is-spread" : ""}${r.park ? " is-park" : ""}`} style={{ gridColumn: r.col, gridRow: r.row }}>
              {r.park && <div className="we-site__park">Central park</div>}
              {r.rows.map((row, i) => (
                <div key={i} className="we-site__cl">
                  {row.label && (
                    <header>
                      <button type="button" onClick={(e) => onMany(row.units.filter((u) => matches.has(u.id)).map((u) => u.id), add(e))} title="Select every unit shown in this row">{row.label}</button>
                      <span>{row.units.filter(doneKey).length}/{row.units.length}</span>
                    </header>
                  )}
                  <div className={`we-site__row${row.vertical ? " is-vertical" : ""}`}>
                    {row.cards.map((c) => {
                      const style: CSSProperties = c.annex
                        ? { flex: "0 1 auto", width: c.cols * 26 + 14 }
                        : { flex: row.vertical ? "0 0 auto" : c.wide ? `2 1 ${c.cols * 20}px` : "1 1 0", minWidth: Math.max(58, c.cols * (c.wide ? 19 : 24) + 14) };
                      return (
                        <div key={c.key} className={`we-site__card${c.annex ? " is-annex" : ""}`} style={style}>
                          <button type="button" className="we-site__name" onClick={(e) => onMany(c.units.filter((u) => matches.has(u.id)).map((u) => u.id), add(e))}
                            title={`${c.name} · ${c.units.length} units · ${c.units.filter(doneKey).length} done`}>
                            <b>{c.name}</b>{!c.annex && <span>{pct(c.units)}%</span>}
                          </button>
                          <div className="we-site__grid" style={{ gridTemplateColumns: `repeat(${c.cols}, minmax(0, 1fr))` }}>
                            {c.tiles.map((t) => {
                              const on = matches.has(t.u.id);
                              const rs = (t as Tile & { rspan?: number }).rspan ?? 1;
                              return (
                                <button key={t.u.id} type="button" disabled={!on}
                                  className={`we-site__u${sel.has(t.u.id) ? " is-sel" : ""}${t.u.prio ? " is-prio" : ""}${on ? "" : " is-off"}`}
                                  style={{ gridColumn: t.span && t.span > 1 ? `${t.col} / span ${t.span}` : t.col, gridRow: rs > 1 ? `${t.row} / span ${rs}` : t.row, background: on ? colorOf(t.u) : undefined }}
                                  onClick={(e) => onPick(t.u.id, add(e))}
                                  title={`${t.u.code} · ${t.u.type} · built ${t.u.pct.toFixed(0)}%`}>
                                  {t.lab}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
