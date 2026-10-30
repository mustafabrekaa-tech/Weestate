"use server";

import { revalidatePath } from "next/cache";
import { getMe, type ActionResult } from "@/lib/data";
import { IMPORTS } from "@/lib/imports";
import { createClient } from "@/lib/supabase/server";

const TABLES = { customers: "customers", suppliers: "suppliers" } as const;
const KINDS = ["contractor", "supplier", "consultant", "facility", "other"];

// Adds or updates one customer or supplier from the form, using the same
// columns as the Excel import.
export async function saveEntry(kind: keyof typeof TABLES, _: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await getMe();
  if (!me?.company_id) return { error: "You are not part of a company yet." };
  const row: Record<string, unknown> = { company_id: me.company_id };
  for (const c of IMPORTS[kind].columns) {
    const raw = String(form.get(c.key) ?? "").trim();
    if (c.type === "number") row[c.key] = raw === "" ? null : Number(raw.replace(/[,\s]/g, ""));
    else if (c.type === "date") row[c.key] = raw || null;
    else row[c.key] = raw;
  }
  if (kind === "suppliers" && !KINDS.includes(String(row.kind))) row.kind = "other";
  const id = String(form.get("id") ?? "");
  const supabase = await createClient();
  const q = id ? supabase.from(TABLES[kind]).update(row).eq("id", id) : supabase.from(TABLES[kind]).insert(row);
  const { data, error } = await q.select("id");
  if (error) {
    if (error.code === "23505") return { error: "That name is already on the list." };
    if (error.code === "42501") return { error: kind === "customers" ? "Only Sales, Handover or Community can change customers." : "Only Procurement, PM or Facility can change suppliers." };
    return { error: error.message };
  }
  if (!data?.length) return { error: "Not saved. You may not have permission." };
  revalidatePath(`/directory/${kind}`);
  return { ok: id ? "Saved." : "Added." };
}
