"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSONSource, ImageSource, Map as MlMap } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { ActionResult } from "@/lib/data";
import { corners, defaultGeo, type PlanGeo, toLngLat } from "@/lib/geo";
import { STYLE } from "./SiteMap";
import type { CUnit } from "./UnitConsole";
import { addModelLayer, type MapModel } from "./MapModels";
import { Select } from "@/components/Select";

export type EarthProject = {
  id: string; name: string; lng: number; lat: number; href: string; sub?: string;
  plan: { image: string; w: number; h: number } | null; geo: PlanGeo | null;
  // Buildings drawn on the 3D site map, and 3D models placed there.
  blocks?: { ring: [number, number][]; base: number; top: number }[];
  models?: MapModel[];
};

const FLOOR_M = 3.3;

// The satellite map with each project's masterplan laid on it, the units drawn on top
// in the console's colours, and a tour from project to project.
export function EarthMap({
  projects, focusId, units, matches, sel, colorOf, onPick, canAlign, saveGeo, height = 480, flyId, onProject,
}: {
  // Fly to this project whenever it changes ("" shows them all); onProject hears clicks on a project label.
  flyId?: string;
  onProject?: (id: string) => void;
  projects: EarthProject[];
  focusId?: string;
  units?: CUnit[];
  matches?: Set<string>;
  sel?: Set<string>;
  colorOf?: (u: CUnit) => string;
  onPick?: (id: string, additive: boolean) => void;
  canAlign?: boolean;
  saveGeo?: (g: PlanGeo) => Promise<ActionResult>;
  height?: number | string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [ready, setReady] = useState(false);
  const [base, setBase] = useState<"satellite" | "map">("satellite");
  const [opacity, setOpacity] = useState(0.75);
  const [threeD, setThreeD] = useState(false);
  const [align, setAlign] = useState(false);
  const [msg, setMsg] = useState<ActionResult>(null);
  const [saving, start] = useTransition();
  const focus = projects.find((p) => p.id === focusId) ?? null;

  // Each project's plan position: saved, or a first guess around its pin. The focused one can be moved.
  const geoOf = (p: EarthProject) => p.geo ?? (p.plan ? defaultGeo(p.lng, p.lat, p.plan.w) : null);
  const [geo, setGeo] = useState<PlanGeo | null>(focus ? geoOf(focus) : null);
  const geoRef = useRef(geo);
  geoRef.current = geo;
  const alignRef = useRef(align);
  alignRef.current = align;
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const projRef = useRef(onProject);
  projRef.current = onProject;

  const unitsGeo = useMemo(() => {
    if (!units || !focus?.plan || !geo) return null;
    const { w, h } = focus.plan;
    return {
      type: "FeatureCollection" as const,
      features: units.filter((u) => u.poly && u.poly.length > 2).map((u) => {
        const on = matches ? matches.has(u.id) : true;
        const ring = u.poly!.map(([x, y]) => toLngLat(geo, w, h, x, y));
        ring.push(ring[0]!);
        const f = u.floor ?? 0;
        return {
          type: "Feature" as const,
          properties: { id: u.id, code: u.code, color: on && colorOf ? colorOf(u) : "#9aa3ab", on: on ? 1 : 0, sel: sel?.has(u.id) ? 1 : 0, b: f * FLOOR_M, t: (f + 1) * FLOOR_M - 0.4 },
          geometry: { type: "Polygon" as const, coordinates: [ring] },
        };
      }),
    };
  }, [units, focus, geo, matches, sel, colorOf]);
  const unitsRef = useRef(unitsGeo);
  unitsRef.current = unitsGeo;

  useEffect(() => {
    let map: MlMap | undefined;
    let cancelled = false;
    import("maplibre-gl").then((ml) => {
      if (cancelled || !box.current) return;
      ml.setWorkerUrl("/maplibre-gl-worker.mjs");
      const start = focus ?? projects[0];
      map = new ml.Map({
        container: box.current,
        style: { ...STYLE, projection: { type: "mercator" } },
        // Open on the project's 3D model when it has one, so it is in view.
        center: focus?.models?.[0] ? [focus.models[0].placement.lng, focus.models[0].placement.lat] : start ? [start.lng, start.lat] : [31.35, 30.03],
        zoom: focus ? 16.5 : 9,
        // Tilt the view when the project has buildings or a 3D model to show.
        pitch: focus && ((focus.blocks?.length ?? 0) > 0 || (focus.models?.length ?? 0) > 0) ? 55 : 0,
        maxPitch: 80,
        attributionControl: { compact: true },
      });
      mapRef.current = map;
      map.addControl(new ml.NavigationControl({ visualizePitch: true }), "top-right");
      map.addControl(new ml.FullscreenControl(), "top-right");
      map.addControl(new ml.ScaleControl({ unit: "metric" }), "bottom-left");
      const ro = new ResizeObserver(() => map?.resize());
      ro.observe(box.current);
      map.on("remove", () => ro.disconnect());

      map.on("load", () => {
        const m = map!;
        for (const p of projects) {
          const g = p.id === focus?.id ? geoRef.current : geoOf(p);
          if (p.plan && g) {
            const url = new URL(p.plan.image, location.origin).toString();
            m.addSource(`plan-${p.id}`, { type: "image", url, coordinates: corners(g, p.plan.w, p.plan.h) });
            m.addLayer({ id: `plan-${p.id}`, type: "raster", source: `plan-${p.id}`, paint: { "raster-opacity": 0.75, "raster-fade-duration": 0 } });
          }
          // A label on each project; clicking flies there.
          const el = document.createElement("button");
          el.type = "button";
          el.className = "we-earth__tag";
          el.textContent = p.name;
          el.onclick = () => { if (projRef.current) projRef.current(p.id); else flyTo(p); };
          new ml.Marker({ element: el, anchor: "bottom" }).setLngLat([p.lng, p.lat]).addTo(m);
        }
        // Buildings outlined on the 3D site map stand up here too, with any placed 3D models.
        const blocks = projects.flatMap((p) => (p.blocks ?? []).filter((b) => b.ring.length > 2).map((b) => {
          const ring = [...b.ring];
          const [f, l] = [ring[0]!, ring[ring.length - 1]!];
          if (f[0] !== l[0] || f[1] !== l[1]) ring.push(f);
          return { type: "Feature" as const, properties: { b: b.base, t: b.top }, geometry: { type: "Polygon" as const, coordinates: [ring] } };
        }));
        if (blocks.length) {
          m.addSource("blocks", { type: "geojson", data: { type: "FeatureCollection", features: blocks } });
          m.addLayer({ id: "blocks-3d", type: "fill-extrusion", source: "blocks",
            paint: { "fill-extrusion-color": "#e6dccb", "fill-extrusion-base": ["get", "b"], "fill-extrusion-height": ["get", "t"], "fill-extrusion-opacity": 0.92 } });
        }
        const models = projects.flatMap((p) => p.models ?? []);
        if (models.length) addModelLayer(m, models).catch(() => {});
        m.addSource("units", { type: "geojson", data: unitsRef.current ?? { type: "FeatureCollection", features: [] } });
        m.addLayer({ id: "units-fill", type: "fill", source: "units",
          paint: { "fill-color": ["get", "color"], "fill-opacity": ["case", ["==", ["get", "on"], 1], 0.85, 0.25] } });
        m.addLayer({ id: "units-3d", type: "fill-extrusion", source: "units", layout: { visibility: "none" },
          paint: { "fill-extrusion-color": ["get", "color"], "fill-extrusion-base": ["get", "b"], "fill-extrusion-height": ["get", "t"], "fill-extrusion-opacity": 0.92 } });
        m.addLayer({ id: "units-sel", type: "line", source: "units", filter: ["==", ["get", "sel"], 1],
          paint: { "line-color": "#0b1220", "line-width": 2.5 } });
        for (const id of ["units-fill", "units-3d"]) {
          m.on("click", id, (e) => {
            if (alignRef.current) return;
            const f = e.features?.[0];
            const oe = e.originalEvent as MouseEvent;
            if (f) pickRef.current?.(String(f.properties.id), oe.ctrlKey || oe.metaKey || oe.shiftKey);
          });
          m.on("mouseenter", id, () => { if (!alignRef.current) m.getCanvas().style.cursor = "pointer"; });
          m.on("mouseleave", id, () => { m.getCanvas().style.cursor = ""; });
        }
        if (!focus && projects.length > 1) {
          const b = new ml.LngLatBounds([projects[0]!.lng, projects[0]!.lat], [projects[0]!.lng, projects[0]!.lat]);
          projects.forEach((p) => b.extend([p.lng, p.lat]));
          m.fitBounds(b, { padding: 80, maxZoom: 15, duration: 0 });
        } else if (focus?.plan && geoRef.current) {
          const c = corners(geoRef.current, focus.plan.w, focus.plan.h);
          const b = new ml.LngLatBounds(c[0], c[0]);
          c.forEach((x) => b.extend(x));
          m.fitBounds(b, { padding: 40, duration: 0 });
        }

        // Lining up the plan: drag anywhere to move it while the panel is open.
        let drag: null | { x: number; y: number; g: PlanGeo } = null;
        m.on("mousedown", (e) => {
          if (!alignRef.current || !geoRef.current) return;
          e.preventDefault();
          m.dragPan.disable();
          drag = { x: e.lngLat.lng, y: e.lngLat.lat, g: geoRef.current };
        });
        m.on("mousemove", (e) => {
          if (!drag) return;
          setGeo({ ...drag.g, lng: drag.g.lng + (e.lngLat.lng - drag.x), lat: drag.g.lat + (e.lngLat.lat - drag.y) });
        });
        const end = () => { if (drag) { drag = null; m.dragPan.enable(); } };
        m.on("mouseup", end);
        m.getCanvas().addEventListener("mouseleave", end);
        setReady(true);
      });
    });
    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
    // Built once; later changes go through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function flyTo(p: EarthProject) {
    const g = geoOf(p);
    mapRef.current?.flyTo({ center: g ? [g.lng, g.lat] : [p.lng, p.lat], zoom: 16.3, pitch: 50, bearing: -15, duration: 3500, essential: true });
  }

  // Follow the project picked outside the map (the reports dashboard).
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || flyId === undefined) return;
    const p = projects.find((x) => x.id === flyId);
    if (p) { flyTo(p); return; }
    if (projects.length > 1) {
      import("maplibre-gl").then((ml) => {
        const b = new ml.LngLatBounds([projects[0]!.lng, projects[0]!.lat], [projects[0]!.lng, projects[0]!.lat]);
        projects.forEach((x) => b.extend([x.lng, x.lat]));
        map.fitBounds(b, { padding: 80, maxZoom: 13, pitch: 0, bearing: 0, duration: 1800 });
      });
    } else if (projects[0]) flyTo(projects[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, flyId]);

  // A tour: fly to each project in turn and circle it, like the flythrough.
  const tourRef = useRef(0);
  function tour() {
    const map = mapRef.current;
    if (!map) return;
    const run = ++tourRef.current;
    const list = projects.length ? projects : [];
    let i = 0;
    const next = () => {
      if (run !== tourRef.current || !list.length) return;
      const p = list[i % list.length]!;
      const g = geoOf(p);
      map.flyTo({ center: g ? [g.lng, g.lat] : [p.lng, p.lat], zoom: 16.2, pitch: 60, bearing: map.getBearing(), duration: list.length > 1 ? 4000 : 1500, essential: true });
      map.once("moveend", () => {
        if (run !== tourRef.current) return;
        map.easeTo({ bearing: map.getBearing() + 180, duration: 9000, easing: (t) => t });
        map.once("moveend", () => { i++; if (i < Math.max(2, list.length * 2)) next(); });
      });
    };
    next();
  }
  const stopTour = () => { tourRef.current++; mapRef.current?.stop(); };

  // Keep the map in step with the console: colours, selection, filters, plan position.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource("units") as GeoJSONSource | undefined)?.setData(unitsGeo ?? { type: "FeatureCollection", features: [] });
  }, [ready, unitsGeo]);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !focus?.plan || !geo) return;
    (map.getSource(`plan-${focus.id}`) as ImageSource | undefined)?.setCoordinates(corners(geo, focus.plan.w, focus.plan.h));
  }, [ready, geo, focus]);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    for (const p of projects) if (map.getLayer(`plan-${p.id}`)) map.setPaintProperty(`plan-${p.id}`, "raster-opacity", opacity);
    map.setLayoutProperty("imagery", "visibility", base === "satellite" ? "visible" : "none");
    map.setLayoutProperty("streets", "visibility", base === "map" ? "visible" : "none");
    map.setLayoutProperty("units-3d", "visibility", threeD ? "visible" : "none");
    map.setLayoutProperty("units-fill", "visibility", threeD ? "none" : "visible");
  }, [ready, opacity, base, threeD, projects]);

  function view(k: "plan" | "3d" | "south" | "east") {
    const map = mapRef.current;
    if (!map) return;
    const c = geo ? [geo.lng, geo.lat] as [number, number] : map.getCenter().toArray() as [number, number];
    const rot = geo?.rot ?? 0;
    setThreeD(k !== "plan");
    if (k === "plan") map.easeTo({ center: c, pitch: 0, bearing: rot, duration: 900 });
    else if (k === "3d") map.easeTo({ center: c, pitch: 55, bearing: rot - 25, duration: 900 });
    else map.easeTo({ center: c, pitch: 78, bearing: rot + (k === "east" ? -90 : 0), zoom: Math.max(map.getZoom(), 16.6), duration: 900 });
  }

  const size = focus?.plan && geo ? Math.round(geo.mpp * focus.plan.w) : 0;

  return (
    <div className="we-earth" style={{ height }}>
      <div ref={box} className="we-earth__canvas" role="region" aria-label="Satellite map with the masterplan" />
      <div className="we-earth__bar">
        <div className="we-seg">
          <button type="button" className={base === "satellite" ? "is-on" : ""} onClick={() => setBase("satellite")}>Satellite</button>
          <button type="button" className={base === "map" ? "is-on" : ""} onClick={() => setBase("map")}>Street map</button>
        </div>
        <div className="we-seg">
          <button type="button" onClick={() => view("plan")}>Plan</button>
          <button type="button" onClick={() => view("3d")}>3D</button>
          <button type="button" onClick={() => view("south")}>Elevation S</button>
          <button type="button" onClick={() => view("east")}>Elevation E</button>
        </div>
        <label className="we-earth__slider">Masterplan
          <input type="range" min={0} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(+e.target.value)} aria-label="Masterplan opacity" />
        </label>
        <div className="we-seg">
          <button type="button" onClick={tour}>{projects.length > 1 ? "Tour projects" : "Fly around"}</button>
          <button type="button" onClick={stopTour}>Stop</button>
        </div>
        {projects.length > 1 && (
          <Select className="we-earth__go" value="" onChange={(e) => { const p = projects.find((x) => x.id === e.target.value); if (p) flyTo(p); }} aria-label="Fly to a project">
            <option value="">Fly to project…</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        )}
        {canAlign && focus?.plan && <button type="button" className={`we-btn we-btn--sm ${align ? "we-btn--primary" : "we-btn--secondary"}`} onClick={() => setAlign(!align)}>Line up the plan</button>}
      </div>
      {align && focus?.plan && geo && (
        <div className="we-earth__align">
          <b>Line up the masterplan with the satellite</b>
          <p className="we-help">Drag the map to move the plan. Turn the masterplan down to see roads and plots under it.</p>
          <label>Turn <input type="range" min={-180} max={180} step={0.5} value={geo.rot} onChange={(e) => setGeo({ ...geo, rot: +e.target.value })} /> <span>{geo.rot.toFixed(1)}°</span></label>
          <label>Width <input type="range" min={100} max={3000} step={5} value={size} onChange={(e) => setGeo({ ...geo, mpp: +e.target.value / focus.plan!.w })} /> <span>{size} m</span></label>
          <div className="we-row">
            <button type="button" className="we-btn we-btn--primary we-btn--sm" disabled={saving || !saveGeo}
              onClick={() => start(async () => { const r = await saveGeo!(geo); setMsg(r); if (r?.ok) setAlign(false); })}>{saving ? "Saving…" : "Save position"}</button>
            <button type="button" className="we-btn we-btn--ghost we-btn--sm" onClick={() => { setGeo(geoOf(focus)); setAlign(false); }}>Cancel</button>
          </div>
        </div>
      )}
      {msg && <div className={`we-earth__msg${msg.error ? " is-err" : ""}`} onClick={() => setMsg(null)}>{msg.error ?? msg.ok}</div>}
      {focus && !focus.geo && focus.plan && !align && (
        <div className="we-earth__note">The plan is placed roughly on the pin.{canAlign ? " Use Line up the plan to match it to the satellite." : ""}</div>
      )}
    </div>
  );
}
