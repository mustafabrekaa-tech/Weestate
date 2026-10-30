export const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "weestate.app";

// Which kind of address a request came in on: the public website on the
// root domain, the staff portal on admin., a company's own workspace, or
// anything else (previews, localhost), which behaves like a workspace.
export function hostKind(host: string): "site" | "admin" | "company" | "other" {
  const h = host.toLowerCase().split(":")[0]!;
  if (h === ROOT_DOMAIN || h === `www.${ROOT_DOMAIN}`) return "site";
  if (h === `admin.${ROOT_DOMAIN}`) return "admin";
  if (h.endsWith(`.${ROOT_DOMAIN}`)) return "company";
  return "other";
}
