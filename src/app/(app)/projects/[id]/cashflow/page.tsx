import { Kpi } from "@/components/Kpis";
import { money } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

type Row = { month: string; outflow_due_egp: number; outflow_paid_egp: number; inflow_due_egp: number; inflow_received_egp: number };

export default async function CashFlowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("cash_flow").select("*").eq("project_id", id).order("month");
  const rows = (data ?? []) as Row[];
  const thisMonth = new Date().toISOString().slice(0, 7);
  let cum = 0;
  const withCum = rows.map((r) => {
    cum += Number(r.inflow_due_egp) - Number(r.outflow_due_egp);
    return { ...r, net: Number(r.inflow_due_egp) - Number(r.outflow_due_egp), cum };
  });
  const sum = (k: keyof Row) => rows.reduce((a, r) => a + Number(r[k]), 0);
  const next12 = withCum.filter((r) => r.month.slice(0, 7) >= thisMonth).slice(0, 12);

  return (
    <>
      <div className="we-kpis">
        <Kpi label="Owed to contractors" value={money(sum("outflow_due_egp") - sum("outflow_paid_egp"))} note={`Certified net ${money(sum("outflow_due_egp"))}`} />
        <Kpi label="Paid out" value={money(sum("outflow_paid_egp"))} />
        <Kpi label="Instalments due" value={money(sum("inflow_due_egp"))} note="From unit sales" />
        <Kpi label="Collected" value={money(sum("inflow_received_egp"))} />
      </div>
      <section className="we-stack">
        <h2 style={{ margin: 0 }}>By month <small>EGP · coming 12 months in bold</small></h2>
        <div className="we-table-wrap">
          <table className="we-table">
            <thead><tr><th>Month</th><th className="num">Out: certified</th><th className="num">Out: paid</th><th className="num">In: due</th><th className="num">In: collected</th><th className="num">Net</th><th className="num">Cumulative</th></tr></thead>
            <tbody>
              {withCum.length === 0 && <tr><td colSpan={7} className="we-empty">Cash flow appears once there are certificates or unit sales.</td></tr>}
              {withCum.map((r) => (
                <tr key={r.month} className={next12.includes(r) ? "we-row--group" : undefined}>
                  <td>{new Date(r.month).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}</td>
                  <td className="num">{money(r.outflow_due_egp)}</td>
                  <td className="num">{money(r.outflow_paid_egp)}</td>
                  <td className="num">{money(r.inflow_due_egp)}</td>
                  <td className="num">{money(r.inflow_received_egp)}</td>
                  <td className={`num${r.net < 0 ? " is-bad" : ""}`}>{money(r.net)}</td>
                  <td className={`num${r.cum < 0 ? " is-bad" : ""}`}>{money(r.cum)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
