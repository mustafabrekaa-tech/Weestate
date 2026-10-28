import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMe, type Department, type Profile } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { updatePerson } from "./actions";

export const metadata: Metadata = { title: "People and departments" };

export default async function People() {
  const me = await getMe();
  if (!me?.is_admin) redirect("/");
  const supabase = await createClient();
  const [{ data: people }, { data: depts }] = await Promise.all([
    supabase.from("profiles").select("*").order("email"),
    supabase.from("departments").select("*").order("sort"),
  ]);
  return (
    <>
      <div className="we-pagehead">
        <div>
          <div className="we-eyebrow">Admin</div>
          <h1>People and departments</h1>
        </div>
      </div>
      <p className="we-help" style={{ margin: 0 }}>
        Invite people from Supabase (Authentication → Users → Invite). They appear here after their first sign-in; give each one a department so their work reaches them.
      </p>
      <div className="we-table-wrap">
        <table className="we-table">
          <thead><tr><th>Person</th><th>Department</th><th>Admin</th><th /></tr></thead>
          <tbody>
            {((people ?? []) as Profile[]).map((p) => (
              <tr key={p.id}>
                <td colSpan={4}>
                  <form action={updatePerson} className="we-row">
                    <input type="hidden" name="id" value={p.id} />
                    <input name="full_name" defaultValue={p.full_name} placeholder="Full name" className="we-input" style={{ maxWidth: 220 }} aria-label="Full name" />
                    <span className="we-meta" style={{ minWidth: 200 }}>{p.email}</span>
                    <select name="department" defaultValue={p.department ?? ""} className="we-input we-select" style={{ maxWidth: 240 }} aria-label="Department">
                      <option value="">No department</option>
                      {((depts ?? []) as Department[]).map((d) => (
                        <option key={d.code} value={d.code}>{d.name}</option>
                      ))}
                    </select>
                    <label className="we-row" style={{ gap: 6 }}>
                      <input type="checkbox" name="is_admin" defaultChecked={p.is_admin} /> Admin
                    </label>
                    <button className="we-btn we-btn--secondary we-btn--sm">Save</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
