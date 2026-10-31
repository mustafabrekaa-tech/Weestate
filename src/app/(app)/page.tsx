import Link from "next/link";
import { Kpis, type ProjectStatus } from "@/components/Kpis";
import { ProjectDashboard } from "@/components/ProjectDashboard";
import { QueueTable } from "@/components/QueueTable";
import { EarthMap, type EarthProject } from "@/components/EarthMap";
import { readGeo } from "@/lib/geo";
import type { ModelPlacement } from "@/lib/site";
import { projectSlugs } from "@/lib/slug";
import { getMe, sortQueue, type QueueItem, acts } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export default async function Overview({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project } = await searchParams;
  const supabase = await createClient();
  const me = await getMe();
  const [{ data: projects }, { data: queue }, { data: plans }, { data: blds }, { data: mods }] = await Promise.all([
    supabase.from("project_status").select("*").eq("company_id", me?.company_id ?? "").order("name"),
    supabase.from("work_queue").select("*").eq("company_id", me?.company_id ?? ""),
    supabase.from("projects").select("id, plan_image, plan_w, plan_h, plan_geo").eq("company_id", me?.company_id ?? ""),
    supabase.from("buildings").select("project_id, footprint, floors, floor_height_m, base_m").not("footprint", "is", null).limit(5000),
    supabase.from("project_models").select("id, project_id, url, placement").not("placement", "is", null),
  ]);
  type Bld = { project_id: string; footprint: [number, number][]; floors: number | null; floor_height_m: number | null; base_m: number | null };
  type Mod = { id: string; project_id: string; url: string; placement: ModelPlacement };
  const blocksOf = (id: string) => ((blds ?? []) as Bld[]).filter((b) => b.project_id === id).map((b) => {
    const base = Number(b.base_m ?? 0);
    return { ring: b.footprint, base, top: base + Math.max(1, b.floors ?? 1) * Number(b.floor_height_m || 3.2) };
  });
  const modelsOf = (id: string) => ((mods ?? []) as Mod[]).filter((m) => m.project_id === id).map((m) => ({ id: m.id, url: m.url, placement: m.placement }));
  const list = (projects ?? []) as ProjectStatus[];
  const items = sortQueue((queue ?? []) as QueueItem[]);
  const late = items.filter((q) => q.overdue);
  const slugs = await projectSlugs();
  const at = (id: string) => `/projects/${slugs.get(id) ?? id}`;
  const planOf = new Map((plans ?? []).map((x) => [x.id as string, x]));
  const earth: EarthProject[] = list
    .filter((p) => p.lat != null && p.lng != null)
    .map((p) => {
      const x = planOf.get(p.id);
      return {
        id: p.id, name: p.name, lat: p.lat!, lng: p.lng!, href: `${at(p.id)}/console?view=earth`,
        plan: x?.plan_image && x.plan_w && x.plan_h ? { image: x.plan_image, w: Number(x.plan_w), h: Number(x.plan_h) } : null,
        geo: readGeo(x?.plan_geo),
        blocks: blocksOf(p.id),
        models: modelsOf(p.id),
      };
    });
  const canSetup = acts(me, ["pm", "cost_control"]);

  const focus = list.find((p) => p.id === project) ?? list[0];

  return (
    <>
      {list.length === 0 ? (
        <>
          <div className="we-pagehead we-pagehead--intro">
            <div><div className="we-eyebrow we-eyebrow--brand">Dashboard</div><h1>Welcome</h1><p className="we-purpose">Set up your first project to see its dashboard, unit map and Gantt chart here.</p></div>
          </div>
          <div className="we-card we-empty">
            No projects yet.{canSetup && <> <Link href="/projects/new">Set up the first one</Link>; it takes a few minutes.</>}
          </div>
        </>
      ) : (
        <ProjectDashboard id={focus!.id} me={me} greeting />
      )}

      {list.length > 1 && (
        <section className="we-panel">
          <div className="we-panel__head"><h2>All projects</h2><small>pick one to see its dashboard</small></div>
          <div className="we-row">
            {list.map((p) => <Link key={p.id} className={`we-pill${p.id === focus?.id ? " is-on" : ""}`} href={`/?project=${p.id}`}>{p.name}</Link>)}
          </div>
        </section>
      )}

      {list.length > 0 && (
        <section className="we-panel">
          <div className="we-panel__head">
            <h2>On the map</h2>
            <small>{list.length} project{list.length === 1 ? "" : "s"} · click a name to fly there · <Link href={`${at(focus!.id)}/console?view=earth`}>open with units</Link></small>
          </div>
          <EarthMap projects={earth} height={520} />
        </section>
      )}

      {list.length > 1 && list.map((p) => (
        <section key={p.id} className="we-stack">
          <h2 style={{ margin: 0 }}><Link href={at(p.id)} style={{ color: "inherit", textDecoration: "none" }}>{p.name}</Link></h2>
          <Kpis p={p} />
        </section>
      ))}

      <section className="we-stack">
        <h2 style={{ margin: 0 }}>
          Everything waiting{" "}
          <span className="we-help">· {items.length} open, {late.length} overdue</span>
        </h2>
        <QueueTable items={items} myDepartment={me?.department} showProject empty="Nothing is waiting on any department." />
      </section>
    </>
  );
}
