import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { LogoUpload } from "@/components/LogoUpload";
import { getBrand } from "@/lib/brand";
import { getMe } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { saveCompany } from "../actions";

export const metadata: Metadata = { title: "Company" };

export default async function CompanyPage() {
  const me = await getMe();
  if (!me?.is_admin || !me.company_id) redirect("/");
  const supabase = await createClient();
  const [{ data: c }, { data: depts }, brand] = await Promise.all([
    supabase.from("companies").select("*").eq("id", me.company_id).single(),
    supabase.from("departments").select("*").order("sort"),
    getBrand(),
  ]);
  const address = `${c?.slug}.${brand.rootDomain}`;
  return (
    <>
      <div className="we-pagehead"><div><div className="we-eyebrow">Admin</div><h1>Company, branding and security</h1></div></div>
      <section className="we-card">
        <ActionForm action={saveCompany.bind(null, me.company_id)} className="we-form-grid">
          <div className="we-field"><label htmlFor="name">Name</label><input id="name" name="name" className="we-input" defaultValue={c?.name} required /></div>
          <div className="we-field"><label htmlFor="name_ar">Name in Arabic</label><input id="name_ar" name="name_ar" className="we-input" dir="rtl" defaultValue={c?.name_ar} /></div>
          <div className="we-field"><label htmlFor="currency">Currency</label><input id="currency" name="currency" className="we-input we-mono" defaultValue={c?.currency} maxLength={3} /></div>

          <span className="we-section-title">Branding</span>
          <div className="we-field" style={{ gridColumn: "1 / -1" }}>
            <label>Logo</label>
            <LogoUpload name="logo_url" folder={me.company_id} value={c?.logo_url ?? ""} />
          </div>
          <div className="we-field">
            <label htmlFor="brand_color">Brand colour</label>
            <div className="we-row" style={{ gap: 8, flexWrap: "nowrap" }}>
              <input id="brand_color" name="brand_color" type="color" defaultValue={c?.brand_color || "#8a6420"} className="we-swatch" style={{ padding: 0, width: 44, height: 40 }} />
              <label className="we-row" style={{ gap: 6, font: "400 14px var(--font-sans)", textTransform: "none", letterSpacing: 0 }}>
                <input type="checkbox" name="default_color" defaultChecked={!c?.brand_color} /> Use WE-estate gold
              </label>
            </div>
            <span className="we-help">Used for links, highlights and the active menu item.</span>
          </div>
          <div className="we-field" style={{ gridColumn: "span 2" }}>
            <label htmlFor="tagline">Sign-in page message</label>
            <input id="tagline" name="tagline" className="we-input" defaultValue={c?.tagline} placeholder="Welcome to the M Squared project room." />
          </div>

          <span className="we-section-title">Web address</span>
          <div className="we-field" style={{ gridColumn: "1 / -1" }}>
            <span>Your team signs in at <a href={`https://${address}`}><b>{address}</b></a>{c?.domain ? <> and <a href={`https://${c.domain}`}><b>{c.domain}</b></a></> : null}.</span>
            <span className="we-help">To use your own address, such as projects.yourcompany.com, ask {brand.appName} support{brand.supportEmail ? ` at ${brand.supportEmail}` : ""}.</span>
          </div>

          <span className="we-section-title">Security</span>
          <div className="we-field" style={{ gridColumn: "1 / -1" }}>
            <label className="we-row" style={{ gap: 8, font: "400 15px var(--font-sans)", textTransform: "none", letterSpacing: 0, color: "var(--ink)" }}>
              <input type="checkbox" name="require_mfa" defaultChecked={!!c?.require_mfa} /> Everyone must use an authenticator app to sign in
            </label>
            <span className="we-help">People without one are asked to set it up the next time they open the app. Set up yours first under My account.</span>
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
