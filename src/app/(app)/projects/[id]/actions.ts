"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/data";
import { IMPORTS } from "@/lib/imports";
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
  // Every contract column the import knows, read from the form by the same names.
  const row: Record<string, unknown> = {};
  for (const c of IMPORTS.contracts.columns) {
    const v = form.get(c.key);
    if (v == null) continue;
    row[c.key] = c.type === "number" ? num(v) : str(v) || null;
  }
  row.value_egp = value;
  const { error } = await supabase.rpc("import_rows", { p_project: id, p_kind: "contracts", p_rows: [row] });
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
  // Links between schedule activities, sent once all activities are in.
  if (kind === "activity_links") {
    const { data, error } = await supabase.rpc("import_links", { p_project: id, p_links: rows });
    if (error) return { error: error.message };
    revalidatePath(`/projects/${id}`, "layout");
    return { ok: `${data} links saved.` };
  }
  const { data, error } = await supabase.rpc("import_rows", {
    p_project: id,
    p_kind: kind,
    p_rows: rows,
    p_version: version ?? null,
  });
  if (error) return { error: error.message };
  if (kind === "activities") {
    // Categories (engineering, execution…) aren't part of the bulk import.
    const byCat = new Map<string, string[]>();
    for (const r of rows) if (r.category) byCat.set(String(r.category), [...(byCat.get(String(r.category)) ?? []), String(r.code)]);
    for (const [cat, codes] of byCat) await supabase.from("activities").update({ category: cat }).eq("project_id", id).in("code", codes);
  }
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
      city: str(form.get("city")),
      district: str(form.get("district")),
      plot_no: str(form.get("plot_no")),
      land_area_m2: num(form.get("land_area_m2")),
      bua_m2: num(form.get("bua_m2")),
      units_planned: num(form.get("units_planned")),
      owner_entity: str(form.get("owner_entity")),
      consultant: str(form.get("consultant")),
      main_contractor: str(form.get("main_contractor")),
      permit_no: str(form.get("permit_no")),
      permit_date: str(form.get("permit_date")) || null,
      handover_date: str(form.get("handover_date")) || null,
      description: str(form.get("description")),
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

// 3D site plan ----------------------------------------------------------------------------------

export async function saveOutline(id: string, kind: "phase" | "building" | "unit", target: string, ring: [number, number][] | null): Promise<ActionResult> {
  const supabase = await createClient();
  const closed = ring && ring.length >= 3 ? [...ring, ring[0]!] : null;
  const { error } = await supabase.rpc("save_outline", { p_project: id, p_kind: kind, p_id: target, p_ring: closed });
  if (error) return { error: error.message };
  return done(id, "site", ring ? "Outline saved." : "Outline removed.");
}

export async function saveBuilding(id: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const code = str(form.get("code"));
  if (!code) return { error: "Give the building a code, such as B01." };
  const { error } = await supabase.rpc("import_rows", {
    p_project: id,
    p_kind: "buildings",
    p_rows: [{ code, name: str(form.get("name")) || code, phase: str(form.get("phase")) || null, floors: num(form.get("floors")) }],
  });
  if (error) return { error: error.message };
  const h = num(form.get("floor_height_m")), b = num(form.get("base_m"));
  if ((h != null && !Number.isNaN(h)) || (b != null && !Number.isNaN(b))) {
    await supabase.from("buildings").update({
      ...(h != null && !Number.isNaN(h) ? { floor_height_m: h } : {}),
      ...(b != null && !Number.isNaN(b) ? { base_m: b } : {}),
    }).eq("project_id", id).eq("code", code);
  }
  return done(id, "site", "Building saved.");
}

export async function changeUnitStatus(id: string, unit: string, status: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("units").update({ status }).eq("id", unit).eq("project_id", id).select("id");
  if (error) return { error: denied(error, "the PM, Sales or Handover") };
  if (!data?.length) return { error: "Only the PM, Sales or Handover can change a unit." };
  return done(id, "site", "Unit updated.");
}

export async function addModel(id: string, model: { name: string; url: string; size: number }): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("project_models").insert({ project_id: id, name: model.name, url: model.url, size_bytes: model.size });
  if (error) return { error: error.code === "42501" ? "Only PM, Technical office, Cost control or Sales can add models." : error.message };
  return done(id, "site", "Model added.");
}

export async function removeModel(id: string, model: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("project_models").delete().eq("id", model).eq("project_id", id);
  if (error) return { error: error.message };
  return done(id, "site", "Model removed.");
}

