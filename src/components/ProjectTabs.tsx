"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TAB_MODULE } from "@/lib/access";

// Grouped so related pages sit together; the bar wraps instead of hiding tabs off-screen.
const groups: [string, string][][] = [
  [["", "Overview"], ["console", "Unit console"], ["site", "3D site"]],
  [["construction", "Construction progress"], ["delivery", "Unit delivery"], ["schedule", "Schedule and Gantt"]],
  [["budget", "Budget and cost"], ["boq", "BOQ"], ["contracts", "Contracts"], ["cashflow", "Cash flow"]],
  [["units", "Units and sales"], ["documents", "Documents"]],
  [["structure", "Phases and buildings"], ["import", "Import Excel"], ["settings", "Setup"]],
];

// The sheet each tab's data usually comes from.
const sheetFor: Record<string, string> = {
  budget: "budget", schedule: "activities", boq: "boq", contracts: "contracts", units: "units", cashflow: "payments", settings: "phases", site: "buildings", structure: "buildings",
};

export function ProjectTabs({ id, hidden = [] }: { id: string; hidden?: string[] }) {
  const path = usePathname();
  const active = path.split("/")[3] ?? "";
  const sheet = hidden.includes("import") ? undefined : sheetFor[active];
  return (
    <div className="we-tabbar">
      <nav className="we-tabs we-tabs--groups" aria-label="Project">
        {groups.map((g, i) => {
          const list = g.filter(([slug]) => !hidden.includes(TAB_MODULE[slug] ?? ""));
          if (!list.length) return null;
          return (
            <div key={i} className="we-tabs__group">
              {list.map(([slug, label]) => (
                <Link key={slug} href={`/projects/${id}${slug ? `/${slug}` : ""}`} aria-current={slug === active ? "page" : undefined}>
                  {label}
                </Link>
              ))}
            </div>
          );
        })}
      </nav>
      {sheet && (
        <Link className="we-btn we-btn--secondary we-btn--sm" href={`/projects/${id}/import?kind=${sheet}`}>
          Upload from Excel
        </Link>
      )}
    </div>
  );
}
