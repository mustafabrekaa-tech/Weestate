import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { ActionPanel } from "@/components/ActionPanel";
import { FieldInput } from "@/components/FieldInput";
import { ItemStatus } from "@/components/StatusChip";
import { WorkflowSteps, type Step } from "@/components/WorkflowSteps";
import { getMe, getSteps, refOptions, type Option, type QueueItem } from "@/lib/data";
import { canRaise, docBySlug, docRef, type Field } from "@/lib/docs";
import { date, dateTime, money } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { deleteDraft, docAction, updateDraft } from "../../actions";

type Event = { id: number; action: string; from_step: number | null; to_step: number | null; comment: string; actor: string | null; created_at: string };

const verbs: Record<string, string> = {
  create: "Drafted",
  submit: "Submitted",
  forward: "Sent on",
  skip: "Skipped",
  return: "Returned",
  reject: "Rejected",
  pay: "Marked as paid",
  done: "Closed",
  comment: "Commented",
};

export default async function DocPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const d = docBySlug(slug);
  if (!d) notFound();
  const supabase = await createClient();
  const me = await getMe();
  const [{ data: raw }, { data: events }, { data: q }] = await Promise.all([
    supabase.from(d.table).select(`*, projects(name, company_id)${d.embed ? `, ${d.embed}` : ""}`).eq("id", id).maybeSingle(),
    supabase.from("workflow_events").select("*").eq("doc_type", d.type).eq("doc_id", id).order("created_at").order("id"),
    supabase.from("work_queue").select("*").eq("doc_type", d.type).eq("doc_id", id).maybeSingle(),
  ]);
  if (!raw) notFound();
  const doc = raw as unknown as Record<string, unknown> & {
    id: string; number: number; title: string; status: string; step: number; project_id: string; amount_egp: number | null;
    projects: { name: string; company_id: string } | null;
  };
  const companyId = doc.projects?.company_id ?? "";
  const steps = await getSteps(d.type, companyId);
  const evs = (events ?? []) as Event[];
  const queue = q as QueueItem | null;

  const actorIds = [...new Set(evs.map((e) => e.actor).filter(Boolean))] as string[];
  const { data: people } = actorIds.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", actorIds)
    : { data: [] };
  const who = new Map(((people ?? []) as { id: string; full_name: string; email: string }[]).map((p) => [p.id, p.full_name || p.email]));

  const doneBy: Record<number, string> = {};
  for (const e of evs) {
    if (["submit", "forward", "pay", "done"].includes(e.action) && e.from_step != null) {
      doneBy[e.from_step] = `${who.get(e.actor ?? "") ?? "Someone"} · ${date(e.created_at)}`;
    }
    if (e.action === "skip" && e.from_step != null) doneBy[e.from_step] = "Skipped, below the limit";
  }

  const current = steps.find((s) => s.seq === doc.step);
  const closed = [d.doneStatus, "rejected"].includes(doc.status);
  const myTurn = !closed && current && (me?.is_admin || me?.department === current.department);
  const lastReturn = [...evs].reverse().find((e) => e.action === "return");
  const editable = doc.step === 1 && ["draft", "returned"].includes(doc.status) && canRaise(d, me);

  // Labels for reference fields.
  const sources = [...new Set([...d.fields, ...(d.lines?.columns ?? [])].map((f) => f.ref).filter(Boolean))] as string[];
  const opts: Record<string, Option[]> = {};
  await Promise.all(sources.map(async (s) => (opts[s] = await refOptions(s === "units_available" || s === "units_sold" ? "units" : s, doc.project_id, companyId))));
  const show = (f: Field, v: unknown) => {
    if (v == null || v === "") return "–";
    if (f.kind === "money") return money(Number(v));
    if (f.kind === "date") return date(String(v));
    if (f.kind === "datetime") return dateTime(String(v));
    if (f.kind === "check") return v ? "Yes" : "No";
    if (f.kind === "select") return f.options?.find(([k]) => k === v)?.[1] ?? String(v);
    if (f.kind === "ref") return opts[f.ref!]?.find((o) => o.value === v)?.label ?? "–";
    return String(v);
  };

  const { data: lineRows } = d.lines
    ? await supabase.from(d.lines.table).select("*").eq(d.lines.fk, id)
    : { data: null };
  const { data: instalments } =
    d.type === "unit_sale" ? await supabase.from("instalments").select("*").eq("sale_id", id).order("seq") : { data: null };

  const pc = d.type === "payment_certificate" ? (doc as unknown as Record<string, number>) : null;
  const net = pc ? pc.gross_egp - pc.retention_egp - pc.advance_recovery_egp - pc.penalty_egp - pc.other_deductions_egp : null;
  const visibleFields = d.fields.filter((f) => !f.name.startsWith("new_customer_"));

  return (
    <>
      <div className="we-pagehead">
        <div>
          <div className="we-eyebrow">{doc.projects?.name} · {d.name} · {docRef(d.prefix, doc.number)}</div>
          <h1>{doc.title || `${d.name} #${doc.number}`}</h1>
        </div>
        <ItemStatus
          status={doc.status}
          department={queue?.department}
          departmentName={queue?.department_name}
          daysWaiting={queue?.days_waiting}
          overdue={queue?.overdue}
          myDepartment={me?.department}
        />
      </div>

      <section className="we-card we-stack">
        <WorkflowSteps
          steps={steps.map<Step>((s) => ({ seq: s.seq, name: s.name, department_name: s.departments?.name ?? s.department }))}
          current={doc.step}
          status={doc.status === d.doneStatus ? "done" : doc.status}
          done={doneBy}
          label={`${d.name} workflow`}
        />
        {doc.status === "returned" && lastReturn && (
          <div className="we-banner we-banner--error">
            Returned by {who.get(lastReturn.actor ?? "") ?? "a reviewer"}: “{lastReturn.comment}”
          </div>
        )}
      </section>

      {myTurn && current && (
        <ActionPanel
          action={docAction.bind(null, d.type, id)}
          forwardLabel={doc.step === 1 ? (doc.status === "returned" ? "Send again" : current.action) : current.action}
          canReturn={doc.step > 1}
          note={current.only_above_limit ? "This step applies because the amount is above your company's approval limit." : undefined}
        />
      )}

      <div className="we-grid">
        <section className="we-card">
          <h2>Details</h2>
          <dl className="we-dl">
            {visibleFields.map((f) => (
              <div key={f.name} style={{ display: "contents" }}>
                <dt>{f.label}</dt>
                <dd className={f.kind === "money" ? "we-mono" : undefined}>{show(f, doc[f.name])}</dd>
              </div>
            ))}
            {pc && (
              <>
                <dt>Retention (EGP)</dt><dd className="we-mono">{money(pc.retention_egp)}</dd>
                <dt>Advance recovery (EGP)</dt><dd className="we-mono">{money(pc.advance_recovery_egp)}</dd>
                <dt>Net payable (EGP)</dt><dd className="we-mono"><b>{money(net)}</b></dd>
              </>
            )}
            {d.lines && (
              <>
                <dt>Total (EGP)</dt><dd className="we-mono"><b>{money(doc.amount_egp)}</b></dd>
              </>
            )}
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
                    ? ` to ${steps.find((s) => s.seq === e.to_step)?.departments?.name ?? ""}`
                    : e.action === "skip"
                      ? ` ${steps.find((s) => s.seq === e.from_step)?.name ?? ""}`
                      : ""}
                  <small>{who.get(e.actor ?? "") ?? "System"} · {dateTime(e.created_at)}</small>
                  {e.comment && <blockquote>{e.comment}</blockquote>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {d.lines && (lineRows?.length ?? 0) > 0 && (
        <section className="we-card we-stack">
          <h2 style={{ margin: 0 }}>{d.lines.label}</h2>
          <div className="we-table-wrap">
            <table className="we-table">
              <thead><tr>{d.lines.columns.map((c) => <th key={c.name} className={c.kind === "money" ? "num" : undefined}>{c.label}</th>)}{"amount_egp" in (lineRows![0] ?? {}) && <th className="num">Amount (EGP)</th>}</tr></thead>
              <tbody>
                {(lineRows as Record<string, unknown>[]).map((l) => (
                  <tr key={String(l.id)}>
                    {d.lines!.columns.map((c) => <td key={c.name} className={c.kind === "money" ? "num" : undefined}>{show(c, l[c.name])}</td>)}
                    {"amount_egp" in l && <td className="num">{money(Number(l.amount_egp))}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {instalments && instalments.length > 0 && (
        <section className="we-card we-stack">
          <h2 style={{ margin: 0 }}>Instalments <small>{instalments.length}</small></h2>
          <div className="we-table-wrap">
            <table className="we-table">
              <thead><tr><th>#</th><th>Due</th><th className="num">Amount (EGP)</th><th className="num">Paid (EGP)</th></tr></thead>
              <tbody>
                {instalments.map((i) => (
                  <tr key={i.id}><td>{i.seq}</td><td>{date(i.due_date)}</td><td className="num">{money(i.amount_egp)}</td><td className="num">{money(i.paid_egp)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {editable && (
        <details className="we-card">
          <summary><b>Change this {doc.status === "returned" ? "returned document" : "draft"}</b></summary>
          <ActionForm action={updateDraft.bind(null, slug, id)} className="we-stack" >
            <div className="we-form-grid">
              {visibleFields.map((f) => (
                <div key={f.name} style={f.kind === "textarea" ? { gridColumn: "1 / -1" } : undefined}>
                  <FieldInput field={f} options={f.ref ? opts[f.ref] : undefined} value={f.kind === "datetime" && doc[f.name] ? String(doc[f.name]).slice(0, 16) : doc[f.name]} />
                </div>
              ))}
            </div>
            <div className="we-row">
              <button className="we-btn we-btn--primary">Save changes</button>
            </div>
          </ActionForm>
          {doc.status === "draft" && (
            <form action={deleteDraft.bind(null, slug, id)} style={{ marginTop: 16 }}>
              <button className="we-btn we-btn--danger we-btn--sm">Delete draft</button>
            </form>
          )}
        </details>
      )}
    </>
  );
}
