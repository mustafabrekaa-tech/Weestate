"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Factor = { id: string; friendly_name?: string; status: string; created_at: string };
type Setup = { id: string; qr: string; secret: string };

// Authenticator-app sign-in (Google Authenticator, Microsoft Authenticator,
// 1Password and the like): scan the code, confirm with one 6-digit code.
export function TwoFactor({ required, done }: { required: boolean; done?: string }) {
  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [busy, setBusy] = useState(false);
  const supabase = createClient();

  async function load() {
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors((data?.all ?? []).filter((f) => f.factor_type === "totp") as Factor[]);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verified = (factors ?? []).filter((f) => f.status === "verified");

  async function start() {
    setBusy(true);
    setMsg({});
    // Clear any half-finished setup first, so the new one can be named.
    for (const f of (factors ?? []).filter((f) => f.status !== "verified")) await supabase.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Authenticator ${new Date().toISOString().slice(0, 16)}` });
    setBusy(false);
    if (error || !data) return setMsg({ error: error?.message ?? "Could not start. Try again." });
    setSetup({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function confirm(form: FormData) {
    if (!setup) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: setup.id, code: String(form.get("code") ?? "").replace(/\s/g, "") });
    setBusy(false);
    if (error) return setMsg({ error: "That code didn't match. Use the code showing now in the app." });
    setSetup(null);
    if (done) return void (window.location.href = done);
    setMsg({ ok: "Authenticator app turned on. From now on you'll be asked for a code when you sign in." });
    load();
  }

  async function remove(id: string) {
    if (required && verified.length <= 1) return setMsg({ error: "Signing in needs an authenticator app, so add a new one before removing the last." });
    setBusy(true);
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    setBusy(false);
    if (error) return setMsg({ error: error.message.includes("AAL2") ? "Sign out and back in with your code, then try again." : error.message });
    setMsg({ ok: "Removed." });
    load();
  }

  return (
    <div className="we-stack">
      {msg.error && <div className="we-banner we-banner--error" role="alert">{msg.error}</div>}
      {msg.ok && <div className="we-banner we-banner--ok" role="status">{msg.ok}</div>}
      {factors === null ? (
        <span className="we-help">Checking…</span>
      ) : verified.length ? (
        <ul className="we-list">
          {verified.map((f) => (
            <li key={f.id} className="we-row" style={{ justifyContent: "space-between" }}>
              <span><b>Authenticator app</b> <span className="we-help">· on since {new Date(f.created_at).toLocaleDateString("en-GB")}</span></span>
              <button type="button" className="we-btn we-btn--secondary we-btn--sm" onClick={() => remove(f.id)} disabled={busy}>Remove</button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="we-help" style={{ margin: 0 }}>Off. Turn it on so a stolen password alone can&apos;t open your account.</p>
      )}
      {setup ? (
        <form action={confirm} className="we-stack">
          <ol className="we-steps-list">
            <li>Open Google Authenticator, Microsoft Authenticator or a similar app and add an account.</li>
            <li>Scan this code. <img src={setup.qr} alt="Set-up code for your authenticator app" width={180} height={180} className="we-qr" /></li>
            <li>Can&apos;t scan? Type this key instead: <span className="we-code" style={{ wordBreak: "break-all" }}>{setup.secret}</span></li>
            <li>Type the 6-digit code the app shows.</li>
          </ol>
          <div className="we-row">
            <input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required className="we-input we-mono" style={{ maxWidth: 160, letterSpacing: ".2em" }} aria-label="6-digit code" />
            <button className="we-btn we-btn--primary" disabled={busy}>{busy ? "Checking…" : "Turn on"}</button>
            <button type="button" className="we-link" onClick={() => setSetup(null)}>Cancel</button>
          </div>
        </form>
      ) : (
        !verified.length && <div><button type="button" className="we-btn we-btn--primary" onClick={start} disabled={busy}>Set up authenticator app</button></div>
      )}
    </div>
  );
}
