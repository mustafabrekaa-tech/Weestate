"use client";

import { useActionState } from "react";
import { signIn } from "./actions";

export function LoginForm() {
  const [error, action, pending] = useActionState(signIn, null);
  return (
    <form action={action} className="we-stack">
      <div>
        <h2 style={{ font: "700 26px/32px var(--font-display)", letterSpacing: ".01em", margin: 0 }}>Sign in</h2>
        <p className="we-help" style={{ margin: "4px 0 0" }}>Use your company account.</p>
      </div>
      {error && <div className="we-banner we-banner--error" role="alert">{error}</div>}
      <div className="we-field">
        <label htmlFor="email">Work email</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="we-input" />
      </div>
      <div className="we-field">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="we-input" />
      </div>
      <button className="we-btn we-btn--primary" style={{ justifyContent: "center" }} disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <p className="we-help" style={{ margin: 0 }}>weestate.app</p>
    </form>
  );
}
