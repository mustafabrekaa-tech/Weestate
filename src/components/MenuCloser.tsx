"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

// Drop-down menus (<details class="we-menu">) close when you click anywhere
// else, press Escape, pick an item, or move to another page.
export function MenuCloser() {
  const path = usePathname();
  useEffect(() => {
    const closeAll = (keep?: Element | null) =>
      document.querySelectorAll<HTMLDetailsElement>("details.we-menu[open]").forEach((d) => d !== keep && (d.open = false));
    const onClick = (e: MouseEvent) => {
      const t = e.target as Element;
      const menu = t.closest("details.we-menu");
      // A click on an item inside the list closes its menu too.
      if (menu && t.closest(".we-menu__list a, .we-menu__list button")) return closeAll();
      closeAll(menu);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeAll();
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  useEffect(() => {
    document.querySelectorAll<HTMLDetailsElement>("details.we-menu[open]").forEach((d) => (d.open = false));
    // The mobile menu closes on navigation as well.
    const t = document.getElementById("we-menu") as HTMLInputElement | null;
    if (t) t.checked = false;
  }, [path]);
  return null;
}
