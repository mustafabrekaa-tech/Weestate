import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { PortalHead } from "@/components/PortalHead";
import { getBrand } from "@/lib/brand";
import { DOMAIN_STATE, type Workspace } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { vercelReady } from "@/lib/vercel";
import { checkAddress } from "../actions";

export const metadata: Metadata = { title: "Web addresses" };

export default async function Domains() {
  const supabase = await createClient();
  const [{ data }, brand] = await Promise.all([supabase.rpc("portal_companies"), getBrand()]);
  const rows = (data ?? []) as Workspace[];
  return (
    <>
    <PortalHead title="Web addresses" lead="Each company's address on the platform and any domain of its own." />
    <div className="we-grid we-grid--side">
      <section className="we-stack">
        <div className="we-table-wrap">
          <table className="we-table">
            <thead><tr><th>Company</th><th>{brand.appName} address</th><th>Own domain</th><th>State</th><th /></tr></thead>
            <tbody>
              {rows.map((w) => (
                <tr key={w.id}>
                  <td><Link href={`/platform/companies/${w.id}`}><b>{w.name}</b></Link></td>
                  <td className="we-code">{w.slug}.{brand.rootDomain}</td>
                  <td className="we-code">{w.domain || <span className="we-help">–</span>}</td>
                  <td><span className={`we-chip ${w.domain_status === "connected" ? "we-chip--done" : w.domain_status === "error" ? "we-chip--overdue" : "we-chip--draft"}`}>{DOMAIN_STATE[w.domain_status] ?? "Not checked"}</span></td>
                  <td><ActionForm action={checkAddress.bind(null, w.id)} className=""><button className="we-link">Check</button></ActionForm></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="we-card we-stack">
        <h2 style={{ margin: 0 }}>How addresses work</h2>
        <ol className="we-steps-list">
          <li>Every company gets <span className="we-code">shortname.{brand.rootDomain}</span> as soon as it is created. This needs one wildcard record on {brand.rootDomain}: <span className="we-code">CNAME * → cname.vercel-dns.com</span>.</li>
          <li>A company can also use its own domain. Add it on the company&apos;s page; they add the DNS record shown there.</li>
          <li>Each address shows that company&apos;s logo, colours and name on the sign-in page.</li>
          <li><span className="we-code">admin.{brand.rootDomain}</span> opens this portal.</li>
        </ol>
        {!vercelReady() && <div className="we-banner we-banner--info">Automatic connecting starts once a Vercel token is saved as VERCEL_TOKEN.</div>}
      </section>
    </div>
    </>
  );
}
