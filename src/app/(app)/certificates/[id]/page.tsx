import { notFound } from "next/navigation";
import { ItemStatus } from "@/components/StatusChip";
import { WorkflowSteps, type Step } from "@/components/WorkflowSteps";
import { getMe, type QueueItem } from "@/lib/data";
import { certRef, date, dateTime, money } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { ActionPanel } from "./ActionPanel";

type Cert = {
  id: string;
  number: number;
  period_end: string;
  gross_egp: number;
  retention_egp: number;
  net_egp: number;
  description: string;
  status: string;
  step: number;
  contracts: { code: string; contractor: string; scope: string } | null;
  projects: { name: string } | null;
};
type StepRow = { seq: number; name: string; action: string; department: string; departments: { name: string } | null };
type Event = { id: number; action: string; from_step: number | null; to_step: number | null; comment: string; actor: string | null; created_at: string };

const verbs: Record<string, string> = {
  create: "Drafted",
  submit: "Submitted",
  forward: "Sent on",
  return: "Returned to site",
  reject: "Rejected",
  pay: "Marked as paid",
  comment: "Commented",
};

export default async function CertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const me = await getMe();
  const [{ data: c }, { data: steps }, { data: events }, { data: q }] = await Promise.all([
    supabase
      .from("payment_certificates")
      .select("*, contracts(code, contractor, scope), projects(name)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("workflow_steps").select("seq, name, action, department, departments(name)").eq("doc_type", "payment_certificate").order("seq"),
    supabase.from("workflow_events").select("*").eq("doc_type", "payment_certificate").eq("doc_id", id).order("created_at"),
    supabase.from("work_queue").select("*").eq("doc_id", id).maybeSingle(),
  ]);
  if (!c) notFound();
  const cert = c as unknown as Cert;
  const stepRows = (steps ?? []) as unknown as StepRow[];
  const evs = (events ?? []) as Event[];
  const queue = q as QueueItem | null;

  const actorIds = [...new Set(evs.map((e) => e.actor).filter(Boolean))] as string[];
  const { data: people } = actorIds.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", actorIds)
    : { data: [] };
  const who = new Map(((people ?? []) as { id: string; full_name: string; email: string }[]).map((p) => [p.id, p.full_name || p.email]));

  // Who finished each step, and when, for the stepper.
  const done: Record<number, string> = {};
  for (const e of evs) {
    if (["submit", "forward", "pay"].includes(e.action) && e.from_step != null) {
      done[e.from_step] = `${who.get(e.actor ?? "") ?? "Someone"} · ${date(e.created_at)}`;
    }
  }

  const current = stepRows.find((s) => s.seq === cert.step);
  const open = !["paid", "rejected"].includes(cert.status);
  const myTurn = open && current && (me?.is_admin || me?.department === current.department);
  const lastReturn = [...evs].reverse().find((e) => e.action === "return");

  return (
    <>
      <div className="we-pagehead">
        <div>
          <div className="we-eyebrow">
            {cert.projects?.name} · {cert.contracts?.code} · {certRef(cert.number)}
          </div>
          <h1>Payment certificate #{cert.number}</h1>
        </div>
        <ItemStatus
          status={cert.status}
          department={queue?.department}
          departmentName={queue?.department_name}
          daysWaiting={queue?.days_waiting}
          overdue={queue?.overdue}
          myDepartment={me?.department}
        />
      </div>

      <section className="we-card we-stack">
        <WorkflowSteps
          steps={stepRows.map<Step>((s) => ({ seq: s.seq, name: s.name, department_name: s.departments?.name ?? s.department }))}
          current={cert.step}
          status={cert.status}
          done={done}
          label={`Payment certificate #${cert.number} workflow`}
        />
        {cert.status === "returned" && lastReturn && (
          <div className="we-banner we-banner--error">
            Returned by {who.get(lastReturn.actor ?? "") ?? "a reviewer"}: “{lastReturn.comment}”
          </div>
        )}
      </section>

      {myTurn && current && (
        <ActionPanel id={cert.id} forwardLabel={current.action} canReturn={cert.step > 1} />
      )}

      <div className="we-grid">
        <section className="we-card">
          <h2>Details</h2>
          <dl className="we-dl">
            <dt>Contractor</dt><dd>{cert.contracts?.contractor}</dd>
            <dt>Scope</dt><dd>{cert.contracts?.scope}</dd>
            <dt>Period ending</dt><dd>{date(cert.period_end)}</dd>
            <dt>Gross (EGP)</dt><dd className="we-mono">{money(cert.gross_egp)}</dd>
            <dt>Retention (EGP)</dt><dd className="we-mono">{money(cert.retention_egp)}</dd>
            <dt>Net (EGP)</dt><dd className="we-mono"><b>{money(cert.net_egp)}</b></dd>
            {cert.description && (<><dt>Covers</dt><dd>{cert.description}</dd></>)}
          </dl>
        </section>
        <section className="we-card">
          <h2>History</h2>
          <ol className="we-timeline">
            {evs.map((e) => (
              <li key={e.id} className={`is-${e.action}`}>
                <div>
                  <b>{verbs[e.action] ?? e.action}</b>
                  {e.action === "forward" || e.action === "submit"
                    ? ` to ${stepRows.find((s) => s.seq === e.to_step)?.departments?.name ?? ""}`
                    : ""}
                  <small>{who.get(e.actor ?? "") ?? "System"} · {dateTime(e.created_at)}</small>
                  {e.comment && <blockquote>{e.comment}</blockquote>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  );
}
