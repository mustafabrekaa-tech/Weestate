import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { acts, getMe } from "@/lib/data";
import { UNIT_STATUS } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { assignUnits, editBuilding, removeBuilding, removeZone, savePhase, saveZone } from "../actions";

type Phase = { id: string; code: string; name: string };
type Zone = { id: string; code: string; name: string; phase_id: string | null };
type Building = { id: string; code: string; name: string; phase_id: string | null; zone_id: string | null; floors: number; floor_height_m: number };
type U = { phase_id: string | null; zone_id: string | null; building_id: string | null; status: string; unit_type: string };

// The project's tree: phases, the zones inside them and the buildings inside
// those, with unit counts by status, and the tools to change it.
export default async function Structure({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [me, { data: phases }, { data: zones }, { data: buildings }, { data: units }] = await Promise.all([
    getMe(),
    supabase.from("phases").select("id, code, name").eq("project_id", id).order("code"),
    supabase.from("zones").select("id, code, name, phase_id").eq("project_id", id).order("code"),
    supabase.from("buildings").select("id, code, name, phase_id, zone_id, floors, floor_height_m").eq("project_id", id).order("code"),
    supabase.from("units").select("phase_id, zone_id, building_id, status, unit_type").eq("project_id", id).limit(20000),
  ]);
  const ph = (phases ?? []) as Phase[], zs = (zones ?? []) as Zone[], bs = (buildings ?? []) as Building[], us = (units ?? []) as U[];
  const canEdit = acts(me, ["pm", "cost_control"]);
  const canMove = acts(me, ["pm", "cost_control", "sales"]);
  const types = [...new Set(us.map((u) => u.unit_type).filter(Boolean))].sort();

  const bar = (list: U[]) => (
    <span className="we-mini">
      <span className="we-statbar we-statbar--sm" aria-hidden="true">
        {Object.entries(UNIT_STATUS).map(([k, v]) => {
          const n = list.filter((u) => u.status === k).length;
          return n ? <span key={k} style={{ flexGrow: n, background: v.color }} /> : null;
        })}
      </span>
      <span className="we-help">{list.length ? `${list.length} units` : "No units"}</span>
    </span>
  );
  const name = (o: { code: string; name: string }) => (o.name && o.name !== o.code ? `${o.code} · ${o.name}` : o.code);
  const opts = (list: { id: string; code: string; name: string }[]) => list.map((o) => <option key={o.id} value={o.id}>{name(o)}</option>);

  const buildingRow = (b: Building) => (
    <li key={b.id} className="we-tree__item">
      <details>
        <summary>
          <span className="we-tree__kind">Building</span><b>{name(b)}</b>
          <span className="we-help">{b.floors} floors</span>
          {bar(us.filter((u) => u.building_id === b.id))}
        </summary>
        {canEdit && (
          <div className="we-tree__edit">
            <BuildingForm id={id} b={b} phases={ph} zones={zs} />
            <ActionForm action={removeBuilding.bind(null, id, b.id)}><button className="we-link we-link--danger">Remove building</button></ActionForm>
          </div>
        )}
      </details>
    </li>
  );

  const zoneBlock = (z: Zone) => {
    const inZone = bs.filter((b) => b.zone_id === z.id);
    return (
      <li key={z.id} className="we-tree__item">
        <details open>
          <summary>
            <span className="we-tree__kind">Zone</span><b>{name(z)}</b>
            {bar(us.filter((u) => u.zone_id === z.id || inZone.some((b) => b.id === u.building_id)))}
          </summary>
          {canEdit && (
            <details className="we-tree__edit">
              <summary className="we-link">Edit zone</summary>
              <ActionForm action={saveZone.bind(null, id)} className="we-row">
                <input type="hidden" name="zone_id" value={z.id} />
                <input name="code" defaultValue={z.code} className="we-input we-input--sm we-mono" style={{ maxWidth: 110 }} aria-label="Code" required />
                <input name="name" defaultValue={z.name} className="we-input we-input--sm" style={{ maxWidth: 220 }} aria-label="Name" />
                <select name="phase_id" defaultValue={z.phase_id ?? ""} className="we-input we-select we-input--sm" aria-label="Phase"><option value="">No phase</option>{opts(ph)}</select>
                <button className="we-btn we-btn--secondary we-btn--sm">Save</button>
              </ActionForm>
              <ActionForm action={removeZone.bind(null, id, z.id)}><button className="we-link we-link--danger">Remove zone</button></ActionForm>
            </details>
          )}
          <ul className="we-tree">{inZone.map(buildingRow)}</ul>
        </details>
      </li>
    );
  };

  const groups = [...ph.map((p) => ({ p, key: p.id })), { p: null as Phase | null, key: "none" }];

  return (
    <div className="we-grid we-grid--side">
      <section className="we-card we-stack">
        <div className="we-row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>Phases, zones and buildings</h2>
          <Link className="we-link" href={`/projects/${id}/site`}>See it in 3D</Link>
        </div>
        <p className="we-help" style={{ margin: 0 }}>
          Pick any of these in the bar above and every tab, including the 3D site, shows just that part of the project.
        </p>
        <ul className="we-tree we-tree--root">
          {groups.map(({ p, key }) => {
            const pz = zs.filter((z) => (p ? z.phase_id === p.id : !z.phase_id));
            const loose = bs.filter((b) => (p ? b.phase_id === p.id : !b.phase_id) && !b.zone_id);
            const pu = us.filter((u) => (p ? u.phase_id === p.id : !u.phase_id));
            if (!p && !pz.length && !loose.length && !pu.length) return null;
            return (
              <li key={key} className="we-tree__item we-tree__item--phase">
                <details open>
                  <summary>
                    <span className="we-tree__kind">Phase</span><b>{p ? name(p) : "Not in a phase"}</b>
                    {bar(pu)}
                  </summary>
                  <ul className="we-tree">
                    {pz.map(zoneBlock)}
                    {loose.map(buildingRow)}
                    {!pz.length && !loose.length && <li className="we-help">No zones or buildings yet.</li>}
                  </ul>
                </details>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="we-stack">
        {canEdit && (
          <>
            <section className="we-card we-stack">
              <h3 className="we-h3">Add a phase</h3>
              <ActionForm action={savePhase.bind(null, id)} className="we-stack" resetOnOk>
                <div className="we-row">
                  <input name="code" className="we-input we-mono" placeholder="P04" required aria-label="Code" style={{ maxWidth: 110 }} />
                  <input name="name" className="we-input" placeholder="Phase 04 · Clubhouse" aria-label="Name" />
                </div>
                <div><button className="we-btn we-btn--secondary we-btn--sm">Add phase</button></div>
              </ActionForm>
            </section>
            <section className="we-card we-stack">
              <h3 className="we-h3">Add a zone</h3>
              <ActionForm action={saveZone.bind(null, id)} className="we-stack" resetOnOk>
                <div className="we-row">
                  <input name="code" className="we-input we-mono" placeholder="Z1" required aria-label="Code" style={{ maxWidth: 110 }} />
                  <input name="name" className="we-input" placeholder="North cluster" aria-label="Name" />
                </div>
                <select name="phase_id" className="we-input we-select" aria-label="Phase"><option value="">In which phase?</option>{opts(ph)}</select>
                <div><button className="we-btn we-btn--secondary we-btn--sm">Add zone</button></div>
              </ActionForm>
            </section>
            <section className="we-card we-stack">
              <h3 className="we-h3">Add a building</h3>
              <BuildingForm id={id} phases={ph} zones={zs} />
            </section>
          </>
        )}
        {canMove && (
          <section className="we-card we-stack">
            <h3 className="we-h3">Move units</h3>
            <p className="we-help" style={{ margin: 0 }}>Put a batch of units into a phase, zone or building, for example every code from A03-001 to A03-024 into B01.</p>
            <ActionForm action={assignUnits.bind(null, id)} className="we-stack">
              <div className="we-form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <div className="we-field"><label htmlFor="prefix">Code starts with</label><input id="prefix" name="prefix" className="we-input we-mono" placeholder="A03-" /></div>
                <div className="we-field">
                  <label htmlFor="unit_type">Type</label>
                  <select id="unit_type" name="unit_type" className="we-input we-select"><option value="">Any</option>{types.map((t) => <option key={t}>{t}</option>)}</select>
                </div>
                <div className="we-field"><label htmlFor="from">From code</label><input id="from" name="from" className="we-input we-mono" placeholder="A03-001" /></div>
                <div className="we-field"><label htmlFor="to">To code</label><input id="to" name="to" className="we-input we-mono" placeholder="A03-024" /></div>
                <div className="we-field">
                  <label htmlFor="m-phase">Phase</label>
                  <select id="m-phase" name="phase_id" className="we-input we-select"><option value="">Keep</option><option value="none">None</option>{opts(ph)}</select>
                </div>
                <div className="we-field">
                  <label htmlFor="m-zone">Zone</label>
                  <select id="m-zone" name="zone_id" className="we-input we-select"><option value="">Keep</option><option value="none">None</option>{opts(zs)}</select>
                </div>
                <div className="we-field">
                  <label htmlFor="m-building">Building</label>
                  <select id="m-building" name="building_id" className="we-input we-select"><option value="">Keep</option><option value="none">None</option>{opts(bs)}</select>
                </div>
                <div className="we-field"><label htmlFor="m-floor">Floor</label><input id="m-floor" name="floor" className="we-input we-mono" inputMode="numeric" placeholder="Keep" /></div>
              </div>
              <div><button className="we-btn we-btn--primary we-btn--sm">Move units</button></div>
            </ActionForm>
          </section>
        )}
      </div>
    </div>
  );
}

function BuildingForm({ id, b, phases, zones }: { id: string; b?: Building; phases: Phase[]; zones: Zone[] }) {
  const n = b?.id ?? "new";
  return (
    <ActionForm action={editBuilding.bind(null, id)} className="we-stack" resetOnOk={!b}>
      {b && <input type="hidden" name="building_id" value={b.id} />}
      <div className="we-form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="we-field"><label htmlFor={`bc-${n}`}>Code</label><input id={`bc-${n}`} name="code" defaultValue={b?.code} className="we-input we-mono" placeholder="B01" required /></div>
        <div className="we-field"><label htmlFor={`bn-${n}`}>Name</label><input id={`bn-${n}`} name="name" defaultValue={b?.name} className="we-input" /></div>
        <div className="we-field">
          <label htmlFor={`bp-${n}`}>Phase</label>
          <select id={`bp-${n}`} name="phase_id" defaultValue={b?.phase_id ?? ""} className="we-input we-select"><option value="">None</option>
            {phases.map((p) => <option key={p.id} value={p.id}>{p.name || p.code}</option>)}</select>
        </div>
        <div className="we-field">
          <label htmlFor={`bz-${n}`}>Zone</label>
          <select id={`bz-${n}`} name="zone_id" defaultValue={b?.zone_id ?? ""} className="we-input we-select"><option value="">None</option>
            {zones.map((z) => <option key={z.id} value={z.id}>{z.name || z.code}</option>)}</select>
        </div>
        <div className="we-field"><label htmlFor={`bf-${n}`}>Floors</label><input id={`bf-${n}`} name="floors" defaultValue={b?.floors} className="we-input we-mono" inputMode="numeric" placeholder="6" /></div>
        <div className="we-field"><label htmlFor={`bh-${n}`}>Floor height (m)</label><input id={`bh-${n}`} name="floor_height_m" defaultValue={b?.floor_height_m} className="we-input we-mono" inputMode="decimal" placeholder="3.2" /></div>
      </div>
      <div><button className="we-btn we-btn--secondary we-btn--sm">{b ? "Save building" : "Add building"}</button></div>
    </ActionForm>
  );
}
