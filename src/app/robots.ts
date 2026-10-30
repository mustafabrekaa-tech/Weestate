import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { ROOT_DOMAIN, hostKind } from "@/lib/host";

// Only the public website is for search engines; workspaces and the admin portal are not.
export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = ((await headers()).get("x-forwarded-host") ?? (await headers()).get("host") ?? "").split(":")[0]!.toLowerCase();
  if (hostKind(host) !== "site") return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/site/", "/api/"] },
    sitemap: `https://${ROOT_DOMAIN}/sitemap.xml`,
    host: `https://${ROOT_DOMAIN}`,
  };
}
