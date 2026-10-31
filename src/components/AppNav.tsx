"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; count?: number; late?: boolean; icon?: IconName };
type Group = { key: string; label: string; icon: IconName; items: Item[] };
export type IconName = keyof typeof ICONS;

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
  map: "M3 5.5 7.5 3l5 2.5L17 3v11.5L12.5 17l-5-2.5L3 17zM7.5 3v11.5M12.5 5.5V17",
  calendar: "M3 5h14v12H3zM3 9h14M7 3v4M13 3v4M6 12h4M8 14.5h5",
  cube: "M10 2.5 17 6v8l-7 3.5L3 14V6zM3 6l7 3.5L17 6M10 9.5v8",
  doc: "M5 2.5h7l4 4v11H5zM12 2.5v4h4M8 11h6M8 14h4",
  layers: "M10 3 17 7l-7 4-7-4zM3 10.5l7 4 7-4M3 14l7 4 7-4",
  upload: "M10 13V3.5M6.5 7 10 3.5 13.5 7M3.5 13v3.5h13V13",
  gear: "M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4",
  cash: "M2.5 5.5h15v9h-15zM10 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM5 8v4M15 8v4",
  contract: "M5 2.5h10v15H5zM8 6h4M8 9h4M8 12h2M11 15l1.5-1.5L14 15",
  chart: "M3 17h14M5 14V9M9 14V5M13 14v-3M17 14V7",
};

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

export function AppNav({ top, project, groups }: {
  top: Item[];
  project: { name: string; main: Item[]; more: Item[] } | null;
  groups: Group[];
}) {
  const path = usePathname();
  const active = (href: string, exact = false) => (href === "/" || exact ? path === href : path === href || path.startsWith(href + "/"));
  const link = (i: Item, exact = false) => (
    <Link key={i.href} href={i.href} aria-current={active(i.href, exact) ? "page" : undefined}>
      <span className="we-nav__label">{i.icon && <Icon name={i.icon} />}{i.label}</span>
      {!!i.count && <span className={`we-count${i.late ? " we-count--overdue" : ""}`}>{i.count}</span>}
    </Link>
  );
  // Every section folds; what the person folded is remembered on this browser.
  const folding = new Set(["departments", "admin", "platform"]);
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try { setClosed(JSON.parse(localStorage.getItem("we-nav-folds") || "{}")); } catch {}
  }, []);
  const isOpen = (key: string, items: Item[]) => closed[key] !== undefined ? !closed[key] : items.some((i) => active(i.href)) || !folding.has(key);
  const flip = (key: string, open: boolean) => setClosed((c) => {
    const n = { ...c, [key]: open };
    try { localStorage.setItem("we-nav-folds", JSON.stringify(n)); } catch {}
    return n;
  });
  const fold = (key: string, label: string, icon: IconName, items: Item[], exactFirst = false, strong = false) => {
    if (!items.length) return null;
    const open = isOpen(key, items);
    const total = items.reduce((s, i) => s + (i.count ?? 0), 0);
    return (
      <div key={key} className={`we-fold${open ? " is-open" : ""}${strong ? " we-fold--strong" : ""}`}>
        <button type="button" className="we-fold__head" aria-expanded={open} onClick={() => flip(key, open)}>
          <span className="we-nav__label"><Icon name={icon} />{label}</span>
          {total > 0 && !open && <span className={`we-count${items.some((i) => i.late) ? " we-count--overdue" : ""}`}>{total}</span>}
          <i className="we-fold__chev" aria-hidden="true" />
        </button>
        {open && <div className="we-nav__flat">{items.map((i, n) => link(i, exactFirst && n === 0))}</div>}
      </div>
    );
  };
  const work = groups.filter((g) => !folding.has(g.key) && g.items.length);
  const admin = groups.filter((g) => folding.has(g.key) && g.items.length);

  return (
    <nav className="we-nav" aria-label="Main">
      {top.map((i) => link(i))}
      {project && (
        <>
          <div className="we-nav__group">{project.name}</div>
          {fold("p-site", "Site and delivery", "build", project.main, true, true)}
          {fold("p-more", "Cost, contracts and data", "chart", project.more, false, true)}
        </>
      )}
      {work.length > 0 && <div className="we-nav__group">Workflows</div>}
      {work.map((g) => fold(g.key, g.label, g.icon, g.items))}
      {admin.length > 0 && <div className="we-nav__group">Company</div>}
      {admin.map((g) => fold(g.key, g.label, g.icon, g.items))}
    </nav>
  );
}
