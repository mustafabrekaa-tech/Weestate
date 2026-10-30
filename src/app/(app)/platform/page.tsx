import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { getBrand } from "@/lib/brand";
import { date } from "@/lib/format";
import { DOMAIN_STATE, PLANS, STATUS, type Workspace } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { vercelReady } from "@/lib/vercel";
import { createWorkspace } from "../admin/actions";

export const metadata: Metadata = { title: "Admin portal" };

export default async function Portal({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const { q, status } = await searchParams;
  const supabase = await createClient();
  const [{ data }, brand] = await Promise.all([supabase.rpc("portal_companies"), getBrand()]);
  const all = (data ?? []) as Workspace[];
  const rows = all.filter((w) => (!status || w.status === status) && (!q || `${w.name} ${w.slug} ${w.domain}`.toLowerCase().includes(q.toLowerCase())));
  const sum = (k: "people" | "projects" | "units") => all.reduce((a, w) => a + w[k], 0);
  const n = (s: string) => all.filter((w) => w.status === s).length;

  return (
    <>
      <div className="we-tiles">
        <Link className="we-tile" href="/platform"><span>Companies</span><b>{all.length}</b><small>{n("active")} active</small></Link>
        <Link className="we-tile" href="/platform?status=trial"><span>On trial</span><b>{n("trial")}</b><small>&nbsp;</small></Link>
        <Link className="we-tile" href="/platform?status=suspended"><span>Paused</span><b>{n("suspended")}</b><small>&nbsp;</small></Link>
        <div className="we-tile"><span>People</span><b>{sum("people").toLocaleString("en-US")}</b><small>across all companies</small></div>
        <div className="we-tile"><span>Projects</span><b>{sum("projects")}</b><small>{sum("units").toLocaleString("en-US")} units</small></div>
      </div>

      {!vercelReady() && (
        <div className="we-banner we-banner--info">
          New addresses are saved but connect by hand until a Vercel token is added as <span className="we-code">VERCEL_TOKEN</span> in the Vercel project settings.
        </div>
      )}

      <div className="we-grid we-grid--side">
        <section className="we-stack">
          <form className="we-row we-filterbar" action="/platform">
            <input name="q" defaultValue={q} className="we-input we-input--sm" placeholder="Search company or address" aria-label="Search" style={{ maxWidth: 280 }} />
            <select name="status" defaultValue={status ?? ""} className="we-input we-select we-input--sm" aria-label="Status">
              <option value="">Any status</option>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <button className="we-btn we-btn--secondary we-btn--sm">Filter</button>
          </form>
          <div className="we-table-wrap">
            <table className="we-table">
              <thead>
                <tr><th>Company</th><th>Status</th><th>Web address</th><th className="num">People</th><th className="num">Projects</th><th>Last active</th></tr>
              </thead>
              <tbody>
                {rows.map((w) => (
                  <tr key={w.id}>
                    <td>
                      <Link href={`/platform/companies/${w.id}`} className="we-company-cell">
                        {w.logo_url ? <img src={w.logo_url} alt="" /> : <span className="we-swatch" style={{ background: w.brand_color || "var(--gold)" }} />}
                        <span><b>{w.name}</b><span className="we-meta">{PLANS[w.plan] ?? w.plan} · since {date(w.created_at)}</span></span>
                      </Link>
                    </td>
                    <td>
                      <span className={`we-chip ${STATUS[w.status]?.chip ?? ""}`}>{STATUS[w.status]?.label ?? w.status}</span>
                      {w.status === "trial" && w.trial_ends && <div className="we-meta">until {date(w.trial_ends)}</div>}
                    </td>
                    <td>
                      <div className="we-code">{w.domain || `${w.slug}.${brand.rootDomain}`}</div>
                      <div className="we-meta">{DOMAIN_STATE[w.domain_status] ?? "Not checked"}</div>
                    </td>
                    <td className="num">{w.people}{w.max_users ? <span className="we-meta"> / {w.max_users}</span> : null}</td>
                    <td className="num">{w.projects}</td>
                    <td>{w.last_active ? date(w.last_active) : <span className="we-help">Never</span>}</td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={6} className="we-empty">No companies match.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="we-card we-stack">
          <h2 style={{ margin: 0 }}>Add a company</h2>
          <ActionForm action={createWorkspace} className="we-stack" resetOnOk>
            <div className="we-field"><label htmlFor="name">Company name</label><input id="name" name="name" className="we-input" required /></div>
            <div className="we-field"><label htmlFor="name_ar">Name in Arabic</label><input id="name_ar" name="name_ar" className="we-input" dir="rtl" /></div>
            <div className="we-field">
              <label htmlFor="slug">Short name</label>
              <input id="slug" name="slug" className="we-input we-mono" required placeholder="palmhills" pattern="[a-z0-9][a-z0-9-]{1,38}[a-z0-9]" />
              <span className="we-help">Their address: shortname.{brand.rootDomain}</span>
            </div>
            <div className="we-form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div className="we-field">
                <label htmlFor="plan">Plan</label>
                <select id="plan" name="plan" className="we-input we-select" defaultValue="standard">
                  {Object.entries(PLANS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="we-field"><label htmlFor="trial_days">Trial days</label><input id="trial_days" name="trial_days" className="we-input we-mono" inputMode="numeric" placeholder="0 = paid" /></div>
              <div className="we-field"><label htmlFor="max_users">People limit</label><input id="max_users" name="max_users" className="we-input we-mono" inputMode="numeric" placeholder="No limit" /></div>
            </div>
            <div className="we-field"><label htmlFor="admin_email">Their admin&apos;s email</label><input id="admin_email" name="admin_email" type="email" className="we-input" /></div>
            <div className="we-field"><label htmlFor="admin_name">Admin&apos;s name</label><input id="admin_name" name="admin_name" className="we-input" /></div>
            <div><button className="we-btn we-btn--primary">Create company</button></div>
          </ActionForm>
        </section>
      </div>
    </>
  );
}
