import type { Metadata } from "next";
import { ActionForm } from "@/components/ActionForm";
import { PortalHead } from "@/components/PortalHead";
import { getBrand } from "@/lib/brand";
import { getSiteInfo, type SiteInfo } from "@/lib/siteinfo";
import { saveWebsite } from "../actions";

export const metadata: Metadata = { title: "Website" };

const CONTACT: [keyof SiteInfo, string, string][] = [
  ["sales_email", "Sales email", "info@weestate.app"],
  ["support_email", "Support email", "support@weestate.app"],
  ["phone", "Phone", "+20 1xx xxx xxxx"],
  ["whatsapp", "WhatsApp", "+20 1xx xxx xxxx"],
  ["address", "Office address", "Fifth Settlement, New Cairo, Egypt"],
  ["map_url", "Google Maps link", "https://maps.app.goo.gl/..."],
  ["hours", "Working hours", "Sunday to Thursday, 9:00 to 17:00"],
];
const SOCIAL: [keyof SiteInfo, string][] = [
  ["linkedin", "LinkedIn"], ["instagram", "Instagram"], ["facebook", "Facebook"], ["tiktok", "TikTok"], ["x_url", "X"], ["youtube", "YouTube"],
];
const PAGES: [keyof SiteInfo, string, string][] = [
  ["about_text", "About us", "/about"],
  ["privacy_text", "Privacy policy", "/privacy"],
  ["terms_text", "Terms of service", "/terms"],
  ["refund_text", "Refund policy", "/refund"],
];

export default async function PlatformWebsite() {
  const [info, { rootDomain }] = await Promise.all([getSiteInfo(), getBrand()]);
  return (
    <>
      <PortalHead title="Website" lead={`Contact details, social links and pages shown on ${rootDomain}. Anything left empty is hidden.`}>
        <a href={`https://${rootDomain}`} target="_blank" rel="noreferrer" className="we-btn">Open the website</a>
      </PortalHead>
      <ActionForm action={saveWebsite}>
        <section className="we-card we-stack">
          <h2 style={{ margin: 0 }}>Contact details</h2>
          <p className="we-help" style={{ margin: 0 }}>Shown in the footer and next to the demo form. With WhatsApp filled in, a &quot;Chat with us&quot; button appears on every page.</p>
          <div className="we-form-grid">
            {CONTACT.map(([k, l, ph]) => (
              <div key={k} className="we-field"><label htmlFor={k}>{l}</label><input id={k} name={k} className="we-input" defaultValue={info[k]} placeholder={ph} /></div>
            ))}
          </div>
        </section>
        <section className="we-card we-stack">
          <h2 style={{ margin: 0 }}>Social links</h2>
          <div className="we-form-grid">
            {SOCIAL.map(([k, l]) => (
              <div key={k} className="we-field"><label htmlFor={k}>{l}</label><input id={k} name={k} type="url" className="we-input" defaultValue={info[k]} placeholder="https://" /></div>
            ))}
          </div>
        </section>
        <section className="we-card we-stack">
          <h2 style={{ margin: 0 }}>Pages</h2>
          <p className="we-help" style={{ margin: 0 }}>Plain text. Leave a blank line between paragraphs and start a line with &quot;## &quot; for a heading. A page shows in the footer once it has text.</p>
          {PAGES.map(([k, l, path]) => (
            <div key={k} className="we-field">
              <label htmlFor={k}>{l} <span className="we-help">· {rootDomain}{path}</span></label>
              <textarea id={k} name={k} className="we-input" rows={8} defaultValue={info[k]} />
            </div>
          ))}
        </section>
        <div><button className="we-btn we-btn--primary">Save website</button></div>
      </ActionForm>
    </>
  );
}
