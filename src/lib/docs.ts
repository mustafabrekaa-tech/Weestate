// What the screens need to know about each workflow document. The steps,
// departments and limits live in the database; this is only how to show and
// raise each type.

export type RefSource =
  | "contracts"
  | "cost_codes"
  | "units_available"
  | "units_sold"
  | "units"
  | "customers"
  | "suppliers"
  | "budgets"
  | "schedule_versions";

export type Field = {
  name: string;
  label: string;
  kind: "text" | "textarea" | "money" | "int" | "date" | "datetime" | "select" | "ref" | "check";
  required?: boolean;
  options?: [string, string][];
  ref?: RefSource;
  help?: string;
};

export type LineConfig = {
  table: string;
  fk: string;
  label: string;
  columns: Field[];
};

export type DocType = {
  type: string;
  slug: string;
  table: string;
  name: string;
  plural: string;
  prefix: string;
  doneStatus: string;
  // Departments that raise this document (step 1).
  raisers: string[];
  fields: Field[];
  lines?: LineConfig;
  // Extra embedded selects for the detail page.
  embed?: string;
  summary: (d: Record<string, unknown>) => string;
};

const reasons: [string, string][] = [
  ["client_change", "Client change"],
  ["design_change", "Design change"],
  ["site_condition", "Site condition"],
  ["design_error", "Design error"],
  ["authority", "Authority requirement"],
  ["other", "Other"],
];

