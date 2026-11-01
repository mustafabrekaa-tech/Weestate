// Column layouts for each import, with the header names people tend to use.
export type ImportKind =
  | "phases" | "buildings" | "unit_types" | "units" | "cost_codes" | "budget" | "activities" | "progress"
  | "boq" | "suppliers" | "contracts" | "payments" | "customers" | "assets";

export type Column = { key: string; label: string; aliases: string[]; type?: "number" | "date" | "bool"; required?: boolean; example?: string | number };

type Spec = { name: string; who: string; area: string; company?: boolean; help?: string; columns: Column[] };

// One entry per sheet people can upload. Headings are matched loosely, so the
// sheets they already keep usually work as they are.
export const IMPORTS: Record<ImportKind, Spec> = {
  phases: {
    name: "Phases", who: "PM or Cost control", area: "Project structure",
    columns: [
      { key: "code", label: "Phase code", aliases: ["phase", "code"], required: true, example: "P1" },
      { key: "name", label: "Phase name", aliases: ["name", "description"], example: "Phase 1 villas" },
      { key: "budget_egp", label: "Budget EGP", aliases: ["budget", "amount"], type: "number", example: 250000000 },
      { key: "start_date", label: "Start", aliases: ["start date"], type: "date", example: "2026-01-01" },
      { key: "finish_date", label: "Finish", aliases: ["finish date", "end", "end date"], type: "date", example: "2027-12-31" },
    ],
  },
  buildings: {
    name: "Buildings", who: "PM, Cost control or Technical office", area: "Project structure",
    columns: [
      { key: "code", label: "Building code", aliases: ["building", "block", "code"], required: true, example: "B01" },
      { key: "name", label: "Building name", aliases: ["name"], example: "Building 1" },
      { key: "phase", label: "Phase", aliases: ["phase code"], example: "P1" },
      { key: "floors", label: "Floors", aliases: ["no of floors", "levels"], type: "number", example: 5 },
    ],
  },
  unit_types: {
    name: "Unit types", who: "PM, Cost control or Sales", area: "Project structure",
    help: "Category is one of villa, townhouse, twin house, apartment, duplex, penthouse, chalet, office, retail, clinic or other.",
    columns: [
      { key: "code", label: "Type code", aliases: ["type", "model", "code"], required: true, example: "V-A" },
      { key: "name", label: "Type name", aliases: ["name"], example: "Standalone villa A" },
      { key: "category", label: "Category", aliases: ["kind"], example: "villa" },
      { key: "area_m2", label: "Area m2", aliases: ["area", "bua", "sqm"], type: "number", example: 320 },
      { key: "bedrooms", label: "Bedrooms", aliases: ["beds", "rooms"], type: "number", example: 4 },
    ],
  },
  units: {
    name: "Units", who: "PM, Cost control or Sales", area: "Project structure",
    help: "Status is one of available, reserved, sold, ready, handed over or blocked. Leave it empty to keep the current status.",
    columns: [
      { key: "code", label: "Unit code", aliases: ["unit", "unit no", "unit number", "code"], required: true, example: "B01-101" },
      { key: "phase", label: "Phase", aliases: ["phase code"], example: "P1" },
      { key: "building", label: "Building", aliases: ["building code", "block"], example: "B01" },
      { key: "unit_type", label: "Unit type", aliases: ["type", "model"], example: "V-A" },
      { key: "floor", label: "Floor", aliases: ["level"], type: "number", example: 1 },
      { key: "area_m2", label: "Area m2", aliases: ["area", "bua", "area (m2)", "sqm"], type: "number", example: 320 },
      { key: "garden_m2", label: "Garden m2", aliases: ["garden", "garden area"], type: "number", example: 120 },
      { key: "roof_m2", label: "Roof m2", aliases: ["roof", "roof area"], type: "number" },
      { key: "terrace_m2", label: "Terrace m2", aliases: ["terrace", "balcony"], type: "number" },
      { key: "bedrooms", label: "Bedrooms", aliases: ["beds", "rooms"], type: "number", example: 4 },
      { key: "bathrooms", label: "Bathrooms", aliases: ["baths"], type: "number", example: 3 },
      { key: "view", label: "View", aliases: ["views"], example: "Lagoon" },
      { key: "orientation", label: "Orientation", aliases: ["facing", "direction"], example: "North" },
      { key: "finishing", label: "Finishing", aliases: ["finish", "finishing type"], example: "Semi finished" },
      { key: "status", label: "Status", aliases: [], example: "available" },
      { key: "list_price_egp", label: "List price EGP", aliases: ["price", "list price"], type: "number", example: 18500000 },
      { key: "delivery_date", label: "Delivery date", aliases: ["delivery", "handover date"], type: "date", example: "2028-06-30" },
      { key: "notes", label: "Notes", aliases: ["note", "comment", "remarks"] },
    ],
  },
  cost_codes: {
    name: "Cost codes", who: "Cost control or Finance", area: "Budget and cost", company: true,
    columns: [
      { key: "code", label: "Cost code", aliases: ["code"], required: true, example: "03.01" },
      { key: "parent_code", label: "Parent code", aliases: ["parent"], example: "03" },
      { key: "name", label: "Name", aliases: ["description", "cost code name"], example: "Concrete works" },
      { key: "name_ar", label: "Name in Arabic", aliases: ["arabic name"] },
    ],
  },
  budget: {
    name: "Budget", who: "Cost control or Finance", area: "Budget and cost",
    columns: [
      { key: "cost_code", label: "Cost code", aliases: ["code"], required: true, example: "03.01" },
      { key: "phase", label: "Phase", aliases: [], example: "P1" },
      { key: "amount_egp", label: "Amount EGP", aliases: ["amount", "budget", "value"], type: "number", required: true, example: 42000000 },
      { key: "note", label: "Note", aliases: ["notes", "comment"] },
    ],
  },
  activities: {
    name: "Schedule activities", who: "Cost control or PM", area: "Schedule",
    help: "Primavera P6 (.xer) and MS Project (.xml) exports work too. The first schedule becomes the baseline.",
    columns: [
      { key: "code", label: "Activity ID", aliases: ["activity id", "id", "task id", "code"], required: true, example: "A1010" },
      { key: "name", label: "Activity name", aliases: ["name", "task name", "activity"], required: true, example: "Excavation B01" },
      { key: "wbs", label: "WBS", aliases: [], example: "P1.B01.SUB" },
      { key: "phase", label: "Phase", aliases: [], example: "P1" },
      { key: "building", label: "Building", aliases: ["block"], example: "B01" },
      { key: "start_date", label: "Start", aliases: ["start date", "planned start", "baseline start"], type: "date", example: "2026-02-01" },
      { key: "finish_date", label: "Finish", aliases: ["finish date", "planned finish", "baseline finish", "end"], type: "date", example: "2026-03-15" },
      { key: "is_milestone", label: "Milestone", aliases: [], type: "bool", example: "no" },
      { key: "weight", label: "Weight", aliases: ["budget", "cost", "weight %"], type: "number", example: 1 },
      { key: "category", label: "Category", aliases: ["discipline", "type"], example: "Execution" },
      { key: "predecessors", label: "Predecessors", aliases: ["predecessor", "preds", "links"], example: "A1000 FS+5, A1005 SS" },
    ],
  },
  progress: {
    name: "Progress", who: "Cost control, PM or Site", area: "Schedule",
    help: "One row per activity per reporting date. Percent complete is 0 to 100.",
    columns: [
      { key: "code", label: "Activity ID", aliases: ["activity id", "id", "task id", "code"], required: true, example: "A1010" },
      { key: "period", label: "Date", aliases: ["period", "data date", "as of"], type: "date", example: "2026-10-31" },
      { key: "actual_pct", label: "Percent complete", aliases: ["actual %", "% complete", "progress", "actual"], type: "number", required: true, example: 65 },
      { key: "note", label: "Note", aliases: ["notes", "comment"] },
    ],
  },
  boq: {
    name: "BOQ", who: "Technical office or Cost control", area: "Construction",
    columns: [
      { key: "code", label: "Item no", aliases: ["item", "code", "ref", "item code"], required: true, example: "3.1.1" },
      { key: "description", label: "Description", aliases: ["desc", "item description"], required: true, example: "Reinforced concrete for footings" },
      { key: "unit", label: "Unit", aliases: ["uom"], example: "m3" },
      { key: "quantity", label: "Quantity", aliases: ["qty"], type: "number", example: 850 },
      { key: "rate_egp", label: "Rate EGP", aliases: ["rate", "unit rate", "unit price"], type: "number", example: 6200 },
      { key: "section", label: "Section", aliases: ["bill", "trade", "division"], example: "Concrete" },
      { key: "cost_code", label: "Cost code", aliases: [], example: "03.01" },
      { key: "phase", label: "Phase", aliases: [], example: "P1" },
      { key: "building", label: "Building", aliases: ["block"], example: "B01" },
    ],
  },
  suppliers: {
    name: "Suppliers and contractors", who: "Procurement, PM or Facility", area: "Procurement", company: true,
    help: "Type is contractor, supplier, consultant, facility or other. Rating is 1 to 5.",
    columns: [
      { key: "name", label: "Name", aliases: ["company", "supplier", "contractor"], required: true, example: "Nile Contracting" },
      { key: "name_ar", label: "Name in Arabic", aliases: ["arabic name"] },
      { key: "kind", label: "Type", aliases: ["category"], example: "contractor" },
      { key: "trade", label: "Trade", aliases: ["speciality", "specialty", "scope"], example: "Concrete and structure" },
      { key: "contact_name", label: "Contact person", aliases: ["contact", "contact name"], example: "Eng. Ahmed Samir" },
      { key: "phone", label: "Phone", aliases: ["mobile", "tel"], example: "01000000000" },
      { key: "email", label: "Email", aliases: ["e-mail"] },
      { key: "address", label: "Address", aliases: [] },
      { key: "tax_id", label: "Tax ID", aliases: ["tax no", "tax number", "tax card"] },
      { key: "commercial_reg", label: "Commercial register", aliases: ["cr", "commercial registration", "cr no"] },
      { key: "bank_name", label: "Bank", aliases: ["bank name"] },
      { key: "iban", label: "IBAN", aliases: ["account", "account no", "bank account"] },
      { key: "rating", label: "Rating", aliases: ["score"], type: "number", example: 4 },
      { key: "notes", label: "Notes", aliases: ["note", "comment", "remarks"] },
    ],
  },
  contracts: {
    name: "Contracts", who: "Procurement or PM", area: "Construction",
    help: "Type is main, subcontract, supply, consultancy, facility or other. Status is draft, active, completed, closed or terminated.",
    columns: [
      { key: "code", label: "Contract code", aliases: ["contract", "contract no", "code"], required: true, example: "C-001" },
      { key: "contractor", label: "Contractor", aliases: ["supplier", "vendor", "company"], required: true, example: "Nile Contracting" },
      { key: "scope", label: "Scope", aliases: ["description"], example: "Structure Phase 1" },
      { key: "kind", label: "Type", aliases: ["contract type"], example: "main" },
      { key: "status", label: "Status", aliases: [], example: "active" },
      { key: "value_egp", label: "Value EGP", aliases: ["value", "contract value", "amount"], type: "number", example: 95000000 },
      { key: "advance_pct", label: "Advance %", aliases: ["advance"], type: "number", example: 10 },
      { key: "retention_pct", label: "Retention %", aliases: ["retention"], type: "number", example: 5 },
      { key: "performance_bond_pct", label: "Performance bond %", aliases: ["performance bond", "bond %"], type: "number", example: 5 },
      { key: "vat_pct", label: "VAT %", aliases: ["vat", "tax %"], type: "number", example: 14 },
      { key: "defects_months", label: "Defects period months", aliases: ["defects liability", "dlp", "maintenance period"], type: "number", example: 12 },
      { key: "payment_terms", label: "Payment terms", aliases: ["terms"], example: "Monthly certificates, paid in 30 days" },
      { key: "insurance", label: "Insurance", aliases: ["car policy"] },
      { key: "signed_on", label: "Signed on", aliases: ["signing date", "signed"], type: "date", example: "2026-01-15" },
      { key: "start_date", label: "Start", aliases: ["start date"], type: "date", example: "2026-02-01" },
      { key: "finish_date", label: "Finish", aliases: ["finish date", "end", "end date"], type: "date", example: "2027-06-30" },
      { key: "contact_name", label: "Contact person", aliases: ["contact"] },
      { key: "contact_phone", label: "Contact phone", aliases: ["phone", "mobile"] },
      { key: "contact_email", label: "Contact email", aliases: ["email"] },
      { key: "cost_code", label: "Cost code", aliases: [], example: "03" },
      { key: "phase", label: "Phase", aliases: [], example: "P1" },
      { key: "notes", label: "Notes", aliases: ["note", "remarks"] },
    ],
  },
  payments: {
    name: "Payments made", who: "Finance", area: "Budget and cost",
    help: "Past payments to contractors and suppliers, for the cost report and cash flow.",
    columns: [
      { key: "contract", label: "Contract code", aliases: ["contract", "contract no"], example: "C-001" },
      { key: "supplier", label: "Paid to", aliases: ["supplier", "contractor", "payee"], example: "Nile Contracting" },
      { key: "cost_code", label: "Cost code", aliases: [], example: "03.01" },
      { key: "amount_egp", label: "Amount EGP", aliases: ["amount", "paid", "value"], type: "number", required: true, example: 4500000 },
      { key: "paid_on", label: "Paid on", aliases: ["date", "payment date"], type: "date", example: "2026-09-30" },
      { key: "reference", label: "Reference", aliases: ["cheque", "check no", "transfer no", "ref"] },
    ],
  },
  customers: {
    name: "Customers and owners", who: "Sales, Handover or Community", area: "Sales and customers", company: true,
    help: "People with the same national ID are updated, not added twice.",
    columns: [
      { key: "full_name", label: "Full name", aliases: ["name", "customer", "owner", "client"], required: true, example: "Mona Hassan" },
      { key: "national_id", label: "National ID", aliases: ["id", "id number", "passport", "national id / passport"] },
      { key: "nationality", label: "Nationality", aliases: [], example: "Egyptian" },
      { key: "phone", label: "Phone", aliases: ["mobile", "tel"], example: "01000000000" },
      { key: "phone2", label: "Second phone", aliases: ["phone 2", "mobile 2", "other phone"] },
      { key: "email", label: "Email", aliases: ["e-mail"] },
      { key: "address", label: "Address", aliases: [] },
      { key: "birth_date", label: "Date of birth", aliases: ["dob", "birth date", "birthday"], type: "date" },
      { key: "occupation", label: "Occupation", aliases: ["job", "profession"] },
      { key: "source", label: "Lead source", aliases: ["source", "channel"], example: "Broker" },
      { key: "broker", label: "Broker", aliases: ["agent", "broker name"] },
      { key: "notes", label: "Notes", aliases: ["note", "remarks"] },
    ],
  },
  assets: {
    name: "Assets and equipment", who: "Facility or PM", area: "Facility management",
    help: "Category is lift, pump, generator, hvac, fire, electrical, irrigation, pool, landscape, security or other.",
    columns: [
      { key: "tag", label: "Asset tag", aliases: ["tag", "asset no", "code"], required: true, example: "LIFT-B01-1" },
      { key: "name", label: "Name", aliases: ["description", "asset"], example: "Passenger lift 1" },
      { key: "category", label: "Category", aliases: ["type"], example: "lift" },
      { key: "building", label: "Building", aliases: ["block"], example: "B01" },
      { key: "unit", label: "Unit", aliases: ["unit code"] },
      { key: "contract", label: "Maintenance contract", aliases: ["contract", "contract code"] },
      { key: "manufacturer", label: "Manufacturer", aliases: ["make", "brand"], example: "Schindler" },
      { key: "model", label: "Model", aliases: [] },
      { key: "install_date", label: "Installed on", aliases: ["install date", "installation date"], type: "date" },
      { key: "warranty_until", label: "Warranty until", aliases: ["warranty", "warranty end"], type: "date" },
    ],
  },
};

