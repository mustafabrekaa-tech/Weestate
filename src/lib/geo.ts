// Where a masterplan image sits on the earth, and how to turn plan pixels into longitude and latitude.
export type PlanGeo = { lng: number; lat: number; mpp: number; rot: number };

const M_PER_DEG = 111320;

// Without a saved alignment, centre the plan on the project pin at about half a kilometre across.
export function defaultGeo(lng: number, lat: number, w: number): PlanGeo {
  return { lng, lat, mpp: 540 / w, rot: 0 };
}

export function toLngLat(g: PlanGeo, w: number, h: number, x: number, y: number): [number, number] {
  const dx = (x - w / 2) * g.mpp, dy = -(y - h / 2) * g.mpp;
  const r = (-g.rot * Math.PI) / 180;
  const ex = dx * Math.cos(r) - dy * Math.sin(r), ny = dx * Math.sin(r) + dy * Math.cos(r);
  return [g.lng + ex / (M_PER_DEG * Math.cos((g.lat * Math.PI) / 180)), g.lat + ny / M_PER_DEG];
}

// The four corners maplibre wants for an image: top-left, top-right, bottom-right, bottom-left.
export function corners(g: PlanGeo, w: number, h: number) {
  return [toLngLat(g, w, h, 0, 0), toLngLat(g, w, h, w, 0), toLngLat(g, w, h, w, h), toLngLat(g, w, h, 0, h)] as [
    [number, number], [number, number], [number, number], [number, number],
  ];
}

export function readGeo(v: unknown): PlanGeo | null {
  const o = v as Partial<PlanGeo> | null;
  return o && [o.lng, o.lat, o.mpp, o.rot].every((n) => typeof n === "number" && Number.isFinite(n)) ? (o as PlanGeo) : null;
}
