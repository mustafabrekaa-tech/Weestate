import type { MapModel } from "@/components/MapModels";
import type { CBuilding, COpt, CUnit } from "@/components/UnitConsole";
import { fetchAll, loadConstruction } from "@/lib/construction";
import type { Scope } from "@/lib/scope";
import { createClient } from "@/lib/supabase/server";
import { readGeo } from "@/lib/geo";
import type { EarthProject } from "@/components/EarthMap";
import type { TileLayout } from "@/components/SiteTiles";

type Supa = Awaited<ReturnType<typeof createClient>>;
type Row = {
  id: string; code: string; unit_type: string; phase_id: string | null; zone_id: string | null; building_id: string | null; floor: number | null;
  status: string; handover_stage: string; handover_stage_at: string | null; priority: boolean; delivery_date: string | null; target_date: string | null;
  area_m2: number | null; plan_poly: [number, number][] | null;
};

const ALL: Scope = { phase: "", zone: "", building: "", buildings: [], label: "" };

// Everything the unit console needs for one project.
export async function loadConsole(supabase: Supa, project: string) {
  const [c, rows, { data: p }, { data: phases }, { data: zones }, { data: buildings }, { data: all }, { data: blds }, { data: mods }] = await Promise.all([
    loadConstruction(supabase, project, ALL),
    fetchAll<Row>((a, b) => supabase.from("units")
      .select("id, code, unit_type, phase_id, zone_id, building_id, floor, status, handover_stage, handover_stage_at, priority, delivery_date, target_date, area_m2, plan_poly")
      .eq("project_id", project).order("code").range(a, b)),
    supabase.from("projects").select("plan_image, plan_w, plan_h, tile_layout").eq("id", project).maybeSingle(),
    supabase.from("phases").select("id, code, name").eq("project_id", project).order("code"),
    supabase.from("zones").select("id, code, name").eq("project_id", project).order("code"),
    supabase.from("buildings").select("id, code, name, zone_id, phase_id, floors").eq("project_id", project).order("code"),
    supabase.from("projects").select("id, name, lat, lng, plan_image, plan_w, plan_h, plan_geo").not("lat", "is", null).order("name"),
    supabase.from("buildings").select("footprint, floors, floor_height_m, base_m").eq("project_id", project).not("footprint", "is", null).limit(5000),
    supabase.from("project_models").select("id, url, placement").eq("project_id", project).not("placement", "is", null),
  ]);
  const units: CUnit[] = rows.map((r) => ({
    id: r.id, code: r.code, type: r.unit_type ?? "", phase: r.phase_id, zone: r.zone_id, building: r.building_id, floor: r.floor,
    status: r.status, ho: r.handover_stage ?? "not_started", hoAt: r.handover_stage_at, prio: !!r.priority, due: r.delivery_date, target: r.target_date,
    pct: Math.round((c.unitPct.get(r.id) ?? 0) * 10) / 10, area: r.area_m2 == null ? null : Number(r.area_m2), poly: r.plan_poly,
  }));
  const stagePct: Record<string, number[]> = {};
  for (const u of units) {
    const m = c.byUnit.get(u.id);
    if (m) stagePct[u.id] = c.stages.map((s) => m.get(s.id) ?? 0);
  }
  const plan = p?.plan_image && p.plan_w && p.plan_h ? { image: p.plan_image as string, w: Number(p.plan_w), h: Number(p.plan_h) } : null;
  // Every project the person can see, so the satellite map can show them together and fly between them.
  const earth: EarthProject[] = (all ?? []).filter((x) => x.lat != null && x.lng != null).map((x) => ({
    id: x.id, name: x.name, lat: Number(x.lat), lng: Number(x.lng), href: `/projects/${x.id}/console?view=earth`,
    plan: x.plan_image && x.plan_w && x.plan_h ? { image: x.plan_image, w: Number(x.plan_w), h: Number(x.plan_h) } : null,
    geo: readGeo(x.plan_geo),
    // This project's buildings and placed 3D models on the satellite view.
    ...(x.id === project ? {
      blocks: ((blds ?? []) as { footprint: [number, number][]; floors: number | null; floor_height_m: number | null; base_m: number | null }[]).map((b) => {
        const b0 = Number(b.base_m ?? 0);
        return { ring: b.footprint, base: b0, top: b0 + Math.max(1, b.floors ?? 1) * Number(b.floor_height_m || 3.2) };
      }),
      models: ((mods ?? []) as MapModel[]).map((m) => ({ id: m.id, url: m.url, placement: m.placement })),
    } : {}),
  }));
  const tileLayout = (p?.tile_layout as TileLayout | null) ?? null;
  return {
    tileLayout: tileLayout?.regions?.length ? tileLayout : null,
    earth,
    units,
    stagePct,
    stages: c.stages.map((s) => ({ id: s.id, name: s.name })),
    plan,
    phases: (phases ?? []).map((x) => ({ id: x.id, label: x.name || x.code })) as COpt[],
    zones: (zones ?? []).map((x) => ({ id: x.id, label: x.name || x.code })) as COpt[],
    buildings: (buildings ?? []).map((b) => ({ id: b.id, code: b.code, name: b.name || b.code, zone: b.zone_id, phase: b.phase_id, floors: Number(b.floors) || 1 })) as CBuilding[],
  };
}
