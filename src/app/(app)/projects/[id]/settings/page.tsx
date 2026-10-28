import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { SiteMap } from "@/components/SiteMap";
import { getProjects } from "@/lib/data";
import { money } from "@/lib/format";
import { PROJECT_TYPES } from "@/lib/options";
import { createClient } from "@/lib/supabase/server";
import { copyStructure, savePhase, saveSettings } from "../actions";

type Check = { step: string; done: boolean; detail: string };
const where: Record<string, string> = {
  Map: "settings", Phases: "settings", Units: "units", Budget: "budget", Schedule: "import", BOQ: "import", Contracts: "contracts", People: "",
};
const STATUSES: [string, string][] = [
  ["planning", "Planning"], ["design", "Design"], ["construction", "Construction"], ["handover", "Handover"], ["operation", "Operation"], ["closed", "Closed"],
];

export default async function SetupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: p }, { data: phases }, { data: checks }, projects] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).single(),
    supabase.from("phases").select("*").eq("project_id", id).order("code"),
    supabase.rpc("setup_checklist", { p_project: id }),
    getProjects(),
  ]);
  if (!p) return null;
  const others = projects.filter((x) => x.id !== id);

  return (
    <>
      <section className="we-card we-stack">
        <h2 style={{ margin: 0 }}>Setup checklist</h2>
        <ol className="we-checklist we-checklist--steps">
          {((checks ?? []) as Check[]).map((c) => (
            <li key={c.step} className={c.done ? "is-done" : ""}>
              <b>{c.step}</b>{" "}
              {c.done ? <span className="we-help">Done</span> : (
                <Link href={c.step === "People" ? "/admin/people" : `/projects/${id}/${where[c.step] ?? ""}`}>{c.detail}</Link>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section className="we-card">
        <h2>Project and location</h2>
        <ActionForm action={saveSettings.bind(null, id)} className="we-stack">
          <div className="we-form-grid">
            <div className="we-field"><label htmlFor="name">Name</label><input id="name" name="name" className="we-input" defaultValue={p.name} required /></div>
            <div className="we-field"><label htmlFor="location">Area</label><input id="location" name="location" className="we-input" defaultValue={p.location} placeholder="New Cairo" /></div>
            <div className="we-field">
              <label htmlFor="project_type">Type</label>
              <select id="project_type" name="project_type" className="we-input we-select" defaultValue={p.project_type}>{PROJECT_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            </div>
            <div className="we-field">
              <label htmlFor="status">Stage</label>
              <select id="status" name="status" className="we-input we-select" defaultValue={p.status}>{STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            </div>
            <div className="we-field"><label htmlFor="budget_egp">Headline budget (EGP)</label><input id="budget_egp" name="budget_egp" className="we-input we-mono" defaultValue={p.budget_egp} /></div>
            <div className="we-field"><label htmlFor="start_date">Start</label><input id="start_date" name="start_date" type="date" className="we-input" defaultValue={p.start_date ?? ""} /></div>
            <div className="we-field"><label htmlFor="finish_date">Finish</label><input id="finish_date" name="finish_date" type="date" className="we-input" defaultValue={p.finish_date ?? ""} /></div>
          </div>
          <SiteMap pick={{ lat: p.lat, lng: p.lng }} zoom={p.map_zoom} height={360} />
          <div><button className="we-btn we-btn--primary">Save project</button></div>
        </ActionForm>
      </section>

      <section className="we-card we-stack">
        <h2 style={{ margin: 0 }}>Phases</h2>
        <div className="we-table-wrap">
          <table className="we-table we-table--inputs">
            <thead><tr><th>Code</th><th>Name</th><th>Budget (EGP)</th><th>Start</th><th>Finish</th><th /></tr></thead>
            <tbody>
              {[...(phases ?? []), null].map((ph) => (
                <tr key={ph?.id ?? "new"}>
                  <td colSpan={6}>
                    <ActionForm action={savePhase.bind(null, id)} className="we-row" resetOnOk={!ph}>
                      <input type="hidden" name="phase_id" value={ph?.id ?? ""} />
                      <input name="code" className="we-input we-mono" defaultValue={ph?.code} placeholder="Phase 05" style={{ maxWidth: 120 }} aria-label="Code" />
                      <input name="name" className="we-input" defaultValue={ph?.name} placeholder="Name" style={{ maxWidth: 240 }} aria-label="Name" />
                      <input name="budget_egp" className="we-input we-mono" defaultValue={ph ? money(ph.budget_egp) : ""} placeholder="Budget" style={{ maxWidth: 160 }} aria-label="Budget" />
                      <input name="start_date" type="date" className="we-input" defaultValue={ph?.start_date ?? ""} style={{ maxWidth: 160 }} aria-label="Start" />
                      <input name="finish_date" type="date" className="we-input" defaultValue={ph?.finish_date ?? ""} style={{ maxWidth: 160 }} aria-label="Finish" />
                      <button className="we-btn we-btn--secondary we-btn--sm">{ph ? "Save" : "Add phase"}</button>
                    </ActionForm>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {others.length > 0 && (
        <section className="we-card">
          <h2>Copy from another project</h2>
          <p className="we-help" style={{ marginTop: 0 }}>Copies phases, unit types and budget lines (with zero amounts), so a similar project starts with the same structure.</p>
          <ActionForm action={copyStructure.bind(null, id)} className="we-row">
            <select name="source" className="we-input we-select" style={{ maxWidth: 320 }} aria-label="Project to copy">
              {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <button className="we-btn we-btn--secondary">Copy structure</button>
          </ActionForm>
        </section>
      )}
    </>
  );
}
