import Link from "next/link";
import { Kpis, type ProjectStatus } from "@/components/Kpis";
import { QueueTable } from "@/components/QueueTable";
import { getMe, sortQueue, type QueueItem } from "@/lib/data";
import { date } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export default async function Overview() {
  const supabase = await createClient();
  const me = await getMe();
  const [{ data: projects }, { data: queue }] = await Promise.all([
    supabase.from("project_status").select("*").order("name"),
    supabase.from("work_queue").select("*"),
  ]);
  const items = sortQueue((queue ?? []) as QueueItem[]);
  const late = items.filter((q) => q.overdue);

  return (
    <>
      <div className="we-pagehead">
        <div>
          <div className="we-eyebrow">All projects</div>
          <h1>Overview</h1>
        </div>
        <Link className="we-btn we-btn--primary" href="/certificates/new">New payment certificate</Link>
      </div>

      {((projects ?? []) as ProjectStatus[]).map((p) => (
        <section key={p.id} className="we-stack">
          <div className="we-pagehead">
            <div>
              <div className="we-eyebrow">
                {p.location} · {p.phase_count} phases · {p.unit_count} units{p.as_of ? ` · as of ${date(p.as_of)}` : ""}
              </div>
              <h2 style={{ margin: 0 }}>
                <Link href={`/projects/${p.id}`} style={{ color: "inherit", textDecoration: "none" }}>{p.name}</Link>
              </h2>
            </div>
            <Link className="we-btn we-btn--secondary we-btn--sm" href={`/projects/${p.id}`}>Open project</Link>
          </div>
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
