import Link from "next/link";
import { getBrand } from "@/lib/brand";

// The public website on the root domain: its own header and footer.
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const b = await getBrand();
  return (
    <div className="ws">
      <header className="ws-nav">
        <div className="ws-wrap ws-nav__in">
          <Link href="/" className="ws-nav__logo"><img src={b.logo || "/weestate-horizontal.svg"} alt={b.appName} /></Link>
          <nav className="ws-nav__links" aria-label="Website">
            <a href="/#features">Features</a>
            <a href="/#site3d">3D site</a>
            <a href="/#workflow">How it works</a>
            <a href="/#security">Security</a>
            <a href="/#plans">Plans</a>
          </nav>
          <div className="ws-nav__cta">
            <Link href="/login" className="ws-btn ws-btn--ghost">Sign in</Link>
            <a href="/#contact" className="ws-btn ws-btn--gold">Book a demo</a>
          </div>
        </div>
      </header>
      {children}
      <footer className="ws-foot">
        <div className="ws-wrap ws-foot__in">
          <div>
            <img src="/weestate-horizontal-reverse.svg" alt={b.appName} height={30} />
            <p>The operating system for real-estate developers.</p>
          </div>
          <div className="ws-foot__cols">
            <div><b>Product</b><a href="/#features">Features</a><a href="/#site3d">3D site</a><a href="/#plans">Plans</a></div>
            <div><b>Company</b><a href="/#contact">Contact</a>{b.supportEmail && <a href={`mailto:${b.supportEmail}`}>{b.supportEmail}</a>}</div>
            <div><b>Customers</b><Link href="/login">Sign in to your workspace</Link></div>
          </div>
        </div>
        <div className="ws-wrap ws-foot__legal">© {new Date().getFullYear()} {b.appName}. Made in Egypt.</div>
      </footer>
    </div>
  );
}
