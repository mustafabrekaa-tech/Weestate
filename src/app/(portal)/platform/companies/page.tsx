import type { Metadata } from "next";
import Link from "next/link";
import { PortalHead } from "@/components/PortalHead";
import { getBrand } from "@/lib/brand";
import { date } from "@/lib/format";
import { DOMAIN_STATE, STATUS, type Workspace } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Companies" };

export default async function Companies({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const { q, status } = await searchParams;
  const supabase = await createClient();
  const [{ data }, { data: plans }, brand] = await Promise.all([
    supabase.rpc("portal_companies"),
    supabase.from("plans").select("code, name"),
    getBrand(),
  ]);
  const planName = new Map((plans ?? []).map((p) => [p.code as string, p.name as string]));
  const all = (data ?? []) as Workspace[];
  const rows = all.filter((w) => (!status || w.status === status) && (!q || `${w.name} ${w.slug} ${w.domain} ${w.contact_name} ${w.contact_email}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <>
      <PortalHead title="Companies" lead="Every developer using the platform, with their plan, address and activity.">
        <Link className="we-btn we-btn--primary" href="/platform/companies/new">+ Add a company</Link>
      </PortalHead>
      <form className="we-row we-filterbar" action="/platform/companies">
        <input name="q" defaultValue={q} className="we-input we-input--sm" placeholder="Search name, address or contact" aria-label="Search" style={{ maxWidth: 300 }} />
        <select name="status" defaultValue={status ?? ""} className="we-input we-select we-input--sm" aria-label="Status">
          <option value="">Any status</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button className="we-btn we-btn--secondary we-btn--sm">Filter</button>
        <span className="we-help">{rows.length} of {all.length}</span>
      </form>
      <div className="we-table-wrap">
        <table className="we-table">
          <thead>
            <tr><th>Company</th><th>Status</th><th>Plan</th><th>Web address</th><th className="num">People</th><th className="num">Projects</th><th className="num">Units</th><th>Last active</th></tr>
          </thead>
          <tbody>
            {rows.map((w) => (
              <tr key={w.id}>
                <td>
                  <Link href={`/platform/companies/${w.id}`} className="we-company-cell">
                    {w.logo_url ? <img src={w.logo_url} alt="" /> : <span className="we-swatch" style={{ background: w.brand_color || "var(--gold)" }} />}
                    <span><b>{w.name}</b><span className="we-meta">{w.contact_name || w.contact_email || `since ${date(w.created_at)}`}</span></span>
                  </Link>
                </td>
                <td>
                  <span className={`we-chip ${STATUS[w.status]?.chip ?? ""}`}>{STATUS[w.status]?.label ?? w.status}</span>
                  {w.status === "trial" && w.trial_ends && <div className="we-meta">until {date(w.trial_ends)}</div>}
                </td>
                <td>{planName.get(w.plan) ?? w.plan}</td>
                <td><div className="we-code">{w.domain || `${w.slug}.${brand.rootDomain}`}</div><div className="we-meta">{DOMAIN_STATE[w.domain_status] ?? "Not checked"}</div></td>
                <td className="num">{w.people}{w.max_users ? <span className="we-meta"> / {w.max_users}</span> : null}</td>
                <td className="num">{w.projects}</td>
                <td className="num">{w.units.toLocaleString("en-US")}</td>
                <td>{w.last_active ? date(w.last_active) : <span className="we-help">Never</span>}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={8} className="we-empty">No companies match.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
