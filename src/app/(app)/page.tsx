import Link from "next/link";
import { Kpis, type ProjectStatus } from "@/components/Kpis";
import { ProjectDashboard } from "@/components/ProjectDashboard";
import { QueueTable } from "@/components/QueueTable";
import { SiteMap } from "@/components/SiteMap";
import { getMe, sortQueue, type QueueItem, acts } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export default async function Overview({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project } = await searchParams;
  const supabase = await createClient();
  const me = await getMe();
  const [{ data: projects }, { data: queue }] = await Promise.all([
    supabase.from("project_status").select("*").eq("company_id", me?.company_id ?? "").order("name"),
    supabase.from("work_queue").select("*").eq("company_id", me?.company_id ?? ""),
  ]);
  const list = (projects ?? []) as ProjectStatus[];
  const items = sortQueue((queue ?? []) as QueueItem[]);
  const late = items.filter((q) => q.overdue);
  const pins = list
    .filter((p) => p.lat != null && p.lng != null)
    .map((p) => ({
      id: p.id,
      lat: p.lat!,
      lng: p.lng!,
      label: p.name,
      sub: `SPI ${p.spi ?? "–"} · CPI ${p.cpi ?? "–"} · ${p.unit_count} units`,
      href: `/projects/${p.id}`,
    }));
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
          <div className="we-panel__head"><h2>On the map</h2><small>{list.length} project{list.length === 1 ? "" : "s"}</small></div>
          <SiteMap pins={pins} height={360} />
        </section>
      )}

      {list.length > 1 && list.map((p) => (
        <section key={p.id} className="we-stack">
          <h2 style={{ margin: 0 }}><Link href={`/projects/${p.id}`} style={{ color: "inherit", textDecoration: "none" }}>{p.name}</Link></h2>
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
