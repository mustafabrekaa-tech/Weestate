import type { Metadata } from "next";
import { PlanEditor, type PUnit } from "@/components/PlanEditor";
import { fetchAll } from "@/lib/construction";
import { acts, getMe } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { savePlanPolys, setPlanImage } from "../actions";

export const metadata: Metadata = { title: "Masterplan" };

// Upload the masterplan and mark where each unit is on it. This is what the unit
// console's Tile map, Masterplan and 3D views are drawn from.
export default async function MasterplanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [me, { data: p }, { data: blds }, rows] = await Promise.all([
    getMe(),
    supabase.from("projects").select("plan_image, plan_w, plan_h").eq("id", id).maybeSingle(),
    supabase.from("buildings").select("id, code").eq("project_id", id),
    fetchAll<{ id: string; code: string; building_id: string | null; plan_poly: [number, number][] | null }>((a, b) =>
      supabase.from("units").select("id, code, building_id, plan_poly").eq("project_id", id).order("code").range(a, b)),
  ]);
  const bcode = new Map((blds ?? []).map((b) => [b.id as string, b.code as string]));
  const units: PUnit[] = rows
    .map((u) => ({ id: u.id, code: u.code, building: (u.building_id && bcode.get(u.building_id)) || "", poly: u.plan_poly }))
    .sort((a, b) => a.building.localeCompare(b.building, undefined, { numeric: true }) || a.code.localeCompare(b.code, undefined, { numeric: true }));
  const plan = p?.plan_image && p.plan_w && p.plan_h ? { image: p.plan_image as string, w: Number(p.plan_w), h: Number(p.plan_h) } : null;

  async function img(url: string, w: number, h: number) {
    "use server";
    return setPlanImage(id, url, w, h);
  }
  async function polys(items: { id: string; poly: [number, number][] | null }[]) {
    "use server";
    return savePlanPolys(id, items);
  }

  return (
    <>
      <PlanEditor projectId={id} plan={plan} units={units} canEdit={acts(me, ["pm", "tech_office", "cost_control", "sales"])} setImage={img} savePolys={polys} />
    </>
  );
}
