"use client";

import { useRef, useState } from "react";

type Set3 = { main: string; accent: string; dark: string };
const DEFAULTS: Set3 = { main: "#8a6420", accent: "#c9a24e", dark: "#26313a" };

const hex = (r: number, g: number, b: number) => "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
const rgb = (h: string) => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255] as const; };
function hsl(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  const h = d === 0 ? 0 : mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return { h: (h + 360) % 360, s, l };
}
const mix = (a: string, b: string, t: number) => { const x = rgb(a), y = rgb(b); return hex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t); };
const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

// Reads the logo's main colours and turns them into a few ready palettes.
async function fromLogo(url: string): Promise<Set3[]> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  await img.decode();
  const c = document.createElement("canvas");
  const W = 96, H = Math.max(8, Math.round((96 * (img.naturalHeight || 96)) / (img.naturalWidth || 96)));
  c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  g.drawImage(img, 0, 0, W, H);
  const px = g.getImageData(0, 0, W, H).data;
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3]! < 200) continue;
    const r = px[i]!, gg = px[i + 1]!, b = px[i + 2]!;
    if (Math.min(r, gg, b) > 238) continue; // paper white
    const k = ((r >> 4) << 8) | ((gg >> 4) << 4) | (b >> 4);
    const e = buckets.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += gg; e.b += b;
    buckets.set(k, e);
  }
  const cols = [...buckets.values()].map((e) => ({ n: e.n, c: hex(e.r / e.n, e.g / e.n, e.b / e.n) }))
    .sort((a, b) => b.n - a.n);
  // merge near-identical colours
  const uniq: { n: number; c: string; h: ReturnType<typeof hsl> }[] = [];
  for (const x of cols) {
    const [r, g2, b] = rgb(x.c);
    const near = uniq.find((u) => { const [r2, g3, b2] = rgb(u.c); return Math.hypot(r - r2, g2 - g3, b - b2) < 48; });
    if (near) near.n += x.n; else uniq.push({ ...x, h: hsl(r, g2, b) });
  }
  uniq.sort((a, b) => b.n - a.n);
  const vivid = uniq.filter((u) => u.h.s > 0.22 && u.h.l > 0.18 && u.h.l < 0.75);
  const darkC = uniq.find((u) => u.h.l < 0.28);
  const main = vivid[0]?.c ?? uniq[0]?.c ?? DEFAULTS.main;
  const mh = hsl(...rgb(main));
  const second = vivid.find((u) => hueGap(u.h.h, mh.h) > 25)?.c;
  const dark = darkC?.c ?? mix(main, "#0b1220", 0.72);
  const sets: Set3[] = [
    { main, accent: second ?? mix(main, "#ffffff", 0.35), dark },
    { main: second ?? mix(main, "#000000", 0.2), accent: main, dark },
    { main, accent: mix(main, "#ffffff", 0.45), dark: mix(main, "#0b1220", 0.75) },
  ];
  const seen = new Set<string>();
  return sets.filter((s) => { const k = `${s.main}${s.accent}${s.dark}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

export function BrandColors({ value, useDefault }: { value: Partial<Set3>; useDefault: boolean }) {
  const [cols, setCols] = useState<Set3>({ ...DEFAULTS, ...Object.fromEntries(Object.entries(value).filter(([, v]) => v)) });
  const [def, setDef] = useState(useDefault);
  const [sugs, setSugs] = useState<Set3[]>([]);
  const [msg, setMsg] = useState("");
  const box = useRef<HTMLDivElement>(null);

  async function suggest() {
    setMsg("");
    const url = (box.current?.closest("form")?.querySelector('input[name="logo_url"]') as HTMLInputElement | null)?.value;
    if (!url) return setMsg("Upload a logo first, then try again.");
    try {
      const s = await fromLogo(url);
      setSugs(s);
      if (!s.length) setMsg("No clear colours found in the logo.");
    } catch {
      setMsg("Couldn't read the logo's colours. Pick them by hand below.");
    }
  }
  const set = (k: keyof Set3, v: string) => { setCols((c) => ({ ...c, [k]: v })); setDef(false); };
  const rows: [keyof Set3, string, string][] = [
    ["main", "Main colour", "Links, highlights, the active menu item"],
    ["accent", "Accent colour", "Charts, progress bars, badges"],
    ["dark", "Dark colour", "Buttons and selected items"],
  ];
  const ink = (h: string) => { const [r, g, b] = rgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) > 160 ? "#111827" : "#fff"; };
  const shown = def ? DEFAULTS : cols;

  return (
    <div ref={box} className="we-brandcols">
      <input type="hidden" name="brand_color" value={cols.main} />
      <input type="hidden" name="accent_color" value={cols.accent} />
      <input type="hidden" name="dark_color" value={cols.dark} />
      {def && <input type="hidden" name="default_color" value="on" />}

      <div className="we-row" style={{ justifyContent: "space-between" }}>
        <label className="we-row" style={{ gap: 6, font: "400 14px var(--font-sans)", textTransform: "none", letterSpacing: 0 }}>
          <input type="checkbox" checked={def} onChange={(e) => setDef(e.target.checked)} /> Use WE-estate colours
        </label>
        <button type="button" className="we-btn we-btn--secondary we-btn--sm" onClick={suggest}>Suggest colours from my logo</button>
      </div>
      {msg && <span className="we-help">{msg}</span>}
      {sugs.length > 0 && (
        <div className="we-brandcols__sugs">
          <span className="we-help">Pick one, then fine-tune below:</span>
          {sugs.map((s, i) => (
            <button key={i} type="button" className="we-brandcols__sug" onClick={() => { setCols(s); setDef(false); }} title="Use these colours">
              <i style={{ background: s.main }} /><i style={{ background: s.accent }} /><i style={{ background: s.dark }} />
              <span>Option {i + 1}</span>
            </button>
          ))}
        </div>
      )}
      <div className={`we-brandcols__rows${def ? " is-off" : ""}`}>
        {rows.map(([k, label, help]) => (
          <div key={k} className="we-brandcols__row">
            <input type="color" value={shown[k]} onChange={(e) => set(k, e.target.value)} aria-label={label} className="we-swatch" />
            <div><b>{label}</b><span className="we-help">{help}</span></div>
            <input className="we-input we-mono" value={shown[k]} maxLength={7} aria-label={`${label} code`}
              onChange={(e) => { const v = e.target.value.trim(); if (/^#[0-9a-f]{6}$/i.test(v)) set(k, v.toLowerCase()); }} style={{ width: 110 }} />
          </div>
        ))}
      </div>
      <div className="we-brandcols__preview" aria-label="Preview">
        <span className="we-help">Preview</span>
        <div className="we-row" style={{ gap: 10, alignItems: "center" }}>
          <span style={{ background: shown.dark, color: ink(shown.dark), padding: "8px 14px", borderRadius: 6, fontWeight: 600, fontSize: 13 }}>Save</span>
          <span style={{ background: `color-mix(in srgb, ${shown.main} 12%, #fff)`, color: shown.main, padding: "8px 12px", borderRadius: 6, fontWeight: 600, fontSize: 13, borderLeft: `3px solid ${shown.main}` }}>Active menu item</span>
          <span style={{ color: shown.main, textDecoration: "underline", fontSize: 13 }}>A link</span>
          <span style={{ flex: "1 1 120px", height: 8, borderRadius: 4, background: "#e5e7eb", overflow: "hidden" }}><i style={{ display: "block", width: "62%", height: "100%", background: shown.accent }} /></span>
        </div>
      </div>
    </div>
  );
}
