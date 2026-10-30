import Link from "next/link";
import { Fragment } from "react";
import { ActionForm } from "@/components/ActionForm";
import { Kpi } from "@/components/Kpis";
import { getMe, acts } from "@/lib/data";
import { money } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { approveBudget, saveBudgetLine } from "../actions";

type Line = {
  cost_code_id: string; code: string; name: string; parent_code: string | null;
  budget_egp: number; committed_egp: number; certified_egp: number; paid_egp: number; uncommitted_egp: number;
};

export default async function BudgetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const me = await getMe();
  const [{ data: report }, { data: budgets }, { data: codes }, { data: phases }, { data: proj }] = await Promise.all([
    supabase.from("cost_report").select("*").eq("project_id", id),
    supabase.from("budgets").select("*").eq("project_id", id).order("version", { ascending: false }),
    supabase.from("cost_codes").select("code, name, parent_code, company_id").order("code"),
    supabase.from("phases").select("code, name").eq("project_id", id).order("code"),
    supabase.from("project_status").select("bac_egp, ev_egp, ac_egp, eac_egp, cpi").eq("id", id).maybeSingle(),
  ]);
  const lines = (report ?? []) as Line[];
  const current = (budgets ?? []).find((b) => b.status !== "superseded");
  const canEdit = acts(me, ["cost_control", "finance"]);

  // Roll sub-codes up to their main code.
  const main = new Map<string, Line & { children: Line[] }>();
  const allCodes = (codes ?? []) as { code: string; name: string; parent_code: string | null }[];
  for (const l of lines) {
    const top = l.parent_code ?? l.code;
    if (!main.has(top)) {
      const c = allCodes.find((x) => x.code === top);
      main.set(top, { cost_code_id: "", code: top, name: c?.name ?? top, parent_code: null, budget_egp: 0, committed_egp: 0, certified_egp: 0, paid_egp: 0, uncommitted_egp: 0, children: [] });
    }
    const m = main.get(top)!;
    for (const k of ["budget_egp", "committed_egp", "certified_egp", "paid_egp", "uncommitted_egp"] as const) m[k] += Number(l[k]);
    if (l.parent_code) m.children.push(l);
  }
  const groups = [...main.values()].sort((a, b) => a.code.localeCompare(b.code));
  const sum = (k: keyof Line) => lines.reduce((a, l) => a + Number(l[k]), 0);

  return (
    <>
      <div className="we-kpis">
        <Kpi label="Budget" value={money(sum("budget_egp"))} note={current ? `Version ${current.version} · ${current.status}` : "No budget yet"} />
        <Kpi label="Committed" value={money(sum("committed_egp"))} note="Contracts, issued variations and POs" />
        <Kpi label="Certified" value={money(sum("certified_egp"))} note="Payment certificates raised" />
        <Kpi label="Paid" value={money(sum("paid_egp"))} note="Payments recorded by Finance" />
        <Kpi label="CPI" value={proj?.cpi != null ? Number(proj.cpi).toFixed(2) : "–"} note={proj?.eac_egp ? `Forecast ${money(proj.eac_egp)}` : "Needs progress and cost"} />
      </div>

      <section className="we-stack">
        <div className="we-pagehead">
          <h2 style={{ margin: 0 }}>Cost report <small>EGP, by cost code</small></h2>
          <div className="we-row">
            {current?.status === "approved" && (
              <Link className="we-btn we-btn--secondary we-btn--sm" href={`/docs/budget-revisions/new?project=${id}`}>Request a budget revision</Link>
            )}
            {current?.status === "draft" && canEdit && (
              <ActionForm action={approveBudget.bind(null, id, current.id)} className="">
                <button className="we-btn we-btn--primary we-btn--sm">Approve this budget</button>
              </ActionForm>
            )}
          </div>
        </div>
        {groups.length === 0 ? (
          <div className="we-table-wrap we-empty">No budget yet. Add lines below, or import them on the Import tab.</div>
        ) : (
          <div className="we-table-wrap">
            <table className="we-table">
              <thead><tr><th>Cost code</th><th className="num">Budget</th><th className="num">Committed</th><th className="num">Uncommitted</th><th className="num">Certified</th><th className="num">Paid</th></tr></thead>
              <tbody>
                {groups.map((g) => (
                  <Fragment key={g.code}>
                    <tr className="we-row--group">
                      <td><span className="we-code">{g.code}</span> <b>{g.name}</b></td>
                      <td className="num">{money(g.budget_egp)}</td>
                      <td className="num">{money(g.committed_egp)}</td>
                      <td className={`num${g.uncommitted_egp < 0 ? " is-bad" : ""}`}>{money(g.uncommitted_egp)}</td>
                      <td className="num">{money(g.certified_egp)}</td>
                      <td className="num">{money(g.paid_egp)}</td>
                    </tr>
                    {g.children.map((c) => (
                      <tr key={c.code}>
                        <td style={{ paddingLeft: 28 }}><span className="we-code">{c.code}</span> {c.name}</td>
                        <td className="num">{money(c.budget_egp)}</td>
                        <td className="num">{money(c.committed_egp)}</td>
                        <td className={`num${c.uncommitted_egp < 0 ? " is-bad" : ""}`}>{money(c.uncommitted_egp)}</td>
                        <td className="num">{money(c.certified_egp)}</td>
                        <td className="num">{money(c.paid_egp)}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
                <tr className="we-row--total">
                  <td><b>Total</b></td>
                  <td className="num">{money(sum("budget_egp"))}</td>
                  <td className="num">{money(sum("committed_egp"))}</td>
                  <td className="num">{money(sum("uncommitted_egp"))}</td>
                  <td className="num">{money(sum("certified_egp"))}</td>
                  <td className="num">{money(sum("paid_egp"))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canEdit && current?.status !== "approved" && (
        <section className="we-card">
          <h2>Add or change a budget line</h2>
          <ActionForm action={saveBudgetLine.bind(null, id)} className="we-form-grid" resetOnOk>
            <div className="we-field">
              <label htmlFor="cost_code">Cost code</label>
              <select id="cost_code" name="cost_code" className="we-input we-select" required>
                {allCodes.map((c) => <option key={c.code} value={c.code}>{c.parent_code ? "  " : ""}{c.code} {c.name}</option>)}
              </select>
            </div>
            <div className="we-field">
              <label htmlFor="phase">Phase <span className="we-help">· optional</span></label>
              <select id="phase" name="phase" className="we-input we-select">
                <option value="">Whole project</option>
                {(phases ?? []).map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
              </select>
            </div>
            <div className="we-field">
              <label htmlFor="amount_egp">Amount (EGP)</label>
              <input id="amount_egp" name="amount_egp" className="we-input we-mono" inputMode="decimal" required />
            </div>
            <div className="we-field" style={{ alignSelf: "end" }}>
              <button className="we-btn we-btn--primary">Save line</button>
            </div>
          </ActionForm>
        </section>
      )}
    </>
  );
}

