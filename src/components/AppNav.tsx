"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; count?: number; late?: boolean };
type Group = { key: string; label: string; icon: keyof typeof ICONS; items: Item[] };

// Outline icons, 20px, stroke follows the text colour.
const ICONS = {
  home: "M3 10.5 10 4l7 6.5V17a1 1 0 0 1-1 1h-4v-5H8v5H4a1 1 0 0 1-1-1z",
  inbox: "M3 11h4l1 2h4l1-2h4M4 4h12l1 7v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5z",
  sheet: "M4 3h12v14H4zM4 8h12M4 13h12M9 3v14",
  projects: "M3 17V8l5-3v12M8 17V5l9 4v8M2 17h16M11 10h3M11 13h3",
  cost: "M10 3v14M14 6.5C14 5 12.5 4 10 4S6 5 6 7s2 2.5 4 3 4 1 4 3-1.5 3-4 3-4-1-4-2.5",
  build: "M3 17h14M5 17V9l5-5 5 5v8M8 17v-4h4v4",
  cart: "M3 4h2l2 9h9l2-6H6M8 16.5a1 1 0 1 0 0 .01M15 16.5a1 1 0 1 0 0 .01",
  sales: "M4 10l6-6 6 6M6 8.5V16h8V8.5M9 16v-3h2v3",
  keys: "M12 3a4 4 0 1 1-3.5 6L3 14.5V17h2.5v-2h2v-2h2l1-1A4 4 0 0 1 12 3zM13 6.5a.5.5 0 1 0 0 .01",
  tools: "M14.5 3.5a3.5 3.5 0 0 0-4.6 4.4L3.5 14.3a1.4 1.4 0 0 0 2 2l6.4-6.4a3.5 3.5 0 0 0 4.4-4.6l-2 2-2-.5-.5-2z",
  teams: "M7 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 17c0-3 2.2-5 5-5s5 2 5 5M13 4a3 3 0 0 1 0 5.5M15 12c1.8.6 3 2.4 3 5",
  admin: "M10 2.5 16 5v4.5c0 3.8-2.6 6.6-6 8-3.4-1.4-6-4.2-6-8V5zM7.5 10l2 2 3.5-4",
  globe: "M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM3 10h14M10 3c2 2 3 4.5 3 7s-1 5-3 7c-2-2-3-4.5-3-7s1-5 3-7z",
};

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

export function AppNav({ top, groups }: { top: Item[]; groups: Group[] }) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
  const link = (i: Item, icon?: keyof typeof ICONS) => (
    <Link key={i.href} href={i.href} aria-current={active(i.href) ? "page" : undefined}>
      <span className="we-nav__label">{icon && <Icon name={icon} />}{i.label}</span>
      {!!i.count && <span className={`we-count${i.late ? " we-count--overdue" : ""}`}>{i.count}</span>}
    </Link>
  );

  return (
    <nav className="we-nav" aria-label="Main">
      {top.map((i, n) => link(i, (["home", "inbox", "sheet"] as const)[n] ?? "home"))}
      {groups.filter((g) => g.items.length).map((g) => {
        const open = g.items.some((i) => active(i.href));
        const total = g.items.reduce((s, i) => s + (i.count ?? 0), 0);
        return (
          <details key={g.key} className="we-nav__section" open={open || undefined}>
            <summary>
              <span className="we-nav__label"><Icon name={g.icon} />{g.label}</span>
              {total > 0 && !open && <span className={`we-count${g.items.some((i) => i.late) ? " we-count--overdue" : ""}`}>{total}</span>}
            </summary>
            <div className="we-nav__items">{g.items.map((i) => link(i))}</div>
          </details>
        );
      })}
    </nav>
  );
}
