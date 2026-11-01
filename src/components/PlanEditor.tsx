"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import type { ActionResult } from "@/lib/data";
import { createClient } from "@/lib/supabase/client";

type Pt = [number, number];
export type PUnit = { id: string; code: string; building: string; poly: Pt[] | null };
type Plan = { image: string; w: number; h: number } | null;

// Upload the masterplan, then mark units on it: pick one or more units in the list and
// drag a box over them on the plan. Several units share the box in equal parts, in the
// order they are listed. The angle lets boxes follow a rotated plan.
export function PlanEditor({
  projectId, plan: initialPlan, units: initialUnits, canEdit, setImage, savePolys,
}: {
  projectId: string;
  plan: Plan;
  units: PUnit[];
  canEdit: boolean;
  setImage: (url: string, w: number, h: number) => Promise<ActionResult>;
  savePolys: (items: { id: string; poly: Pt[] | null }[]) => Promise<ActionResult>;
}) {
  const [plan, setPlan] = useState<Plan>(initialPlan);
  const [units, setUnits] = useState(initialUnits);
  const [sel, setSel] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [angle, setAngle] = useState(0);
  const [split, setSplit] = useState<"auto" | "across" | "down">("auto");
  const [rows, setRows] = useState(1);
  const [drag, setDrag] = useState<{ a: Pt; b: Pt } | null>(null);
  const [note, setNote] = useState<ActionResult>(null);
  const [busy, start] = useTransition();
  const svg = useRef<SVGSVGElement>(null);

  const done = units.filter((u) => u.poly).length;
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return units.filter((u) => (!onlyOpen || !u.poly) && (!t || u.code.toLowerCase().includes(t) || u.building.toLowerCase().includes(t)));
  }, [units, q, onlyOpen]);
  const groups = useMemo(() => {
    const m = new Map<string, PUnit[]>();
    for (const u of list) m.set(u.building || "No building", [...(m.get(u.building || "No building") ?? []), u]);
    return [...m.entries()];
  }, [list]);

  async function upload(f: File) {
    setNote(null);
    if (f.size > 15 * 1024 * 1024) { setNote({ error: "The image is over 15 MB. Save it as a JPG or make it smaller." }); return; }
    const size = await new Promise<{ w: number; h: number }>((res, rej) => {
      const img = new Image();
      img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => rej(new Error("That file isn't an image the browser can read. Use PNG, JPG or WebP."));
      img.src = URL.createObjectURL(f);
    }).catch((e: Error) => { setNote({ error: e.message }); return null; });
    if (!size) return;
    start(async () => {
      const supabase = createClient();
      const ext = (f.name.split(".").pop() || "png").toLowerCase();
      const path = `${projectId}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("plans").upload(path, f, { contentType: f.type });
      if (error) { setNote({ error: error.message }); return; }
      const url = supabase.storage.from("plans").getPublicUrl(path).data.publicUrl;
      const r = await setImage(url, size.w, size.h);
      if (r?.error) { setNote(r); return; }
      setPlan({ image: url, w: size.w, h: size.h });
      setNote({ ok: "Masterplan uploaded. Now mark the units on it." });
    });
  }

  // Screen point to plan pixels.
  function toPlan(e: { clientX: number; clientY: number }): Pt {
    const s = svg.current!;
    const p = s.createSVGPoint();
    p.x = e.clientX; p.y = e.clientY;
    const r = p.matrixTransform(s.getScreenCTM()!.inverse());
    return [r.x, r.y];
  }
  const rad = (angle * Math.PI) / 180;
  const rot = ([x, y]: Pt, a: number): Pt => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

  // The dragged box in the plan's (possibly rotated) frame, cut into one cell per selected unit.
  function cells(a: Pt, b: Pt, n: number): Pt[][] {
    const [ax, ay] = rot(a, -rad), [bx, by] = rot(b, -rad);
    const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), y0 = Math.min(ay, by), y1 = Math.max(ay, by);
    const r = Math.max(1, Math.min(rows, n));
    const perRow = Math.ceil(n / r);
    const across = split === "across" || (split === "auto" && x1 - x0 >= y1 - y0);
    const cols = across ? perRow : r, rws = across ? r : perRow;
    const cw = (x1 - x0) / cols, ch = (y1 - y0) / rws;
    const out: Pt[][] = [];
    for (let i = 0; i < n; i++) {
      const c = across ? i % cols : Math.floor(i / rws), w = across ? Math.floor(i / cols) : i % rws;
      const X = x0 + c * cw, Y = y0 + w * ch;
      out.push(([[X, Y], [X + cw, Y], [X + cw, Y + ch], [X, Y + ch]] as Pt[]).map((p) => rot(p, rad).map((v) => Math.round(v * 10) / 10) as Pt));
    }
    return out;
  }

  function persist(items: { id: string; poly: Pt[] | null }[], msg: string) {
    const before = units;
    setUnits((us) => us.map((u) => { const it = items.find((x) => x.id === u.id); return it ? { ...u, poly: it.poly } : u; }));
    start(async () => {
      const r = await savePolys(items);
      if (r?.error) { setUnits(before); setNote(r); } else setNote({ ok: msg });
    });
  }

  function finish(a: Pt, b: Pt) {
    if (!sel.length || Math.abs(a[0] - b[0]) < 3 || Math.abs(a[1] - b[1]) < 3) return;
    const ordered = units.filter((u) => sel.includes(u.id));
    const polys = cells(a, b, ordered.length);
    persist(ordered.map((u, i) => ({ id: u.id, poly: polys[i]! })), `${ordered.length} unit${ordered.length > 1 ? "s" : ""} marked.`);
    // Move on to the next units still to mark, same count as before.
    const open = units.filter((u) => !u.poly && !sel.includes(u.id));
    setSel(open.slice(0, Math.max(1, sel.length)).map((u) => u.id));
  }

  function toggle(id: string, add: boolean) {
    setSel((s) => (add ? (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]) : [id]));
  }

  const preview = drag && sel.length ? cells(drag.a, drag.b, sel.length) : [];
  const fit = plan ? Math.min(1, 1100 / plan.w) : 1;
  const font = plan ? Math.max(10, plan.w / 160) : 12;

  return (
    <div className="we-stack">
      <section className="we-card we-stack">
        <div className="we-row" style={{ justifyContent: "space-between" }}>
          <div className="we-row">
            {canEdit && (
              <label className="we-btn we-btn--secondary">
                {plan ? "Replace the masterplan image" : "Upload the masterplan image"}
                <input type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={(e) => { if (e.target.files?.[0]) upload(e.target.files[0]); e.target.value = ""; }} />
              </label>
            )}
            {plan && <span className="we-help">{plan.w} × {plan.h} px · {done} of {units.length} units marked</span>}
          </div>
          {plan && done > 0 && <a className="we-link" href="console">Open the unit console</a>}
        </div>
        <span className="we-help">
          {plan
            ? "Pick units on the left (Ctrl or Shift for several, or a building name for all of it), then drag a box over them on the plan. Several units share the box equally, in list order. Click a marked unit on the plan to pick it again."
            : "Upload a PNG or JPG of the masterplan (up to 15 MB), the clearer the better. A site-plan export from AutoCAD or the brochure plan works well."}
        </span>
        {note?.error && <div className="we-banner we-banner--error" role="alert">{note.error}</div>}
        {note?.ok && <div className="we-banner we-banner--ok" role="status">{note.ok}</div>}
      </section>

      {plan && (
        <div className="we-plan-ed">
          <aside className="we-card we-stack we-plan-ed__list">
            <input className="we-input" placeholder="Find unit or building" value={q} onChange={(e) => setQ(e.target.value)} />
            <label className="we-row" style={{ gap: 6 }}><input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> <span className="we-help">Only units not marked yet</span></label>
            <div className="we-plan-ed__scroll">
              {groups.map(([b, us]) => (
                <div key={b}>
                  <button type="button" className="we-plan-ed__bld" onClick={() => setSel(us.map((u) => u.id))}>{b} <small>{us.filter((u) => u.poly).length}/{us.length}</small></button>
                  <div className="we-plan-ed__units">
                    {us.map((u) => (
                      <button key={u.id} type="button" onClick={(e) => toggle(u.id, e.ctrlKey || e.metaKey || e.shiftKey)}
                        className={`${sel.includes(u.id) ? "is-sel" : ""}${u.poly ? " is-done" : ""}`}>{u.code}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="we-help">{sel.length} picked</div>
            {sel.length > 0 && canEdit && (
              <button type="button" className="we-btn we-btn--ghost we-btn--sm" disabled={busy}
                onClick={() => persist(sel.map((id) => ({ id, poly: null })), "Marks cleared.")}>Clear their marks</button>
            )}
          </aside>

          <div className="we-stack" style={{ minWidth: 0 }}>
            <div className="we-row we-plan-ed__tools">
              <div className="we-seg we-seg--light">
                <button type="button" onClick={() => setZoom((z) => Math.max(0.25, z / 1.25))}>−</button>
                <button type="button" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
                <button type="button" onClick={() => setZoom((z) => Math.min(6, z * 1.25))}>+</button>
              </div>
              <label className="we-row" style={{ gap: 6 }}><span className="we-help">Angle</span>
                <input type="range" min={-90} max={90} value={angle} onChange={(e) => setAngle(Number(e.target.value))} />
                <input className="we-input" style={{ width: 70 }} type="number" value={angle} onChange={(e) => setAngle(Number(e.target.value) || 0)} />°</label>
              <label className="we-row" style={{ gap: 6 }}><span className="we-help">Several units go</span>
                <select className="we-input" value={split} onChange={(e) => setSplit(e.target.value as typeof split)}>
                  <option value="auto">along the longer side</option><option value="across">left to right</option><option value="down">top to bottom</option>
                </select></label>
              <label className="we-row" style={{ gap: 6 }}><span className="we-help">in</span>
                <input className="we-input" style={{ width: 60 }} type="number" min={1} value={rows} onChange={(e) => setRows(Math.max(1, Number(e.target.value) || 1))} /><span className="we-help">rows</span></label>
            </div>
            <div className="we-plan-ed__canvas">
              <svg ref={svg} viewBox={`0 0 ${plan.w} ${plan.h}`} width={plan.w * fit * zoom} height={plan.h * fit * zoom}
                style={{ cursor: canEdit && sel.length ? "crosshair" : "default", touchAction: "none" }}
                onPointerDown={(e) => { if (!canEdit || !sel.length || (e.target as Element).tagName === "polygon") return; (e.target as Element).setPointerCapture?.(e.pointerId); const p = toPlan(e); setDrag({ a: p, b: p }); }}
                onPointerMove={(e) => drag && setDrag({ a: drag.a, b: toPlan(e) })}
                onPointerUp={() => { if (drag) finish(drag.a, drag.b); setDrag(null); }}>
                <image href={plan.image} width={plan.w} height={plan.h} />
                {units.filter((u) => u.poly).map((u) => (
                  <g key={u.id}>
                    <polygon points={u.poly!.map((p) => p.join(",")).join(" ")} onClick={(e) => toggle(u.id, e.ctrlKey || e.metaKey || e.shiftKey)}
                      fill={sel.includes(u.id) ? "rgba(193,154,62,.55)" : "rgba(47,111,70,.28)"} stroke={sel.includes(u.id) ? "#8a6a1f" : "#2f6f46"} strokeWidth={Math.max(1, plan.w / 1500)} style={{ cursor: "pointer" }} />
                    {zoom * fit > 0.5 && (
                      <text x={u.poly!.reduce((a, p) => a + p[0], 0) / u.poly!.length} y={u.poly!.reduce((a, p) => a + p[1], 0) / u.poly!.length}
                        fontSize={font} textAnchor="middle" dominantBaseline="middle" fill="#1f2a22" pointerEvents="none" fontWeight={600}>{u.code.split("-").at(-1)}</text>
                    )}
                  </g>
                ))}
                {preview.map((poly, i) => (
                  <polygon key={i} points={poly.map((p) => p.join(",")).join(" ")} fill="rgba(193,154,62,.35)" stroke="#8a6a1f" strokeDasharray="6 4" strokeWidth={Math.max(1, plan.w / 1200)} pointerEvents="none" />
                ))}
              </svg>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