export const IMPORT_ORDER: ImportKind[] = [
  "phases", "buildings", "unit_types", "units", "cost_codes", "budget", "payments", "activities", "progress",
  "boq", "contracts", "suppliers", "customers", "assets",
];

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

// Primavera P6 .xer export: the TASK table, with links from TASKPRED.
export function parseXer(text: string) {
  const lines = text.split(/\r?\n/);
  let table = "", fields: string[] = [];
  const rows: Record<string, unknown>[] = [];
  const codeOf = new Map<string, string>();
  const preds: { task: string; pred: string; type: string; lag: number }[] = [];
  for (const line of lines) {
    const parts = line.split("\t");
    if (parts[0] === "%T") table = parts[1] ?? "";
    else if (parts[0] === "%F") fields = parts.slice(1);
    else if (parts[0] === "%R" && table === "TASK") {
      const r = Object.fromEntries(fields.map((f, i) => [f, parts[i + 1] ?? ""]));
      codeOf.set(r.task_id!, r.task_code!);
      if (r.task_type === "TT_WBS" || r.task_type === "TT_LOE") continue;
      rows.push({
        code: r.task_code,
        name: r.task_name,
        start_date: toDate(r.target_start_date || r.early_start_date),
        finish_date: toDate(r.target_end_date || r.early_end_date),
        is_milestone: r.task_type === "TT_Mile" || r.task_type === "TT_FinMile",
        weight: Number(r.target_drtn_hr_cnt) || 1,
      });
    } else if (parts[0] === "%R" && table === "TASKPRED") {
      const r = Object.fromEntries(fields.map((f, i) => [f, parts[i + 1] ?? ""]));
      preds.push({ task: r.task_id!, pred: r.pred_task_id!, type: (r.pred_type ?? "PR_FS").replace("PR_", ""), lag: Math.round((Number(r.lag_hr_cnt) || 0) / 8) });
    }
  }
  const byTask = new Map<string, string[]>();
  for (const p of preds) {
    const succ = codeOf.get(p.task), pred = codeOf.get(p.pred);
    if (!succ || !pred) continue;
    byTask.set(succ, [...(byTask.get(succ) ?? []), `${pred} ${p.type}${p.lag ? (p.lag > 0 ? "+" : "") + p.lag : ""}`]);
  }
  for (const r of rows) if (byTask.has(r.code as string)) r.predecessors = byTask.get(r.code as string)!.join(", ");
  return rows.filter((r) => r.code && r.name);
}