// Where a 3D model stands on the satellite map. RLS keeps it to the departments that add models.
export async function placeModel(id: string, model: string, placement: { lng: number; lat: number; rot: number; scale: number; alt: number } | null): Promise<ActionResult> {
  const ok = (n: unknown, lo: number, hi: number) => typeof n === "number" && Number.isFinite(n) && n >= lo && n <= hi;
  if (placement && !(ok(placement.lng, -180, 180) && ok(placement.lat, -85, 85) && ok(placement.rot, -360, 360) && ok(placement.scale, 0.001, 1000) && ok(placement.alt, -500, 500)))
    return { error: "That position is not valid." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("project_models").update({ placement }).eq("id", model).eq("project_id", id).select("id");
  if (error) return { error: denied(error, "PM, Technical office, Cost control or Sales") };
  if (!data?.length) return { error: "Only PM, Technical office, Cost control or Sales can place models." };
  return done(id, "site", placement ? "Model position saved." : "Model taken off the map.");
}

// Phases, zones and buildings ---------------------------------------------------------------------
export async function saveZone(id: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const code = str(form.get("code"));
  if (!code) return { error: "Give the zone a code, such as Z1." };
  const row = { project_id: id, code, name: str(form.get("name")), phase_id: str(form.get("phase_id")) || null };
  const zid = str(form.get("zone_id"));
  const { error } = zid
    ? await supabase.from("zones").update(row).eq("id", zid).eq("project_id", id)
    : await supabase.from("zones").insert(row);
  if (error) return { error: error.code === "23505" ? "Another zone already uses that code." : denied(error, "the PM, Technical office or Cost control") };
  return done(id, "structure", "Zone saved.");
}

export async function removeZone(id: string, zone: string, _: ActionResult): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("zones").delete().eq("id", zone).eq("project_id", id);
  if (error) return { error: denied(error, "the PM, Technical office or Cost control") };
  return done(id, "structure", "Zone removed. Its buildings and units stay, without a zone.");
}

export async function editBuilding(id: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const code = str(form.get("code"));
  if (!code) return { error: "Give the building a code, such as B01." };
  const floors = num(form.get("floors")), h = num(form.get("floor_height_m"));
  if (Number.isNaN(floors) || Number.isNaN(h)) return { error: "Floors and floor height must be numbers." };
  const row = {
    project_id: id, code, name: str(form.get("name")) || code,
    phase_id: str(form.get("phase_id")) || null, zone_id: str(form.get("zone_id")) || null,
    floors: floors ?? 1, ...(h != null ? { floor_height_m: h } : {}),
  };
  const bid = str(form.get("building_id"));
  const { error } = bid
    ? await supabase.from("buildings").update(row).eq("id", bid).eq("project_id", id)
    : await supabase.from("buildings").insert(row);
  if (error) return { error: error.code === "23505" ? "Another building already uses that code." : denied(error, "the PM or Cost control") };
  return done(id, "structure", "Building saved.");
}

export async function removeBuilding(id: string, building: string, _: ActionResult): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("buildings").delete().eq("id", building).eq("project_id", id);
  if (error) return { error: denied(error, "the PM or Cost control") };
  return done(id, "structure", "Building removed. Its units stay, without a building.");
}

// Moves a batch of units (by code pattern, range and type) into a phase, zone or building.
export async function assignUnits(id: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const prefix = str(form.get("prefix")), from = str(form.get("from")), to = str(form.get("to")), type = str(form.get("unit_type"));
  if (!prefix && !from && !to && !type) return { error: "Say which units: a code start, a range or a type." };
  const set: Record<string, string | number | null> = {};
  for (const k of ["phase_id", "zone_id", "building_id"]) {
    const v = str(form.get(k));
    if (v === "none") set[k] = null;
    else if (v) set[k] = v;
  }
  const floor = num(form.get("floor"));
  if (Number.isNaN(floor)) return { error: "Floor must be a number." };
  if (floor != null) set.floor = floor;
  if (!Object.keys(set).length) return { error: "Choose where the units go." };
  // A building brings its phase and zone along unless they were chosen.
  if (set.building_id) {
    const { data: b } = await supabase.from("buildings").select("phase_id, zone_id").eq("id", set.building_id).single();
    if (b && !("phase_id" in set) && b.phase_id) set.phase_id = b.phase_id;
    if (b && !("zone_id" in set) && b.zone_id) set.zone_id = b.zone_id;
  }
  let q = supabase.from("units").update(set).eq("project_id", id);
  if (prefix) q = q.ilike("code", `${prefix.replace(/[%_]/g, "")}%`);
  if (from) q = q.gte("code", from);
  if (to) q = q.lte("code", to);
  if (type) q = q.eq("unit_type", type);
  const { data, error } = await q.select("id");
  if (error) return { error: denied(error, "the PM, Cost control or Sales") };
  if (!data?.length) return { error: "No units matched. Check the code start or range." };
  return done(id, "structure", `${data.length} units moved.`);
}

