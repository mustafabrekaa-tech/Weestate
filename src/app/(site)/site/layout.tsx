import Link from "next/link";
import { getBrand } from "@/lib/brand";
import { SOCIALS, getSiteInfo, telLink, waLink } from "@/lib/siteinfo";

// The public website on the root domain: its own header and footer.
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [b, info] = await Promise.all([getBrand(), getSiteInfo()]);
  const show = (k: string) => !info.hidden.includes(k);
  const socials = show("social") ? SOCIALS.filter(([k]) => info[k]) : [];
  const email = info.sales_email || info.support_email;
  return (
    <div className="ws">
      <header className="ws-nav">
        <div className="ws-wrap ws-nav__in">
          <Link href="/" className="ws-nav__logo"><img src={b.logo || "/weestate-horizontal.svg"} alt={b.appName} /></Link>
          <nav className="ws-nav__links" aria-label="Website">
            {show("features") && <a href="/#features">Features</a>}
            {show("site3d") && <a href="/#site3d">3D site</a>}
            {show("workflow") && <a href="/#workflow">How it works</a>}
            {show("security") && <a href="/#security">Security</a>}
            {show("plans") && <a href="/#plans">Plans</a>}
          </nav>
          <div className="ws-nav__cta">
            {show("contact") && <a href="/#contact" className="ws-btn ws-btn--gold">Book a demo</a>}
          </div>
        </div>
      </header>
      {children}
      <footer className="ws-foot">
        <div className="ws-wrap ws-foot__in">
          <div className="ws-foot__about">
            <img src="/weestate-horizontal-reverse.svg" alt={b.appName} height={30} />
            <p>The project control center for real-estate developers.<br />Every project. Every department. One line.</p>
            {show("contacts") && <div className="ws-foot__contact">
              {email && <a href={`mailto:${email}`} className="ws-foot__mail">{email}</a>}
              {info.phone && <a href={telLink(info.phone)}>Phone {info.phone}</a>}
              {info.whatsapp && <a href={waLink(info.whatsapp)} target="_blank" rel="noreferrer">WhatsApp {info.whatsapp}</a>}
              {info.address && (info.map_url ? <a href={info.map_url} target="_blank" rel="noreferrer" className="ws-foot__dim">{info.address}</a> : <span className="ws-foot__dim">{info.address}</span>)}
              {info.hours && <span className="ws-foot__dim">{info.hours}</span>}
            </div>}
            {socials.length > 0 && (
              <div className="ws-foot__social">
                {socials.map(([k, label, d]) => (
                  <a key={k} href={info[k]} target="_blank" rel="noreferrer" aria-label={label} title={label}>
                    <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d={d} /></svg>
                  </a>
                ))}
              </div>
            )}
          </div>
          <div className="ws-foot__col"><b>Product</b>{show("features") && <a href="/#features">Features</a>}{show("site3d") && <a href="/#site3d">3D site</a>}{show("workflow") && <a href="/#workflow">How it works</a>}{show("plans") && <a href="/#plans">Pricing</a>}</div>
          <div className="ws-foot__col"><b>Company</b>{info.about_text && <Link href="/about">About us</Link>}{show("contact") && <><a href="/#contact">Contact</a><a href="/#contact">Request a demo</a></>}</div>
          {(info.privacy_text || info.terms_text || info.refund_text) && <div className="ws-foot__col"><b>Legal</b>{info.privacy_text && <Link href="/privacy">Privacy policy</Link>}{info.terms_text && <Link href="/terms">Terms of service</Link>}{info.refund_text && <Link href="/refund">Refund policy</Link>}</div>}
        </div>
        <div className="ws-wrap ws-foot__legal">
          <span>© {new Date().getFullYear()} {b.appName}. All rights reserved.</span>
          <span>Made for real-estate developers in Egypt and the Gulf.</span>
        </div>
      </footer>
      {show("chat") && info.whatsapp && (
        <a className="ws-chat" href={waLink(info.whatsapp)} target="_blank" rel="noreferrer">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M3.5 16.5l1-3.2A7 7 0 1 1 7 15.6z" strokeLinejoin="round" /></svg>
          Chat with us
        </a>
      )}
    </div>
  );
}
