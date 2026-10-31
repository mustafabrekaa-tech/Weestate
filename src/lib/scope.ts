import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

// The part of a project someone is looking at: a phase, a zone inside it, or
// one building. Chosen in the bar under the project tabs and kept per project
// in a cookie, so every tab shows the same slice.
export type Scope = {
  phase: string; zone: string; building: string;
  // Buildings inside the chosen zone (or the chosen building), for tables that only know buildings.
  buildings: string[];
  label: string;
};

export const scopeCookie = (projectId: string) => `we-scope-${projectId}`;

export const getScope = cache(async function getScope(projectId: string): Promise<Scope> {
  const none: Scope = { phase: "", zone: "", building: "", buildings: [], label: "" };
  const raw = (await cookies()).get(scopeCookie(projectId))?.value;
  if (!raw) return none;
  let v: { phase?: string; zone?: string; building?: string };
  try {
    v = JSON.parse(decodeURIComponent(raw));
  } catch {
    return none;
  }
  const supabase = await createClient();
  const [{ data: ph }, { data: z }, { data: b }] = await Promise.all([
    v.phase ? supabase.from("phases").select("id, name, code").eq("id", v.phase).eq("project_id", projectId).maybeSingle() : Promise.resolve({ data: null }),
    v.zone ? supabase.from("zones").select("id, name, code").eq("id", v.zone).eq("project_id", projectId).maybeSingle() : Promise.resolve({ data: null }),
    v.building ? supabase.from("buildings").select("id, name, code").eq("id", v.building).eq("project_id", projectId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  let buildings: string[] = [];
  if (b) buildings = [b.id];
  else if (z) buildings = ((await supabase.from("buildings").select("id").eq("zone_id", z.id)).data ?? []).map((r) => r.id);
  const label = [ph?.name || ph?.code, z?.name || z?.code, b?.name || b?.code].filter(Boolean).join(" · ");
  return { phase: ph?.id ?? "", zone: z?.id ?? "", building: b?.id ?? "", buildings, label };
});

// Narrows a query on a table with phase_id (and, if it has one, building_id).
export function scoped<Q>(q: Q, s: Scope, opts: { building?: boolean; zone?: boolean } = {}): Q {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let r = q as any;
  if (s.phase) r = r.eq("phase_id", s.phase);
  if (opts.zone && s.zone && !s.building) {
    // Units sit in a zone directly (villas) or through their building.
    const list = s.buildings.length ? `,building_id.in.(${s.buildings.join(",")})` : "";
    r = r.or(`zone_id.eq.${s.zone}${list}`);
  } else if (opts.building && (s.building || s.zone)) {
    r = r.in("building_id", s.buildings.length ? s.buildings : ["00000000-0000-0000-0000-000000000000"]);
  }
  return r as Q;
}
