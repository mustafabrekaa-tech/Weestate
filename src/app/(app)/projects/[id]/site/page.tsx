import Link from "next/link";
import { projectBase } from "@/lib/slug";
import { ConsoleSection } from "@/components/ConsoleSection";
import { SitePlan } from "@/components/SitePlan";
import { acts, getMe } from "@/lib/data";
import { getScope } from "@/lib/scope";
import type { SiteBuilding, SiteModel, SitePhase, SiteUnit, SiteZone } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { addModel, changeUnitStatus, placeModel, removeModel, saveLayout, saveOutline } from "../actions";

export default async function SitePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string }> }) {
  const { id } = await params;
  const base = await projectBase(id);
  const { view } = await searchParams;
  const supabase = await createClient();
  const { data: pp } = await supabase.from("projects").select("plan_image").eq("id", id).maybeSingle();
  if (pp?.plan_image && view !== "map") {
    return (
      <div className="we-stack">
        <div className="we-row" style={{ justifyContent: "space-between" }}>
          <p className="we-help" style={{ margin: 0 }}>The project in 3D, built from the masterplan. Colour it by handover, construction, sales or delivery date; click units to open them.</p>
          <div className="we-seg we-seg--light">
            <Link href={`${base}/site`} className="is-on">3D masterplan</Link>
            <Link href={`${base}/site?view=map`}>Satellite map and models</Link>
          </div>
        </div>
        <ConsoleSection projectId={id} mode="sales" view="3d" title="3D site" height={640} />
      </div>
    );
  }
  const [me, scope] = await Promise.all([getMe(), getScope(id)]);
  const [{ data: p }, { data: phases }, { data: zones }, { data: buildings }, { data: units }, { data: models }] = await Promise.all([
    supabase.from("projects").select("lat, lng").eq("id", id).single(),
    supabase.from("phases").select("id, code, name, boundary").eq("project_id", id).order("code"),
    supabase.from("zones").select("id, code, name, phase_id, boundary").eq("project_id", id).order("code"),
    supabase.from("buildings").select("id, code, name, phase_id, zone_id, floors, floor_height_m, base_m, footprint").eq("project_id", id).order("code"),
    supabase.from("units").select("id, code, building_id, phase_id, zone_id, floor, status, unit_type, area_m2, garden_m2, bedrooms, list_price_egp, footprint").eq("project_id", id).order("code").limit(10000),
    supabase.from("project_models").select("id, name, url, placement").eq("project_id", id).order("created_at"),
  ]);
  const canBuild = acts(me, ["pm", "cost_control"]);

  return (
    <>
    {pp?.plan_image && (
      <div className="we-row" style={{ justifyContent: "flex-end", marginBottom: 8 }}>
        <div className="we-seg we-seg--light">
          <Link href={`${base}/site`}>3D masterplan</Link>
          <Link href={`${base}/site?view=map`} className="is-on">Satellite map and models</Link>
        </div>
      </div>
    )}
    <SitePlan
      projectId={id}
      center={p?.lat != null && p?.lng != null ? [p.lng, p.lat] : null}
      phases={(phases ?? []) as SitePhase[]}
      zones={(zones ?? []) as SiteZone[]}
      buildings={(buildings ?? []) as SiteBuilding[]}
      units={(units ?? []) as SiteUnit[]}
      models={(models ?? []) as SiteModel[]}
      canDraw={acts(me, ["pm", "tech_office", "cost_control", "sales"])}
      canSell={acts(me, ["pm", "sales", "handover"])}
      canBuild={canBuild}
      initial={{ phase: scope.phase, zone: scope.zone, building: scope.building }}
      saveOutline={saveOutline.bind(null, id)}
      saveLayout={saveLayout.bind(null, id)}
      changeStatus={changeUnitStatus.bind(null, id)}
      addModel={addModel.bind(null, id)}
      removeModel={removeModel.bind(null, id)}
      placeModel={placeModel.bind(null, id)}
    >
      {canBuild && (
        <Link className="we-link" href={`${base}/structure`}>Add or change phases, zones and buildings</Link>
      )}
    </SitePlan>
    </>
  );
}
