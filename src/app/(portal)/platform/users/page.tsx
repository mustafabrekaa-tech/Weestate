import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { PortalHead } from "@/components/PortalHead";
import { getBrand } from "@/lib/brand";
import { date } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { setStaff, staffResetMfa, staffResetPassword } from "../actions";

export const metadata: Metadata = { title: "Users & access" };

type U = { id: string; email: string; full_name: string; company_id: string | null; company: string; department: string | null; is_admin: boolean; is_platform_admin: boolean; last_sign_in: string | null; has_mfa: boolean };

export default async function Users({ searchParams }: { searchParams: Promise<{ q?: string; staff?: string }> }) {
  const { q, staff } = await searchParams;
  const supabase = await createClient();
  const [{ data }, brand] = await Promise.all([supabase.rpc("portal_users", { p_q: q ?? "", p_staff: staff === "1" }), getBrand()]);
  const rows = (data ?? []) as U[];
  return (
    <>
      <PortalHead title="Users & access" lead={`Everyone on ${brand.appName}. Reset sign-ins, and choose who is ${brand.appName} staff. Company admins manage their own people's roles.`} />
      <form className="we-row we-filterbar" action="/platform/users">
        <input name="q" defaultValue={q} className="we-input we-input--sm" placeholder="Search name, email or company" aria-label="Search" style={{ maxWidth: 300 }} />
        <label className="we-row" style={{ gap: 6, fontSize: 14 }}><input type="checkbox" name="staff" value="1" defaultChecked={staff === "1"} /> Only {brand.appName} staff</label>
        <button className="we-btn we-btn--secondary we-btn--sm">Filter</button>
        <span className="we-help">{rows.length} shown</span>
      </form>
      <div className="we-table-wrap">
        <table className="we-table">
          <thead><tr><th>Person</th><th>Company</th><th>Role</th><th>Sign-in</th><th>Last in</th><th /></tr></thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td><div className="we-title">{u.full_name || u.email}</div><div className="we-meta">{u.email}</div></td>
                <td>{u.company_id ? <Link href={`/platform/companies/${u.company_id}`}>{u.company}</Link> : <span className="we-help">None</span>}</td>
                <td className="we-row" style={{ gap: 4 }}>
                  {u.is_platform_admin && <span className="we-chip we-chip--active">{brand.appName} staff</span>}
                  {u.is_admin && <span className="we-chip we-chip--done">Company admin</span>}
                  {u.department && <span className="we-chip">{u.department}</span>}
                </td>
                <td><span className={`we-chip ${u.has_mfa ? "we-chip--done" : "we-chip--overdue"}`}>{u.has_mfa ? "Authenticator on" : "Not set up"}</span></td>
                <td>{u.last_sign_in ? date(u.last_sign_in) : <span className="we-help">Never</span>}</td>
                <td>
                  <details className="we-menu">
                    <summary className="we-btn we-btn--secondary we-btn--sm">Actions</summary>
                    <div className="we-menu__list we-menu__list--right">
                      <ActionForm action={staffResetPassword.bind(null, u.id)} className=""><button>Reset password</button></ActionForm>
                      {u.has_mfa && <ActionForm action={staffResetMfa.bind(null, u.id)} className=""><button>Reset authenticator</button></ActionForm>}
                      <ActionForm action={setStaff.bind(null, u.id, !u.is_platform_admin)} className="">
                        <button>{u.is_platform_admin ? `Remove ${brand.appName} staff access` : `Make ${brand.appName} staff`}</button>
                      </ActionForm>
                    </div>
                  </details>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="we-empty">Nobody matches.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
