"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS: [string, string][] = [
  ["/platform", "Companies"],
  ["/platform/domains", "Web addresses"],
  ["/platform/branding", "App branding"],
];

// Tabs across the top of the WE-estate staff portal.
export function PortalNav({ appName }: { appName: string }) {
  const path = usePathname();
  const on = (h: string) => (h === "/platform" ? path === h || path.startsWith("/platform/companies") : path.startsWith(h));
  return (
    <div className="we-portalbar">
      <div className="we-pagehead">
        <div>
          <div className="we-eyebrow">{appName} staff only</div>
          <h1>Admin portal</h1>
        </div>
      </div>
      <nav className="we-tabs" aria-label="Admin portal">
        {LINKS.map(([h, l]) => <Link key={h} href={h} aria-current={on(h) ? "page" : undefined}>{l}</Link>)}
      </nav>
    </div>
  );
}
