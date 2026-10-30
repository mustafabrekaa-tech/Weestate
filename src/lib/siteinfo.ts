import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// What the public website shows about WE-estate itself: contacts, socials, legal pages.
export type SiteInfo = SiteText & {
  // Parts of the website switched off in the admin portal.
  hidden: string[];
};
export type SiteText = {
  support_email: string; sales_email: string; phone: string; whatsapp: string; address: string; map_url: string; hours: string;
  linkedin: string; facebook: string; instagram: string; x_url: string; youtube: string;
  tiktok: string; privacy_text: string; terms_text: string; refund_text: string; about_text: string;
};

export const SOCIALS: [keyof SiteText, string, string][] = [
  ["linkedin", "LinkedIn", "M4 8h3v9H4zM5.5 3.5a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4zM9 8h3v1.3c.5-.8 1.5-1.5 3-1.5 2.6 0 3 1.7 3 4V17h-3v-4.5c0-1.1 0-2.4-1.5-2.4S12 11.3 12 12.4V17H9z"],
  ["facebook", "Facebook", "M11.5 17v-6h2l.4-2.5h-2.4V7c0-.7.3-1.3 1.4-1.3h1.1V3.5c-.5-.1-1.2-.2-2-.2-2 0-3.2 1.2-3.2 3.4v1.8H6.6V11h2.2v6z"],
  ["instagram", "Instagram", "M7 3h6a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zm3 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm4.3-1.2a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6z"],
  ["tiktok", "TikTok", "M13.2 3c.3 1.9 1.5 3.2 3.4 3.4v2.4c-1.2 0-2.3-.4-3.3-1v5.1c0 2.9-2.3 4.6-4.7 4.6A4.5 4.5 0 0 1 4 13c0-2.6 2.2-4.7 5.1-4.4v2.5c-1.3-.3-2.6.6-2.6 1.9 0 1.1.9 2 2 2 1.2 0 2.1-.8 2.1-2.3V3z"],
  ["x_url", "X", "M4 3.5h3.6l3.2 4.4 3.8-4.4h1.6l-4.7 5.4 5.5 7.6h-3.6L9.9 11.8 5.8 16.5H4.2l5-5.7z"],
  ["youtube", "YouTube", "M17.6 6.6c-.2-.8-.8-1.4-1.6-1.6C14.6 4.7 10 4.7 10 4.7s-4.6 0-6 .3c-.8.2-1.4.8-1.6 1.6C2 8 2 10 2 10s0 2 .4 3.4c.2.8.8 1.4 1.6 1.6 1.4.3 6 .3 6 .3s4.6 0 6-.3c.8-.2 1.4-.8 1.6-1.6.4-1.4.4-3.4.4-3.4s0-2-.4-3.4zM8.4 12.5v-5l4.2 2.5z"],
];

export const getSiteInfo = cache(async (): Promise<SiteInfo> => {
  const supabase = await createClient();
  const { data } = await supabase.from("platform_settings").select("*").maybeSingle();
  const pick = (k: string) => String((data as Record<string, unknown> | null)?.[k] ?? "");
  const info = Object.fromEntries(
    ["support_email", "sales_email", "phone", "whatsapp", "address", "map_url", "hours", "linkedin", "facebook", "instagram", "x_url", "youtube", "tiktok", "privacy_text", "terms_text", "refund_text", "about_text"].map((k) => [k, pick(k)]),
  ) as unknown as SiteInfo;
  info.hidden = ((data as { site_hidden?: string[] } | null)?.site_hidden ?? []);
  return info;
});

export const waLink = (n: string) => `https://wa.me/${n.replace(/[^\d]/g, "").replace(/^0/, "20")}`;
export const telLink = (n: string) => `tel:${n.replace(/[^\d+]/g, "")}`;
