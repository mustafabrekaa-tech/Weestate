import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { getMe, type Department, type Profile } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { addPerson, resetPassword, updatePerson } from "../actions";

export const metadata: Metadata = { title: "People" };

export default async function People({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const me = await getMe();
  if (!me?.is_admin) redirect("/");
  const { company: asked } = await searchParams;
  const company = (me.is_platform_admin && asked) || me.company_id;
  const supabase = await createClient();
  const [{ data: people }, { data: depts }, { data: comp }] = await Promise.all([
    supabase.from("profiles").select("*").eq("company_id", company ?? "").order("email"),
    supabase.from("departments").select("*").order("sort"),
    supabase.from("companies").select("name").eq("id", company ?? "").maybeSingle(),
  ]);
  const deptOptions = ((depts ?? []) as Department[]).map((d) => <option key={d.code} value={d.code}>{d.name}</option>);
  return (
    <>
      <div className="we-pagehead">
        <div>
          <div className="we-eyebrow">Admin · {comp?.name}</div>
          <h1>People</h1>
        </div>
      </div>

      <section className="we-card">
        <h2>Add a person</h2>
        <ActionForm action={addPerson.bind(null, company)} className="we-form-grid">
          <div className="we-field"><label htmlFor="email">Work email</label><input id="email" name="email" type="email" className="we-input" required /></div>
          <div className="we-field"><label htmlFor="full_name">Full name</label><input id="full_name" name="full_name" className="we-input" required /></div>
          <div className="we-field">
            <label htmlFor="department">Department</label>
            <select id="department" name="department" className="we-input we-select" required>{deptOptions}</select>
          </div>
          <div className="we-field">
            <label htmlFor="password">Temporary password <span className="we-help">· optional</span></label>
            <input id="password" name="password" className="we-input we-mono" placeholder="Made for you if empty" />
          </div>
          <label className="we-row" style={{ gap: 8, alignSelf: "end" }}><input type="checkbox" name="is_admin" /> Admin (can add people and change settings)</label>
          <div className="we-field" style={{ alignSelf: "end" }}><button className="we-btn we-btn--primary">Add person</button></div>
        </ActionForm>
      </section>

      <section className="we-stack">
        <h2 style={{ margin: 0 }}>Everyone <small>{people?.length ?? 0}</small></h2>
        <div className="we-table-wrap">
          <table className="we-table">
            <tbody>
              {((people ?? []) as Profile[]).map((p) => (
                <tr key={p.id}>
                  <td>
                    <ActionForm action={updatePerson} className="we-row">
                      <input type="hidden" name="id" value={p.id} />
                      <input name="full_name" defaultValue={p.full_name} placeholder="Full name" className="we-input" style={{ maxWidth: 220 }} aria-label="Full name" />
                      <span className="we-meta" style={{ minWidth: 200 }}>{p.email}</span>
                      <select name="department" defaultValue={p.department ?? ""} className="we-input we-select" style={{ maxWidth: 240 }} aria-label="Department">
                        <option value="">No department</option>
                        {deptOptions}
                      </select>
                      <label className="we-row" style={{ gap: 6 }}><input type="checkbox" name="is_admin" defaultChecked={p.is_admin} /> Admin</label>
                      <button className="we-btn we-btn--secondary we-btn--sm">Save</button>
                    </ActionForm>
                  </td>
                  <td style={{ width: 1 }}>
                    {p.id !== me.id && (
                      <ActionForm action={resetPassword.bind(null, p.id)} className="">
                        <button className="we-link">Reset password</button>
                      </ActionForm>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