// Microsoft Project XML export (File > Save as > XML), with predecessor links.
export function parseMspXml(text: string) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const get = (el: Element, tag: string) => el.getElementsByTagName(tag)[0]?.textContent ?? "";
  const tasks = [...doc.getElementsByTagName("Task")];
  const codeOf = new Map(tasks.map((t) => [get(t, "UID"), get(t, "WBS") || get(t, "ID")]));
  const TYPES = ["FF", "FS", "SF", "SS"];
  return tasks
    .filter((t) => get(t, "Summary") !== "1" && get(t, "Name"))
    .map((t) => ({
      code: get(t, "WBS") || get(t, "ID"),
      name: get(t, "Name"),
      wbs: get(t, "OutlineNumber"),
      start_date: toDate(get(t, "Start")),
      finish_date: toDate(get(t, "Finish")),
      is_milestone: get(t, "Milestone") === "1",
      weight: 1,
      predecessors: [...t.getElementsByTagName("PredecessorLink")]
        .map((l) => {
          const pred = codeOf.get(get(l, "PredecessorUID"));
          const lag = Math.round((Number(get(l, "LinkLag")) || 0) / 4800); // tenths of a minute, 8h days
          return pred ? `${pred} ${TYPES[Number(get(l, "Type") || 1)] ?? "FS"}${lag ? (lag > 0 ? "+" : "") + lag : ""}` : "";
        })
        .filter(Boolean)
        .join(", "),
    }));
}

