import type { Metadata } from "next";
import Link from "next/link";
import { MenuCloser } from "@/components/MenuCloser";
import { PortalNav } from "@/components/PortalNav";
import { getBrand } from "@/lib/brand";
import { getMe } from "@/lib/data";

export const metadata: Metadata = { title: { default: "Platform", template: "%s · Platform" } };

// WE-estate staff only. A separate space from the companies' app: its own
// bar and menu, none of the project screens.
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const [me, brand] = await Promise.all([getMe(), getBrand()]);
  if (!me?.is_platform_admin) {
    return (
      <main className="we-portal__main">
        <section className="we-card we-stack" style={{ maxWidth: 520, margin: "10vh auto" }}>
          <h1 style={{ margin: 0 }}>{brand.appName} staff only</h1>
          <p style={{ margin: 0 }}>This is where {brand.appName} runs the platform. Your account doesn&apos;t have access.</p>
          <div className="we-row">
            <Link className="we-btn we-btn--primary we-btn--sm" href={`https://${brand.rootDomain}`}>Go to {brand.appName}</Link>
            <form action="/auth/signout" method="post"><button className="we-btn we-btn--secondary we-btn--sm">Sign out</button></form>
          </div>
        </section>
      </main>
    );
  }
  return (
    <div className="we-portal">
      <MenuCloser />
      <PortalNav appName={brand.appName} logo={brand.logo} who={me.full_name || me.email} />
      <main className="we-portal__main">{children}</main>
    </div>
  );
}
