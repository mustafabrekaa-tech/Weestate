import { index2, money, pct } from "@/lib/format";

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
  status?: string;
  lat?: number | null;
  lng?: number | null;
  map_zoom?: number;
  budget_egp?: number;
  bac_egp?: number | null;
  pv_egp?: number | null;
  ev_egp?: number | null;
  ac_egp?: number | null;
  eac_egp?: number | null;
};

const millions = (n: number | null | undefined) => (n == null ? "–" : `${money(Number(n) / 1e6)}M`);

export function Kpis({ p, full = false }: { p: ProjectStatus; full?: boolean }) {
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
      {full && (
        <>
          <div className="we-kpi">
            <span className="we-kpi__label">Earned value</span>
            <span className="we-kpi__value">{millions(p.ev_egp)}</span>
            <span className="we-kpi__note">Planned {millions(p.pv_egp)} · actual cost {millions(p.ac_egp)}</span>
          </div>
          <div className="we-kpi">
            <span className="we-kpi__label">Forecast at completion</span>
            <span className="we-kpi__value">{millions(p.eac_egp)}</span>
            <span className={`we-kpi__note ${p.eac_egp != null && p.bac_egp != null && p.eac_egp > p.bac_egp ? "is-bad" : ""}`}>
              Budget {millions(p.bac_egp)} EGP
            </span>
          </div>
        </>
      )}
      <div className="we-kpi">
        <span className="we-kpi__label">Overdue</span>
        <span className="we-kpi__value">{p.overdue_count}</span>
        <span className={`we-kpi__note ${p.overdue_count > 0 ? "is-bad" : ""}`}>of {p.open_count} open items</span>
      </div>
    </div>
  );
}

export function Kpi({ label, value, note, bad }: { label: string; value: string; note?: string; bad?: boolean }) {
  return (
    <div className="we-kpi">
      <span className="we-kpi__label">{label}</span>
      <span className="we-kpi__value">{value}</span>
      {note && <span className={`we-kpi__note${bad ? " is-bad" : ""}`}>{note}</span>}
    </div>
  );
}
