"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").replace(/[,\s]/g, "").replace("−", "-");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};
const str = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const denied = (e: { code?: string; message: string }, who: string) =>
  e.code === "42501" ? `Only ${who} can change this.` : e.message;
const done = (id: string, tab: string, ok: string): ActionResult => {
  revalidatePath(`/projects/${id}`, "layout");
  return { ok };
};

export async function saveBudgetLine(id: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const amount = num(form.get("amount_egp"));
  if (amount == null || Number.isNaN(amount)) return { error: "Enter the amount in EGP." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("import_rows", {
    p_project: id,
    p_kind: "budget",
    p_rows: [{ cost_code: str(form.get("cost_code")), phase: str(form.get("phase")) || null, amount_egp: amount }],
  });
  if (error) return { error: error.message };
  return done(id, "budget", "Budget line saved.");
}

export async function approveBudget(id: string, budgetId: string, _: ActionResult): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("budgets")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .eq("id", budgetId)
    .select("id");
  if (error) return { error: denied(error, "Cost control or Finance") };
  if (!data?.length) return { error: "Only Cost control or Finance can approve the budget." };
  return done(id, "budget", "Budget approved. Changes now go through budget revisions.");
}

export async function addPhaseProgress(id: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const planned = num(form.get("planned_pct"));
  const actual = num(form.get("actual_pct"));
  const cost = num(form.get("actual_cost_egp"));
  if (planned == null || actual == null || Number.isNaN(planned) || Number.isNaN(actual)) return { error: "Enter planned and actual percentages." };
  if (planned < 0 || planned > 100 || actual < 0 || actual > 100) return { error: "Percentages are between 0 and 100." };
  const supabase = await createClient();
  const { error } = await supabase.from("progress_updates").insert({
    project_id: id,
    phase_id: str(form.get("phase_id")),
    period: str(form.get("period")),
    planned_pct: planned,
    actual_pct: actual,
    actual_cost_egp: Number.isNaN(cost) ? 0 : (cost ?? 0),
    note: str(form.get("note")),
  });
  if (error) return { error: denied(error, "Site, Cost control or the PM") };
  return done(id, "schedule", "Progress saved. SPI and CPI are updated.");
}

export async function addActivityProgress(id: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const actual = num(form.get("actual_pct"));
  if (actual == null || Number.isNaN(actual) || actual < 0 || actual > 100) return { error: "Enter a percentage between 0 and 100." };
  const supabase = await createClient();
  const { error } = await supabase.from("activity_progress").insert({
    project_id: id,
    activity_id: str(form.get("activity_id")),
    period: str(form.get("period")),
    actual_pct: actual,
    note: str(form.get("note")),
  });
  if (error) return { error: denied(error, "Site, Cost control or the PM") };
  return done(id, "schedule", "Activity progress saved.");
}

export async function addBoqItem(id: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("import_rows", {
    p_project: id,
    p_kind: "boq",
    p_rows: [{
      code: str(form.get("code")),
      description: str(form.get("description")),
      unit: str(form.get("unit")),
      quantity: num(form.get("quantity")) || 0,
      rate_egp: num(form.get("rate_egp")) || 0,
      section: str(form.get("section")),
      cost_code: str(form.get("cost_code")) || null,
      phase: str(form.get("phase")) || null,
    }],
  });
  if (error) return { error: error.message };
  return done(id, "boq", "BOQ item saved.");
}

