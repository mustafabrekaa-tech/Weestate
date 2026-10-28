"use server";

import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export async function createProject(_: ActionResult, form: FormData): Promise<ActionResult> {
  const s = (k: string) => String(form.get(k) ?? "").trim();
  const n = (k: string) => {
    const v = s(k).replace(/[,\s]/g, "");
    return v === "" ? null : Number(v);
  };
  if (!s("name") || !s("code")) return { error: "Give the project a name and a short code." };
  const phases = form
    .getAll("phase_code")
    .map((c, i) => ({
      code: String(c).trim(),
      name: String(form.getAll("phase_name")[i] ?? "").trim() || String(c).trim(),
      budget_egp: Number(String(form.getAll("phase_budget")[i] ?? "").replace(/[,\s]/g, "")) || 0,
      finish_date: String(form.getAll("phase_finish")[i] ?? "") || null,
    }))
    .filter((p) => p.code);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("setup_project", {
    p: {
      code: s("code"),
      name: s("name"),
      location: s("location"),
      project_type: s("project_type"),
      template_id: s("template_id") || null,
      budget_egp: n("budget_egp"),
      start_date: s("start_date") || null,
      finish_date: s("finish_date") || null,
      lat: n("lat"),
      lng: n("lng"),
      phases,
    },
  });
  if (error) {
    return { error: error.code === "23505" ? "A project with that code already exists." : error.message };
  }
  redirect(`/projects/${data}/settings`);
}
