"use server";

import { redirect } from "next/navigation";
import { getBrand } from "@/lib/brand";
import type { ActionResult } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

const s = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);

export async function sendEnquiry(_: ActionResult, form: FormData): Promise<ActionResult> {
  // A field people never see; bots fill it in.
  if (s(form, "website")) return { ok: "Thanks, we'll be in touch." };
  const name = s(form, "name", 120), email = s(form, "email");
  if (name.length < 2) return { error: "Please tell us your name." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Please enter a valid email address." };
  const supabase = await createClient();
  const { error } = await supabase.from("enquiries").insert({
    name, email,
    company: s(form, "company", 160),
    phone: s(form, "phone", 40),
    role: s(form, "role", 80),
    projects: s(form, "projects", 40),
    message: s(form, "message", 4000),
    source: s(form, "source", 40) || "website",
  });
  if (error) return { error: "We couldn't send that just now. Please try again in a minute." };
  return { ok: `Thanks ${name.split(" ")[0]}. We've got your message and will get back to you within one working day.` };
}

// "Go to your workspace": a company's short name or name opens its sign-in page.
export async function goToWorkspace(_: ActionResult, form: FormData): Promise<ActionResult> {
  const text = s(form, "workspace", 80);
  if (!text) return { error: "Type your company's short name." };
  const supabase = await createClient();
  const { data } = await supabase.rpc("find_workspace", { p_text: text.replace(/\..*$/, "") });
  if (!data) return { error: "We couldn't find that workspace. Check the short name with your admin, for example msq for msq.weestate.app." };
  const { rootDomain } = await getBrand();
  redirect(`https://${data}.${rootDomain}/login`);
}
