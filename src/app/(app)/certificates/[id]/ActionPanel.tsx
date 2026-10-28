"use client";

import { useActionState } from "react";
import { certificateAction } from "../actions";

export function ActionPanel({
  id,
  forwardLabel,
  canReturn,
}: {
  id: string;
  forwardLabel: string;
  canReturn: boolean;
}) {
  const [error, action, pending] = useActionState(certificateAction.bind(null, id), null);
  return (
    <form action={action} className="we-card we-actions">
      <h2 style={{ margin: 0 }}>Your turn</h2>
      {error && <div className="we-banner we-banner--error" role="alert">{error}</div>}
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
