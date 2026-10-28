"use client";

import { useActionState } from "react";
import { createCertificate } from "../actions";

type Option = { id: string; label: string };

export function NewForm({ contracts }: { contracts: Option[] }) {
  const [error, action, pending] = useActionState(createCertificate, null);
  return (
    <form action={action} className="we-card we-stack" style={{ maxWidth: 720 }}>
      {error && <div className="we-banner we-banner--error" role="alert">{error}</div>}
      <div className="we-field">
        <label htmlFor="contract_id">Contract</label>
        <select id="contract_id" name="contract_id" className="we-input we-select" required defaultValue="">
          <option value="" disabled>Choose a contract</option>
          {contracts.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
      </div>
      <div className="we-form-grid">
        <div className="we-field">
          <label htmlFor="gross_egp">Certified amount (EGP)</label>
          <input id="gross_egp" name="gross_egp" className="we-input we-mono" inputMode="decimal" required placeholder="18,400,000" />
          <span className="we-help">From the measurement sheet, before retention. Retention is taken from the contract.</span>
        </div>
        <div className="we-field">
          <label htmlFor="period_end">Period ending</label>
          <input id="period_end" name="period_end" type="date" className="we-input" required />
        </div>
      </div>
      <div className="we-field">
        <label htmlFor="description">What it covers</label>
        <textarea id="description" name="description" className="we-input" rows={3} placeholder="September works, Phase 02" />
      </div>
      <div className="we-row">
        <button className="we-btn we-btn--primary" disabled={pending}>{pending ? "Saving…" : "Save draft"}</button>
        <span className="we-help">You can check it once more before submitting it to the technical office.</span>
      </div>
    </form>
  );
}
