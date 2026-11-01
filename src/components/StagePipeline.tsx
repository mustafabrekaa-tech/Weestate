"use client";

import Link from "next/link";
import { useState } from "react";

export type PipeStage = { key: string; label: string; color: string; next: string; owner: string; count: number };
export type PipeRow = { id: string; code: string; cluster: string; type: string; since: string; contract: string; late: boolean; built: number };

// The handover stages as cards, and the units of the one picked. Switching happens
// in the browser, so a click shows the list at once instead of reloading the page.
export function StagePipeline({ stages, rows, initial, base }: { stages: PipeStage[]; rows: Record<string, PipeRow[]>; initial: string; base: string }) {
  const [sel, setSel] = useState(initial);
  const st = stages.find((s) => s.key === sel) ?? stages[0]!;
  const list = rows[sel] ?? [];
  function pick(k: string) {
    setSel(k);
    const u = new URL(window.location.href);
    u.searchParams.set("stage", k);
    window.history.replaceState(null, "", u);
  }
  return (
    <>
      <section className="we-panel">
        <div className="we-panel__head"><h2>Handover pipeline</h2><small>click a stage to list its units</small></div>
        <div className="we-scrollx">
          <div className="we-pipe2">
            {stages.map((h) => (
              <a key={h.key} href={`?stage=${h.key}`} onClick={(e) => { e.preventDefault(); pick(h.key); }} aria-current={h.key === sel ? "true" : undefined}>
                <i style={{ background: h.color }} />
                <b>{h.count}</b>
                <span>{h.label}</span>
                <small>{h.next}</small>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="we-panel">
        <div className="we-panel__head">
          <div>
            <h2>{st.label} <span className="we-help">· {st.count} units</span></h2>
            <div className="we-help">{st.owner}</div>
          </div>
          {st.count > 0 && <Link className="we-btn we-btn--primary we-btn--sm" href={`${base}/console?stage=${sel}`}>Select them on the map</Link>}
        </div>
        <div className="we-table-wrap" style={{ maxHeight: 420 }}>
          <table className="we-table">
            <thead><tr><th>Unit</th><th>Cluster</th><th>Type</th><th>In this stage since</th><th>Contract date</th><th>Built</th><th></th></tr></thead>
            <tbody>
              {list.length === 0 && <tr><td colSpan={7} className="we-empty">No unit is in this stage today.</td></tr>}
              {list.map((r) => (
                <tr key={r.id}>
                  <td className="we-mono">{r.code}</td>
                  <td>{r.cluster}</td>
                  <td>{r.type}</td>
                  <td className="we-mono">{r.since}</td>
                  <td>{r.late ? <span className="we-chip we-chip--overdue">Late · {r.contract}</span> : <span className="we-mono">{r.contract}</span>}</td>
                  <td className="we-mono">{r.built}%</td>
                  <td style={{ textAlign: "right" }}><Link prefetch={false} className="we-link" href={`${base}/console?q=${encodeURIComponent(r.code)}`}>Open on map</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {st.count > list.length && <p className="we-help" style={{ margin: 0 }}>Showing {list.length} of {st.count}. Select them on the map to see and move them all.</p>}
      </section>
    </>
  );
}
