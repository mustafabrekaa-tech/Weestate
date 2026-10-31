import { type Scope, scoped } from "@/lib/scope";
import { createClient } from "@/lib/supabase/server";

type Supa = Awaited<ReturnType<typeof createClient>>;
export type Stage = { id: string; seq: number; name: string; weight: number };
export type BuildUnit = {
  id: string; code: string; unit_type: string; status: string; delivery_date: string | null;
  phase_id: string | null; zone_id: string | null; building_id: string | null;
};

// Every row of a query, page by page (the API returns at most 1000 at a time).
export async function fetchAll<T>(make: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, max = 60000) {
  const out: T[] = [];
  for (let from = 0; from < max; from += 1000) {
    const { data } = await make(from, from + 999);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

// Stages, units in scope, and where each unit and stage stands now.
export async function loadConstruction(supabase: Supa, project: string, scope: Scope) {
  await supabase.rpc("ensure_stages", { p_project: project });
  const [{ data: st }, units, now] = await Promise.all([
    supabase.from("construction_stages").select("id, seq, name, weight").eq("project_id", project).order("seq"),
    fetchAll<BuildUnit>((a, b) =>
      scoped(supabase.from("units").select("id, code, unit_type, status, delivery_date, phase_id, zone_id, building_id").eq("project_id", project), scope, { zone: true, building: true })
        .order("code").range(a, b)),
    // One call returns the latest figure per unit and stage (reading the view page by page timed out).
    supabase.rpc("unit_stage_latest", { p_project: project }).then(({ data }) =>
      ((data ?? []) as [string, string, number, string][]).map(([unit_id, stage_id, pct, as_of]) => ({ unit_id, stage_id, pct, as_of }))),
  ]);
  const stages = ((st ?? []) as Stage[]).map((s) => ({ ...s, weight: Number(s.weight) }));
  const totalW = stages.reduce((s, x) => s + x.weight, 0) || 1;
  const byUnit = new Map<string, Map<string, number>>();
  let lastUpdate = "";
  for (const r of now) {
    if (!byUnit.has(r.unit_id)) byUnit.set(r.unit_id, new Map());
    byUnit.get(r.unit_id)!.set(r.stage_id, Number(r.pct));
    if (r.as_of > lastUpdate) lastUpdate = r.as_of;
  }
  const unitPct = new Map<string, number>();
  for (const u of units) {
    const m = byUnit.get(u.id);
    unitPct.set(u.id, m ? stages.reduce((s, x) => s + (m.get(x.id) ?? 0) * x.weight, 0) / totalW : 0);
  }
  const stagePct = (unitIds: string[], stage: string) =>
    unitIds.length ? unitIds.reduce((s, id) => s + (byUnit.get(id)?.get(stage) ?? 0), 0) / unitIds.length : 0;
  return { stages, units, byUnit, unitPct, stagePct, totalW, lastUpdate };
}

// Gold scale for a percentage, from pale to full.
export function heat(p: number) {
  if (p <= 0) return { background: "#f1eee8", color: "#8a96a0" };
  if (p >= 100) return { background: "#3f8f5a", color: "#fff" };
  const t = p / 100;
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t);
  return { background: `rgb(${mix(250, 201)},${mix(238, 162)},${mix(206, 78)})`, color: "#26313a" };
}