export const DOCS: DocType[] = [
  {
    type: "payment_certificate",
    slug: "certificates",
    table: "payment_certificates",
    name: "Payment certificate",
    plural: "Payment certificates",
    prefix: "PC",
    doneStatus: "paid",
    raisers: ["site", "tech_office"],
    fields: [
      { name: "contract_id", label: "Contract", kind: "ref", ref: "contracts", required: true },
      { name: "period_end", label: "Period ending", kind: "date", required: true },
      { name: "gross_egp", label: "Certified this period (EGP)", kind: "money", required: true, help: "Retention and advance recovery are worked out from the contract." },
      { name: "penalty_egp", label: "Penalties (EGP)", kind: "money" },
      { name: "other_deductions_egp", label: "Other deductions (EGP)", kind: "money" },
      { name: "description", label: "What it covers", kind: "textarea" },
    ],
    embed: "contracts(code, contractor, scope)",
    summary: (d) => String((d.contracts as { contractor?: string } | null)?.contractor ?? ""),
  },
  {
    type: "variation_order",
    slug: "variations",
    table: "variation_orders",
    name: "Variation order",
    plural: "Variation orders",
    prefix: "VO",
    doneStatus: "done",
    raisers: ["site", "tech_office", "pm"],
    fields: [
      { name: "title", label: "Title", kind: "text", required: true },
      { name: "contract_id", label: "Contract", kind: "ref", ref: "contracts" },
      { name: "cost_code_id", label: "Cost code", kind: "ref", ref: "cost_codes" },
      { name: "reason", label: "Reason", kind: "select", options: reasons },
      { name: "amount_egp", label: "Value (EGP)", kind: "money", help: "Use a minus sign for an omission." },
      { name: "time_impact_days", label: "Time impact (days)", kind: "int" },
      { name: "description", label: "Description", kind: "textarea" },
    ],
    embed: "contracts(code, contractor)",
    summary: (d) => String((d.contracts as { contractor?: string } | null)?.contractor ?? d.reason ?? ""),
  },
  {
    type: "purchase_request",
    slug: "purchases",
    table: "purchase_requests",
    name: "Purchase request",
    plural: "Purchase requests",
    prefix: "PR",
    doneStatus: "done",
    raisers: ["site", "pm", "facility", "procurement"],
    fields: [
      { name: "title", label: "What is needed", kind: "text", required: true },
      { name: "cost_code_id", label: "Cost code", kind: "ref", ref: "cost_codes" },
      { name: "needed_by", label: "Needed by", kind: "date" },
    ],
    lines: {
      table: "pr_lines",
      fk: "pr_id",
      label: "Items",
      columns: [
        { name: "description", label: "Item", kind: "text", required: true },
        { name: "unit", label: "Unit", kind: "text" },
        { name: "quantity", label: "Qty", kind: "money" },
        { name: "rate_egp", label: "Est. rate (EGP)", kind: "money" },
      ],
    },
    summary: (d) => (d.needed_by ? `Needed by ${d.needed_by}` : ""),
  },
  {
    type: "budget_revision",
    slug: "budget-revisions",
    table: "budget_revisions",
    name: "Budget revision",
    plural: "Budget revisions",
    prefix: "BR",
    doneStatus: "done",
    raisers: ["cost_control"],
    fields: [
      { name: "title", label: "Title", kind: "text", required: true },
      { name: "reason", label: "Why", kind: "textarea" },
    ],
    lines: {
      table: "budget_revision_lines",
      fk: "revision_id",
      label: "Changes by cost code",
      columns: [
        { name: "cost_code_id", label: "Cost code", kind: "ref", ref: "cost_codes", required: true },
        { name: "change_egp", label: "Change (EGP, + or −)", kind: "money", required: true },
      ],
    },
    summary: (d) => String(d.reason ?? ""),
  },
  {
    type: "schedule_update",
    slug: "schedule-updates",
    table: "schedule_updates",
    name: "Schedule update",
    plural: "Schedule updates",
    prefix: "SU",
    doneStatus: "done",
    raisers: ["cost_control"],
    fields: [
      { name: "title", label: "Title", kind: "text", required: true },
      { name: "data_date", label: "Data date", kind: "date" },
      { name: "version_id", label: "Schedule", kind: "ref", ref: "schedule_versions" },
    ],
    summary: (d) => (d.data_date ? `Data date ${d.data_date}` : ""),
  },
  {
    type: "unit_sale",
    slug: "sales",
    table: "unit_sales",
    name: "Unit sale",
    plural: "Unit sales",
    prefix: "SA",
    doneStatus: "done",
    raisers: ["sales"],
    fields: [
      { name: "unit_id", label: "Unit", kind: "ref", ref: "units_available", required: true },
      { name: "customer_id", label: "Customer", kind: "ref", ref: "customers", help: "Or add a new customer below." },
      { name: "new_customer_name", label: "New customer: full name", kind: "text" },
      { name: "new_customer_phone", label: "New customer: phone", kind: "text" },
      { name: "new_customer_national_id", label: "New customer: national ID", kind: "text" },
      { name: "price_egp", label: "Price (EGP)", kind: "money", required: true },
      { name: "discount_egp", label: "Discount (EGP)", kind: "money" },
      { name: "down_payment_egp", label: "Down payment (EGP)", kind: "money" },
      { name: "years", label: "Instalment years", kind: "int", help: "Quarterly instalments are created when the contract is signed." },
    ],
    embed: "units(code, unit_type), customers(full_name, phone)",
    summary: (d) =>
      [(d.units as { code?: string } | null)?.code, (d.customers as { full_name?: string } | null)?.full_name].filter(Boolean).join(" · "),
  },
  {
    type: "unit_handover",
    slug: "handovers",
    table: "unit_handovers",
    name: "Unit handover",
    plural: "Unit handovers",
    prefix: "HO",
    doneStatus: "done",
    raisers: ["site", "handover"],
    fields: [
      { name: "unit_id", label: "Unit", kind: "ref", ref: "units_sold", required: true },
      { name: "customer_id", label: "Owner", kind: "ref", ref: "customers" },
      { name: "scheduled_at", label: "Handover appointment", kind: "datetime" },
      { name: "meter_electric", label: "Electricity meter", kind: "text" },
      { name: "meter_water", label: "Water meter", kind: "text" },
      { name: "keys", label: "Keys handed", kind: "int" },
      { name: "notes", label: "Notes", kind: "textarea" },
    ],
    embed: "units(code, unit_type), customers(full_name, phone)",
    summary: (d) =>
      [(d.units as { code?: string } | null)?.code, (d.customers as { full_name?: string } | null)?.full_name].filter(Boolean).join(" · "),
  },
  {
    type: "work_order",
    slug: "work-orders",
    table: "work_orders",
    name: "Work order",
    plural: "Work orders",
    prefix: "WO",
    doneStatus: "done",
    raisers: ["community", "facility"],
    fields: [
      { name: "title", label: "Problem", kind: "text", required: true },
      { name: "unit_id", label: "Unit", kind: "ref", ref: "units" },
      {
        name: "priority",
        label: "Priority",
        kind: "select",
        options: [["normal", "Normal"], ["low", "Low"], ["high", "High"], ["urgent", "Urgent"]],
      },
      {
        name: "source",
        label: "Reported by",
        kind: "select",
        options: [["owner", "Owner"], ["inspection", "Inspection"], ["preventive", "Preventive plan"], ["security", "Security"], ["staff", "Staff"]],
      },
      { name: "is_warranty", label: "Under warranty (contractor fixes)", kind: "check" },
      { name: "description", label: "Details", kind: "textarea" },
    ],
    embed: "units(code)",
    summary: (d) => [(d.units as { code?: string } | null)?.code, d.priority].filter(Boolean).join(" · "),
  },
  {
    type: "owner_request",
    slug: "owner-requests",
    table: "owner_requests",
    name: "Owner request",
    plural: "Owner requests",
    prefix: "OR",
    doneStatus: "done",
    raisers: ["community", "handover"],
    fields: [
      { name: "title", label: "Request", kind: "text", required: true },
      { name: "unit_id", label: "Unit", kind: "ref", ref: "units" },
      { name: "customer_id", label: "Owner", kind: "ref", ref: "customers" },
      {
        name: "kind",
        label: "Type",
        kind: "select",
        options: [["other", "Other"], ["modification", "Modification"], ["complaint", "Complaint"], ["move_in", "Move in"], ["move_out", "Move out"], ["document", "Document"]],
      },
      { name: "description", label: "Details", kind: "textarea" },
    ],
    embed: "units(code), customers(full_name)",
    summary: (d) => [(d.units as { code?: string } | null)?.code, d.kind].filter(Boolean).join(" · "),
  },
];

export const docByType = (type: string) => DOCS.find((d) => d.type === type);
export const docBySlug = (slug: string) => DOCS.find((d) => d.slug === slug);
export const docHref = (type: string, id?: string) => {
  const d = docByType(type);
  return `/docs/${d?.slug ?? type}${id ? `/${id}` : ""}`;
};
export const docRef = (prefix: string, n: number | null | undefined) => `${prefix}-${String(n ?? 0).padStart(2, "0")}`;
export const canRaise = (d: DocType, dept: string | null | undefined, admin: boolean) =>
  admin || (!!dept && d.raisers.includes(dept));
