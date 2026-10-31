// Planned against actual, as cumulative % over time (an S-curve).
export type Point = [string, number];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function Curve({ plan, actual, today, unit = "%", max = 100, labels = ["Planned", "Actual"] }: {
  plan: Point[]; actual: Point[]; today: string; unit?: string; max?: number; labels?: [string, string];
}) {
  const all = [...plan, ...actual].map((p) => Date.parse(p[0]));
  if (all.length < 2) return <div className="we-empty">Not enough dates to draw a curve yet.</div>;
  const W = 760, H = 260, L = 44, R = 12, T = 12, B = 28;
  const t0 = Math.min(...all), t1 = Math.max(...all, Date.parse(today));
  const top = Math.max(max, ...plan.map((p) => p[1]), ...actual.map((p) => p[1])) || 1;
  const x = (d: string) => L + ((Date.parse(d) - t0) / Math.max(1, t1 - t0)) * (W - L - R);
  const y = (v: number) => T + (1 - v / top) * (H - T - B);
  const path = (ps: Point[]) => ps.map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ");
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * top);
  const months: string[] = [];
  const step = Math.max(1, Math.ceil((t1 - t0) / (86400000 * 30) / 10));
  for (let d = new Date(t0); d.getTime() <= t1; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + step, 1))) months.push(d.toISOString().slice(0, 10));
  return (
    <div className="we-stack" style={{ gap: 6 }}>
      <svg className="we-curve" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${labels[0]} against ${labels[1].toLowerCase()}`}>
        {yTicks.map((v) => (
          <g key={v}><line className="grid" x1={L} x2={W - R} y1={y(v)} y2={y(v)} /><text x={L - 6} y={y(v) + 4} textAnchor="end">{Math.round(v)}{unit}</text></g>
        ))}
        {months.map((m) => <text key={m} x={x(m)} y={H - 8} textAnchor="middle">{MONTHS[Number(m.slice(5, 7)) - 1]} {m.slice(2, 4)}</text>)}
        <line className="today" x1={x(today)} x2={x(today)} y1={T} y2={H - B} />
        <path className="plan" d={path(plan)} />
        <path className="actual" d={path(actual)} />
        {actual.length > 0 && <circle cx={x(actual.at(-1)![0])} cy={y(actual.at(-1)![1])} r="4" fill="#c9a24e" />}
      </svg>
      <div className="we-curve-legend"><span><i />{labels[0]}</span><span><i className="a" />{labels[1]}</span></div>
    </div>
  );
}
