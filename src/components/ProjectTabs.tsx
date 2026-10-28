"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs: [string, string][] = [
  ["", "Overview"],
  ["budget", "Budget and cost"],
  ["schedule", "Schedule and progress"],
  ["boq", "BOQ"],
  ["contracts", "Contracts"],
  ["units", "Units and sales"],
  ["cashflow", "Cash flow"],
  ["documents", "Documents"],
  ["import", "Import"],
  ["settings", "Setup"],
];

export function ProjectTabs({ id }: { id: string }) {
  const path = usePathname();
  const active = path.split("/")[3] ?? "";
  return (
    <nav className="we-tabs" aria-label="Project">
      {tabs.map(([slug, label]) => (
        <Link key={slug} href={`/projects/${id}${slug ? `/${slug}` : ""}`} aria-current={slug === active ? "page" : undefined}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
