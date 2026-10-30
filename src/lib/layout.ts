import type { SiteBuilding, SitePhase, SiteUnit, SiteZone } from "@/lib/site";

// A suggested site layout for anything not drawn yet, so the 3D site is never
// empty: phases side by side around the project's location, zones grouped
// inside them, buildings as blocks, villas and townhouses on their own plots,
// and apartments without a building stacked into blocks of 24 (4 a floor).
// Nothing here is saved until someone presses "Save this layout".

type Ring = [number, number][];
export type VirtualBuilding = SiteBuilding & { virtual: true; units: { id: string; floor: number }[] };
export type Layout = {
  phases: Map<string, Ring>;
  zones: Map<string, Ring>;
  buildings: Map<string, Ring>;
  units: Map<string, Ring>;
  virtual: VirtualBuilding[];
  // What was made up rather than drawn, for saving.
  made: { phases: string[]; zones: string[]; buildings: string[]; units: string[] };
};

const PLOT = /villa|town|twin|house|chalet|duplex|cabana/i;
const BLOCK = { w: 32, h: 18, cell: [40, 28] as [number, number] };
const PER_FLOOR = 4, FLOORS = 6;

type Item = { kind: "building" | "unit" | "virtual"; id: string; zone: string; w: number; h: number; cw: number; ch: number };

const rect = (x: number, y: number, w: number, h: number): [number, number][] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];

