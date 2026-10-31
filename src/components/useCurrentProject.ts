"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export type ProjectItem = { id: string; name: string; slug: string | null };

const KEY = "we-project";

// The project the person is in: from the address (/projects/<slug>/… or the dashboard's ?project=),
// else the one they opened last, else the first. Worked out in the browser so it follows every
// navigation (the app layout itself is not re-rendered when the page changes).
export function useCurrentProject(list: ProjectItem[]) {
  const path = usePathname();
  const params = useSearchParams();
  const seg = path.split("/");
  const hit =
    (seg[1] === "projects" ? list.find((p) => p.id === seg[2] || p.slug === seg[2]) : undefined) ??
    (path === "/" ? list.find((p) => p.id === params.get("project")) : undefined);
  const [last, setLast] = useState<string | null>(null);
  useEffect(() => {
    const m = document.cookie.match(/(?:^|; )we-project=([^;]+)/);
    if (m) setLast(decodeURIComponent(m[1]!));
  }, []);
  useEffect(() => {
    if (!hit) return;
    document.cookie = `${KEY}=${encodeURIComponent(hit.id)}; path=/; max-age=31536000; samesite=lax`;
    setLast(hit.id);
  }, [hit?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return hit ?? list.find((p) => p.id === last) ?? list[0] ?? null;
}
