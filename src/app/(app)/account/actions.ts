"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export async function saveProfile(id: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: String(form.get("full_name") ?? "").trim(), phone: String(form.get("phone") ?? "").trim() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: "Saved." };
}

export async function changePassword(_: ActionResult, form: FormData): Promise<ActionResult> {
  const pw = String(form.get("password") ?? "");
  if (pw.length < 8) return { error: "Use at least 8 characters." };
  if (pw !== String(form.get("confirm") ?? "")) return { error: "The two passwords don't match." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: pw });
  if (error) return { error: error.message };
  return { ok: "Password changed." };
}
