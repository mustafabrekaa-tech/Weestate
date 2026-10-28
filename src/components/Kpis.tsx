import { index2, pct } from "@/lib/format";

export type ProjectStatus = {
  id: string;
  code: string;
  name: string;
  location: string;
  phase_count: number;
  unit_count: number;
  as_of: string | null;
  actual_pct: number | null;
  planned_pct: number | null;
  spi: number | null;
  cpi: number | null;
  overdue_count: number;
  open_count: number;
};

export function Kpis({ p }: { p: ProjectStatus }) {
  return (
    <div className="we-kpis">
      <div className="we-kpi">
        <span className="we-kpi__label">Progress</span>
        <span className="we-kpi__value">{pct(p.actual_pct)}</span>
        <span className="we-kpi__note">Plan {pct(p.planned_pct)}</span>
      </div>
      <div className="we-kpi">
        <span className="we-kpi__label">SPI</span>
        <span className="we-kpi__value">{index2(p.spi)}</span>
        <span className={`we-kpi__note ${p.spi != null && p.spi < 1 ? "is-bad" : "is-good"}`}>
          {p.spi == null ? "No progress yet" : p.spi < 1 ? "Behind plan" : "On or ahead of plan"}
        </span>
      </div>
      <div className="we-kpi">
        <span className="we-kpi__label">CPI</span>
        <span className="we-kpi__value">{index2(p.cpi)}</span>
        <span className={`we-kpi__note ${p.cpi != null && p.cpi < 1 ? "is-bad" : "is-good"}`}>
          {p.cpi == null ? "No costs yet" : p.cpi < 1 ? "Over budget" : "Under budget"}
        </span>
      </div>
      <div className="we-kpi">
        <span className="we-kpi__label">Overdue</span>
        <span className="we-kpi__value">{p.overdue_count}</span>
        <span className={`we-kpi__note ${p.overdue_count > 0 ? "is-bad" : ""}`}>of {p.open_count} open items</span>
      </div>
    </div>
  );
}