export async function saveLayout(id: string, data: unknown): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: n, error } = await supabase.rpc("save_layout", { p_project: id, p_data: data });
  if (error) return { error: error.message };
  return done(id, "site", `Layout saved (${n} parts). Redraw any outline from the panel when you have the real one.`);
}

// Which units a bulk form means: phase, zone, building, unit type and/or typed codes.
async function pickUnits(supabase: Awaited<ReturnType<typeof createClient>>, id: string, form: FormData) {
  const codes = str(form.get("codes")).split(/[\s,;]+/).filter(Boolean);
  // Each field can carry several values (multi-select): units must match one of them.
  const many = (k: string) => form.getAll(k).map((v) => String(v).trim()).filter(Boolean);
  const sets = { phase_id: many("phase_id"), zone_id: many("zone_id"), building_id: many("building_id"), unit_type: many("unit_type") };
  let q = supabase.from("units").select("id").eq("project_id", id);
  for (const [k, v] of Object.entries(sets)) if (v.length) q = q.in(k, v);
  if (codes.length) q = q.in("code", codes);
  const out: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await q.range(from, from + 999);
    out.push(...(data ?? []).map((r) => r.id as string));
    if (!data || data.length < 1000) break;
  }
  return { ids: out, filtered: codes.length > 0 || Object.values(sets).some((v) => v.length > 0) };
}

export async function recordConstruction(id: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const pctv = num(form.get("pct"));
  if (pctv == null || Number.isNaN(pctv) || pctv < 0 || pctv > 100) return { error: "Enter a percentage between 0 and 100." };
  const supabase = await createClient();
  const { ids, filtered } = await pickUnits(supabase, id, form);
  if (!filtered) return { error: "Choose which units: a phase, building, unit type or unit codes." };
  if (!ids.length) return { error: "No units match that choice." };
  const stages = form.getAll("stage_id").map(String).filter(Boolean);
  if (!stages.length) return { error: "Tick at least one stage." };
  for (const stage of stages) {
    const { error } = await supabase.rpc("record_unit_progress", { p_project: id, p_units: ids, p_stage: stage, p_pct: pctv, p_as_of: str(form.get("as_of")) || null });
    if (error) return { error: denied(error, "Site, the Technical office, Quality or the PM") };
  }
  return done(id, "construction", `Recorded ${pctv}% on ${stages.length} stage${stages.length > 1 ? "s" : ""} for ${ids.length} units.`);
}

export async function saveStages(id: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const ids = form.getAll("sid").map(String);
  const names = form.getAll("sname").map(String);
  const weights = form.getAll("sweight").map((w) => Number(w) || 0);
  for (let i = 0; i < ids.length; i++) {
    if (!names[i]!.trim()) continue;
    const { error } = await supabase.from("construction_stages").update({ name: names[i]!.trim(), weight: weights[i] }).eq("id", ids[i]!);
    if (error) return { error: denied(error, "the PM, Technical office or Cost control") };
  }
  const extra = str(form.get("new_name"));
  if (extra) {
    const { error } = await supabase.from("construction_stages").insert({ project_id: id, seq: ids.length + 1, name: extra, weight: num(form.get("new_weight")) || 5 });
    if (error) return { error: denied(error, "the PM, Technical office or Cost control") };
  }
  return done(id, "construction", "Stages saved.");
}

export async function setDeliveryDates(id: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const when = str(form.get("delivery_date"));
  if (!when) return { error: "Pick the planned delivery date." };
  const supabase = await createClient();
  const { ids, filtered } = await pickUnits(supabase, id, form);
  if (!filtered) return { error: "Choose which units: a phase, building, unit type or unit codes." };
  if (!ids.length) return { error: "No units match that choice." };
  const { data, error } = await supabase.rpc("set_delivery_dates", { p_project: id, p_units: ids, p_date: when });
  if (error) return { error: error.message };
  return done(id, "delivery", `Planned delivery set for ${data} units.`);
}

// Bulk changes from the unit console: the units come as a list of ids ------------------------------
const idsOf = (form: FormData) => str(form.get("ids")).split(",").map((s) => s.trim()).filter((s) => /^[0-9a-f-]{36}$/i.test(s));

