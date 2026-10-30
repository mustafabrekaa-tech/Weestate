"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const n = (f: FormData, k: string) => Number(s(f, k).replace(/[,\s]/g, "") || 0);

export async function addPerson(company: string | null, _: ActionResult, form: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_create_user", {
    p_email: s(form, "email"),
    p_full_name: s(form, "full_name"),
    p_department: s(form, "department") || null,
    p_is_admin: form.get("is_admin") === "on",
    p_company: company,
    p_password: s(form, "password") || null,
  });
  if (error) return { error: error.message };
  const row = (data as { temp_password: string }[])[0];
  revalidatePath("/admin/people");
  return { ok: `Added ${s(form, "email")}. Their temporary password is ${row?.temp_password}. Send it to them; they change it under My account.` };
}

export async function updatePerson(_: ActionResult, form: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const department = s(form, "department");
  const { data, error } = await supabase
    .from("profiles")
    .update({ full_name: s(form, "full_name"), department: department || null, is_admin: form.get("is_admin") === "on" })
    .eq("id", s(form, "id"))
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Not saved. Only admins can change people." };
  revalidatePath("/", "layout");
  return { ok: "Saved." };
}

export async function resetPassword(id: string, _: ActionResult): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_reset_password", { p_user: id });
  if (error) return { error: error.message };
  return { ok: `New temporary password: ${data}` };
}

export async function saveCompany(id: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .update({
      name: s(form, "name"),
      name_ar: s(form, "name_ar"),
      logo_url: s(form, "logo_url"),
      currency: s(form, "currency") || "EGP",
      brand_color: form.get("default_color") === "on" ? "" : s(form, "brand_color").toLowerCase(),
      tagline: s(form, "tagline"),
      require_mfa: form.get("require_mfa") === "on",
    })
    .eq("id", id)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Only an admin can change the company." };
  revalidatePath("/", "layout");
  return { ok: "Company saved." };
}

export async function saveLimit(company: string, docType: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("approval_limits").upsert({
    company_id: company,
    doc_type: docType,
    amount_egp: n(form, "amount_egp"),
    any_time_impact: form.get("any_time_impact") === "on",
  });
  if (error) return { error: error.message };
  revalidatePath("/admin/limits");
  return { ok: "Limit saved." };
}

export async function customizeSteps(company: string, docType: string, _: ActionResult): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: defaults } = await supabase
    .from("workflow_steps")
    .select("doc_type, seq, name, name_ar, department, action, due_days, only_above_limit")
    .eq("doc_type", docType)
    .is("company_id", null);
  const { error } = await supabase.from("workflow_steps").insert((defaults ?? []).map((d) => ({ ...d, company_id: company })));
  if (error) return { error: error.message };
  revalidatePath("/admin/workflows");
  return { ok: "You now have your own copy of these steps. Edit them below." };
}

export async function saveStep(company: string, docType: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const id = s(form, "id");
  const row = {
    name: s(form, "name"),
    action: s(form, "action") || "Send on",
    department: s(form, "department"),
    due_days: n(form, "due_days") || 2,
    only_above_limit: form.get("only_above_limit") === "on",
  };
  if (!row.name || !row.department) return { error: "Each step needs a name and a department." };
  if (id) {
    const { error } = await supabase.from("workflow_steps").update(row).eq("id", id).eq("company_id", company);
    if (error) return { error: error.message };
  } else {
    const { data: last } = await supabase.from("workflow_steps").select("seq").eq("doc_type", docType).eq("company_id", company).order("seq", { ascending: false }).limit(1).maybeSingle();
    const { error } = await supabase.from("workflow_steps").insert({ ...row, name_ar: row.name, doc_type: docType, company_id: company, seq: (last?.seq ?? 0) + 1 });
    if (error) return { error: error.message };
  }
  revalidatePath("/admin/workflows");
  return { ok: "Step saved." };
}

export async function removeLastStep(company: string, docType: string, table: string, _: ActionResult): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: last } = await supabase.from("workflow_steps").select("id, seq").eq("doc_type", docType).eq("company_id", company).order("seq", { ascending: false }).limit(1).maybeSingle();
  if (!last) return { error: "No steps to remove." };
  if (last.seq <= 2) return { error: "A workflow needs at least two steps." };
  const { count } = await supabase.from(table).select("id", { count: "exact", head: true }).eq("step", last.seq).not("status", "in", "(done,paid,rejected)");
  if (count) return { error: `${count} open documents are at this step. Move them on first.` };
  const { error } = await supabase.from("workflow_steps").delete().eq("id", last.id);
  if (error) return { error: error.message };
  revalidatePath("/admin/workflows");
  return { ok: "Last step removed." };
}

export async function useDefaultSteps(company: string, docType: string, _: ActionResult): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("workflow_steps").delete().eq("doc_type", docType).eq("company_id", company);
  if (error) return { error: error.message };
  revalidatePath("/admin/workflows");
  return { ok: "Back to the standard steps." };
}

export async function createWorkspace(_: ActionResult, form: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const slug = s(form, "slug").toLowerCase();
  const { data: id, error } = await supabase.rpc("create_company", { p_slug: slug, p_name: s(form, "name"), p_name_ar: s(form, "name_ar") });
  if (error) {
    return { error: error.code === "23505" ? "That short name is taken." : error.code === "23514" ? "Short name: 3 to 40 lowercase letters, numbers or dashes." : error.message };
  }
  let note = `Workspace ${s(form, "name")} created.`;
  if (s(form, "admin_email")) {
    const { data, error: ue } = await supabase.rpc("admin_create_user", {
      p_email: s(form, "admin_email"),
      p_full_name: s(form, "admin_name"),
      p_department: "pm",
      p_is_admin: true,
      p_company: id,
      p_password: null,
    });
    if (ue) return { error: `${note} The admin was not added: ${ue.message}` };
    note += ` Admin ${s(form, "admin_email")} can sign in with the temporary password ${(data as { temp_password: string }[])[0]?.temp_password}.`;
  }
  revalidatePath("/platform");
  return { ok: note };
}
