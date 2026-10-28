import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { getMe } from "@/lib/data";
import { DOCS } from "@/lib/docs";
import { money } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { saveLimit } from "../actions";

export const metadata: Metadata = { title: "Approval limits" };
const WITH_LIMIT = ["payment_certificate", "variation_order", "purchase_request", "budget_revision"];

export default async function LimitsPage() {
  const me = await getMe();
  if (!me?.is_admin || !me.company_id) redirect("/");
  const supabase = await createClient();
  const { data } = await supabase.from("approval_limits").select("*").eq("company_id", me.company_id);
  const limits = new Map((data ?? []).map((l) => [l.doc_type, l]));
  return (
    <>
      <div className="we-pagehead"><div><div className="we-eyebrow">Admin</div><h1>Approval limits</h1></div></div>
      <p className="we-help" style={{ margin: 0 }}>Above these amounts the executive approval step applies. Below them it is skipped and the skip is recorded in the history.</p>
      <div className="we-table-wrap">
        <table className="we-table">
          <thead><tr><th>Document</th><th>Executive approval needed above (EGP)</th></tr></thead>
          <tbody>
            {DOCS.filter((d) => WITH_LIMIT.includes(d.type)).map((d) => {
              const l = limits.get(d.type);
              return (
                <tr key={d.type}>
                  <td><b>{d.plural}</b></td>
                  <td>
                    <ActionForm action={saveLimit.bind(null, me.company_id!, d.type)} className="we-row">
                      <input name="amount_egp" className="we-input we-mono" defaultValue={l ? money(l.amount_egp) : ""} style={{ maxWidth: 200 }} aria-label={`${d.name} limit`} />
                      {d.type === "variation_order" && (
                        <label className="we-row" style={{ gap: 6 }}><input type="checkbox" name="any_time_impact" defaultChecked={l?.any_time_impact} /> or any time impact</label>
                      )}
                      <button className="we-btn we-btn--secondary we-btn--sm">Save</button>
                    </ActionForm>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
