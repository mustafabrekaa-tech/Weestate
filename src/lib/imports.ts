// Column layouts for each import, with the header names people tend to use.
export type ImportKind = "units" | "boq" | "contracts" | "budget" | "activities" | "suppliers" | "customers";

export type Column = { key: string; label: string; aliases: string[]; type?: "number" | "date" | "bool"; required?: boolean };

export const IMPORTS: Record<ImportKind, { name: string; who: string; columns: Column[] }> = {
  units: {
    name: "Units",
    who: "PM, Cost control or Sales",
    columns: [
      { key: "code", label: "Unit code", aliases: ["unit", "unit no", "unit number", "code"], required: true },
      { key: "phase", label: "Phase", aliases: ["phase code"] },
      { key: "building", label: "Building", aliases: ["building code", "block"] },
      { key: "unit_type", label: "Unit type", aliases: ["type", "model"] },
      { key: "area_m2", label: "Area m2", aliases: ["area", "bua", "area (m2)", "sqm"], type: "number" },
      { key: "floor", label: "Floor", aliases: ["level"], type: "number" },
      { key: "status", label: "Status", aliases: [] },
      { key: "list_price_egp", label: "List price EGP", aliases: ["price", "list price"], type: "number" },
    ],
  },
  boq: {
    name: "BOQ",
    who: "Technical office or Cost control",
    columns: [
      { key: "code", label: "Item no", aliases: ["item", "code", "ref", "item code"], required: true },
      { key: "description", label: "Description", aliases: ["desc", "item description"], required: true },
      { key: "unit", label: "Unit", aliases: ["uom"] },
      { key: "quantity", label: "Quantity", aliases: ["qty"], type: "number" },
      { key: "rate_egp", label: "Rate EGP", aliases: ["rate", "unit rate", "unit price"], type: "number" },
      { key: "section", label: "Section", aliases: ["bill", "trade", "division"] },
      { key: "cost_code", label: "Cost code", aliases: [] },
      { key: "phase", label: "Phase", aliases: [] },
    ],
  },
  contracts: {
    name: "Contracts",
    who: "Procurement or PM",
    columns: [
      { key: "code", label: "Contract code", aliases: ["contract", "contract no", "code"], required: true },
      { key: "contractor", label: "Contractor", aliases: ["supplier", "vendor", "company"], required: true },
      { key: "scope", label: "Scope", aliases: ["description"] },
      { key: "value_egp", label: "Value EGP", aliases: ["value", "contract value", "amount"], type: "number" },
      { key: "retention_pct", label: "Retention %", aliases: ["retention"], type: "number" },
      { key: "advance_pct", label: "Advance %", aliases: ["advance"], type: "number" },
      { key: "kind", label: "Type", aliases: ["contract type"] },
      { key: "cost_code", label: "Cost code", aliases: [] },
      { key: "phase", label: "Phase", aliases: [] },
      { key: "start_date", label: "Start", aliases: ["start date"], type: "date" },
      { key: "finish_date", label: "Finish", aliases: ["finish date", "end", "end date"], type: "date" },
    ],
  },
  budget: {
    name: "Budget",
    who: "Cost control or Finance",
    columns: [
      { key: "cost_code", label: "Cost code", aliases: ["code"], required: true },
      { key: "phase", label: "Phase", aliases: [] },
      { key: "amount_egp", label: "Amount EGP", aliases: ["amount", "budget", "value"], type: "number", required: true },
      { key: "note", label: "Note", aliases: ["notes", "comment"] },
    ],
  },
  activities: {
    name: "Schedule activities",
    who: "Cost control or PM",
    columns: [
      { key: "code", label: "Activity ID", aliases: ["activity id", "id", "task id", "code"], required: true },
      { key: "name", label: "Activity name", aliases: ["name", "task name", "activity"], required: true },
      { key: "wbs", label: "WBS", aliases: [] },
      { key: "phase", label: "Phase", aliases: [] },
      { key: "start_date", label: "Start", aliases: ["start date", "planned start", "baseline start"], type: "date" },
      { key: "finish_date", label: "Finish", aliases: ["finish date", "planned finish", "baseline finish", "end"], type: "date" },
      { key: "is_milestone", label: "Milestone", aliases: [], type: "bool" },
      { key: "weight", label: "Weight", aliases: ["budget", "cost", "weight %"], type: "number" },
    ],
  },
  suppliers: {
    name: "Suppliers and contractors",
    who: "Procurement, PM or Facility",
    columns: [
      { key: "name", label: "Name", aliases: ["company", "supplier"], required: true },
      { key: "kind", label: "Type", aliases: ["category"] },
      { key: "tax_id", label: "Tax ID", aliases: ["tax no", "tax number"] },
      { key: "phone", label: "Phone", aliases: ["mobile", "tel"] },
      { key: "email", label: "Email", aliases: ["e-mail"] },
    ],
  },
  customers: {
    name: "Customers and owners",
    who: "Sales, Handover or Community",
    columns: [
      { key: "full_name", label: "Full name", aliases: ["name", "customer", "owner"], required: true },
      { key: "national_id", label: "National ID", aliases: ["id", "id number", "passport"] },
      { key: "phone", label: "Phone", aliases: ["mobile", "tel"] },
      { key: "email", label: "Email", aliases: ["e-mail"] },
      { key: "address", label: "Address", aliases: [] },
    ],
  },
};

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[_\s]+/g, " ").replace(/[^\p{L}\p{N} %]/gu, "").trim();

function toDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  const s = String(v).trim();
  const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2]!.padStart(2, "0")}-${dmy[1]!.padStart(2, "0")}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

// Turns a sheet (first row headers) into rows the database import expects.
export function mapRows(kind: ImportKind, table: unknown[][]) {
  const cols = IMPORTS[kind].columns;
  const headerRow = table.findIndex((r) => r.filter((c) => c != null && c !== "").length >= 2);
  if (headerRow < 0) return { rows: [], missing: cols.filter((c) => c.required).map((c) => c.label), matched: [] as string[] };
  const headers = table[headerRow]!.map(norm);
  const index: Record<string, number> = {};
  for (const c of cols) {
    const names = [c.key, c.label, ...c.aliases].map(norm);
    const i = headers.findIndex((h) => names.includes(h));
    if (i >= 0) index[c.key] = i;
  }
  const missing = cols.filter((c) => c.required && index[c.key] == null).map((c) => c.label);
  const rows = table
    .slice(headerRow + 1)
    .map((r) => {
      const o: Record<string, unknown> = {};
      for (const c of cols) {
        const i = index[c.key];
        if (i == null) continue;
        const v = r[i];
        if (v == null || v === "") continue;
        if (c.type === "number") {
          const n = typeof v === "number" ? v : Number(String(v).replace(/[,\s%]/g, ""));
          if (Number.isFinite(n)) o[c.key] = n;
        } else if (c.type === "date") o[c.key] = toDate(v);
        else if (c.type === "bool") o[c.key] = ["1", "yes", "true", "y", "x"].includes(norm(v));
        else o[c.key] = String(v).trim();
      }
      return o;
    })
    .filter((o) => cols.filter((c) => c.required).every((c) => o[c.key] != null && o[c.key] !== ""));
  return { rows, missing, matched: Object.keys(index) };
}

export function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  const sep = (text.split("\n")[0] ?? "").split(";").length > (text.split("\n")[0] ?? "").split(",").length ? ";" : ",";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell.replace(/\r$/, "")); out.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  return out;
}

// Primavera P6 .xer export: the TASK table.
export function parseXer(text: string) {
  const lines = text.split(/\r?\n/);
  let table = "", fields: string[] = [];
  const rows: Record<string, unknown>[] = [];
  for (const line of lines) {
    const parts = line.split("\t");
    if (parts[0] === "%T") table = parts[1] ?? "";
    else if (parts[0] === "%F") fields = parts.slice(1);
    else if (parts[0] === "%R" && table === "TASK") {
      const r = Object.fromEntries(fields.map((f, i) => [f, parts[i + 1] ?? ""]));
      if (r.task_type === "TT_WBS" || r.task_type === "TT_LOE") continue;
      rows.push({
        code: r.task_code,
        name: r.task_name,
        start_date: toDate(r.target_start_date || r.early_start_date),
        finish_date: toDate(r.target_end_date || r.early_end_date),
        is_milestone: r.task_type === "TT_Mile" || r.task_type === "TT_FinMile",
        weight: Number(r.target_drtn_hr_cnt) || 1,
      });
    }
  }
  return rows.filter((r) => r.code && r.name);
}

// Microsoft Project XML export (File > Save as > XML).
export function parseMspXml(text: string) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const get = (el: Element, tag: string) => el.getElementsByTagName(tag)[0]?.textContent ?? "";
  return [...doc.getElementsByTagName("Task")]
    .filter((t) => get(t, "Summary") !== "1" && get(t, "Name"))
    .map((t) => ({
      code: get(t, "WBS") || get(t, "ID"),
      name: get(t, "Name"),
      wbs: get(t, "OutlineNumber"),
      start_date: toDate(get(t, "Start")),
      finish_date: toDate(get(t, "Finish")),
      is_milestone: get(t, "Milestone") === "1",
      weight: 1,
    }));
}

export function templateCsv(kind: ImportKind) {
  return IMPORTS[kind].columns.map((c) => c.label).join(",") + "\n";
}
