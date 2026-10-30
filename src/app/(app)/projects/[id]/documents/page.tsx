import Link from "next/link";
import { QueueTable } from "@/components/QueueTable";
import { getMe, sortQueue, type QueueItem } from "@/lib/data";
import { canRaise, DOCS } from "@/lib/docs";
import { createClient } from "@/lib/supabase/server";

export default async function ProjectDocuments({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const me = await getMe();
  const { data } = await supabase.from("work_queue").select("*").eq("project_id", id);
  const items = sortQueue((data ?? []) as QueueItem[]);
  return (
    <>
      <section className="we-card we-stack">
        <h2 style={{ margin: 0 }}>Raise a document</h2>
        <div className="we-row">
          {DOCS.filter((d) => canRaise(d, me)).map((d) => (
            <Link key={d.type} className="we-btn we-btn--secondary we-btn--sm" href={`/docs/${d.slug}/new?project=${id}`}>{d.name}</Link>
          ))}
        </div>
      </section>
      <section className="we-stack">
        <h2 style={{ margin: 0 }}>Open in this project <small>{items.length}</small></h2>
        <QueueTable items={items} myDepartment={me?.department} />
      </section>
      <section className="we-row">
        {DOCS.map((d) => <Link key={d.type} className="we-pill" href={`/docs/${d.slug}?project=${id}&show=all`}>All {d.plural.toLowerCase()}</Link>)}
      </section>
    </>
  );
}
