type Kind = "done" | "waiting" | "overdue" | "active" | "draft";

const icons: Record<Kind, React.ReactNode> = {
  done: <path d="M2.5 6.5l2.2 2.2L9.5 3.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  waiting: (
    <>
      <circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 3.6V6l1.6 1.2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  overdue: (
    <>
      <path d="M6 1.2L11.2 10.4H.8Z" fill="currentColor" />
      <path d="M6 4.6v2.4M6 8.5v.1" stroke="var(--status-overdue-soft)" strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
  active: <rect x="1" y="4.2" width="10" height="3.6" rx="1.8" fill="currentColor" />,
  draft: <circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 1.6" />,
};

export function StatusChip({ kind, children }: { kind: Kind; children: React.ReactNode }) {
  return (
    <span className={`we-chip we-chip--${kind}`}>
      <svg viewBox="0 0 12 12" aria-hidden="true">{icons[kind]}</svg>
      {children}
    </span>
  );
}

const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

// The words come from the workflow state, never typed by hand.
export function ItemStatus({
  status,
  departmentName,
  department,
  daysWaiting,
  overdue,
  myDepartment,
}: {
  status: string;
  departmentName?: string;
  department?: string;
  daysWaiting?: number;
  overdue?: boolean;
  myDepartment?: string | null;
}) {
  if (status === "paid") return <StatusChip kind="done">Paid</StatusChip>;
  if (status === "done") return <StatusChip kind="done">Done</StatusChip>;
  if (status === "rejected") return <StatusChip kind="overdue">Rejected</StatusChip>;
  if (status === "draft") return <StatusChip kind="draft">Draft</StatusChip>;
  if (overdue) return <StatusChip kind="overdue">Overdue · {days(daysWaiting ?? 0)}</StatusChip>;
  if (status === "returned") return <StatusChip kind="overdue">Returned for changes</StatusChip>;
  if (myDepartment && department === myDepartment) return <StatusChip kind="active">Your turn</StatusChip>;
  return (
    <StatusChip kind="waiting">
      With {departmentName} · {days(daysWaiting ?? 0)}
    </StatusChip>
  );
}