export async function bulkHandover(id: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const ids = idsOf(form);
  if (!ids.length) return { error: "Select units on the map first." };
  const stage = str(form.get("stage"));
  if (!stage) return { error: "Choose the handover stage." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_handover_stage", { p_project: id, p_units: ids, p_stage: stage, p_at: str(form.get("at")) || null, p_note: str(form.get("note")) });
  if (error) return { error: error.message };
  return done(id, "console", `Moved ${data} unit${data === 1 ? "" : "s"} to this stage.`);
}

export async function bulkConstruction(id: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const ids = idsOf(form);
  if (!ids.length) return { error: "Select units on the map first." };
  const pctv = num(form.get("pct"));
  if (pctv == null || Number.isNaN(pctv) || pctv < 0 || pctv > 100) return { error: "Enter a percentage between 0 and 100." };
  const stages = form.getAll("stage_id").map(String).filter(Boolean);
  if (!stages.length) return { error: "Tick at least one stage." };
  const supabase = await createClient();
  for (const stage of stages) {
    const { error } = await supabase.rpc("record_unit_progress", { p_project: id, p_units: ids, p_stage: stage, p_pct: pctv, p_as_of: str(form.get("as_of")) || null });
    if (error) return { error: denied(error, "Site, the Technical office, Quality or the PM") };
  }
  return done(id, "console", `Recorded ${pctv}% on ${stages.length} stage${stages.length > 1 ? "s" : ""} for ${ids.length} unit${ids.length === 1 ? "" : "s"}.`);
}

export async function bulkDelivery(id: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const ids = idsOf(form);
  if (!ids.length) return { error: "Select units on the map first." };
  const when = str(form.get("delivery_date"));
  if (!when) return { error: "Pick the planned delivery date." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_delivery_dates", { p_project: id, p_units: ids, p_date: when });
  if (error) return { error: error.message };
  return done(id, "console", `Planned delivery set for ${data} unit${data === 1 ? "" : "s"}.`);
}

export async function bulkPriority(id: string, ids: string[], on: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_unit_priority", { p_project: id, p_units: ids, p_on: on });
  if (error) return { error: error.message };
  return done(id, "console", on ? `Marked ${data} as priority.` : `Took ${data} off the priority list.`);
}

// Where the masterplan sits on the satellite map. Only planning (pm, cost control) can save it; RLS checks that.
export async function savePlanGeo(id: string, g: { lng: number; lat: number; mpp: number; rot: number }): Promise<ActionResult> {
  if (![g.lng, g.lat, g.mpp, g.rot].every((n) => typeof n === "number" && Number.isFinite(n)) || g.mpp <= 0) return { error: "That position is not valid." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("projects").update({ plan_geo: g }).eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Only project management or planning can move the plan." };
  revalidatePath(`/projects/${id}`, "layout");
  revalidatePath("/");
  return { ok: "Plan position saved." };
}

// Deletes a project and everything in it (every project table cascades). Admins only, and only after
// they type the project's name, because nothing can bring it back.
export async function deleteProject(id: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const { getMe } = await import("@/lib/data");
  const me = await getMe();
  if (!me?.is_admin && !me?.is_platform_admin) return { error: "Only an admin can delete a project." };
  const supabase = await createClient();
  const { data: p } = await supabase.from("projects").select("name").eq("id", id).maybeSingle();
  if (!p) return { error: "This project no longer exists." };
  if (str(form.get("confirm")).toLowerCase() !== String(p.name).trim().toLowerCase())
    return { error: `Type the project's name exactly (${p.name}) to delete it.` };
  const { data, error } = await supabase.from("projects").delete().eq("id", id).select("id");
  if (error) return { error: denied(error, "PM or cost control") };
  if (!data?.length) return { error: "Only an admin who is also in PM or cost control can delete a project." };
  revalidatePath("/", "layout");
  const { redirect } = await import("next/navigation");
  redirect("/?deleted=1");
  return null;
}

// Handover stages and history from a delivery-console JSON export.
export async function importHandover(id: string, rows: Record<string, unknown>[], replace: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_handover", { p_project: id, p_rows: rows, p_replace: replace });
  if (error) return { error: error.message };
  const r = data as { units: number; events: number };
  return done(id, "delivery", `${r.units} units and ${r.events} history entries saved.`);
}

// A new masterplan image for the project. Its alignment on the satellite map starts again around the pin.
export async function setPlanImage(id: string, url: string, w: number, h: number): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("projects").update({ plan_image: url, plan_w: Math.round(w), plan_h: Math.round(h), plan_geo: null }).eq("id", id).select("id");
  if (error) return { error: denied(error, "Project management") };
  if (!data?.length) return { error: "Only Project management can change the masterplan." };
  return done(id, "masterplan", "Masterplan saved.");
}

// Where units sit on the masterplan, in image pixels. A null poly clears the mark.
export async function savePlanPolys(id: string, items: { id: string; poly: [number, number][] | null }[]): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_plan_polys", { p_project: id, p_items: items });
  if (error) return { error: error.message };
  revalidatePath(`/projects/${id}`, "layout");
  return { ok: `${data} units saved.` };
}