// The links written in a "Predecessors" column, for every imported activity.
export function linksFromRows(rows: Record<string, unknown>[]) {
  const out: { pred: string; succ: string; type: string; lag: number }[] = [];
  for (const r of rows) {
    const text = String(r.predecessors ?? "");
    for (const part of text.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean)) {
      const m = part.match(/^(.+?)\s*(FS|SS|FF|SF)?\s*([+-]\s*\d+)?\s*d?$/i);
      if (m) out.push({ pred: m[1]!.trim(), succ: String(r.code), type: (m[2] ?? "FS").toUpperCase(), lag: m[3] ? Number(m[3].replace(/\s/g, "")) : 0 });
    }
  }
  return out;
}

export function templateCsv(kind: ImportKind) {
  return IMPORTS[kind].columns.map((c) => c.label).join(",") + "\n";
}

// An Excel template with the headings, one example row and a notes sheet.
export async function downloadTemplate(kind: ImportKind) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const spec = IMPORTS[kind];
  const head = spec.columns.map((c) => ({ value: c.label, fontWeight: "bold" as const, backgroundColor: "#F7EFDC" }));
  const example = spec.columns.map((c) =>
    c.example == null ? null : c.type === "date" ? { value: new Date(String(c.example)), type: Date, format: "yyyy-mm-dd" }
      : typeof c.example === "number" ? { value: c.example, type: Number } : { value: String(c.example), type: String },
  );
  const notes = [
    [{ value: "Column", fontWeight: "bold" as const }, { value: "Needed", fontWeight: "bold" as const }, { value: "Kind", fontWeight: "bold" as const }, { value: "Also accepted as", fontWeight: "bold" as const }],
    ...spec.columns.map((c) => [
      { value: c.label }, { value: c.required ? "Yes" : "" }, { value: c.type ?? "text" }, { value: c.aliases.join(", ") },
    ]),
    [],
    [{ value: spec.help ?? "Replace the example row with your own data. Extra columns are ignored." }],
  ];
  await writeXlsxFile(
    [
      { data: [head, example], sheet: spec.name.slice(0, 31), columns: spec.columns.map((c) => ({ width: Math.max(14, c.label.length + 4) })), stickyRowsCount: 1 },
      { data: notes, sheet: "How to fill", columns: [{ width: 26 }, { width: 10 }, { width: 10 }, { width: 60 }] },
    ] as never,
  ).toFile(`weestate-${kind}-template.xlsx`);
}

