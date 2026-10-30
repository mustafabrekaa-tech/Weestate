import type { Metadata } from "next";
import { ActionForm } from "@/components/ActionForm";
import { PortalHead } from "@/components/PortalHead";
import { createWorkspace } from "@/app/(app)/admin/actions";
import { getBrand } from "@/lib/brand";
import { money } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Add a company" };

export default async function NewCompany() {
  const supabase = await createClient();
  const [{ data: plans }, brand] = await Promise.all([
    supabase.from("plans").select("code, name, price_egp, max_users").eq("active", true).order("sort"),
    getBrand(),
  ]);
  return (
    <>
      <PortalHead title="Add a company" lead={`Opens a workspace with its own address on ${brand.rootDomain} and creates its first admin.`} />
      <section className="we-card" style={{ maxWidth: 760 }}>
        <ActionForm action={createWorkspace} className="we-stack" resetOnOk>
          <h3 className="we-h3">Company</h3>
          <div className="we-form-grid">
            <div className="we-field"><label htmlFor="name">Company name</label><input id="name" name="name" className="we-input" required /></div>
            <div className="we-field"><label htmlFor="name_ar">Name in Arabic</label><input id="name_ar" name="name_ar" className="we-input" dir="rtl" /></div>
            <div className="we-field">
              <label htmlFor="slug">Short name</label>
              <input id="slug" name="slug" className="we-input we-mono" required placeholder="palmhills" pattern="[a-z0-9][a-z0-9-]{1,38}[a-z0-9]" />
              <span className="we-help">Their address becomes shortname.{brand.rootDomain}</span>
            </div>
          </div>
          <h3 className="we-h3">Plan</h3>
          <div className="we-form-grid">
            <div className="we-field">
              <label htmlFor="plan">Plan</label>
              <select id="plan" name="plan" className="we-input we-select" defaultValue="standard">
                {(plans ?? []).map((p) => <option key={p.code} value={p.code}>{p.name} · EGP {money(p.price_egp)} a month</option>)}
              </select>
            </div>
            <div className="we-field"><label htmlFor="trial_days">Free trial (days)</label><input id="trial_days" name="trial_days" className="we-input we-mono" inputMode="numeric" placeholder="0 = starts paid" /></div>
            <div className="we-field"><label htmlFor="max_users">People limit</label><input id="max_users" name="max_users" className="we-input we-mono" inputMode="numeric" placeholder="From the plan" /></div>
          </div>
          <h3 className="we-h3">Their first admin</h3>
          <div className="we-form-grid">
            <div className="we-field"><label htmlFor="admin_name">Name</label><input id="admin_name" name="admin_name" className="we-input" /></div>
            <div className="we-field"><label htmlFor="admin_email">Email</label><input id="admin_email" name="admin_email" type="email" className="we-input" /></div>
          </div>
          <span className="we-help">They get a temporary password (shown after you press Create) and set up an authenticator app at first sign-in.</span>
          <div><button className="we-btn we-btn--primary">Create company</button></div>
        </ActionForm>
      </section>
    </>
  );
}
