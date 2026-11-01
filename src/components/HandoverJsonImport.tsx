"use client";

import { useMemo, useState, useTransition } from "react";
import type { ActionResult } from "@/lib/data";
import { HANDOVER, HANDOVER_BY_KEY } from "@/lib/handover";

type U = { id: string; code: string; phase: string | null };
type Row = { unit_id: string; code: string; stage: string; at: string | null; priority: boolean; target: string | null; events: { stage: string; at: string; note: string }[] };
type Ev = { k?: string; s?: number; d?: string; n?: string };
type Entry = { k?: string; st?: number; due?: string; pr?: number | boolean; e?: Ev[] };

const CHUNK = 300;
const KEYS = HANDOVER.map((h) => h.key);

// Finds the unit a console key such as "PH02|Cluster B01|B01/QL11|VG01" or
// "PH01|Cluster 05|05/Annexes|AM02" stands for. A plain unit code works too.
export function matcher(units: U[]) {
  const byCode = new Map(units.map((u) => [u.code.toUpperCase(), u]));
  return (key: string): U | null => {
    const direct = byCode.get(key.trim().toUpperCase());
    if (direct) return direct;
    const p = key.split("|").map((s) => s.trim());
    if (p.length < 2) return null;
    const unit = p.at(-1)!.toUpperCase();
    const bld = p.at(-2)!;
    const cluster = p.length >= 3 ? p.at(-3)!.replace(/^cluster\s*/i, "").toUpperCase() : "";
    const phase = p.length >= 4 ? p[0]!.toUpperCase() : "";
    for (const seg of [bld.split("/").at(-1)!, bld.split("/")[0]!, bld.replace("/", "-"), cluster]) {
      const u = seg && byCode.get(`${seg}-${unit}`.toUpperCase());
      if (u) return u;
    }
    // Annexes and the like: a unit with this suffix in a block whose code ends with the cluster number.
    let cands = units.filter((u) => u.code.toUpperCase().endsWith(`-${unit}`) && cluster && u.code.toUpperCase().split("-")[0]!.endsWith(cluster));
    // Phase codes differ between files ("PH01" against "Phase 01"), so compare their numbers.
    const num = (v: string) => Number(v.match(/\d+/)?.[0] ?? NaN);
    if (cands.length > 1 && phase) cands = cands.filter((u) => (u.phase ?? "").toUpperCase() === phase || num(u.phase ?? "") === num(phase));
    return cands.length === 1 ? cands[0]! : null;
  };
}

export function toRows(json: unknown, units: U[]) {
  const find = matcher(units);
  const src = (json as { units?: unknown })?.units ?? json;
  const entries: [string, Entry][] = Array.isArray(src)
    ? (src as (Entry & { code?: string; unit?: string; stage?: string })[]).map((x) => [String(x.code ?? x.unit ?? ""), { ...x, k: x.k ?? x.stage }])
    : Object.entries((src ?? {}) as Record<string, Entry>);
  const rows: Row[] = [], missed: string[] = [];
  for (const [key, e] of entries) {
    const u = find(key);
    const stage = e.k && KEYS.includes(e.k) ? e.k : typeof e.st === "number" ? KEYS[e.st] : undefined;
    if (!u || !stage) { missed.push(key); continue; }
    const events = (e.e ?? [])
      .map((x) => ({ stage: x.k && KEYS.includes(x.k) ? x.k : typeof x.s === "number" ? KEYS[x.s] ?? "" : "", at: (x.d ?? "").slice(0, 10), note: x.n ?? "" }))
      .filter((x) => x.stage && /^\d{4}-\d{2}-\d{2}$/.test(x.at));
    const at = events.filter((x) => x.stage === stage).map((x) => x.at).sort().at(-1) ?? null;
    rows.push({ unit_id: u.id, code: u.code, stage, at, priority: !!e.pr, target: e.due ? e.due.slice(0, 10) : null, events });
  }
  return { rows, missed };
}

