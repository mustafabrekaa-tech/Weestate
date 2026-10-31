import type { CBuilding, COpt, CUnit } from "@/components/UnitConsole";
import { fetchAll, loadConstruction } from "@/lib/construction";
import type { Scope } from "@/lib/scope";
import { createClient } from "@/lib/supabase/server";

type Supa = Awaited<ReturnType<typeof createClient>>;
type Row = {
  id: string; code: string; unit_type: string; phase_id: string | null; zone_id: string | null; building_id: string | null; floor: number | null;
  status: string; handover_stage: string; handover_stage_at: string | null; priority: boolean; delivery_date: string | null; target_date: string | null;
  area_m2: number | null; plan_poly: [number, number][] | null;
};

const ALL: Scope = { phase: "", zone: "", building: "", buildings: [], label: "" };

// Everything the unit console needs for one project.
export async function loadConsole(supabase: Supa, project: string) {
  const [c, rows, { data: p }, { data: phases }, { data: zones }, { data: buildings }] = await Promise.all([
    loadConstruction(supabase, project, ALL),
    fetchAll<Row>((a, b) => supabase.from("units")
      .select("id, code, unit_type, phase_id, zone_id, building_id, floor, status, handover_stage, handover_stage_at, priority, delivery_date, target_date, area_m2, plan_poly")
      .eq("project_id", project).order("code").range(a, b)),
    supabase.from("projects").select("plan_image, plan_w, plan_h").eq("id", project).maybeSingle(),
    supabase.from("phases").select("id, code, name").eq("project_id", project).order("code"),
    supabase.from("zones").select("id, code, name").eq("project_id", project).order("code"),
    supabase.from("buildings").select("id, code, name, zone_id, phase_id, floors").eq("project_id", project).order("code"),
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
  return {
    units,
    stagePct,
    stages: c.stages.map((s) => ({ id: s.id, name: s.name })),
    plan,
    phases: (phases ?? []).map((x) => ({ id: x.id, label: x.name || x.code })) as COpt[],
    zones: (zones ?? []).map((x) => ({ id: x.id, label: x.name || x.code })) as COpt[],
    buildings: (buildings ?? []).map((b) => ({ id: b.id, code: b.code, name: b.name || b.code, zone: b.zone_id, phase: b.phase_id, floors: Number(b.floors) || 1 })) as CBuilding[],
  };
}
