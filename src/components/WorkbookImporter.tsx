"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/data";
import { downloadWorkbook, IMPORTS, kindOfSheet, linksFromRows, mapRows, WORKBOOK_ORDER, type ImportKind } from "@/lib/imports";

const CHUNK = 1000;

type Part = {
  sheet: string;
  kind: ImportKind | null;
  rows: Record<string, unknown>[];
  missing: string[];
  state: "ready" | "empty" | "missing" | "unknown" | "saving" | "saved" | "failed";
  note?: string;
};

// Upload one workbook that holds every kind of data, one sheet each. Shows what
// each sheet will go into, then saves them in dependency order.
export function WorkbookImporter({ save }: { save: (kind: string, rows: Record<string, unknown>[]) => Promise<ActionResult> }) {
  const [parts, setParts] = useState<Part[]>([]);
  const [file, setFile] = useState("");
  const [note, setNote] = useState<ActionResult>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [pending, start] = useTransition();

  async function read(f: File) {
    setNote(null);
    setParts([]);
    setOpen(null);
    setFile(f.name);
    try {
      if (!f.name.toLowerCase().endsWith(".xlsx")) throw new Error("Choose an Excel workbook (.xlsx).");
      const { default: readXlsxFile } = await import("read-excel-file/browser");
      const sheets = await readXlsxFile(f);
      const out: Part[] = [];
      for (const s of sheets) {
        if (/^read ?me|^how to/i.test(s.sheet.trim())) continue;
        const kind = kindOfSheet(s.sheet);
        if (!kind) { out.push({ sheet: s.sheet, kind, rows: [], missing: [], state: "unknown" }); continue; }
        const m = mapRows(kind, s.data as unknown[][]);
        const hasData = (s.data as unknown[][]).slice(1).some((r) => r.some((c) => c != null && c !== ""));
        out.push({
          sheet: s.sheet, kind, rows: m.rows, missing: m.missing,
          state: !hasData ? "empty" : m.missing.length ? "missing" : m.rows.length ? "ready" : "empty",
        });
      }
      out.sort((a, b) => rank(a.kind) - rank(b.kind));
      setParts(out);
      if (!out.some((p) => p.state === "ready")) setNote({ error: "No sheet in this file has rows ready to save. Download the workbook template to see the sheet names and headings." });
    } catch (e) {
      setNote({ error: (e as Error).message || "Could not read that file." });
    }
  }

  function update(sheet: string, patch: Partial<Part>) {
    setParts((ps) => ps.map((p) => (p.sheet === sheet ? { ...p, ...patch } : p)));
  }

  function submit() {
    start(async () => {
      let total = 0, failed = 0;
      for (const p of parts.filter((x) => x.state === "ready" && x.kind)) {
        update(p.sheet, { state: "saving" });
        let saved = 0, error = "";
        for (let i = 0; i < p.rows.length; i += CHUNK) {
          const r = await save(p.kind!, p.rows.slice(i, i + CHUNK));
          if (r?.error) { error = r.error; break; }
          saved += Number(r?.ok?.match(/\d+/)?.[0] ?? 0);
        }
        let extra = "";
        if (!error && p.kind === "activities") {
          const links = linksFromRows(p.rows);
          if (links.length) {
            const r = await save("activity_links", links);
            extra = r?.error ? ` Links not saved: ${r.error}` : ` ${r?.ok ?? ""}`;
          }
        }
        total += saved;
        if (error) failed++;
        update(p.sheet, error
          ? { state: "failed", note: `${saved ? `${saved} saved, then: ` : ""}${error}` }
          : { state: "saved", note: `${saved} rows saved.${extra}` });
      }
      setNote(failed
        ? { error: `${total} rows saved from ${file}, but ${failed} sheet${failed > 1 ? "s" : ""} had a problem. See the list below, fix the file and upload it again; rows already saved are updated, not doubled.` }
        : { ok: `All done: ${total} rows saved from ${file}.` });
    });
  }

  const ready = parts.filter((p) => p.state === "ready");
  const shown = parts.find((p) => p.sheet === open);

  return (
    <div className="we-stack">
      <div className="we-card we-stack">
        <div className="we-row">
          <label className="we-btn we-btn--secondary">
            Choose the workbook
            <input type="file" hidden accept=".xlsx" onChange={(e) => { if (e.target.files?.[0]) read(e.target.files[0]); e.target.value = ""; }} />
          </label>
          <button type="button" className="we-btn we-btn--ghost" onClick={() => downloadWorkbook()}>Download the workbook template</button>
          <a className="we-link" href="/weestate-example-workbook.xlsx" download>Filled example (Palm Ridge)</a>
        </div>
        <span className="we-help">
          One Excel file with a sheet for each kind of data: {WORKBOOK_ORDER.map((k) => IMPORTS[k].name).join(", ")}.
          Fill the sheets you have and leave the others empty. You will see what each sheet goes into before anything is saved.
        </span>
        {note?.error && <div className="we-banner we-banner--error" role="alert">{note.error}</div>}
        {note?.ok && <div className="we-banner we-banner--ok" role="status">{note.ok}</div>}
      </div>

      {parts.length > 0 && (
        <div className="we-stack">
          <div className="we-row">
            <b>{file}: {ready.length} of {parts.length} sheets ready, {ready.reduce((a, p) => a + p.rows.length, 0).toLocaleString("en-US")} rows</b>
            {ready.length > 0 && (
              <button className="we-btn we-btn--primary" onClick={submit} disabled={pending}>{pending ? "Saving…" : `Save ${ready.length} sheet${ready.length > 1 ? "s" : ""}`}</button>
            )}
          </div>
          <div className="we-table-wrap">
            <table className="we-table">
              <thead><tr><th>Sheet</th><th>Goes into</th><th>Rows</th><th>Status</th><th /></tr></thead>
              <tbody>
                {parts.map((p) => (
                  <tr key={p.sheet}>
                    <td><b>{p.sheet}</b></td>
                    <td>{p.kind ? IMPORTS[p.kind].name : "–"}</td>
                    <td>{p.rows.length ? p.rows.length.toLocaleString("en-US") : "–"}</td>
                    <td>
                      <span className={`we-chip ${CHIP[p.state]}`}>
                        {LABEL[p.state]}
                      </span>
                      {p.state === "missing" && <span className="we-help"> Missing: {p.missing.join(", ")}</span>}
                      {p.state === "unknown" && <span className="we-help"> Not a sheet name WE-estate knows, so it is skipped.</span>}
                      {p.note && <span className="we-help"> {p.note}</span>}
                    </td>
                    <td>{p.rows.length > 0 && <button type="button" className="we-link" onClick={() => setOpen(open === p.sheet ? null : p.sheet)}>{open === p.sheet ? "Hide" : "Preview"}</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {shown?.kind && (
            <div className="we-stack">
              <b>{shown.sheet}: first {Math.min(30, shown.rows.length)} of {shown.rows.length} rows</b>
              <div className="we-table-wrap" style={{ maxHeight: 380 }}>
                <table className="we-table">
                  <thead><tr>{IMPORTS[shown.kind].columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
                  <tbody>
                    {shown.rows.slice(0, 30).map((r, i) => (
                      <tr key={i}>{IMPORTS[shown.kind!].columns.map((c) => <td key={c.key}>{r[c.key] == null ? "" : String(r[c.key])}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const LABEL: Record<Part["state"], string> = {
  ready: "Ready", empty: "Empty, skipped", missing: "Columns missing", unknown: "Skipped",
  saving: "Saving…", saved: "Saved", failed: "Problem",
};

const CHIP: Record<Part["state"], string> = {
  ready: "we-chip--waiting", empty: "we-chip--draft", missing: "we-chip--overdue", unknown: "we-chip--draft",
  saving: "we-chip--waiting", saved: "we-chip--done", failed: "we-chip--overdue",
};

const rank = (k: ImportKind | null) => (k ? WORKBOOK_ORDER.indexOf(k) : 99);
