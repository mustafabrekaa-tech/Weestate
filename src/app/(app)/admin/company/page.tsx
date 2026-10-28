import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { getMe } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { saveCompany } from "../actions";

export const metadata: Metadata = { title: "Company" };

export default async function CompanyPage() {
  const me = await getMe();
  if (!me?.is_admin || !me.company_id) redirect("/");
  const supabase = await createClient();
  const [{ data: c }, { data: depts }] = await Promise.all([
    supabase.from("companies").select("*").eq("id", me.company_id).single(),
    supabase.from("departments").select("*").order("sort"),
  ]);
  return (
    <>
      <div className="we-pagehead"><div><div className="we-eyebrow">Admin</div><h1>Company</h1></div></div>
      <section className="we-card">
        <ActionForm action={saveCompany.bind(null, me.company_id)} className="we-form-grid">
          <div className="we-field"><label htmlFor="name">Name</label><input id="name" name="name" className="we-input" defaultValue={c?.name} required /></div>
          <div className="we-field"><label htmlFor="name_ar">Name in Arabic</label><input id="name_ar" name="name_ar" className="we-input" dir="rtl" defaultValue={c?.name_ar} /></div>
          <div className="we-field"><label htmlFor="logo_url">Logo link <span className="we-help">· optional</span></label><input id="logo_url" name="logo_url" className="we-input" defaultValue={c?.logo_url} placeholder="https://…" /></div>
          <div className="we-field"><label htmlFor="currency">Currency</label><input id="currency" name="currency" className="we-input we-mono" defaultValue={c?.currency} maxLength={3} /></div>
          <div className="we-field">
            <label htmlFor="domain">Own web address <span className="we-help">· optional</span></label>
            <input id="domain" name="domain" className="we-input" defaultValue={c?.domain ?? ""} placeholder="projects.yourcompany.com" />
            <span className="we-help">Workspace short name: {c?.slug}. Ask WE-estate to connect your own address.</span>
          </div>
          <div className="we-field" style={{ alignSelf: "end" }}><button className="we-btn we-btn--primary">Save</button></div>
        </ActionForm>
      </section>
      <section className="we-card">
        <h2>Departments</h2>
        <p className="we-help" style={{ marginTop: 0 }}>Every workspace uses the same departments, so workflows route the same way. Give each person one on the People page.</p>
        <div className="we-row">{(depts ?? []).map((d) => <span key={d.code} className="we-pill">{d.name} · <span dir="rtl">{d.name_ar}</span></span>)}</div>
      </section>
    </>
  );
}