// Upload the JSON saved by the unit delivery console: current stage, priority,
// due date and the dated history of every unit.
export function HandoverJsonImport({ units, save }: { units: U[]; save: (rows: Row[], replace: boolean) => Promise<ActionResult> }) {
  const [file, setFile] = useState("");
  const [data, setData] = useState<{ rows: Row[]; missed: string[] } | null>(null);
  const [replace, setReplace] = useState(false);
  const [note, setNote] = useState<ActionResult>(null);
  const [pending, start] = useTransition();

  async function read(f: File) {
    setNote(null); setData(null); setFile(f.name);
    try {
      const r = toRows(JSON.parse(await f.text()), units);
      setData(r);
      if (!r.rows.length) setNote({ error: "No unit in this file matches a unit of this project." });
    } catch {
      setNote({ error: "That file isn't valid JSON." });
    }
  }

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of data?.rows ?? []) m.set(r.stage, (m.get(r.stage) ?? 0) + 1);
    return m;
  }, [data]);

  function submit() {
    if (!data) return;
    start(async () => {
      let units = 0, events = 0;
      for (let i = 0; i < data.rows.length; i += CHUNK) {
        const r = await save(data.rows.slice(i, i + CHUNK), replace);
        if (r?.error) { setNote({ error: `${units ? `${units} units saved, then: ` : ""}${r.error}` }); return; }
        const m = r?.ok?.match(/(\d+) units and (\d+)/);
        units += Number(m?.[1] ?? 0); events += Number(m?.[2] ?? 0);
      }
      setNote({ ok: `Saved: ${units} units moved to their stage, ${events} history entries added.` });
      setData(null);
    });
  }

  const nEvents = data?.rows.reduce((a, r) => a + r.events.length, 0) ?? 0;

  return (
    <div className="we-stack">
      <div className="we-row">
        <label className="we-btn we-btn--secondary">
          Choose the JSON file
          <input type="file" hidden accept=".json,application/json" onChange={(e) => { if (e.target.files?.[0]) read(e.target.files[0]); e.target.value = ""; }} />
        </label>
        <span className="we-help">The file saved by the unit delivery console (unit-progress-….json). Units are matched by block and unit, e.g. B01/QL11 · VG01 → QL11-VG01.</span>
      </div>
      {note?.error && <div className="we-banner we-banner--error" role="alert">{note.error}</div>}
      {note?.ok && <div className="we-banner we-banner--ok" role="status">{note.ok}</div>}
      {data && data.rows.length > 0 && (
        <>
          <b>{file}: {data.rows.length} units matched, {nEvents.toLocaleString("en-US")} history entries{data.missed.length ? `, ${data.missed.length} not found` : ""}</b>
          <div className="we-tiles">
            {HANDOVER.filter((h) => counts.get(h.key)).map((h) => (
              <div className="we-tile" key={h.key}><span><i className="we-dot" style={{ background: h.color }} />{h.label}</span><b>{counts.get(h.key)}</b></div>
            ))}
          </div>
          {data.missed.length > 0 && (
            <details>
              <summary className="we-help">{data.missed.length} entries match no unit of this project and will be skipped</summary>
              <div className="we-help" style={{ maxHeight: 160, overflow: "auto" }}>{data.missed.join(" · ")}</div>
            </details>
          )}
          <div className="we-table-wrap" style={{ maxHeight: 300 }}>
            <table className="we-table we-table--compact">
              <thead><tr><th>Unit</th><th>Stage</th><th>Since</th><th>Due</th><th>Priority</th><th className="num">History</th></tr></thead>
              <tbody>
                {data.rows.slice(0, 100).map((r) => (
                  <tr key={r.unit_id}><td>{r.code}</td><td>{HANDOVER_BY_KEY[r.stage]?.label}</td><td>{r.at ?? "–"}</td><td>{r.target ?? "–"}</td><td>{r.priority ? "Yes" : ""}</td><td className="num">{r.events.length}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <label className="we-row" style={{ gap: 8 }}>
            <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
            <span>Replace the earlier history of these units with the file&apos;s history <span className="we-help">(otherwise new entries are added and ones already there are skipped)</span></span>
          </label>
          <div><button className="we-btn we-btn--primary" onClick={submit} disabled={pending}>{pending ? "Saving…" : `Save ${data.rows.length} units`}</button></div>
        </>
      )}
    </div>
  );
}