// One workbook for everything: one sheet per kind, saved in this order so
// phases and buildings exist before units, suppliers before contracts, and so on.
export const WORKBOOK_ORDER: ImportKind[] = [
  "phases", "buildings", "unit_types", "units", "cost_codes", "budget", "suppliers", "contracts", "payments",
  "activities", "progress", "boq", "customers", "assets",
];

const SHEET_NAMES: Partial<Record<ImportKind, string[]>> = {
  unit_types: ["types", "unit type"],
  cost_codes: ["cost code", "cbs"],
  budget: ["budgets", "budget lines"],
  activities: ["schedule", "activities", "programme", "program"],
  progress: ["progress updates", "progress update"],
  suppliers: ["suppliers", "contractors", "vendors"],
  payments: ["payments", "payments out"],
  customers: ["customers", "owners", "clients"],
  assets: ["assets", "equipment"],
};

// Which import a sheet belongs to, from its name ("Units", "04 Units", "unit_types"...).
export function kindOfSheet(name: string): ImportKind | null {
  const n = norm(name).replace(/^\d+\s*/, "");
  for (const k of WORKBOOK_ORDER) {
    const names = [k, k.replace(/_/g, " "), IMPORTS[k].name, ...(SHEET_NAMES[k] ?? [])].map(norm);
    if (names.includes(n)) return k;
  }
  return null;
}

