import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { getMe } from "@/lib/data";
import { date, money } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { addUnitType, generateUnits, setUnitStatus } from "../actions";

const STATUSES: [string, string][] = [
  ["available", "Available"], ["reserved", "Reserved"], ["sold", "Sold"], ["ready", "Ready for handover"],
  ["handed_over", "Handed over"], ["blocked", "Blocked"],
];
const CATEGORIES = ["villa", "townhouse", "twin_house", "apartment", "duplex", "penthouse", "chalet", "office", "retail", "clinic", "other"];
const label = (s: string) => STATUSES.find(([k]) => k === s)?.[1] ?? s;

export default async function UnitsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string; phase?: string; q?: string }>;
}) {
  const { id } = await params;
  const { status, phase, q } = await searchParams;
  const supabase = await createClient();
  const me = await getMe();
  let uq = supabase.from("units").select("id, code, unit_type, area_m2, garden_m2, bedrooms, bathrooms, view, finishing, delivery_date, floor, status, list_price_egp, phases(name), buildings(code)").eq("project_id", id).order("code").limit(300);
  if (status) uq = uq.eq("status", status);
  if (phase) uq = uq.eq("phase_id", phase);
  if (q) uq = uq.ilike("code", `%${q}%`);
  const [{ data: summary }, { data: phases }, { data: types }, { data: units }] = await Promise.all([
    supabase.from("unit_summary").select("*").eq("project_id", id),
    supabase.from("phases").select("id, code, name").eq("project_id", id).order("code"),
    supabase.from("unit_types").select("*").eq("project_id", id).order("code"),
    uq,
  ]);
  const canSetup = me?.is_admin || ["pm", "cost_control", "sales"].includes(me?.department ?? "");
  const canStatus = me?.is_admin || ["pm", "cost_control", "sales", "handover"].includes(me?.department ?? "");
  const cell = (ph: string | null, st: string) =>
    (summary ?? []).filter((s) => (ph === null || s.phase_id === ph) && s.status === st).reduce((a, s) => a + s.units, 0);
  const href = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ status, phase, q, ...o }).filter(([, v]) => v) as [string, string][]);
    return `/projects/${id}/units${p.toString() ? `?${p}` : ""}`;
  };

  return (
    <>
      <section className="we-stack">
        <div className="we-pagehead">
          <h2 style={{ margin: 0 }}>Units by phase</h2>
          <div className="we-row">
            <Link className="we-btn we-btn--secondary we-btn--sm" href={`/docs/handovers/new?project=${id}`}>New handover</Link>
            <Link className="we-btn we-btn--primary we-btn--sm" href={`/docs/sales/new?project=${id}`}>New sale</Link>
          </div>
        </div>
        <div className="we-table-wrap">
          <table className="we-table">
            <thead><tr><th>Phase</th>{STATUSES.map(([k, l]) => <th key={k} className="num">{l}</th>)}<th className="num">Total</th></tr></thead>
            <tbody>
              {(phases ?? []).map((p) => (
                <tr key={p.id}>
                  <td><Link href={href({ phase: p.id })}>{p.name}</Link></td>
                  {STATUSES.map(([k]) => <td key={k} className="num">{cell(p.id, k) || "–"}</td>)}
                  <td className="num"><b>{STATUSES.reduce((a, [k]) => a + cell(p.id, k), 0)}</b></td>
                </tr>
              ))}
              <tr className="we-row--total">
                <td><b>All phases</b></td>
                {STATUSES.map(([k]) => <td key={k} className="num"><Link href={href({ status: k, phase: undefined })}>{cell(null, k)}</Link></td>)}
                <td className="num"><b>{STATUSES.reduce((a, [k]) => a + cell(null, k), 0)}</b></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="we-stack">
        <form className="we-row" action={`/projects/${id}/units`}>
          <input name="q" defaultValue={q} className="we-input" placeholder="Unit code" style={{ maxWidth: 180 }} aria-label="Unit code" />
          <select name="phase" defaultValue={phase ?? ""} className="we-input we-select" style={{ maxWidth: 200 }} aria-label="Phase">
            <option value="">All phases</option>
            {(phases ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select name="status" defaultValue={status ?? ""} className="we-input we-select" style={{ maxWidth: 200 }} aria-label="Status">
            <option value="">All statuses</option>
            {STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <button className="we-btn we-btn--secondary we-btn--sm">Filter</button>
        </form>
        <ActionForm action={setUnitStatus.bind(null, id)} className="we-stack">
          <div className="we-table-wrap" style={{ maxHeight: 520 }}>
            <table className="we-table">
              <thead><tr>{canStatus && <th />}<th>Unit</th><th>Type</th><th>Phase</th><th>Building</th><th className="num">Floor</th><th className="num">Area m²</th><th className="num">Garden m²</th><th className="num">Beds</th><th className="num">Baths</th><th>View</th><th>Finishing</th><th>Delivery</th><th className="num">List price</th><th>Status</th></tr></thead>
              <tbody>
                {(units ?? []).length === 0 && <tr><td colSpan={15} className="we-empty">No units match.</td></tr>}
                {(units ?? []).map((u) => (
                  <tr key={u.id}>
                    {canStatus && <td><input type="checkbox" name="unit" value={u.id} aria-label={`Select ${u.code}`} /></td>}
                    <td><span className="we-code">{u.code}</span></td>
                    <td>{u.unit_type}</td>
                    <td>{(u.phases as unknown as { name: string } | null)?.name}</td>
                    <td>{(u.buildings as unknown as { code: string } | null)?.code ?? ""}</td>
                    <td className="num">{u.floor ?? "–"}</td>
                    <td className="num">{u.area_m2 ?? "–"}</td>
                    <td className="num">{u.garden_m2 ?? "–"}</td>
                    <td className="num">{u.bedrooms ?? "–"}</td>
                    <td className="num">{u.bathrooms ?? "–"}</td>
                    <td>{u.view}</td>
                    <td>{u.finishing}</td>
                    <td>{u.delivery_date ? date(u.delivery_date) : ""}</td>
                    <td className="num">{money(u.list_price_egp)}</td>
                    <td>{label(u.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canStatus && (
            <div className="we-row">
              <span className="we-help">Set ticked units to</span>
              <select name="status" className="we-input we-select" style={{ maxWidth: 220 }} aria-label="New status">
                {STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <button className="we-btn we-btn--secondary we-btn--sm">Update</button>
              <span className="we-help">Sales and handovers change status by themselves through their workflows.</span>
            </div>
          )}
        </ActionForm>
        {(units ?? []).length === 300 && <span className="we-help">Showing the first 300. Filter to narrow down.</span>}
      </section>

      {canSetup && (
        <div className="we-grid">
          <section className="we-card">
            <h2>Generate units</h2>
            <p className="we-help" style={{ marginTop: 0 }}>Codes look like P02-B07-0503: phase, building, floor and unit.</p>
            <ActionForm action={generateUnits.bind(null, id)} className="we-form-grid">
              <div className="we-field">
                <label htmlFor="gphase">Phase</label>
                <select id="gphase" name="phase_id" className="we-input we-select" required>
                  {(phases ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="we-field">
                <label htmlFor="gtype">Unit type</label>
                <select id="gtype" name="unit_type_id" className="we-input we-select">
                  <option value="">Not set</option>
                  {(types ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="we-field"><label htmlFor="buildings">Buildings</label><input id="buildings" name="buildings" className="we-input we-mono" inputMode="numeric" required /></div>
              <div className="we-field"><label htmlFor="floors">Floors each (incl. ground)</label><input id="floors" name="floors" className="we-input we-mono" inputMode="numeric" required /></div>
              <div className="we-field"><label htmlFor="per_floor">Units per floor</label><input id="per_floor" name="per_floor" className="we-input we-mono" inputMode="numeric" required /></div>
              <div className="we-field"><label htmlFor="prefix">Building letter</label><input id="prefix" name="prefix" className="we-input we-mono" defaultValue="B" maxLength={3} /></div>
              <div className="we-field"><label htmlFor="start">First building no.</label><input id="start" name="start" className="we-input we-mono" defaultValue="1" /></div>
              <div className="we-field" style={{ alignSelf: "end" }}><button className="we-btn we-btn--primary">Generate</button></div>
            </ActionForm>
            <p className="we-help">Villas: use 1 floor and 1 unit per floor, one &quot;building&quot; per villa. Or import a unit list from Excel.</p>
          </section>
          <section className="we-card we-stack">
            <h2 style={{ margin: 0 }}>Unit types</h2>
            <ul className="we-checklist">
              {(types ?? []).map((t) => <li key={t.id}><b>{t.code}</b> {t.name} <span className="we-help">{t.area_m2 ? `${t.area_m2} m²` : ""}</span></li>)}
            </ul>
            <ActionForm action={addUnitType.bind(null, id)} className="we-form-grid" resetOnOk>
              <div className="we-field"><label htmlFor="tcode">Code</label><input id="tcode" name="code" className="we-input we-mono" required placeholder="V4" /></div>
              <div className="we-field"><label htmlFor="tname">Name</label><input id="tname" name="name" className="we-input" required placeholder="Villa, 4 bedrooms" /></div>
              <div className="we-field">
                <label htmlFor="tcat">Category</label>
                <select id="tcat" name="category" className="we-input we-select">{CATEGORIES.map((c) => <option key={c} value={c}>{c.replace("_", " ")}</option>)}</select>
              </div>
              <div className="we-field"><label htmlFor="tarea">Area m²</label><input id="tarea" name="area_m2" className="we-input we-mono" /></div>
              <div className="we-field"><label htmlFor="tbed">Bedrooms</label><input id="tbed" name="bedrooms" className="we-input we-mono" /></div>
              <div className="we-field" style={{ alignSelf: "end" }}><button className="we-btn we-btn--secondary">Add type</button></div>
            </ActionForm>
          </section>
        </div>
      )}
    </>
  );
}
