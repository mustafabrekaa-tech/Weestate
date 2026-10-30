import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getBrand } from "@/lib/brand";
import { hostKind } from "@/lib/host";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  const b = await getBrand();
  // An address no company uses goes to the public website.
  if (hostKind((await headers()).get("host") ?? "") === "company" && !b.company) redirect(`https://${b.rootDomain}`);
  return (
    <div className="we-login">
      <section className="we-login__brand">
        {b.company?.logo_url ? (
          <img src={b.company.logo_url} alt={b.company.name} style={{ maxWidth: "min(100%, 320px)", maxHeight: 160, objectFit: "contain" }} />
        ) : b.company ? (
          <h1 className="we-login__company">{b.company.name}</h1>
        ) : (
          <img src={b.logo || "/weestate-logo.svg"} alt={b.appName} style={{ width: "min(100%, 360px)", height: "auto" }} />
        )}
        {b.tagline && <p>{b.tagline}</p>}
        {b.company && (
          <span className="we-login__powered">
            <img src="/weestate-horizontal.svg" alt="" height={18} /> Runs on {b.appName}
          </span>
        )}
      </section>
      <section className="we-login__form">
        <LoginForm host={b.company ? `${b.company.slug}.${b.rootDomain}` : b.rootDomain} />
      </section>
    </div>
  );
}
