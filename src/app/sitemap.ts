import type { MetadataRoute } from "next";
import { ROOT_DOMAIN } from "@/lib/host";
import { getSiteInfo } from "@/lib/siteinfo";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const info = await getSiteInfo();
  const root = `https://${ROOT_DOMAIN}`;
  const pages: [string, string][] = [["/about", info.about_text], ["/privacy", info.privacy_text], ["/terms", info.terms_text], ["/refund", info.refund_text]];
  return [
    { url: root, changeFrequency: "weekly", priority: 1 },
    ...pages.filter(([, t]) => t.trim()).map(([p]) => ({ url: root + p, changeFrequency: "yearly" as const, priority: 0.3 })),
  ];
}
