import Link from "next/link";
import { ItemStatus } from "@/components/StatusChip";
import { money } from "@/lib/format";
import type { QueueItem } from "@/lib/data";
import { docHref } from "@/lib/docs";

export function QueueTable({
  items,
  myDepartment,
  showProject = false,
  empty = "Nothing is waiting here.",
}: {
  items: QueueItem[];
  myDepartment?: string | null;
  showProject?: boolean;
  empty?: string;
}) {
  if (items.length === 0) return <div className="we-table-wrap we-empty">{empty}</div>;
  return (
    <div className="we-table-wrap">
      <table className="we-table">
        <thead>
          <tr>
            <th>Ref</th>
            <th>Item</th>
            <th>Step</th>
            <th className="num">Amount (EGP)</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((q) => (
            <tr key={q.doc_type + q.doc_id}>
              <td>
                <span className="we-code">{q.ref}</span>
              </td>
              <td>
                <Link className="we-rowlink" href={docHref(q.doc_type, q.doc_id)}>
                  <div className="we-title">{q.title}</div>
                </Link>
                <div className="we-meta">
                  {showProject ? `${q.project_name} · ` : ""}
                  {q.subtitle}
                </div>
              </td>
              <td>{q.step_name}</td>
              <td className="num">{money(q.amount_egp)}</td>
              <td>
                <ItemStatus
                  status={q.status}
                  department={q.department}
                  departmentName={q.department_name}
                  daysWaiting={q.days_waiting}
                  overdue={q.overdue}
                  myDepartment={myDepartment}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
