// Small server-rendered charts for dashboards. Plain SVG, no client code.

export function Sparkline({ values, color = "var(--steel)", plan }: { values: number[]; color?: string; plan?: number[] }) {
  if (values.length < 2) return null;
  const all = [...values, ...(plan ?? [])];
  const max = Math.max(1, ...all), min = Math.min(0, ...all);
  const W = 160, H = 36;
  const pts = (vs: number[]) => vs.map((v, i) => `${((i / (vs.length - 1)) * W).toFixed(1)},${(H - 2 - ((v - min) / (max - min || 1)) * (H - 4)).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      {plan && <polyline points={pts(plan)} fill="none" stroke="var(--gold)" strokeWidth="1.5" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />}
      <polyline points={pts(values)} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export type Col = { label: string; a: number; b: number; href?: string; now?: boolean };

// Paired columns per period: a (dark, e.g. actual) against b (gold, e.g. planned).
export function ColumnChart({ cols, aLabel, bLabel, title }: { cols: Col[]; aLabel: string; bLabel: string; title: string }) {
  const W = 640, H = 220, L = 34, B = 26, T = 10;
  const max = Math.max(1, ...cols.map((c) => Math.max(c.a, c.b)));
  const nice = Math.ceil(max / 10) * 10 || 10;
  const cw = (W - L) / Math.max(1, cols.length);
  const y = (v: number) => T + (1 - v / nice) * (H - T - B);
  return (
    <figure className="we-colchart" style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={L} x2={W} y1={y(nice * f)} y2={y(nice * f)} stroke="var(--line)" />
            <text x={L - 6} y={y(nice * f) + 4} textAnchor="end">{Math.round(nice * f)}</text>
          </g>
        ))}
        {cols.map((c, i) => {
          const x = L + i * cw;
          const bw = Math.min(16, cw / 3);
          const body = (
            <g key={c.label}>
              <title>{`${c.label}: ${aLabel} ${c.a}, ${bLabel} ${c.b}`}</title>
              {c.now && <rect x={x + 1} y={T} width={cw - 2} height={H - T - B} fill="var(--brand-soft)" />}
              <rect x={x + cw / 2 - bw - 1} y={y(c.a)} width={bw} height={Math.max(0, H - B - y(c.a))} fill="var(--steel)" rx="2" />
              <rect x={x + cw / 2 + 1} y={y(c.b)} width={bw} height={Math.max(0, H - B - y(c.b))} fill="var(--gold)" rx="2" />
              <text x={x + cw / 2} y={H - 8} textAnchor="middle" style={c.now ? { fill: "var(--brand)", fontWeight: 600 } : undefined}>{c.label}</text>
            </g>
          );
          return c.href ? <a key={c.label} href={c.href}>{body}</a> : body;
        })}
      </svg>
      <figcaption className="we-help" style={{ display: "flex", gap: 16 }}>
        <span><i style={{ display: "inline-block", width: 10, height: 10, background: "var(--steel)", borderRadius: 2, marginRight: 6 }} />{aLabel}</span>
        <span><i style={{ display: "inline-block", width: 10, height: 10, background: "var(--gold)", borderRadius: 2, marginRight: 6 }} />{bLabel}</span>
      </figcaption>
    </figure>
  );
}

// A donut of parts, with the total in the middle.
export function Donut({ parts, label }: { parts: { label: string; value: number; color: string }[]; label: string }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  const R = 52, C = 2 * Math.PI * R;
  let off = 0;
  return (
    <svg viewBox="0 0 140 140" width="140" height="140" role="img" aria-label={label}>
      <circle cx="70" cy="70" r={R} fill="none" stroke="var(--surface-sunken)" strokeWidth="18" />
      {parts.filter((p) => p.value > 0).map((p) => {
        const len = (p.value / total) * C;
        const el = <circle key={p.label} cx="70" cy="70" r={R} fill="none" stroke={p.color} strokeWidth="18" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off} transform="rotate(-90 70 70)"><title>{`${p.label}: ${p.value}`}</title></circle>;
        off += len;
        return el;
      })}
      <text x="70" y="68" textAnchor="middle" style={{ font: "500 22px var(--font-mono)", fill: "var(--ink)" }}>{parts.reduce((s, p) => s + p.value, 0)}</text>
      <text x="70" y="86" textAnchor="middle" style={{ font: "400 11px var(--font-sans)", fill: "var(--ink-muted)" }}>units</text>
    </svg>
  );
}
