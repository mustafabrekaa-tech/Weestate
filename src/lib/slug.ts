import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// Projects are opened at readable addresses (/projects/trio-gardens/...). The proxy turns the
// name back into the id, so pages keep working with ids; links are built with these helpers.
export const projectSlugs = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.from("projects").select("id, slug");
  return new Map((data ?? []).map((r) => [r.id as string, (r.slug as string | null) || (r.id as string)]));
});

export async function projectBase(id: string) {
  return `/projects/${(await projectSlugs()).get(id) ?? id}`;
}
