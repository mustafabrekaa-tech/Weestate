"use client";

import { useEffect } from "react";
import { IDLE_MS } from "@/lib/idle";
import { createClient } from "@/lib/supabase/client";

// Signs out a tab left open with nobody using it. Activity in any tab counts.
export function IdleGuard() {
  useEffect(() => {
    const KEY = "we-active";
    let last = Date.now();
    const mark = () => {
      const now = Date.now();
      if (now - last < 30000) return;
      last = now;
      try { localStorage.setItem(KEY, String(now)); } catch {}
    };
    try { localStorage.setItem(KEY, String(last)); } catch {}
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    const t = setInterval(async () => {
      let seen = last;
      try { seen = Math.max(seen, Number(localStorage.getItem(KEY) || 0)); } catch {}
      if (Date.now() - seen > IDLE_MS) {
        clearInterval(t);
        await createClient().auth.signOut({ scope: "local" });
        location.href = "/login?idle=1";
      }
    }, 60000);
    return () => { clearInterval(t); events.forEach((e) => window.removeEventListener(e, mark)); };
  }, []);
  return null;
}
