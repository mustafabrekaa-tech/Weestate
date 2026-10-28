// Planned against actual progress over time, in the project's own months.
export type CurvePoint = { period: string; planned: number; actual: number };

export function SCurve({ points }: { points: CurvePoint[] }) {
  if (points.length === 0) return <div className="we-empty">No monthly progress yet. Add it on the Schedule and progress tab.</div>;
  const W = 640, H = 240, L = 40, R = 12, T = 12, B = 28;
  const n = points.length;
  const x = (i: number) => L + (n === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (n - 1));
  const y = (v: number) => T + (1 - v / 100) * (H - T - B);
  const path = (k: "planned" | "actual") => points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join("");
  const step = Math.max(1, Math.ceil(n / 8));
  return (
    <figure className="we-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Planned and actual progress by month">
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="we-chart__grid" />
            <text x={L - 6} y={y(v) + 4} textAnchor="end" className="we-chart__tick">{v}%</text>
          </g>
        ))}
        {points.map((p, i) =>
          i % step === 0 || i === n - 1 ? (
            <text key={p.period} x={x(i)} y={H - 8} textAnchor="middle" className="we-chart__tick">
              {new Date(p.period).toLocaleDateString("en-GB", { month: "short", year: "2-digit" })}
            </text>
          ) : null,
        )}
        <path d={path("planned")} className="we-chart__plan" />
        <path d={path("actual")} className="we-chart__actual" />
        {points.map((p, i) => (
          <circle key={p.period} cx={x(i)} cy={y(p.actual)} r={3} className="we-chart__dot">
            <title>{`${p.period}: actual ${p.actual.toFixed(1)}%, plan ${p.planned.toFixed(1)}%`}</title>
          </circle>
        ))}
      </svg>
      <figcaption className="we-row we-help">
        <span className="we-key we-key--plan" /> Planned <span className="we-key we-key--actual" /> Actual
      </figcaption>
    </figure>
  );
}
