"use client";

import { useEffect, useState } from "react";

// Three short steps under a page title. Hidden once the person closes them, per page, on this browser.
export function PageTips({ id, steps }: { id: string; steps: [string, string][] }) {
  const key = `we-tips:${id}`;
  const [open, setOpen] = useState(true);
  useEffect(() => {
    try { if (localStorage.getItem(key) === "off") setOpen(false); } catch {}
  }, [key]);
  const set = (on: boolean) => {
    setOpen(on);
    try { if (on) localStorage.removeItem(key); else localStorage.setItem(key, "off"); } catch {}
  };
  if (!open) {
    return <button type="button" className="we-link we-tips__show" onClick={() => set(true)}>How this page works</button>;
  }
  return (
    <div className="we-tips" role="note">
      {steps.map(([b, t], i) => (
        <div key={i} className="we-tips__step"><span className="we-tips__n">{i + 1}</span><div><b>{b}</b> {t}</div></div>
      ))}
      <button type="button" className="we-link we-tips__hide" onClick={() => set(false)}>Hide tips</button>
    </div>
  );
}
