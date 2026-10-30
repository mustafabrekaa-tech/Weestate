// Who may do what, shared by server pages and client components.

export type Profile = {
  id: string;
  full_name: string;
  email: string;
  department: string | null;
  is_admin: boolean;
  is_platform_admin: boolean;
  company_id: string | null;
  phone: string;
  read_only: boolean;
  all_projects: boolean;
  extra_roles: string[];
  email_alerts?: boolean;
};

// Whether the person acts for any of these departments (admins act for all;
// view-only people for none). Mirrors public.in_department in the database.
export function acts(me: Profile | null | undefined, codes: string[]) {
  if (!me) return false;
  if (me.is_admin || me.is_platform_admin) return true;
  if (me.read_only) return false;
  return codes.includes(me.department ?? "") || (me.extra_roles ?? []).some((r) => codes.includes(r));
}


// Sections of the app an admin can hide from a department.
export const MODULES: { key: string; label: string; help: string }[] = [
  { key: "planning", label: "Budget and planning", help: "Budget, schedule and cash flow" },
  { key: "construction", label: "Construction", help: "BOQ, contracts, certificates and variations" },
  { key: "procurement", label: "Procurement", help: "Purchase requests and suppliers" },
  { key: "sales", label: "Sales and customers", help: "Units, sales and customers" },
  { key: "handover", label: "Handover and community", help: "Handovers and owner requests" },
  { key: "facility", label: "Facility management", help: "Work orders" },
  { key: "site", label: "3D site", help: "Site map and 3D models" },
  { key: "import", label: "Import from Excel", help: "Uploading data from spreadsheets" },
  { key: "departments", label: "Department queues", help: "Other departments' queues" },
];

// Project tabs and workflow documents by section.
export const TAB_MODULE: Record<string, string> = {
  budget: "planning", schedule: "planning", cashflow: "planning", boq: "construction", contracts: "construction",
  units: "sales", site: "site", import: "import",
};
export const DOC_MODULE: Record<string, string> = {
  budget_revision: "planning", schedule_update: "planning", payment_certificate: "construction", variation_order: "construction",
  purchase_request: "procurement", unit_sale: "sales", unit_handover: "handover", owner_request: "handover", work_order: "facility",
};
