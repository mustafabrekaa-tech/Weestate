import { Fragment } from "react";
import { ActionForm } from "@/components/ActionForm";
import { getMe, acts } from "@/lib/data";
import { money } from "@/lib/format";
import { getScope, scoped } from "@/lib/scope";
import { createClient } from "@/lib/supabase/server";
import { addBoqItem } from "../actions";
import { Select } from "@/components/Select";

type Item = { id: string; section: string; code: string; description: string; unit: string; quantity: number; rate_egp: number; amount_egp: number; cost_codes: { code: string } | null };

export default async function BoqPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const me = await getMe();
  const [{ data }, { data: codes }, { data: phases }] = await Promise.all([
    scoped(supabase.from("boq_items").select("*, cost_codes(code)").eq("project_id", id).order("sort").order("code").limit(5000), await getScope(id), { building: true }),
    supabase.from("cost_codes").select("code, name, parent_code").order("code"),
    supabase.from("phases").select("code, name").eq("project_id", id).order("code"),
  ]);
  const items = (data ?? []) as Item[];
  const sections = [...new Set(items.map((i) => i.section || "General"))];
  const total = items.reduce((s, i) => s + Number(i.amount_egp), 0);
  const canEdit = acts(me, ["tech_office", "cost_control"]);

  return (
    <>
      <div className="we-pagehead">
        <h2 style={{ margin: 0 }}>Bill of quantities <small>{items.length} items · {money(total)} EGP</small></h2>
      </div>
      {items.length === 0 ? (
        <div className="we-table-wrap we-empty">No BOQ yet. Import it from Excel on the Import tab, or add items below.</div>
      ) : (
        <div className="we-table-wrap">
          <table className="we-table">
            <thead><tr><th>Item</th><th>Description</th><th>Unit</th><th className="num">Qty</th><th className="num">Rate (EGP)</th><th className="num">Amount (EGP)</th></tr></thead>
            <tbody>
              {sections.map((s) => {
                const rows = items.filter((i) => (i.section || "General") === s);
                return (
                  <Fragment key={s}>
                    <tr className="we-row--group">
                      <td colSpan={5}><b>{s}</b></td>
                      <td className="num"><b>{money(rows.reduce((a, i) => a + Number(i.amount_egp), 0))}</b></td>
                    </tr>
                    {rows.map((i) => (
                      <tr key={i.id}>
                        <td><span className="we-code">{i.code}</span></td>
                        <td>{i.description}{i.cost_codes && <div className="we-meta">Cost code {i.cost_codes.code}</div>}</td>
                        <td>{i.unit}</td>
                        <td className="num">{money(i.quantity)}</td>
                        <td className="num">{money(i.rate_egp)}</td>
                        <td className="num">{money(i.amount_egp)}</td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && (
        <section className="we-card">
          <h2>Add or change an item</h2>
          <ActionForm action={addBoqItem.bind(null, id)} className="we-form-grid" resetOnOk>
            <div className="we-field"><label htmlFor="code">Item no.</label><input id="code" name="code" className="we-input we-mono" required placeholder="2.1.3" /></div>
            <div className="we-field" style={{ gridColumn: "span 2" }}><label htmlFor="description">Description</label><input id="description" name="description" className="we-input" required /></div>
            <div className="we-field"><label htmlFor="section">Section</label><input id="section" name="section" className="we-input" placeholder="Concrete works" /></div>
            <div className="we-field"><label htmlFor="unit">Unit</label><input id="unit" name="unit" className="we-input" placeholder="m3" /></div>
            <div className="we-field"><label htmlFor="quantity">Quantity</label><input id="quantity" name="quantity" className="we-input we-mono" inputMode="decimal" /></div>
            <div className="we-field"><label htmlFor="rate_egp">Rate (EGP)</label><input id="rate_egp" name="rate_egp" className="we-input we-mono" inputMode="decimal" /></div>
            <div className="we-field">
              <label htmlFor="cost_code">Cost code</label>
              <Select id="cost_code" name="cost_code" className="we-input we-select">
                <option value="">None</option>
                {(codes ?? []).map((c) => <option key={c.code} value={c.code}>{c.code} {c.name}</option>)}
              </Select>
            </div>
            <div className="we-field">
              <label htmlFor="phase">Phase</label>
              <Select id="phase" name="phase" className="we-input we-select">
                <option value="">Whole project</option>
                {(phases ?? []).map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
              </Select>
            </div>
            <div className="we-field" style={{ alignSelf: "end" }}><button className="we-btn we-btn--primary">Save item</button></div>
          </ActionForm>
        </section>
      )}
    </>
  );
}
