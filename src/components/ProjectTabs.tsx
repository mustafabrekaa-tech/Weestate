"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TAB_MODULE } from "@/lib/access";

const tabs: [string, string][] = [
  ["", "Overview"],
  ["site", "3D site"],
  ["structure", "Phases and buildings"],
  ["budget", "Budget and cost"],
  ["schedule", "Schedule and Gantt"],
  ["construction", "Construction progress"],
  ["delivery", "Unit delivery"],
  ["boq", "BOQ"],
  ["contracts", "Contracts"],
  ["units", "Units and sales"],
  ["cashflow", "Cash flow"],
  ["documents", "Documents"],
  ["import", "Import Excel"],
  ["settings", "Setup"],
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
      <nav className="we-tabs" aria-label="Project">
        {tabs.filter(([slug]) => !hidden.includes(TAB_MODULE[slug] ?? "")).map(([slug, label]) => (
          <Link key={slug} href={`/projects/${id}${slug ? `/${slug}` : ""}`} aria-current={slug === active ? "page" : undefined}>
            {label}
          </Link>
        ))}
      </nav>
      {sheet && (
        <Link className="we-btn we-btn--secondary we-btn--sm" href={`/projects/${id}/import?kind=${sheet}`}>
          Upload from Excel
        </Link>
      )}
    </div>
  );
}
