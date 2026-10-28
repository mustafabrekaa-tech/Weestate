import { notFound } from "next/navigation";
import { Kpis, type ProjectStatus } from "@/components/Kpis";
import { QueueTable } from "@/components/QueueTable";
import { getMe, sortQueue, type QueueItem } from "@/lib/data";
import { date, money, pct } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

type Phase = { id: string; code: string; name: string; budget_egp: number; finish_date: string | null };
type Progress = { phase_id: string; period: string; planned_pct: number; actual_pct: number };
type Contract = { id: string; code: string; contractor: string; scope: string; value_egp: number; phase_id: string | null };

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const me = await getMe();
  const [{ data: p }, { data: phases }, { data: progress }, { data: contracts }, { data: queue }, { data: units }] =
    await Promise.all([
      supabase.from("project_status").select("*").eq("id", id).maybeSingle(),
      supabase.from("phases").select("*").eq("project_id", id).order("code"),
      supabase.from("progress_updates").select("phase_id, period, planned_pct, actual_pct").order("period", { ascending: false }),
      supabase.from("contracts").select("*").eq("project_id", id).order("code"),
      supabase.from("work_queue").select("*").eq("project_id", id),
      supabase.from("units").select("status").eq("project_id", id),
    ]);
  if (!p) notFound();
  const project = p as ProjectStatus;
  const latest = new Map<string, Progress>();
  for (const r of (progress ?? []) as Progress[]) if (!latest.has(r.phase_id)) latest.set(r.phase_id, r);
  const unitCounts = ((units ?? []) as { status: string }[]).reduce<Record<string, number>>((acc, u) => {
    acc[u.status] = (acc[u.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <div className="we-pagehead">
        <div>
          <div className="we-eyebrow">
            {project.location} · {project.phase_count} phases · {project.unit_count} units
          </div>
          <h1>{project.name}</h1>
        </div>
      </div>
      <Kpis p={project} />

      <section className="we-stack">
        <h2 style={{ margin: 0 }}>Waiting items</h2>
        <QueueTable items={sortQueue((queue ?? []) as QueueItem[])} myDepartment={me?.department} />
      </section>

      <div className="we-grid">
        <section className="we-card">
          <h2>Phases <small>latest monthly progress</small></h2>
          <div className="we-table-wrap">
            <table className="we-table">
              <thead><tr><th>Phase</th><th className="num">Actual</th><th className="num">Plan</th><th className="num">SPI</th></tr></thead>
              <tbody>
                {((phases ?? []) as Phase[]).map((ph) => {
                  const l = latest.get(ph.id);
                  return (
                    <tr key={ph.id}>
                      <td><div className="we-title">{ph.name}</div><div className="we-meta">Finish {date(ph.finish_date)}</div></td>
                      <td className="num">{pct(l?.actual_pct)}</td>
                      <td className="num">{pct(l?.planned_pct)}</td>
                      <td className="num">{l && l.planned_pct > 0 ? (l.actual_pct / l.planned_pct).toFixed(2) : "–"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
        <section className="we-card">
          <h2>Units <small>{project.unit_count} in total</small></h2>
          <dl className="we-dl">
            {["available", "reserved", "sold", "handed_over"].map((s) => (
              <div key={s} style={{ display: "contents" }}>
                <dt>{s === "handed_over" ? "Handed over" : s[0]!.toUpperCase() + s.slice(1)}</dt>
                <dd className="we-mono">{unitCounts[s] ?? 0}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <section className="we-card">
        <h2>Contracts</h2>
        <div className="we-table-wrap">
          <table className="we-table">
            <thead><tr><th>Code</th><th>Contractor</th><th className="num">Value (EGP)</th></tr></thead>
            <tbody>
              {((contracts ?? []) as Contract[]).map((c) => (
                <tr key={c.id}>
                  <td><span className="we-code">{c.code}</span></td>
                  <td><div className="we-title">{c.contractor}</div><div className="we-meta">{c.scope}</div></td>
                  <td className="num">{money(c.value_egp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
