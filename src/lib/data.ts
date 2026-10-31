import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export { acts, type Profile } from "@/lib/access";
import type { Profile } from "@/lib/access";

export type QueueItem = {
  doc_type: string;
  doc_id: string;
  ref: string;
  title: string;
  subtitle: string;
  project_id: string;
  project_name: string;
  amount_egp: number;
  status: string;
  step: number;
  step_name: string;
  department: string;
  department_name: string;
  step_entered_at: string;
  due_days: number;
  days_waiting: number;
  overdue: boolean;
};

export type Department = { code: string; name: string; name_ar: string; sort: number };

// Once per request, however many layouts and pages ask.
export const getMe = cache(async function getMe() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const id = claims?.claims?.sub;
  if (!id) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", id).single();
  return data as Profile | null;
});

// Overdue first, then the longest waiting.
export function sortQueue(items: QueueItem[]) {
  return [...items].sort(
    (a, b) => Number(b.overdue) - Number(a.overdue) || b.days_waiting - a.days_waiting,
  );
}

export type StepRow = {
  seq: number;
  name: string;
  action: string;
  department: string;
  due_days: number;
  only_above_limit: boolean;
  company_id: string | null;
  departments: { name: string } | null;
};

// A company's own steps for a document type if it has any, else the defaults.
export async function getSteps(docType: string, companyId: string | null | undefined) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("workflow_steps")
    .select("seq, name, action, department, due_days, only_above_limit, company_id, departments(name)")
    .eq("doc_type", docType)
    .order("seq");
  const rows = (data ?? []) as unknown as StepRow[];
  const own = rows.filter((r) => companyId && r.company_id === companyId);
  return own.length ? own : rows.filter((r) => r.company_id === null);
}

export type Project = {
  id: string;
  code: string;
  name: string;
  location: string;
  company_id: string;
  lat: number | null;
  lng: number | null;
  map_zoom: number;
};

export async function getProjects() {
  const supabase = await createClient();
  const { data } = await supabase.from("projects").select("id, code, name, location, company_id, lat, lng, map_zoom").order("name");
  return (data ?? []) as Project[];
}

export type Option = { value: string; label: string };

// Choices for a reference field, limited to one project.
export async function refOptions(source: string, projectId: string, companyId: string): Promise<Option[]> {
  const supabase = await createClient();
  switch (source) {
    case "contracts": {
      const { data } = await supabase.from("contracts").select("id, code, contractor").eq("project_id", projectId).order("code");
      return (data ?? []).map((r) => ({ value: r.id, label: `${r.code} · ${r.contractor}` }));
    }
    case "cost_codes": {
      const { data } = await supabase.from("cost_codes").select("id, code, name, company_id").order("code");
      return (data ?? [])
        .filter((r) => r.company_id === null || r.company_id === companyId)
        .map((r) => ({ value: r.id, label: `${r.code} ${r.name}` }));
    }
    case "units":
    case "units_available":
    case "units_sold": {
      let q = supabase.from("units").select("id, code, unit_type, status").eq("project_id", projectId).order("code").limit(5000);
      if (source === "units_available") q = q.in("status", ["available", "ready"]);
      if (source === "units_sold") q = q.in("status", ["sold", "ready"]);
      const { data } = await q;
      return (data ?? []).map((r) => ({ value: r.id, label: `${r.code}${r.unit_type ? ` · ${r.unit_type}` : ""}` }));
    }
    case "customers": {
      const { data } = await supabase.from("customers").select("id, full_name, phone").eq("company_id", companyId).order("full_name").limit(5000);
      return (data ?? []).map((r) => ({ value: r.id, label: `${r.full_name}${r.phone ? ` · ${r.phone}` : ""}` }));
    }
    case "suppliers": {
      const { data } = await supabase.from("suppliers").select("id, name").eq("company_id", companyId).order("name");
      return (data ?? []).map((r) => ({ value: r.id, label: r.name }));
    }
    case "schedule_versions": {
      const { data } = await supabase.from("schedule_versions").select("id, name, is_baseline").eq("project_id", projectId).order("created_at");
      return (data ?? []).map((r) => ({ value: r.id, label: `${r.name}${r.is_baseline ? " (baseline)" : ""}` }));
    }
  }
  return [];
}

export type ActionResult = { error?: string; ok?: string } | null;
