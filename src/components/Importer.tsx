"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/data";
import { WorkbookImporter } from "./WorkbookImporter";
import { downloadTemplate, IMPORTS, linksFromRows, mapRows, parseCsv, parseMspXml, parseXer, templateCsv, type ImportKind } from "@/lib/imports";

const CHUNK = 1000;

export function Importer({
  save,
  kinds,
  initial,
}: {
  save: (kind: string, rows: Record<string, unknown>[]) => Promise<ActionResult>;
  kinds: ImportKind[];
  initial?: string;
}) {
  // Everything in one workbook by default; one sheet at a time when a kind was asked for.
  const [mode, setMode] = useState<"book" | "one">(initial ? "one" : "book");
  const [kind, setKind] = useState<ImportKind>(kinds.includes(initial as ImportKind) ? (initial as ImportKind) : kinds[0]!);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [note, setNote] = useState<ActionResult>(null);
  const [file, setFile] = useState("");
  const [pending, start] = useTransition();
  const cols = IMPORTS[kind].columns;

  async function read(f: File) {
    setNote(null);
    setRows([]);
    setFile(f.name);
    try {
      const name = f.name.toLowerCase();
      if (name.endsWith(".xer")) {
        if (kind !== "activities") throw new Error("A .xer file is a Primavera schedule. Choose Schedule activities first.");
        setRows(parseXer(await f.text()));
        return;
      }
      if (name.endsWith(".xml")) {
        if (kind !== "activities") throw new Error("An .xml file is an MS Project schedule. Choose Schedule activities first.");
        setRows(parseMspXml(await f.text()));
        return;
      }
      let table: unknown[][];
      if (name.endsWith(".csv") || name.endsWith(".txt")) table = parseCsv(await f.text());
      else {
        const { readSheet } = await import("read-excel-file/browser");
        table = (await readSheet(f)) as unknown[][];
      }
      const m = mapRows(kind, table);
      if (m.missing.length) {
        setNote({ error: `These columns were not found: ${m.missing.join(", ")}. Download the template to see the headings.` });
        return;
      }
      setRows(m.rows);
      if (!m.rows.length) setNote({ error: "No rows with the required columns filled in." });
    } catch (e) {
      setNote({ error: (e as Error).message || "Could not read that file." });
    }
  }

  function submit() {
    start(async () => {
      let saved = 0;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const r = await save(kind, rows.slice(i, i + CHUNK));
        if (r?.error) {
          setNote({ error: `${saved ? `${saved} rows saved, then: ` : ""}${r.error}` });
          return;
        }
        saved += Number(r?.ok?.match(/\d+/)?.[0] ?? 0);
      }
      let linked = "";
      if (kind === "activities") {
        const links = linksFromRows(rows);
        if (links.length) {
          const r = await save("activity_links", links);
          linked = r?.error ? ` Links between activities were not saved: ${r.error}` : ` ${r?.ok ?? ""}`;
        }
      }
      setNote({ ok: `${saved} rows saved from ${file}.${linked}` });
      setRows([]);
    });
  }

  const href = `data:text/csv;charset=utf-8,${encodeURIComponent(templateCsv(kind))}`;

  const toggle = (
    <div className="we-seg we-seg--light" role="tablist" aria-label="How to import">
      <button type="button" role="tab" aria-selected={mode === "book"} className={mode === "book" ? "is-on" : ""} onClick={() => setMode("book")}>Everything in one workbook</button>
      <button type="button" role="tab" aria-selected={mode === "one"} className={mode === "one" ? "is-on" : ""} onClick={() => setMode("one")}>One sheet at a time</button>
    </div>
  );

  if (mode === "book") return <div className="we-stack">{toggle}<WorkbookImporter save={save} /></div>;

  return (
    <div className="we-stack">
      {toggle}
      <div className="we-import-kinds">
        {[...new Set(kinds.map((k) => IMPORTS[k].area))].map((area) => (
          <div key={area} className="we-import-kinds__group">
            <span className="we-eyebrow">{area}</span>
            <div className="we-row" style={{ gap: 6 }}>
              {kinds.filter((k) => IMPORTS[k].area === area).map((k) => (
                <button key={k} type="button" className={`we-pill${k === kind ? " is-on" : ""}`} onClick={() => { setKind(k); setRows([]); setNote(null); }}>
                  {IMPORTS[k].name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="we-card we-stack">
        <div className="we-row">
          <label className="we-btn we-btn--secondary">
            Choose a file
            <input type="file" hidden accept=".xlsx,.csv,.txt,.xer,.xml" onChange={(e) => e.target.files?.[0] && read(e.target.files[0])} />
          </label>
          <button type="button" className="we-btn we-btn--ghost" onClick={() => downloadTemplate(kind)}>Download Excel template</button>
          <a className="we-link" href={href} download={`weestate-${kind}-template.csv`}>CSV template</a>
        </div>
        <span className="we-help">
          Excel (.xlsx) or CSV with these headings: {cols.map((c) => c.label + (c.required ? " *" : "")).join(", ")}.
          {IMPORTS[kind].help && ` ${IMPORTS[kind].help}`}
          {" "}Saved by {IMPORTS[kind].who}. Rows with the same code are updated, not duplicated.
        </span>
        {note?.error && <div className="we-banner we-banner--error" role="alert">{note.error}</div>}
        {note?.ok && <div className="we-banner we-banner--ok" role="status">{note.ok}</div>}
      </div>
      {rows.length > 0 && (
        <div className="we-stack">
          <div className="we-row">
            <b>{rows.length} rows ready from {file}</b>
            <button className="we-btn we-btn--primary" onClick={submit} disabled={pending}>{pending ? "Saving…" : `Save ${rows.length} rows`}</button>
          </div>
          <div className="we-table-wrap" style={{ maxHeight: 420 }}>
            <table className="we-table">
              <thead><tr>{cols.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
              <tbody>
                {rows.slice(0, 50).map((r, i) => (
                  <tr key={i}>{cols.map((c) => <td key={c.key}>{r[c.key] == null ? "" : String(r[c.key])}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 50 && <span className="we-help">Showing the first 50.</span>}
        </div>
      )}
    </div>
  );
}
