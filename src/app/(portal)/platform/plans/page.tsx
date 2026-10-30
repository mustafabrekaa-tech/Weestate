import type { Metadata } from "next";
import { ActionForm } from "@/components/ActionForm";
import { PortalHead } from "@/components/PortalHead";
import { money } from "@/lib/format";
import { type Workspace } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { savePlan } from "../actions";

export const metadata: Metadata = { title: "Plans & pricing" };

type Plan = { code: string; name: string; price_egp: number; max_users: number | null; max_projects: number | null; features: string; sort: number; active: boolean };

export default async function Plans() {
  const supabase = await createClient();
  const [{ data: plans }, { data: cos }] = await Promise.all([
    supabase.from("plans").select("*").order("sort"),
    supabase.rpc("portal_companies"),
  ]);
  const all = (cos ?? []) as Workspace[];
  const on = (code: string, st: string) => all.filter((w) => w.plan === code && w.status === st).length;

  const form = (p?: Plan) => (
    <ActionForm action={savePlan} className="we-stack" resetOnOk={!p}>
      <div className="we-form-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        <div className="we-field"><label>Code</label><input name="code" defaultValue={p?.code} readOnly={!!p} className="we-input we-mono" required placeholder="growth" /></div>
        <div className="we-field"><label>Name</label><input name="name" defaultValue={p?.name} className="we-input" required /></div>
        <div className="we-field"><label>Price a month (EGP)</label><input name="price_egp" defaultValue={p?.price_egp} className="we-input we-mono" inputMode="decimal" /></div>
        <div className="we-field"><label>People limit</label><input name="max_users" defaultValue={p?.max_users ?? ""} className="we-input we-mono" inputMode="numeric" placeholder="No limit" /></div>
        <div className="we-field"><label>Project limit</label><input name="max_projects" defaultValue={p?.max_projects ?? ""} className="we-input we-mono" inputMode="numeric" placeholder="No limit" /></div>
        <div className="we-field"><label>Order</label><input name="sort" defaultValue={p?.sort ?? ""} className="we-input we-mono" inputMode="numeric" /></div>
      </div>
      <div className="we-field"><label>What&apos;s included</label><input name="features" defaultValue={p?.features} className="we-input" /></div>
      <div className="we-row">
        <label className="we-row" style={{ gap: 6, fontSize: 14 }}><input type="checkbox" name="active" defaultChecked={p ? p.active : true} /> Offered to new companies</label>
        <button className="we-btn we-btn--primary we-btn--sm">{p ? "Save" : "Add plan"}</button>
      </div>
    </ActionForm>
  );

  return (
    <>
      <PortalHead title="Plans & pricing" lead="What each plan costs and allows. Limits apply when a company's admin adds people." />
      <div className="we-portal__cards">
        {((plans ?? []) as Plan[]).map((p) => (
          <div key={p.code} className="we-pcard">
            <span>{p.name}{!p.active && " · not offered"}</span>
            <b>EGP {money(p.price_egp)}<small style={{ fontSize: 14 }}> / month</small></b>
            <small>{p.max_users ? `${p.max_users} people` : "Unlimited people"} · {p.max_projects ? `${p.max_projects} projects` : "unlimited projects"}</small>
            <small>{on(p.code, "active")} active · {on(p.code, "trial")} on trial</small>
          </div>
        ))}
      </div>
      <div className="we-stack">
        {((plans ?? []) as Plan[]).map((p) => (
          <details key={p.code} className="we-card">
            <summary className="we-row" style={{ cursor: "pointer" }}><b>Edit {p.name}</b><span className="we-help">{p.features}</span></summary>
            <div style={{ marginTop: 16 }}>{form(p)}</div>
          </details>
        ))}
        <section className="we-card we-stack">
          <h2 style={{ margin: 0 }}>Add a plan</h2>
          {form()}
        </section>
      </div>
    </>
  );
}
