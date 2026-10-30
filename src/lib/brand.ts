import { cache } from "react";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type Brand = {
  appName: string;
  tagline: string;
  logo: string;
  color: string;
  rootDomain: string;
  supportEmail: string;
  // The company whose web address this is, if any.
  company: { id: string; slug: string; name: string; logo_url: string; brand_color: string; tagline: string; require_mfa: boolean } | null;
};

// How the app presents itself on this web address: WE-estate's own branding,
// overridden by the company when the address is theirs.
export const getBrand = cache(async (): Promise<Brand> => {
  const host = ((await headers()).get("x-forwarded-host") ?? (await headers()).get("host") ?? "").split(":")[0]!.toLowerCase();
  const supabase = await createClient();
  const [{ data: p }, { data: c }] = await Promise.all([
    supabase.from("platform_settings").select("*").maybeSingle(),
    supabase.rpc("company_by_host", { p_host: host }),
  ]);
  const company = ((c ?? []) as Brand["company"][])[0] ?? null;
  return {
    appName: p?.app_name || "WE-estate",
    tagline: company?.tagline || p?.tagline || "",
    logo: company?.logo_url || p?.logo_url || "",
    color: company?.brand_color || p?.brand_color || "",
    rootDomain: p?.root_domain || "weestate.app",
    supportEmail: p?.support_email || "",
    company,
  };
});

// Overrides the gold brand tokens with a company or platform colour.
export function brandStyle(color: string) {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return "";
  return `:root{--brand:${color};--brand-hover:color-mix(in srgb,${color} 82%,#000);--brand-soft:color-mix(in srgb,${color} 12%,#fff);--focus-ring:${color};}`;
}
