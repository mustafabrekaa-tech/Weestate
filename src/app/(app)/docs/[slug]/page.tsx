import Link from "next/link";
import { notFound } from "next/navigation";
import { ItemStatus } from "@/components/StatusChip";
import { getMe, getProjects, type QueueItem } from "@/lib/data";
import { canRaise, docBySlug, docHref, docRef } from "@/lib/docs";
import { date, money } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

type Row = {
  id: string;
  number: number;
  title: string;
  amount_egp: number | null;
  status: string;
  project_id: string;
  created_at: string;
  projects: { name: string } | null;
} & Record<string, unknown>;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return { title: docBySlug((await params).slug)?.plural ?? "Documents" };
}

export default async function DocList({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ project?: string; show?: string }>;
}) {
  const { slug } = await params;
  const { project, show } = await searchParams;
  const d = docBySlug(slug);
  if (!d) notFound();
  const supabase = await createClient();
  const me = await getMe();
  const projects = await getProjects();

  let q = supabase
    .from(d.table)
    .select(`id, number, title, amount_egp, status, project_id, created_at, projects(name)${d.embed ? `, ${d.embed}` : ""}`)
    .order("created_at", { ascending: false })
    .limit(500);
  if (project) q = q.eq("project_id", project);
  if (show !== "all") q = q.not("status", "in", `(${d.doneStatus},rejected)`);
  const [{ data }, { data: queue }] = await Promise.all([q, supabase.from("work_queue").select("*").eq("doc_type", d.type)]);
  const rows = (data ?? []) as unknown as Row[];
  const open = new Map(((queue ?? []) as QueueItem[]).map((x) => [x.doc_id, x]));
  const qs = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ project, show, ...o }).filter(([, v]) => v) as [string, string][]);
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  return (
    <>
      <div className="we-pagehead">
        <div>
          <div className="we-eyebrow">Workflows</div>
          <h1>{d.plural}</h1>
        </div>
        {canRaise(d, me) && (
          <Link className="we-btn we-btn--primary" href={`/docs/${slug}/new${project ? `?project=${project}` : ""}`}>
            New {d.name.toLowerCase()}
          </Link>
        )}
      </div>
      <div className="we-row">
        <Link className={`we-pill${!project ? " is-on" : ""}`} href={qs({ project: undefined })}>All projects</Link>
        {projects.map((p) => (
          <Link key={p.id} className={`we-pill${project === p.id ? " is-on" : ""}`} href={qs({ project: p.id })}>{p.name}</Link>
        ))}
        <span className="we-appbar__spacer" />
        <Link className="we-link" href={qs({ show: show === "all" ? undefined : "all" })}>
          {show === "all" ? "Show open only" : "Show closed too"}
        </Link>
      </div>
      {rows.length === 0 ? (
        <div className="we-table-wrap we-empty">No {d.plural.toLowerCase()} {show === "all" ? "yet" : "open"}.</div>
      ) : (
        <div className="we-table-wrap">
          <table className="we-table">
            <thead>
              <tr><th>Ref</th><th>Item</th><th>Raised</th><th className="num">Amount (EGP)</th><th>Status</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const w = open.get(r.id);
                return (
                  <tr key={r.id}>
                    <td><span className="we-code">{docRef(d.prefix, r.number)}</span></td>
                    <td>
                      <Link className="we-rowlink" href={docHref(d.type, r.id)}>
                        <div className="we-title">{r.title || `${d.name} #${r.number}`}</div>
                      </Link>
                      <div className="we-meta">{[r.projects?.name, d.summary(r)].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td>{date(r.created_at)}</td>
                    <td className="num">{money(r.amount_egp)}</td>
                    <td>
                      <ItemStatus
                        status={r.status}
                        department={w?.department}
                        departmentName={w?.department_name}
                        daysWaiting={w?.days_waiting}
                        overdue={w?.overdue}
                        myDepartment={me?.department}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