// The blank workbook: a read-me sheet, then one sheet per kind with its headings.
export async function downloadWorkbook() {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const b = (value: string) => ({ value, fontWeight: "bold" as const });
  const head = (value: string) => ({ value, fontWeight: "bold" as const, backgroundColor: "#F7EFDC" });
  const readMe = [
    [{ value: "WE-estate import workbook", fontWeight: "bold" as const, fontSize: 14 }],
    [{ value: "Fill in the sheets you have and leave the rest empty. Upload the whole file on Import from Excel › Everything in one workbook." }],
    [{ value: "Sheets are saved in the order below, so phases and buildings exist before units, and suppliers before contracts." }],
    [{ value: "Rows with the same code are updated, not duplicated, so you can upload the same workbook again after changes." }],
    [{ value: "Dates as real Excel dates or yyyy-mm-dd. Columns marked * must be filled. Don't rename the sheets." }],
    [],
    [b("Sheet"), b("What goes in it"), b("Who usually fills it"), b("Must have")],
    ...WORKBOOK_ORDER.map((k) => [
      { value: IMPORTS[k].name }, { value: IMPORTS[k].help ?? IMPORTS[k].area }, { value: IMPORTS[k].who },
      { value: IMPORTS[k].columns.filter((c) => c.required).map((c) => c.label).join(", ") },
    ]),
    [],
    [b("Sheet"), b("Column"), b("Needed"), b("Example"), b("Also accepted as")],
    ...WORKBOOK_ORDER.flatMap((k) => IMPORTS[k].columns.map((c) => [
      { value: IMPORTS[k].name }, { value: c.label }, { value: c.required ? "Yes" : "" },
      { value: c.example == null ? "" : String(c.example) }, { value: c.aliases.join(", ") },
    ])),
  ];
  await writeXlsxFile(
    [
      { data: readMe, sheet: "Read me", columns: [{ width: 26 }, { width: 70 }, { width: 34 }, { width: 30 }, { width: 40 }] },
      ...WORKBOOK_ORDER.map((k) => ({
        data: [IMPORTS[k].columns.map((c) => head(c.label + (c.required ? " *" : "")))],
        sheet: IMPORTS[k].name.slice(0, 31),
        columns: IMPORTS[k].columns.map((c) => ({ width: Math.max(14, c.label.length + 4) })),
        stickyRowsCount: 1,
      })),
    ] as never,
  ).toFile("weestate-import-workbook.xlsx");
}
