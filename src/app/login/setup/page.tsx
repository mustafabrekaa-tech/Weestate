import type { Metadata } from "next";
import { TwoFactor } from "@/app/(app)/account/TwoFactor";
import { getBrand } from "@/lib/brand";

export const metadata: Metadata = { title: "Set up your authenticator app" };

// Everyone signs in with a password and an authenticator code. Accounts
// without an authenticator app land here once, straight after the password.
export default async function SetupPage() {
  const b = await getBrand();
  return (
    <div className="we-login">
      <section className="we-login__brand">
        <img src={b.company?.logo_url || b.logo || "/weestate-logo.svg"} alt={b.company?.name ?? b.appName} style={{ maxWidth: "min(100%, 320px)", maxHeight: 160, objectFit: "contain" }} />
      </section>
      <section className="we-login__form">
        <div className="we-stack">
          <div>
            <h2 style={{ font: "700 26px/32px var(--font-display)", margin: 0 }}>Protect your account</h2>
            <p className="we-help" style={{ margin: "4px 0 0" }}>
              {b.appName} asks for a code from an authenticator app every time you sign in. Set it up once to continue.
            </p>
          </div>
          <TwoFactor required done="/" />
          <form action="/auth/signout" method="post">
            <button className="we-link">Sign out</button>
          </form>
        </div>
      </section>
    </div>
  );
}
