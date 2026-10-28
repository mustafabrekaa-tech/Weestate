import type { Metadata } from "next";
import Link from "next/link";
import { ItemStatus } from "@/components/StatusChip";
import { getMe, type QueueItem } from "@/lib/data";
import { certRef, date, money } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Payment certificates" };

type Row = {
  id: string;
  number: number;
  period_end: string;
  gross_egp: number;
  net_egp: number;
  status: string;
  contracts: { code: string; contractor: string } | null;
  projects: { name: string } | null;
};

export default async function Certificates() {
  const supabase = await createClient();
  const me = await getMe();
  const [{ data }, { data: queue }] = await Promise.all([
    supabase
      .from("payment_certificates")
      .select("id, number, period_end, gross_egp, net_egp, status, contracts(code, contractor), projects(name)")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("work_queue").select("*"),
  ]);
  const open = new Map(((queue ?? []) as QueueItem[]).map((q) => [q.doc_id, q]));
  const rows = (data ?? []) as unknown as Row[];

  return (
    <>
      <div className="we-pagehead">
        <div>
          <div className="we-eyebrow">All projects</div>
          <h1>Payment certificates</h1>
        </div>
        <Link className="we-btn we-btn--primary" href="/certificates/new">New payment certificate</Link>
      </div>
      {rows.length === 0 ? (
        <div className="we-table-wrap we-empty">No certificates yet. Site raises the first one from New payment certificate.</div>
      ) : (
        <div className="we-table-wrap">
          <table className="we-table">
            <thead>
              <tr><th>Ref</th><th>Contract</th><th>Period</th><th className="num">Gross (EGP)</th><th className="num">Net (EGP)</th><th>Status</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const q = open.get(r.id);
                return (
                  <tr key={r.id}>
                    <td><span className="we-code">{certRef(r.number)}</span></td>
                    <td>
                      <Link className="we-rowlink" href={`/certificates/${r.id}`}>
                        <div className="we-title">{r.contracts?.contractor}</div>
                      </Link>
                      <div className="we-meta">{r.projects?.name} · {r.contracts?.code}</div>
                    </td>
                    <td>{date(r.period_end)}</td>
                    <td className="num">{money(r.gross_egp)}</td>
                    <td className="num">{money(r.net_egp)}</td>
                    <td>
                      <ItemStatus
                        status={r.status}
                        department={q?.department}
                        departmentName={q?.department_name}
                        daysWaiting={q?.days_waiting}
                        overdue={q?.overdue}
                        myDepartment={me?.department}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
