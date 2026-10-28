export type Step = { seq: number; name: string; department_name: string };

export function WorkflowSteps({
  steps,
  current,
  status,
  done,
  label,
}: {
  steps: Step[];
  current: number;
  status: string;
  done: Record<number, string>;
  label: string;
}) {
  return (
    <ol className="we-steps" style={{ ["--n" as string]: steps.length }} aria-label={label}>
      {steps.map((s) => {
        const finished = status === "paid" || s.seq < current;
        const cls = finished
          ? "we-step--done"
          : s.seq === current
            ? status === "returned" || status === "rejected"
              ? "we-step--returned"
              : "we-step--current"
            : "";
        return (
          <li key={s.seq} className={`we-step ${cls}`} aria-current={s.seq === current && !finished ? "step" : undefined}>
            <b>{s.name}</b>
            <small>{done[s.seq] ?? s.department_name}</small>
          </li>
        );
      })}
    </ol>
  );
}
