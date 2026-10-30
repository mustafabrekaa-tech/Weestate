import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { getBrand } from "@/lib/brand";
import { getMe } from "@/lib/data";
import { date } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { vercelReady } from "@/lib/vercel";
import { createWorkspace } from "../admin/actions";
import { checkAddress, saveAddress } from "./actions";

export const metadata: Metadata = { title: "Companies" };

type W = {
  id: string; slug: string; name: string; created_at: string; people: number; projects: number; units: number;
  domain: string; domain_status: string; logo_url: string; brand_color: string; require_mfa: boolean;
};

const STATE: Record<string, string> = { connected: "Live", "waiting for DNS": "Waiting for DNS", "not added": "Not connected yet", error: "Problem" };

export default async function Platform() {
  const me = await getMe();
  if (!me?.is_platform_admin) redirect("/");
  const supabase = await createClient();
  const [{ data }, brand] = await Promise.all([supabase.rpc("platform_companies"), getBrand()]);
  const rows = (data ?? []) as W[];
  const auto = vercelReady();

  return (
    <>
      <div className="we-pagehead"><div><div className="we-eyebrow">{brand.appName} staff</div><h1>Companies and web addresses</h1></div></div>

      {!auto && (
        <div className="we-banner we-banner--info">
          Addresses are saved but not connected automatically yet. Add a Vercel token as <span className="we-code">VERCEL_TOKEN</span> in the
          Vercel project settings, and new addresses will connect by themselves.
        </div>
      )}

      <div className="we-stack">
        {rows.map((w) => (
          <details key={w.id} className="we-card">
            <summary className="we-company-row">
              {w.logo_url ? <img src={w.logo_url} alt="" className="we-logo-preview" style={{ maxHeight: 32 }} /> : <span className="we-swatch" style={{ background: w.brand_color || "var(--gold)" }} />}
              <b>{w.name}</b>
              <span className="we-code">{w.slug}.{brand.rootDomain}</span>
              {w.domain && <span className="we-code">{w.domain}</span>}
              <span className={`we-chip ${w.domain_status === "connected" ? "we-chip--done" : w.domain_status === "error" ? "we-chip--overdue" : "we-chip--draft"}`}>{STATE[w.domain_status] ?? "Not checked"}</span>
              <span className="we-help">{w.people} people · {w.projects} projects · {w.units} units · since {date(w.created_at)}{w.require_mfa ? " · authenticator required" : ""}</span>
            </summary>
            <div className="we-grid">
              <div className="we-stack">
                <h3 className="we-h3">Web address</h3>
                <ActionForm action={saveAddress.bind(null, w.id)} className="we-stack">
                  <div className="we-field">
                    <label htmlFor={`d-${w.id}`}>Company&apos;s own address <span className="we-help">· optional</span></label>
                    <input id={`d-${w.id}`} name="domain" className="we-input" defaultValue={w.domain} placeholder="projects.company.com" />
                  </div>
                  <div className="we-row">
                    <button className="we-btn we-btn--primary we-btn--sm">Save and connect</button>
                  </div>
                </ActionForm>
                <ActionForm action={checkAddress.bind(null, w.id)}><button className="we-btn we-btn--secondary we-btn--sm">Check status</button></ActionForm>
              </div>
              <div className="we-stack">
                <h3 className="we-h3">DNS the company adds</h3>
                {w.domain ? (
                  <table className="we-table we-table--plain">
                    <thead><tr><th>Type</th><th>Name</th><th>Value</th></tr></thead>
                    <tbody>
                      {w.domain.split(".").length > 2 ? (
                        <tr><td>CNAME</td><td className="we-code">{w.domain.split(".")[0]}</td><td className="we-code">cname.vercel-dns.com</td></tr>
                      ) : (
                        <tr><td>A</td><td className="we-code">@</td><td className="we-code">76.76.21.21</td></tr>
                      )}
                    </tbody>
                  </table>
                ) : (
                  <p className="we-help" style={{ margin: 0 }}>
                    Nothing. {w.slug}.{brand.rootDomain} works through the wildcard record on {brand.rootDomain}
                    (<span className="we-code">CNAME * → cname.vercel-dns.com</span>).
                  </p>
                )}
                <div className="we-row">
                  <Link className="we-link" href={`/admin/people?company=${w.id}`}>People</Link>
                  <a className="we-link" href={`https://${w.domain || `${w.slug}.${brand.rootDomain}`}`} target="_blank" rel="noreferrer">Open sign-in page</a>
                </div>
              </div>
            </div>
          </details>
        ))}
      </div>

      <section className="we-card">
        <h2>Open a workspace for a new developer</h2>
        <ActionForm action={createWorkspace} className="we-form-grid">
          <div className="we-field"><label htmlFor="name">Company name</label><input id="name" name="name" className="we-input" required /></div>
          <div className="we-field"><label htmlFor="name_ar">Name in Arabic</label><input id="name_ar" name="name_ar" className="we-input" dir="rtl" /></div>
          <div className="we-field">
            <label htmlFor="slug">Short name</label>
            <input id="slug" name="slug" className="we-input we-mono" required placeholder="palmhills" pattern="[a-z0-9][a-z0-9-]{1,38}[a-z0-9]" />
            <span className="we-help">Their address becomes shortname.{brand.rootDomain}</span>
          </div>
          <div className="we-field"><label htmlFor="admin_email">Their admin&apos;s email</label><input id="admin_email" name="admin_email" type="email" className="we-input" /></div>
          <div className="we-field"><label htmlFor="admin_name">Admin&apos;s name</label><input id="admin_name" name="admin_name" className="we-input" /></div>
          <div className="we-field" style={{ alignSelf: "end" }}><button className="we-btn we-btn--primary">Create workspace</button></div>
        </ActionForm>
      </section>
    </>
  );
}
