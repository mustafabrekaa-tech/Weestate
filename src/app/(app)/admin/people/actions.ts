"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updatePerson(form: FormData) {
  const supabase = await createClient();
  const department = String(form.get("department") ?? "");
  await supabase
    .from("profiles")
    .update({
      full_name: String(form.get("full_name") ?? "").trim(),
      department: department || null,
      is_admin: form.get("is_admin") === "on",
    })
    .eq("id", String(form.get("id")));
  revalidatePath("/admin/people");
}