export function autoLayout({ center, phases, zones, buildings, units }: {
  center: [number, number];
  phases: SitePhase[];
  zones: SiteZone[];
  buildings: SiteBuilding[];
  units: SiteUnit[];
}): Layout {
  const out: Layout = { phases: new Map(), zones: new Map(), buildings: new Map(), units: new Map(), virtual: [], made: { phases: [], zones: [], buildings: [], units: [] } };
  for (const p of phases) if (p.boundary) out.phases.set(p.id, p.boundary);
  for (const z of zones) if (z.boundary) out.zones.set(z.id, z.boundary);
  for (const b of buildings) if (b.footprint) out.buildings.set(b.id, b.footprint);
  for (const u of units) if (u.footprint) out.units.set(u.id, u.footprint);

  const lat0 = center[1];
  const mx = 111320 * Math.cos((lat0 * Math.PI) / 180), my = 110540;
  const toLngLat = (r: [number, number][], ox: number, oy: number): Ring => r.map(([x, y]) => [ox + x / mx, oy + y / my] as [number, number]);
  const ringBox = (r: Ring) => {
    const xs = r.map((p) => p[0]), ys = r.map((p) => p[1]);
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  };

  // Things to place, per phase ("" = not in a phase).
  const groups = new Map<string, Item[]>();
  const add = (phase: string, it: Item) => groups.set(phase, [...(groups.get(phase) ?? []), it]);

  for (const b of buildings) {
    if (b.footprint) continue;
    add(b.phase_id ?? "", { kind: "building", id: b.id, zone: b.zone_id ?? "", w: BLOCK.w, h: BLOCK.h, cw: BLOCK.cell[0], ch: BLOCK.cell[1] });
  }
  const flats = new Map<string, SiteUnit[]>();
  for (const u of units) {
    if (u.footprint || u.building_id) continue;
    if (PLOT.test(u.unit_type)) {
      const town = /town|twin/i.test(u.unit_type);
      add(u.phase_id ?? "", { kind: "unit", id: u.id, zone: u.zone_id ?? "", w: town ? 8 : 14, h: town ? 14 : 16, cw: town ? 9 : 24, ch: town ? 26 : 28 });
    } else {
      const k = `${u.phase_id ?? ""}|${u.zone_id ?? ""}`;
      flats.set(k, [...(flats.get(k) ?? []), u]);
    }
  }
  const phaseCode = new Map(phases.map((p) => [p.id, p.code]));
  const used = new Set(buildings.map((b) => b.code));
  for (const [k, list] of flats) {
    const [phase, zone] = k.split("|") as [string, string];
    const per = PER_FLOOR * FLOORS;
    for (let i = 0; i * per < list.length; i++) {
      const chunk = list.slice(i * per, (i + 1) * per);
      let n = out.virtual.filter((v) => v.phase_id === (phase || null)).length + 1;
      let code = "";
      do code = `${(phaseCode.get(phase) ?? "B").replace(/\s+/g, "")}-B${String(n++).padStart(2, "0")}`; while (used.has(code));
      used.add(code);
      const v: VirtualBuilding = {
        id: `virtual:${code}`, code, name: code, phase_id: phase || null, zone_id: zone || null, floors: Math.ceil(chunk.length / PER_FLOOR),
        floor_height_m: 3.2, base_m: 0, footprint: null, virtual: true,
        units: chunk.map((u, j) => ({ id: u.id, floor: u.floor ?? Math.floor(j / PER_FLOOR) })),
      };
      out.virtual.push(v);
      add(phase, { kind: "virtual", id: v.id, zone, w: BLOCK.w, h: BLOCK.h, cw: BLOCK.cell[0], ch: BLOCK.cell[1] });
    }
  }

  // Pack each phase's items into rows (grouped by zone), then lay phases side by side.
  type Packed = { phase: string; w: number; h: number; place: { it: Item; x: number; y: number }[] };
  const packed: Packed[] = [];
  for (const [phase, items] of groups) {
    items.sort((a, b) => a.zone.localeCompare(b.zone) || a.kind.localeCompare(b.kind));
    const area = items.reduce((s, i) => s + i.cw * i.ch, 0);
    const width = Math.max(120, Math.sqrt(area) * 1.3);
    let x = 0, y = 0, row = 0, zone = items[0]?.zone ?? "";
    const place: Packed["place"] = [];
    for (const it of items) {
      // A new zone starts a new row, with a road between.
      if (it.zone !== zone) {
        x = 0; y += row + 14; row = 0; zone = it.zone;
      }
      if (x + it.cw > width && x > 0) {
        x = 0; y += row; row = 0;
      }
      place.push({ it, x: x + (it.cw - it.w) / 2, y: y + (it.ch - it.h) / 2 });
      x += it.cw;
      row = Math.max(row, it.ch);
    }
    packed.push({ phase, w: width, h: y + row, place });
  }
  packed.sort((a, b) => (phaseCode.get(a.phase) ?? "~").localeCompare(phaseCode.get(b.phase) ?? "~"));

  const margin = 16, gap = 50;
  const total = packed.reduce((s, p) => s + p.w + 2 * margin, 0) + gap * Math.max(0, packed.length - 1);
  let cursor = -total / 2;
  for (const p of packed) {
    const drawn = p.phase ? out.phases.get(p.phase) : undefined;
    let ox: number, oy: number;
    if (drawn) {
      // Inside a phase that already has an outline: start from its south-west corner.
      const b = ringBox(drawn);
      ox = b.x0 + margin / mx;
      oy = b.y0 + margin / my;
    } else {
      ox = center[0] + (cursor + margin) / mx;
      oy = center[1] - p.h / 2 / my;
      if (p.phase) {
        out.phases.set(p.phase, toLngLat(rect(-margin, -margin, p.w + 2 * margin, p.h + 2 * margin), ox, oy));
        out.made.phases.push(p.phase);
      }
      cursor += p.w + 2 * margin + gap;
    }
    const zoneBox = new Map<string, { x0: number; y0: number; x1: number; y1: number }>();
    for (const { it, x, y } of p.place) {
      const ring = toLngLat(rect(x, y, it.w, it.h), ox, oy);
      if (it.kind === "unit") { out.units.set(it.id, ring); out.made.units.push(it.id); }
      else { out.buildings.set(it.id, ring); if (it.kind === "building") out.made.buildings.push(it.id); }
      if (it.zone) {
        const z = zoneBox.get(it.zone) ?? { x0: x, y0: y, x1: x + it.w, y1: y + it.h };
        zoneBox.set(it.zone, { x0: Math.min(z.x0, x), y0: Math.min(z.y0, y), x1: Math.max(z.x1, x + it.w), y1: Math.max(z.y1, y + it.h) });
      }
    }
    for (const [z, b] of zoneBox) {
      if (out.zones.has(z)) continue;
      out.zones.set(z, toLngLat(rect(b.x0 - 5, b.y0 - 5, b.x1 - b.x0 + 10, b.y1 - b.y0 + 10), ox, oy));
      out.made.zones.push(z);
    }
  }
  return out;
}
