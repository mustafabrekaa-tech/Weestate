// Connects company web addresses to the WE-estate site on Vercel. Needs
// VERCEL_TOKEN (a Vercel access token), VERCEL_PROJECT_ID and VERCEL_TEAM_ID.
const API = "https://api.vercel.com";

export const vercelReady = () => Boolean(process.env.VERCEL_TOKEN && process.env.VERCEL_PROJECT_ID);

async function call(path: string, init?: RequestInit) {
  const team = process.env.VERCEL_TEAM_ID ? `${path.includes("?") ? "&" : "?"}teamId=${process.env.VERCEL_TEAM_ID}` : "";
  const res = await fetch(`${API}${path}${team}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}`, "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body: body as Record<string, unknown> };
}

export type DomainState = "connected" | "waiting for DNS" | "not added" | "error";

// Adds the address to the site (if it isn't already) and reports whether DNS points at it.
export async function connectDomain(domain: string): Promise<{ state: DomainState; detail: string }> {
  if (!vercelReady()) return { state: "not added", detail: "Add a Vercel token to connect addresses automatically." };
  const add = await call(`/v10/projects/${process.env.VERCEL_PROJECT_ID}/domains`, { method: "POST", body: JSON.stringify({ name: domain }) });
  const code = (add.body.error as { code?: string } | undefined)?.code;
  if (!add.ok && code !== "domain_already_in_use" && code !== "domain_already_exists") {
    return { state: "error", detail: String((add.body.error as { message?: string } | undefined)?.message ?? `Vercel said ${add.status}`) };
  }
  return domainState(domain);
}

export async function domainState(domain: string): Promise<{ state: DomainState; detail: string }> {
  if (!vercelReady()) return { state: "not added", detail: "" };
  const cfg = await call(`/v6/domains/${encodeURIComponent(domain)}/config`);
  if (!cfg.ok) return { state: "error", detail: `Vercel said ${cfg.status}` };
  return cfg.body.misconfigured ? { state: "waiting for DNS", detail: "" } : { state: "connected", detail: "" };
}

export async function removeDomain(domain: string) {
  if (!vercelReady()) return;
  await call(`/v9/projects/${process.env.VERCEL_PROJECT_ID}/domains/${encodeURIComponent(domain)}`, { method: "DELETE" });
}
