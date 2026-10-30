import { ActionForm } from "@/components/ActionForm";
import { SitePlan } from "@/components/SitePlan";
import { getMe } from "@/lib/data";
import type { SiteBuilding, SiteModel, SitePhase, SiteUnit } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { addModel, changeUnitStatus, removeModel, saveBuilding, saveOutline } from "../actions";

export default async function SitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const me = await getMe();
  const [{ data: p }, { data: phases }, { data: buildings }, { data: units }, { data: models }] = await Promise.all([
    supabase.from("projects").select("lat, lng").eq("id", id).single(),
    supabase.from("phases").select("id, code, name, boundary").eq("project_id", id).order("code"),
    supabase.from("buildings").select("id, code, name, phase_id, floors, floor_height_m, base_m, footprint").eq("project_id", id).order("code"),
    supabase.from("units").select("id, code, building_id, phase_id, floor, status, unit_type, area_m2, garden_m2, bedrooms, list_price_egp, footprint").eq("project_id", id).order("code").limit(5000),
    supabase.from("project_models").select("id, name, url").eq("project_id", id).order("created_at"),
  ]);
  const dept = me?.department ?? "";
  const canDraw = !!me?.is_admin || ["pm", "tech_office", "cost_control", "sales"].includes(dept);
  const canSell = !!me?.is_admin || ["pm", "sales", "handover"].includes(dept);
  const canBuild = !!me?.is_admin || ["pm", "tech_office", "cost_control"].includes(dept);

  return (
    <SitePlan
      projectId={id}
      center={p?.lat != null && p?.lng != null ? [p.lng, p.lat] : null}
      phases={(phases ?? []) as SitePhase[]}
      buildings={(buildings ?? []) as SiteBuilding[]}
      units={(units ?? []) as SiteUnit[]}
      models={(models ?? []) as SiteModel[]}
      canDraw={canDraw}
      canSell={canSell}
      saveOutline={saveOutline.bind(null, id)}
      changeStatus={changeUnitStatus.bind(null, id)}
      addModel={addModel.bind(null, id)}
      removeModel={removeModel.bind(null, id)}
    >
      {canBuild && (
        <details className="we-site__add">
          <summary>Add or change a building</summary>
          <ActionForm action={saveBuilding.bind(null, id)} className="we-stack" resetOnOk>
            <div className="we-form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div className="we-field"><label htmlFor="bcode">Code</label><input id="bcode" name="code" className="we-input we-mono" required placeholder="B01" /></div>
              <div className="we-field"><label htmlFor="bname">Name</label><input id="bname" name="name" className="we-input" /></div>
              <div className="we-field">
                <label htmlFor="bphase">Phase</label>
                <select id="bphase" name="phase" className="we-input we-select">
                  <option value="">None</option>
                  {(phases ?? []).map((ph) => <option key={ph.id} value={ph.code}>{ph.name || ph.code}</option>)}
                </select>
              </div>
              <div className="we-field"><label htmlFor="bfloors">Floors</label><input id="bfloors" name="floors" className="we-input we-mono" inputMode="numeric" placeholder="5" /></div>
              <div className="we-field"><label htmlFor="bheight">Floor height (m)</label><input id="bheight" name="floor_height_m" className="we-input we-mono" inputMode="decimal" placeholder="3.2" /></div>
              <div className="we-field"><label htmlFor="bbase">Ground level (m)</label><input id="bbase" name="base_m" className="we-input we-mono" inputMode="decimal" placeholder="0" /></div>
            </div>
            <span className="we-help">Same code updates the building. Then draw its outline above. Units link to buildings by their Building column.</span>
            <div><button className="we-btn we-btn--primary we-btn--sm">Save building</button></div>
          </ActionForm>
        </details>
      )}
    </SitePlan>
  );
}
