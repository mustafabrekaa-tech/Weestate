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

const HEX = /^#[0-9a-f]{6}$/i;
// Dark text or white text, whichever reads better on this colour.
export function inkOn(hex: string) {
  const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
  const L = 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
  return L > 0.4 ? "#111827" : "#ffffff";
}

// Overrides the WE-estate tokens with a company's colours: main (links, highlights, active menu item),
// accent (charts, progress bars) and dark (buttons and selected items).
export function brandStyle(color: string, extra?: { accent?: string; dark?: string } | null) {
  const v: string[] = [];
  if (HEX.test(color)) v.push(`--brand:${color}`, `--brand-hover:color-mix(in srgb,${color} 82%,#000)`, `--brand-soft:color-mix(in srgb,${color} 12%,#fff)`, `--focus-ring:${color}`);
  const a = extra?.accent, d = extra?.dark;
  if (a && HEX.test(a)) v.push(`--gold:${a}`, `--gold-hover:color-mix(in srgb,${a} 85%,#000)`);
  if (d && HEX.test(d)) v.push(`--steel:${d}`, `--steel-hover:color-mix(in srgb,${d} 85%,#000)`, `--on-steel:${inkOn(d)}`);
  return v.length ? `:root{${v.join(";")};}` : "";
}
