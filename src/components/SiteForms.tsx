"use client";

import { useActionState } from "react";
import type { ActionResult } from "@/lib/data";
import { Select } from "@/components/Select";

export function EnquiryForm({ action }: { action: (p: ActionResult, f: FormData) => Promise<ActionResult> }) {
  const [state, formAction, pending] = useActionState(action, null);
  if (state?.ok) {
    return (
      <div className="ws-sent" role="status">
        <b>Message sent</b>
        <p>{state.ok}</p>
      </div>
    );
  }
  return (
    <form action={formAction} className="ws-form">
      {state?.error && <div className="we-banner we-banner--error" role="alert">{state.error}</div>}
      <div className="ws-form__grid">
        <label>Your name<input name="name" required autoComplete="name" /></label>
        <label>Company<input name="company" autoComplete="organization" /></label>
        <label>Work email<input name="email" type="email" required autoComplete="email" /></label>
        <label>Phone or WhatsApp<input name="phone" type="tel" autoComplete="tel" /></label>
        <label>Your role
          <Select name="role" defaultValue="">
            <option value="">Choose…</option>
            <option>Owner or CEO</option><option>Project director or PM</option><option>Cost control</option>
            <option>Finance</option><option>Sales</option><option>Technical office</option><option>IT</option><option>Other</option>
          </Select>
        </label>
        <label>Projects you run
          <Select name="projects" defaultValue="">
            <option value="">Choose…</option><option>1</option><option>2 to 5</option><option>6 to 15</option><option>More than 15</option>
          </Select>
        </label>
      </div>
      <label>What would you like to see?<textarea name="message" rows={4} placeholder="For example: a demo for our sales and cost control teams" /></label>
      <input name="website" tabIndex={-1} autoComplete="off" className="ws-hp" aria-hidden="true" />
      <button className="ws-btn ws-btn--gold" disabled={pending}>{pending ? "Sending…" : "Send"}</button>
      <small className="ws-muted">We only use your details to reply to you.</small>
    </form>
  );
}
