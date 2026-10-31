"use client";

import { useEffect, useState } from "react";

// Hides or shows the whole left menu on wide screens; remembered on this browser.
export function NavToggle() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let h = false;
    try { h = localStorage.getItem("we-nav") === "hidden"; } catch {}
    setHidden(h);
    document.documentElement.classList.toggle("we-nav-hidden", h);
  }, []);
  const flip = () => {
    const h = !hidden;
    setHidden(h);
    document.documentElement.classList.toggle("we-nav-hidden", h);
    try { localStorage.setItem("we-nav", h ? "hidden" : "shown"); } catch {}
  };
  return (
    <button type="button" className="we-iconbtn we-navtoggle" onClick={flip} aria-label={hidden ? "Show menu" : "Hide menu"} title={hidden ? "Show menu" : "Hide menu"} aria-pressed={!hidden}>
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
        <rect x="2.5" y="3.5" width="15" height="13" rx="1.5" /><path d={hidden ? "M7 3.5v13M10 8l2 2-2 2" : "M7 3.5v13M12 8l-2 2 2 2"} />
      </svg>
    </button>
  );
}
