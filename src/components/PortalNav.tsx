"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Icon = keyof typeof ICONS;
const ICONS = {
  overview: "M3 13a7 7 0 1 1 14 0M10 13l3-4M3 16h14",
  add: "M4 17V5l6-2 6 2v12M2 17h16M10 7v6M7 10h6",
  companies: "M3 17V7l5-3v13M8 17V4l9 4v9M2 17h16M11 9h3M11 12h3",
  users: "M7 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 17c0-3 2.2-5 5-5s5 2 5 5M13 4a3 3 0 0 1 0 5.5M15 12c1.8.6 3 2.4 3 5",
  plans: "M3 4h7l7 7-6 6-7-7zM6.5 7.5h.01",
  domains: "M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM3 10h14M10 3c2 2 3 4.5 3 7s-1 5-3 7c-2-2-3-4.5-3-7s1-5 3-7z",
  brand: "M10 3a7 7 0 1 0 0 14c1 0 1.5-.7 1.5-1.5 0-.9-.8-1.3-.8-2.2 0-.9.8-1.6 1.7-1.6H14a3 3 0 0 0 3-3C17 5.6 13.9 3 10 3zM6.5 9h.01M9 6.5h.01M12.5 7h.01",
};

const LINKS: [string, string, Icon][] = [
  ["/platform", "Overview", "overview"],
  ["/platform/companies/new", "Add a company", "add"],
  ["/platform/companies", "Companies", "companies"],
  ["/platform/users", "Users & access", "users"],
  ["/platform/plans", "Plans & pricing", "plans"],
  ["/platform/domains", "Web addresses", "domains"],
  ["/platform/branding", "App branding", "brand"],
];

// The WE-estate staff portal's own top bar, separate from any company's app.
export function PortalNav({ appName, logo, who }: { appName: string; logo: string; who: string }) {
  const path = usePathname();
  const on = (h: string) =>
    h === "/platform" ? path === h
    : h === "/platform/companies" ? path.startsWith(h) && path !== "/platform/companies/new"
    : path.startsWith(h);
  return (
    <header className="we-portal__bar">
      <div className="we-portal__top">
        <Link href="/platform" className="we-portal__brand">
          <span className="we-portal__logo"><img src={logo || "/weestate-horizontal.svg"} alt={appName} /></span>
          <span className="we-portal__badge">Platform</span>
        </Link>
        <span className="we-portal__who">
          {who}
          <Link href="/" className="we-portal__link">Open the app</Link>
          <form action="/auth/signout" method="post"><button className="we-portal__link" title="Sign out">Sign out</button></form>
        </span>
      </div>
      <nav className="we-portal__nav" aria-label="Admin portal">
        {LINKS.map(([h, l, i]) => (
          <Link key={h} href={h} aria-current={on(h) ? "page" : undefined}>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[i]} /></svg>
            {l}
          </Link>
        ))}
      </nav>
    </header>
  );
}
