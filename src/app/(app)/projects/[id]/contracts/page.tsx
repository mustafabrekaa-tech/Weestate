import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { ItemStatus } from "@/components/StatusChip";
import { getMe } from "@/lib/data";
import { docHref, docRef } from "@/lib/docs";
import { date, money, pct } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { addContract, recordPayment } from "../actions";

type Balance = {
  contract_id: string; code: string; contractor: string; value_egp: number; variations_egp: number; revised_value_egp: number;
  certified_egp: number; retention_held_egp: number; advance_recovered_egp: number; paid_egp: number; certified_pct: number;
};

export default async function ContractsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const me = await getMe();
  const [{ data: bal }, { data: certs }, { data: codes }, { data: phases }, { data: paid }] = await Promise.all([
    supabase.from("contractor_balance").select("*").eq("project_id", id).order("code"),
    supabase.from("payment_certificates").select("id, number, title, gross_egp, retention_egp, advance_recovery_egp, penalty_egp, other_deductions_egp, status, period_end, contract_id, contracts(code, contractor)").eq("project_id", id).order("period_end", { ascending: false }).limit(200),
    supabase.from("cost_codes").select("code, name").order("code"),
    supabase.from("phases").select("code, name").eq("project_id", id).order("code"),
    supabase.from("payments_out").select("certificate_id, amount_egp").eq("project_id", id),
  ]);
  const rows = (bal ?? []) as Balance[];
  const paidBy = new Map<string, number>();
  for (const p of paid ?? []) if (p.certificate_id) paidBy.set(p.certificate_id, (paidBy.get(p.certificate_id) ?? 0) + Number(p.amount_egp));
  const canAdd = me?.is_admin || ["procurement", "pm"].includes(me?.department ?? "");
  const isFinance = me?.is_admin || me?.department === "finance";
  const toPay = (certs ?? []).filter((c) => ["approved", "paid"].includes(c.status));

  return (
    <>
      <section className="we-stack">
        <div className="we-pagehead">
          <h2 style={{ margin: 0 }}>Contractor balances <small>EGP</small></h2>
          <div className="we-row">
            <Link className="we-btn we-btn--secondary we-btn--sm" href={`/docs/variations/new?project=${id}`}>New variation</Link>
            <Link className="we-btn we-btn--primary we-btn--sm" href={`/docs/certificates/new?project=${id}`}>New payment certificate</Link>
          </div>
        </div>
        <div className="we-table-wrap">
          <table className="we-table">
            <thead><tr><th>Contract</th><th className="num">Value</th><th className="num">Variations</th><th className="num">Revised</th><th className="num">Certified</th><th className="num">%</th><th className="num">Retention held</th><th className="num">Paid</th><th className="num">Balance to certify</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={9} className="we-empty">No contracts yet.</td></tr>}
              {rows.map((c) => (
                <tr key={c.contract_id}>
                  <td><span className="we-code">{c.code}</span><div className="we-title">{c.contractor}</div></td>
                  <td className="num">{money(c.value_egp)}</td>
                  <td className="num">{money(c.variations_egp)}</td>
                  <td className="num">{money(c.revised_value_egp)}</td>
                  <td className="num">{money(c.certified_egp)}</td>
                  <td className="num">{pct(c.certified_pct)}</td>
                  <td className="num">{money(c.retention_held_egp)}</td>
                  <td className="num">{money(c.paid_egp)}</td>
                  <td className="num">{money(Number(c.revised_value_egp) - Number(c.certified_egp))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="we-stack">
        <h2 style={{ margin: 0 }}>Payment certificates</h2>
        <div className="we-table-wrap">
          <table className="we-table">
            <thead><tr><th>Ref</th><th>Contract</th><th>Period</th><th className="num">Gross</th><th className="num">Net</th><th className="num">Paid</th><th>Status</th></tr></thead>
            <tbody>
              {(certs ?? []).length === 0 && <tr><td colSpan={7} className="we-empty">No certificates yet.</td></tr>}
              {(certs ?? []).map((c) => {
                const k = c.contracts as unknown as { code: string; contractor: string } | null;
                const net = c.gross_egp - c.retention_egp - c.advance_recovery_egp - c.penalty_egp - c.other_deductions_egp;
                return (
                  <tr key={c.id}>
                    <td><Link href={docHref("payment_certificate", c.id)} className="we-code">{docRef("PC", c.number)}</Link></td>
                    <td>{k?.code} · {k?.contractor}</td>
                    <td>{date(c.period_end)}</td>
                    <td className="num">{money(c.gross_egp)}</td>
                    <td className="num">{money(net)}</td>
                    <td className="num">{money(paidBy.get(c.id) ?? 0)}</td>
                    <td><ItemStatus status={c.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="we-grid">
        {isFinance && toPay.length > 0 && (
          <section className="we-card">
            <h2>Record a payment</h2>
            <ActionForm action={recordPayment.bind(null, id)} className="we-stack" resetOnOk>
              <div className="we-field">
                <label htmlFor="certificate_id">Certificate</label>
                <select id="certificate_id" name="certificate_id" className="we-input we-select" required>
                  {toPay.map((c) => <option key={c.id} value={c.id}>{docRef("PC", c.number)} · {(c.contracts as unknown as { contractor: string } | null)?.contractor} · {money(c.gross_egp)}</option>)}
                </select>
              </div>
              <div className="we-form-grid">
                <div className="we-field"><label htmlFor="pamount">Amount (EGP)</label><input id="pamount" name="amount_egp" className="we-input we-mono" inputMode="decimal" required /></div>
                <div className="we-field"><label htmlFor="paid_on">Paid on</label><input id="paid_on" name="paid_on" type="date" className="we-input" /></div>
                <div className="we-field"><label htmlFor="reference">Cheque or transfer ref.</label><input id="reference" name="reference" className="we-input" /></div>
              </div>
              <div><button className="we-btn we-btn--primary">Record payment</button></div>
            </ActionForm>
          </section>
        )}

        {canAdd && (
          <section className="we-card">
            <h2>Add a contract</h2>
            <ActionForm action={addContract.bind(null, id)} className="we-form-grid" resetOnOk>
              <div className="we-field"><label htmlFor="ccode">Contract code</label><input id="ccode" name="code" className="we-input we-mono" required placeholder="C-02-MC" /></div>
              <div className="we-field"><label htmlFor="contractor">Contractor</label><input id="contractor" name="contractor" className="we-input" required /></div>
              <div className="we-field" style={{ gridColumn: "1 / -1" }}><label htmlFor="scope">Scope</label><input id="scope" name="scope" className="we-input" /></div>
              <div className="we-field"><label htmlFor="value_egp">Value (EGP)</label><input id="value_egp" name="value_egp" className="we-input we-mono" inputMode="decimal" required /></div>
              <div className="we-field"><label htmlFor="retention_pct">Retention %</label><input id="retention_pct" name="retention_pct" className="we-input we-mono" defaultValue="5" /></div>
              <div className="we-field"><label htmlFor="advance_pct">Advance recovery %</label><input id="advance_pct" name="advance_pct" className="we-input we-mono" defaultValue="0" /></div>
              <div className="we-field">
                <label htmlFor="kind">Type</label>
                <select id="kind" name="kind" className="we-input we-select">
                  <option value="main">Main contract</option><option value="subcontract">Subcontract</option><option value="supply">Supply</option>
                  <option value="consultancy">Consultancy</option><option value="facility">Facility management</option><option value="other">Other</option>
                </select>
              </div>
              <div className="we-field">
                <label htmlFor="ccost">Cost code</label>
                <select id="ccost" name="cost_code" className="we-input we-select">
                  <option value="">None</option>
                  {(codes ?? []).map((c) => <option key={c.code} value={c.code}>{c.code} {c.name}</option>)}
                </select>
              </div>
              <div className="we-field">
                <label htmlFor="cphase">Phase</label>
                <select id="cphase" name="phase" className="we-input we-select">
                  <option value="">Whole project</option>
                  {(phases ?? []).map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
                </select>
              </div>
              <div className="we-field"><label htmlFor="cstart">Start</label><input id="cstart" name="start_date" type="date" className="we-input" /></div>
              <div className="we-field"><label htmlFor="cfinish">Finish</label><input id="cfinish" name="finish_date" type="date" className="we-input" /></div>
              <div className="we-field" style={{ alignSelf: "end" }}><button className="we-btn we-btn--primary">Save contract</button></div>
            </ActionForm>
          </section>
        )}
      </div>
    </>
  );
}