export async function addContract(id: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const value = num(form.get("value_egp"));
  if (!str(form.get("code")) || !str(form.get("contractor"))) return { error: "Enter a contract code and the contractor." };
  if (value == null || Number.isNaN(value)) return { error: "Enter the contract value in EGP." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("import_rows", {
    p_project: id,
    p_kind: "contracts",
    p_rows: [{
      code: str(form.get("code")),
      contractor: str(form.get("contractor")),
      scope: str(form.get("scope")),
      value_egp: value,
      retention_pct: num(form.get("retention_pct")) ?? 5,
      advance_pct: num(form.get("advance_pct")) ?? 0,
      kind: str(form.get("kind")) || "main",
      cost_code: str(form.get("cost_code")) || null,
      phase: str(form.get("phase")) || null,
      start_date: str(form.get("start_date")) || null,
      finish_date: str(form.get("finish_date")) || null,
    }],
  });
  if (error) return { error: error.message };
  return done(id, "contracts", "Contract saved.");
}

export async function recordPayment(id: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const amount = num(form.get("amount_egp"));
  if (amount == null || Number.isNaN(amount) || amount <= 0) return { error: "Enter the amount paid." };
  const supabase = await createClient();
  const certId = str(form.get("certificate_id"));
  const { data: cert } = await supabase.from("payment_certificates").select("contract_id, contracts(cost_code_id, supplier_id)").eq("id", certId).maybeSingle();
  const c = cert?.contracts as unknown as { cost_code_id: string | null; supplier_id: string | null } | null;
  const { error } = await supabase.from("payments_out").insert({
    project_id: id,
    certificate_id: certId,
    amount_egp: amount,
    paid_on: str(form.get("paid_on")) || undefined,
    reference: str(form.get("reference")),
    cost_code_id: c?.cost_code_id ?? null,
    supplier_id: c?.supplier_id ?? null,
  });
  if (error) return { error: denied(error, "Finance") };
  return done(id, "contracts", "Payment recorded.");
}

export async function addUnitType(id: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("unit_types").insert({
    project_id: id,
    code: str(form.get("code")).toUpperCase(),
    name: str(form.get("name")),
    category: str(form.get("category")) || "other",
    area_m2: num(form.get("area_m2")),
    bedrooms: num(form.get("bedrooms")),
  });
  if (error) return { error: error.code === "23505" ? "That code is already used." : denied(error, "the PM, Cost control or Sales") };
  return done(id, "units", "Unit type added.");
}

export async function generateUnits(id: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const b = num(form.get("buildings")), f = num(form.get("floors")), u = num(form.get("per_floor")), s = num(form.get("start"));
  if (!b || !f || !u || [b, f, u].some(Number.isNaN)) return { error: "Enter how many buildings, floors and units per floor." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("generate_units", {
    p_project: id,
    p_phase: str(form.get("phase_id")),
    p_buildings: b,
    p_floors: f,
    p_per_floor: u,
    p_unit_type: str(form.get("unit_type_id")) || null,
    p_building_prefix: str(form.get("prefix")) || "B",
    p_start: s && !Number.isNaN(s) ? s : 1,
  });
  if (error) return { error: error.message };
  return done(id, "units", `${data} units added.`);
}

export async function setUnitStatus(id: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const ids = form.getAll("unit").map(String);
  if (!ids.length) return { error: "Tick the units to change." };
  const { error } = await supabase.from("units").update({ status: str(form.get("status")) }).in("id", ids).eq("project_id", id);
  if (error) return { error: denied(error, "the PM, Sales or Handover") };
  return done(id, "units", `${ids.length} units updated.`);
}

export async function importRows(id: string, kind: string, rows: Record<string, unknown>[], version?: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_rows", {
    p_project: id,
    p_kind: kind,
    p_rows: rows,
    p_version: version ?? null,
  });
  if (error) return { error: error.message };
  revalidatePath(`/projects/${id}`, "layout");
  return { ok: `${data} rows saved.` };
}

export async function saveSettings(id: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const lat = num(form.get("lat")), lng = num(form.get("lng"));
  const { data, error } = await supabase
    .from("projects")
    .update({
      name: str(form.get("name")),
      location: str(form.get("location")),
      status: str(form.get("status")),
      project_type: str(form.get("project_type")),
      budget_egp: num(form.get("budget_egp")) ?? 0,
      start_date: str(form.get("start_date")) || null,
      finish_date: str(form.get("finish_date")) || null,
      ...(lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng) ? { lat, lng } : {}),
    })
    .eq("id", id)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Only the PM or Planning can change the project." };
  return done(id, "settings", "Project saved.");
}

export async function savePhase(id: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const phaseId = str(form.get("phase_id"));
  const row = {
    project_id: id,
    code: str(form.get("code")),
    name: str(form.get("name")) || str(form.get("code")),
    budget_egp: num(form.get("budget_egp")) ?? 0,
    start_date: str(form.get("start_date")) || null,
    finish_date: str(form.get("finish_date")) || null,
  };
  if (!row.code) return { error: "Enter the phase code, for example Phase 01." };
  const { error } = phaseId
    ? await supabase.from("phases").update(row).eq("id", phaseId)
    : await supabase.from("phases").insert(row);
  if (error) return { error: error.code === "23505" ? "That phase code is already used." : denied(error, "the PM or Cost control") };
  return done(id, "settings", "Phase saved.");
}

export async function copyStructure(id: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("copy_project_structure", { p_src: str(form.get("source")), p_dst: id });
  if (error) return { error: error.message };
  return done(id, "settings", "Phases, unit types and budget lines copied.");
}
