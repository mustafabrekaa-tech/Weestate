import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { getBrand } from "@/lib/brand";
import { date } from "@/lib/format";
import { DOMAIN_STATE, STATUS, type Workspace } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { MODULES } from "@/lib/access";
import { checkAddress, saveAddress, saveModules, saveShortName, saveWorkspace, staffResetMfa, staffResetPassword } from "../../actions";
import { Select } from "@/components/Select";

export const metadata: Metadata = { title: "Company" };

type Person = { id: string; email: string; full_name: string; department: string | null; is_admin: boolean; last_sign_in: string | null; has_mfa: boolean };

export default async function CompanyPage({ params }: { params: Promise<{ cid: string }> }) {
  const { cid } = await params;
  const supabase = await createClient();
  const [{ data }, { data: people }, brand, { data: plans }, { data: mod }] = await Promise.all([
    supabase.rpc("portal_companies"),
    supabase.rpc("portal_people", { p_company: cid }),
    getBrand(),
    supabase.from("plans").select("code, name").order("sort"),
    supabase.from("companies").select("modules_off").eq("id", cid).maybeSingle(),
  ]);
  const off = new Set<string>((mod?.modules_off ?? []) as string[]);
  const w = ((data ?? []) as Workspace[]).find((x) => x.id === cid);
  if (!w) notFound();
  const sub = `${w.slug}.${brand.rootDomain}`;
  const ppl = (people ?? []) as Person[];

  return (
    <>
      <div className="we-row" style={{ justifyContent: "space-between" }}>
        <div className="we-row">
          {w.logo_url ? <img src={w.logo_url} alt="" className="we-logo-preview" style={{ maxHeight: 40 }} /> : null}
          <div>
            <Link className="we-link" href="/platform/companies">All companies</Link>
            <h2 style={{ margin: 0 }}>{w.name} <span className={`we-chip ${STATUS[w.status]?.chip ?? ""}`}>{STATUS[w.status]?.label}</span></h2>
            <span className="we-help">{w.people} people · {w.projects} projects · {w.units.toLocaleString("en-US")} units · since {date(w.created_at)}</span>
          </div>
        </div>
        <a className="we-btn we-btn--secondary we-btn--sm" href={`https://${w.domain || sub}`} target="_blank" rel="noreferrer">Open their sign-in page</a>
      </div>

      <div className="we-grid">
        <section className="we-card we-stack">
          <h3 className="we-h3">Account and plan</h3>
          <ActionForm action={saveWorkspace.bind(null, w.id)} className="we-stack">
            <div className="we-field"><label htmlFor="name">Company name</label><input id="name" name="name" defaultValue={w.name} className="we-input" required /></div>
            <div className="we-form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div className="we-field">
                <label htmlFor="status">Status</label>
                <Select id="status" name="status" defaultValue={w.status} className="we-input we-select">
                  {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </Select>
              </div>
              <div className="we-field">
                <label htmlFor="plan">Plan</label>
                <Select id="plan" name="plan" defaultValue={w.plan} className="we-input we-select">
                  {(plans ?? []).map((pl) => <option key={pl.code} value={pl.code}>{pl.name}</option>)}
                </Select>
              </div>
              <div className="we-field"><label htmlFor="max_users">People limit</label><input id="max_users" name="max_users" defaultValue={w.max_users ?? ""} className="we-input we-mono" inputMode="numeric" placeholder="No limit" /></div>
              <div className="we-field"><label htmlFor="max_projects">Project limit</label><input id="max_projects" name="max_projects" defaultValue={w.max_projects ?? ""} className="we-input we-mono" inputMode="numeric" placeholder="No limit" /></div>
              <div className="we-field"><label htmlFor="trial_ends">Trial ends</label><input id="trial_ends" name="trial_ends" type="date" defaultValue={w.trial_ends ?? ""} className="we-input" /></div>
            </div>
            <h3 className="we-h3">Contact</h3>
            <div className="we-form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div className="we-field"><label htmlFor="contact_name">Name</label><input id="contact_name" name="contact_name" defaultValue={w.contact_name} className="we-input" /></div>
              <div className="we-field"><label htmlFor="contact_phone">Phone</label><input id="contact_phone" name="contact_phone" defaultValue={w.contact_phone} className="we-input" /></div>
              <div className="we-field" style={{ gridColumn: "1 / -1" }}><label htmlFor="contact_email">Email</label><input id="contact_email" name="contact_email" type="email" defaultValue={w.contact_email} className="we-input" /></div>
              <div className="we-field" style={{ gridColumn: "1 / -1" }}><label htmlFor="staff_notes">Notes for {brand.appName} staff</label><textarea id="staff_notes" name="staff_notes" defaultValue={w.staff_notes} className="we-input" rows={3} /></div>
            </div>
            <span className="we-help">Paused: people can still sign in but see a notice instead of their projects. Nothing is deleted.</span>
            <div><button className="we-btn we-btn--primary">Save</button></div>
          </ActionForm>
        </section>

        <section className="we-card we-stack">
          <h3 className="we-h3">Web address</h3>
          <ActionForm action={saveShortName.bind(null, w.id)} className="we-stack">
            <div className="we-field">
              <label htmlFor="slug">{brand.appName} address</label>
              <div className="we-row" style={{ gap: 4, flexWrap: "nowrap" }}>
                <input id="slug" name="slug" defaultValue={w.slug} className="we-input we-mono" required pattern="[a-z0-9][a-z0-9-]{1,38}[a-z0-9]" />
                <span className="we-code">.{brand.rootDomain}</span>
              </div>
            </div>
            <div><button className="we-btn we-btn--secondary we-btn--sm">Change address</button></div>
          </ActionForm>
          <ActionForm action={saveAddress.bind(null, w.id)} className="we-stack">
            <div className="we-field">
              <label htmlFor="domain">Their own domain <span className="we-help">· optional</span></label>
              <input id="domain" name="domain" defaultValue={w.domain} className="we-input" placeholder="projects.company.com" />
            </div>
            <div className="we-row">
              <button className="we-btn we-btn--primary we-btn--sm">Save and connect</button>
              <span className="we-chip">{DOMAIN_STATE[w.domain_status] ?? "Not checked"}</span>
            </div>
          </ActionForm>
          <ActionForm action={checkAddress.bind(null, w.id)}><button className="we-link">Check status now</button></ActionForm>
          <div className="we-stack" style={{ gap: 6 }}>
            <b>DNS record they add</b>
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
              <span className="we-help">None. {sub} works through the wildcard record on {brand.rootDomain}.</span>
            )}
          </div>
        </section>
      </div>

      <section className="we-card we-stack">
        <h3 className="we-h3" style={{ margin: 0 }}>Modules <small>{MODULES.length - MODULES.filter((m) => off.has(m.key)).length} of {MODULES.length} on</small></h3>
        <span className="we-help">Untick a module to switch it off for everyone at {w.name}, admins included: it leaves their menu, project tabs and the reports dashboard. Their admin can still hide the modules that are on from single departments.</span>
        <ActionForm action={saveModules.bind(null, w.id, MODULES.map((m) => m.key))} className="we-stack">
          <div className="we-modgrid">
            {MODULES.map((m) => (
              <label key={m.key} className="we-modgrid__item">
                <input type="checkbox" name={`m:${m.key}`} defaultChecked={!off.has(m.key)} />
                <span><b>{m.label}</b><br /><small className="we-help">{m.help}</small></span>
              </label>
            ))}
          </div>
          <div><button className="we-btn we-btn--primary we-btn--sm">Save modules</button></div>
        </ActionForm>
      </section>

      <section className="we-stack">
        <div className="we-row" style={{ justifyContent: "space-between" }}>
          <h3 className="we-h3" style={{ margin: 0 }}>People <small>{ppl.length}{w.max_users ? ` of ${w.max_users}` : ""}</small></h3>
          <Link className="we-btn we-btn--secondary we-btn--sm" href={`/admin/people?company=${w.id}`}>Add or change people</Link>
        </div>
        <div className="we-table-wrap">
          <table className="we-table">
            <thead><tr><th>Name</th><th>Department</th><th>Sign-in</th><th>Last in</th><th /></tr></thead>
            <tbody>
              {ppl.map((p) => (
                <tr key={p.id}>
                  <td><div className="we-title">{p.full_name || p.email}{p.is_admin && <span className="we-chip we-chip--done" style={{ marginLeft: 6 }}>Admin</span>}</div><div className="we-meta">{p.email}</div></td>
                  <td>{p.department ?? "–"}</td>
                  <td><span className={`we-chip ${p.has_mfa ? "we-chip--done" : "we-chip--overdue"}`}>{p.has_mfa ? "Authenticator on" : "Not set up"}</span></td>
                  <td>{p.last_sign_in ? date(p.last_sign_in) : <span className="we-help">Never</span>}</td>
                  <td className="we-row" style={{ justifyContent: "flex-end" }}>
                    <ActionForm action={staffResetPassword.bind(null, p.id)} className=""><button className="we-link">Reset password</button></ActionForm>
                    {p.has_mfa && <ActionForm action={staffResetMfa.bind(null, p.id)} className=""><button className="we-link">Reset authenticator</button></ActionForm>}
                  </td>
                </tr>
              ))}
              {!ppl.length && <tr><td colSpan={5} className="we-empty">Nobody yet. Add their admin under “Add or change people”.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
