import Link from "next/link";
import { projectBase } from "@/lib/slug";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { PageTips } from "@/components/PageTips";
import { SECTION_BY_SLUG } from "@/lib/sections";
import { ProjectTabs } from "@/components/ProjectTabs";
import { ScopeBar } from "@/components/ScopeBar";
import { getMe } from "@/lib/data";
import { getScope, scoped } from "@/lib/scope";
import { createClient } from "@/lib/supabase/server";

const statusLabel: Record<string, string> = {
  planning: "Planning", design: "Design", construction: "Construction", handover: "Handover", operation: "Operation", closed: "Closed",
};

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const base = await projectBase(id);
  const supabase = await createClient();
  const [{ data: p }, me, scope] = await Promise.all([
    supabase.from("projects").select("id, code, name, location, status").eq("id", id).maybeSingle(),
    getMe(),
    getScope(id),
  ]);
  if (!p) notFound();
  const [{ data: phases }, { data: zones }, { data: buildings }, { count }, { data: hiddenRows }] = await Promise.all([
    supabase.from("phases").select("id, code, name").eq("project_id", id).order("code"),
    supabase.from("zones").select("id, code, name, phase_id").eq("project_id", id).order("code"),
    supabase.from("buildings").select("id, code, name, phase_id, zone_id").eq("project_id", id).order("code"),
    scoped(supabase.from("units").select("id", { count: "exact", head: true }).eq("project_id", id), scope, { zone: true, building: true }),
    me?.is_admin ? Promise.resolve({ data: [] }) : supabase.from("hidden_modules").select("module").eq("company_id", me?.company_id ?? "").eq("department", me?.department ?? ""),
  ]);
  const slug = ((await headers()).get("x-pathname") ?? "").split("/")[3] ?? "";
  const sec = SECTION_BY_SLUG[slug];
  const sheetFor: Record<string, string> = { budget: "budget", schedule: "activities", boq: "boq", contracts: "contracts", units: "units", cashflow: "payments", structure: "buildings" };
  return (
    <>
      <div className="we-pagehead we-pagehead--intro">
        <div>
          <div className="we-eyebrow we-eyebrow--brand">{[p.name, p.code, statusLabel[p.status]].filter(Boolean).join(" · ")}</div>
          <h1>{sec ? sec.title : p.name}</h1>
          {sec && <p className="we-purpose">{sec.purpose}</p>}
        </div>
        {sheetFor[slug] && (
          <Link className="we-btn we-btn--secondary we-btn--sm" href={`${base}/import?kind=${sheetFor[slug]}`}>Upload from Excel</Link>
        )}
      </div>
      {sec?.tips && <PageTips id={sec.slug || "overview"} steps={sec.tips} />}
      <ProjectTabs base={base} hidden={(hiddenRows ?? []).map((r) => r.module as string)} />
      <ScopeBar
        projectId={id}
        phases={phases ?? []}
        zones={zones ?? []}
        buildings={buildings ?? []}
        value={{ phase: scope.phase, zone: scope.zone, building: scope.building }}
        counts={{ units: count ?? 0, label: scope.label }}
      />
      {children}
    </>
  );
}
