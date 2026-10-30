import type { Metadata } from "next";
import { ActionForm } from "@/components/ActionForm";
import { LogoUpload } from "@/components/LogoUpload";
import { createClient } from "@/lib/supabase/server";
import { savePlatform } from "../actions";

export const metadata: Metadata = { title: "Branding" };

export default async function PlatformBranding() {
  const supabase = await createClient();
  const { data: p } = await supabase.from("platform_settings").select("*").single();
  return (
    <>
      <p className="we-help" style={{ margin: 0 }}>
        How the app looks on {p?.root_domain} and for companies that haven&apos;t set their own branding. A company&apos;s own logo and colour win on its own address.
      </p>
      <section className="we-card">
        <ActionForm action={savePlatform} className="we-form-grid">
          <div className="we-field"><label htmlFor="app_name">App name</label><input id="app_name" name="app_name" className="we-input" defaultValue={p?.app_name} required /></div>
          <div className="we-field"><label htmlFor="support_email">Support email</label><input id="support_email" name="support_email" type="email" className="we-input" defaultValue={p?.support_email} placeholder="support@weestate.app" /></div>
          <div className="we-field" style={{ gridColumn: "1 / -1" }}><label htmlFor="tagline">Sign-in page message</label><input id="tagline" name="tagline" className="we-input" defaultValue={p?.tagline} /></div>
          <div className="we-field" style={{ gridColumn: "1 / -1" }}>
            <label>Logo <span className="we-help">· leave empty for the gold skyline logo</span></label>
            <LogoUpload name="logo_url" folder="platform" value={p?.logo_url ?? ""} />
          </div>
          <div className="we-field">
            <label htmlFor="brand_color">Accent colour</label>
            <div className="we-row" style={{ gap: 8, flexWrap: "nowrap" }}>
              <input id="brand_color" name="brand_color" type="color" defaultValue={p?.brand_color || "#8a6420"} style={{ padding: 0, width: 44, height: 40 }} />
              <label className="we-row" style={{ gap: 6, font: "400 14px var(--font-sans)", textTransform: "none", letterSpacing: 0 }}>
                <input type="checkbox" name="default_color" defaultChecked={!p?.brand_color} /> Use the standard gold
              </label>
            </div>
          </div>
          <div className="we-field" style={{ alignSelf: "end" }}><button className="we-btn we-btn--primary">Save</button></div>
        </ActionForm>
      </section>
    </>
  );
}
