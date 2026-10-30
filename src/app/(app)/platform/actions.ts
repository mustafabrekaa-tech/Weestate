"use server";

import { revalidatePath } from "next/cache";
import { getBrand } from "@/lib/brand";
import type { ActionResult } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { connectDomain, domainState, removeDomain, vercelReady } from "@/lib/vercel";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const clean = (d: string) => d.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");

// Gives a company its own address (and keeps its name.weestate.app address connected).
export async function saveAddress(companyId: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { rootDomain } = await getBrand();
  const { data: c } = await supabase.from("companies").select("slug, domain").eq("id", companyId).single();
  if (!c) return { error: "Company not found." };
  const domain = clean(s(form, "domain"));
  if (domain && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) return { error: "Enter an address like projects.company.com" };
  if (domain.endsWith(`.${rootDomain}`)) return { error: `Addresses under ${rootDomain} come from the short name. Use the company's own domain here.` };

  const sub = await connectDomain(`${c.slug}.${rootDomain}`);
  const own = domain ? await connectDomain(domain) : null;
  if (c.domain && c.domain !== domain) await removeDomain(c.domain);
  const status = own ? own.state : sub.state;
  const { error } = await supabase.from("companies").update({ domain: domain || null, domain_status: status }).eq("id", companyId);
  if (error) return { error: error.code === "23505" ? "Another company already uses that address." : error.message };
  revalidatePath("/platform");
  if (!vercelReady()) return { ok: "Saved. Connect it on Vercel too (see the steps below), or add a Vercel token so this happens by itself." };
  if (status === "error") return { error: own?.detail || sub.detail };
  return { ok: status === "connected" ? "Connected and live." : "Added. It goes live once the DNS record below is in place." };
}

export async function checkAddress(companyId: string, _: ActionResult): Promise<ActionResult> {
  const supabase = await createClient();
  const { rootDomain } = await getBrand();
  const { data: c } = await supabase.from("companies").select("slug, domain").eq("id", companyId).single();
  if (!c) return { error: "Company not found." };
  const st = await domainState(c.domain || `${c.slug}.${rootDomain}`);
  await supabase.from("companies").update({ domain_status: st.state }).eq("id", companyId);
  revalidatePath("/platform");
  return { ok: st.state === "connected" ? "Live." : st.state === "not added" ? "No Vercel token yet, so I can't check." : "Not pointing here yet." };
}

export async function savePlatform(_: ActionResult, form: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("platform_settings")
    .update({
      app_name: s(form, "app_name") || "WE-estate",
      tagline: s(form, "tagline"),
      logo_url: s(form, "logo_url"),
      brand_color: form.get("default_color") === "on" ? "" : s(form, "brand_color").toLowerCase(),
      support_email: s(form, "support_email"),
      updated_at: new Date().toISOString(),
    })
    .eq("id", true)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Only WE-estate staff can change this." };
  revalidatePath("/", "layout");
  return { ok: "Branding saved." };
}
