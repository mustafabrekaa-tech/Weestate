import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { getMe, getSteps, type Department } from "@/lib/data";
import { DOCS, docByType } from "@/lib/docs";
import { createClient } from "@/lib/supabase/server";
import { customizeSteps, removeLastStep, saveStep, useDefaultSteps } from "../actions";
import { Select } from "@/components/Select";

export const metadata: Metadata = { title: "Workflow steps" };

export default async function WorkflowsPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const me = await getMe();
  if (!me?.is_admin || !me.company_id) redirect("/");
  const { type = "payment_certificate" } = await searchParams;
  const d = docByType(type) ?? DOCS[0]!;
  const supabase = await createClient();
  const [steps, { data: depts }] = await Promise.all([getSteps(d.type, me.company_id), supabase.from("departments").select("*").order("sort")]);
  const own = steps.some((s) => s.company_id === me.company_id);
  const c = me.company_id;

  return (
    <>
      <div className="we-pagehead"><div><div className="we-eyebrow">Admin</div><h1>Workflow steps</h1></div></div>
      <div className="we-row">
        {DOCS.map((x) => <Link key={x.type} className={`we-pill${x.type === d.type ? " is-on" : ""}`} href={`/admin/workflows?type=${x.type}`}>{x.plural}</Link>)}
      </div>
      <section className="we-card we-stack">
        <div className="we-pagehead">
          <h2 style={{ margin: 0 }}>{d.plural} <small>{own ? "your own steps" : "standard steps"}</small></h2>
          {own ? (
            <ActionForm action={useDefaultSteps.bind(null, c, d.type)} className=""><button className="we-link">Go back to the standard steps</button></ActionForm>
          ) : (
            <ActionForm action={customizeSteps.bind(null, c, d.type)} className=""><button className="we-btn we-btn--secondary we-btn--sm">Change these steps</button></ActionForm>
          )}
        </div>
        <div className="we-table-wrap">
          <table className="we-table we-table--inputs">
            <thead><tr><th>#</th><th>Step</th></tr></thead>
            <tbody>
              {[...steps, ...(own ? [null] : [])].map((s) => (
                <tr key={s?.seq ?? "new"}>
                  <td style={{ width: 1 }}><b>{s?.seq ?? "+"}</b></td>
                  <td>
                    {own ? (
                      <ActionForm action={saveStep.bind(null, c, d.type)} className="we-row" resetOnOk={!s}>
                        <input type="hidden" name="id" value={(s as { id?: string } | null)?.id ?? ""} />
                        <input name="name" className="we-input" defaultValue={s?.name} placeholder="Step name" style={{ maxWidth: 200 }} aria-label="Step name" />
                        <Select name="department" className="we-input we-select" defaultValue={s?.department} style={{ maxWidth: 200 }} aria-label="Department">
                          {((depts ?? []) as Department[]).map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}
                        </Select>
                        <input name="action" className="we-input" defaultValue={s?.action} placeholder="Button, e.g. Approve" style={{ maxWidth: 200 }} aria-label="Button label" />
                        <input name="due_days" className="we-input we-mono" defaultValue={s?.due_days ?? 2} style={{ maxWidth: 70 }} aria-label="Days allowed" />
                        <span className="we-help">days</span>
                        <label className="we-row" style={{ gap: 6 }}><input type="checkbox" name="only_above_limit" defaultChecked={s?.only_above_limit} /> only above the limit</label>
                        <button className="we-btn we-btn--secondary we-btn--sm">{s ? "Save" : "Add step"}</button>
                      </ActionForm>
                    ) : (
                      <span><b>{s!.name}</b> <span className="we-help">· {s!.departments?.name} · {s!.due_days} days{s!.only_above_limit ? " · only above the approval limit" : ""}</span></span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {own && (
          <ActionForm action={removeLastStep.bind(null, c, d.type, d.table)} className="">
            <button className="we-btn we-btn--danger we-btn--sm">Remove the last step</button>
          </ActionForm>
        )}
      </section>
    </>
  );
}
