import { cache } from "react";
import { getMe } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

// The sections someone can't use: those WE-estate staff switched off for the
// whole company (everyone, admins included), plus those the company admin
// hid from the person's department (admins see those anyway).
export const getHidden = cache(async function getHidden() {
  const me = await getMe();
  const supabase = await createClient();
  const [{ data: c }, { data: rows }] = await Promise.all([
    supabase.from("companies").select("modules_off").eq("id", me?.company_id ?? "").maybeSingle(),
    me?.is_admin || me?.is_platform_admin
      ? Promise.resolve({ data: [] as { module: string }[] })
      : supabase.from("hidden_modules").select("module").eq("company_id", me?.company_id ?? "").eq("department", me?.department ?? ""),
  ]);
  const off = new Set<string>(((c?.modules_off ?? []) as string[]));
  const hidden = new Set<string>([...off, ...(rows ?? []).map((r) => r.module as string)]);
  return { off, hidden };
});
