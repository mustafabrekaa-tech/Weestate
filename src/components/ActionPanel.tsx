"use client";

import { useActionState } from "react";
import type { ActionResult } from "@/lib/data";

export function ActionPanel({
  action,
  forwardLabel,
  canReturn,
  note,
}: {
  action: (prev: ActionResult, form: FormData) => Promise<ActionResult>;
  forwardLabel: string;
  canReturn: boolean;
  note?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="we-card we-actions">
      <h2 style={{ margin: 0 }}>Your turn</h2>
      {note && <span className="we-help">{note}</span>}
      {state?.error && <div className="we-banner we-banner--error" role="alert">{state.error}</div>}
      <div className="we-field">
        <label htmlFor="comment">Comment</label>
        <textarea id="comment" name="comment" className="we-input" placeholder="Needed when you return or reject it" />
      </div>
      <div className="we-row">
        <button className="we-btn we-btn--primary" name="action" value="forward" disabled={pending}>{forwardLabel}</button>
        {canReturn && (
          <button className="we-btn we-btn--secondary" name="action" value="return" disabled={pending}>Return with comment</button>
        )}
        <button className="we-btn we-btn--ghost" name="action" value="comment" disabled={pending}>Add comment only</button>
        {canReturn && (
          <button className="we-btn we-btn--danger" name="action" value="reject" disabled={pending}>Reject</button>
        )}
      </div>
    </form>
  );
}
