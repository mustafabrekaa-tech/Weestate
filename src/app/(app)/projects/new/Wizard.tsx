"use client";

import { useActionState, useState } from "react";
import { SiteMap } from "@/components/SiteMap";
import type { ActionResult } from "@/lib/data";
import { PROJECT_TYPES } from "@/lib/options";

type Template = { id: string; name: string; project_type: string; payload: { phases?: string[]; unit_types?: { name: string }[] } };

const STEPS = ["The project", "On the map", "Phases"];

export function Wizard({ templates, action }: { templates: Template[]; action: (p: ActionResult, f: FormData) => Promise<ActionResult> }) {
  const [state, formAction, pending] = useActionState(action, null);
  const [step, setStep] = useState(0);
  const [tpl, setTpl] = useState<string>("");
  const [type, setType] = useState("compound");
  const [phases, setPhases] = useState<string[]>(["Phase 01"]);

  const pickTemplate = (id: string) => {
    setTpl(id);
    const t = templates.find((x) => x.id === id);
    if (t) {
      setType(t.project_type);
      setPhases(t.payload.phases?.length ? t.payload.phases : ["Phase 01"]);
    }
  };

  return (
    <form action={formAction} className="we-stack">
      <ol className="we-wizard" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} className={i === step ? "is-current" : i < step ? "is-done" : ""}>
            <button type="button" onClick={() => setStep(i)}>{i + 1}. {s}</button>
          </li>
        ))}
      </ol>
      {state?.error && <div className="we-banner we-banner--error" role="alert">{state.error}</div>}

      <section className="we-card we-stack" hidden={step !== 0}>
        <div className="we-field">
          <span>Start from a template</span>
          <div className="we-grid we-grid--tight">
            <button type="button" className={`we-card we-cardlink${tpl === "" ? " is-on" : ""}`} onClick={() => pickTemplate("")}>
              <b>Blank</b><span className="we-help">Set everything yourself</span>
            </button>
            {templates.map((t) => (
              <button type="button" key={t.id} className={`we-card we-cardlink${tpl === t.id ? " is-on" : ""}`} onClick={() => pickTemplate(t.id)}>
                <b>{t.name}</b>
                <span className="we-help">{t.payload.phases?.length ?? 0} phases · {t.payload.unit_types?.map((u) => u.name).join(", ")}</span>
              </button>
            ))}
          </div>
          <input type="hidden" name="template_id" value={tpl} />
        </div>
        <div className="we-form-grid">
          <div className="we-field"><label htmlFor="name">Project name</label><input id="name" name="name" className="we-input" placeholder="TRIO Gardens" /></div>
          <div className="we-field"><label htmlFor="code">Short code</label><input id="code" name="code" className="we-input we-mono" maxLength={12} placeholder="TRIO" /></div>
          <div className="we-field"><label htmlFor="location">Area</label><input id="location" name="location" className="we-input" placeholder="New Cairo" /></div>
          <div className="we-field">
            <label htmlFor="project_type">Type</label>
            <select id="project_type" name="project_type" className="we-input we-select" value={type} onChange={(e) => setType(e.target.value)}>
              {PROJECT_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <div className="we-field"><label htmlFor="budget_egp">Headline budget (EGP)</label><input id="budget_egp" name="budget_egp" className="we-input we-mono" inputMode="decimal" /></div>
          <div className="we-field"><label htmlFor="start_date">Start</label><input id="start_date" name="start_date" type="date" className="we-input" /></div>
          <div className="we-field"><label htmlFor="finish_date">Finish</label><input id="finish_date" name="finish_date" type="date" className="we-input" /></div>
        </div>
        <div><button type="button" className="we-btn we-btn--primary" onClick={() => setStep(1)}>Next: place it on the map</button></div>
      </section>

      <section className="we-card we-stack" hidden={step !== 1}>
        <p className="we-help" style={{ margin: 0 }}>Zoom in on the satellite view and click the middle of the site.</p>
        <SiteMap pick={{}} height={460} />
        <div className="we-row">
          <button type="button" className="we-btn we-btn--secondary" onClick={() => setStep(0)}>Back</button>
          <button type="button" className="we-btn we-btn--primary" onClick={() => setStep(2)}>Next: phases</button>
        </div>
      </section>

      <section className="we-card we-stack" hidden={step !== 2}>
        <div className="we-table-wrap">
          <table className="we-table we-table--inputs">
            <thead><tr><th>Code</th><th>Name</th><th>Budget (EGP)</th><th>Finish</th><th /></tr></thead>
            <tbody>
              {phases.map((p, i) => (
                <tr key={`${p}-${i}`}>
                  <td><input name="phase_code" defaultValue={p} className="we-input we-mono" aria-label="Phase code" /></td>
                  <td><input name="phase_name" defaultValue={p} className="we-input" aria-label="Phase name" /></td>
                  <td><input name="phase_budget" className="we-input we-mono" inputMode="decimal" aria-label="Phase budget" /></td>
                  <td><input name="phase_finish" type="date" className="we-input" aria-label="Phase finish" /></td>
                  <td><button type="button" className="we-link" onClick={() => setPhases(phases.filter((_, j) => j !== i))}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <button type="button" className="we-btn we-btn--secondary we-btn--sm" onClick={() => setPhases([...phases, `Phase ${String(phases.length + 1).padStart(2, "0")}`])}>Add a phase</button>
        </div>
        <p className="we-help" style={{ margin: 0 }}>Next you&apos;ll generate or import units, enter the budget, import the schedule and BOQ, and add contracts. A checklist on the project keeps track.</p>
        <div className="we-row">
          <button type="button" className="we-btn we-btn--secondary" onClick={() => setStep(1)}>Back</button>
          <button className="we-btn we-btn--primary" disabled={pending}>{pending ? "Creating…" : "Create project"}</button>
        </div>
      </section>
    </form>
  );
}
