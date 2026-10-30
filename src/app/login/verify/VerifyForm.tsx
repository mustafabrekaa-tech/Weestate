"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function VerifyForm() {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(form: FormData) {
    setPending(true);
    setError("");
    const supabase = createClient();
    const { data } = await supabase.auth.mfa.listFactors();
    const factor = data?.totp.find((f) => f.status === "verified");
    if (!factor) {
      window.location.href = "/";
      return;
    }
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: String(form.get("code") ?? "").replace(/\s/g, "") });
    setPending(false);
    if (error) return setError("That code didn't work. Codes change every 30 seconds; try the one showing now.");
    window.location.href = "/";
  }

  return (
    <div className="we-stack">
    <form action={submit} className="we-stack">
      <div>
        <h2 style={{ font: "700 26px/32px var(--font-display)", margin: 0 }}>Enter your code</h2>
        <p className="we-help" style={{ margin: "4px 0 0" }}>Open your authenticator app and type the 6-digit code for this account.</p>
      </div>
      {error && <div className="we-banner we-banner--error" role="alert">{error}</div>}
      <div className="we-field">
        <label htmlFor="code">6-digit code</label>
        <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus className="we-input we-mono" style={{ fontSize: 22, letterSpacing: ".3em" }} />
      </div>
      <button className="we-btn we-btn--primary" style={{ justifyContent: "center" }} disabled={pending}>{pending ? "Checking…" : "Continue"}</button>
    </form>
    <form action="/auth/signout" method="post">
      <button className="we-link">Use a different account</button>
    </form>
    </div>
  );
}
