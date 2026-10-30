"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSONSource, Map as MlMap, StyleSpecification } from "maplibre-gl";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { ActionResult } from "@/lib/data";
import { UNIT_STATUS, type SiteBuilding, type SiteModel, type SitePhase, type SiteUnit } from "@/lib/site";
import { ModelViewer } from "./ModelViewer";

const NO_UNITS = "#c9c3b8";

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
const STYLE: StyleSpecification = {
  version: 8,
  sources: {
    imagery: { type: "raster", tiles: [`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`], tileSize: 256, maxzoom: 19,
      attribution: "Imagery © Esri, Maxar, Earthstar Geographics" },
    places: { type: "raster", tiles: [`${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`], tileSize: 256, maxzoom: 19 },
  },
  layers: [
    { id: "imagery", type: "raster", source: "imagery" },
    { id: "places", type: "raster", source: "places" },
  ],
};

type Pick = { kind: "unit"; id: string } | { kind: "floor"; building: string; floor: number } | { kind: "building"; id: string } | null;
type Draw = { kind: "phase" | "building" | "unit"; id: string; points: [number, number][] } | null;

const majority = (units: SiteUnit[]) => {
  if (!units.length) return null;
  const n = new Map<string, number>();
  units.forEach((u) => n.set(u.status, (n.get(u.status) ?? 0) + 1));
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]![0];
};
const ringCenter = (r: [number, number][]) =>
  [r.reduce((a, p) => a + p[0], 0) / r.length, r.reduce((a, p) => a + p[1], 0) / r.length] as [number, number];

// The project in 3D on satellite imagery: phases outlined, buildings stacked
// floor by floor and coloured by the sales status of their units, villas and
// other units with their own outline drawn on their own. Click to inspect;
// draw outlines straight on the map.
export function SitePlan({
  projectId, center, phases, buildings, units, models, canDraw, canSell,
  saveOutline, changeStatus, addModel, removeModel, children,
}: {
  projectId: string;
  center: [number, number] | null;
  phases: SitePhase[];
  buildings: SiteBuilding[];
  units: SiteUnit[];
  models: SiteModel[];
  canDraw: boolean;
  canSell: boolean;
  saveOutline: (kind: "phase" | "building" | "unit", target: string, ring: [number, number][] | null) => Promise<ActionResult>;
  changeStatus: (unit: string, status: string) => Promise<ActionResult>;
  addModel: (m: { name: string; url: string; size: number }) => Promise<ActionResult>;
  removeModel: (id: string) => Promise<ActionResult>;
  children?: React.ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<"map" | "model">(models.length && !buildings.some((b) => b.footprint) ? "model" : "map");
  const [phase, setPhase] = useState("");
  const [building, setBuilding] = useState("");
  const [pick, setPick] = useState<Pick>(null);
  const [draw, setDraw] = useState<Draw>(null);
  const [note, setNote] = useState<ActionResult>(null);
  const [pending, start] = useTransition();
  const drawRef = useRef<Draw>(null);
  drawRef.current = draw;

  const unitsBy = useMemo(() => {
    const m = new Map<string, SiteUnit[]>();
    for (const u of units) if (u.building_id) m.set(u.building_id, [...(m.get(u.building_id) ?? []), u]);
    return m;
  }, [units]);
  const unitsRef = useRef(unitsBy);
  unitsRef.current = unitsBy;

  // Everything drawn on the map, as GeoJSON.
  const data = useMemo(() => {
    const inPhase = (pid: string | null) => !phase || pid === phase;
    const floors: GeoJSON.Feature[] = [];
    for (const b of buildings) {
      if (!b.footprint || !inPhase(b.phase_id) || (building && b.id !== building)) continue;
      const bu = unitsBy.get(b.id) ?? [];
      const levels = Math.max(1, b.floors ?? 0, ...bu.map((u) => (u.floor ?? 0) + 1));
      const lowest = Math.min(0, ...bu.map((u) => u.floor ?? 0));
      const h = Number(b.floor_height_m) || 3.2;
      for (let f = 0; f < levels; f++) {
        const floorNo = f + lowest;
        const onFloor = bu.length === 1 ? bu : bu.filter((u) => (u.floor ?? 0) === floorNo);
        const st = majority(onFloor);
        floors.push({
          type: "Feature",
          id: floors.length + 1,
          properties: {
            kind: "floor", building: b.id, floor: floorNo,
            base: Number(b.base_m) + f * h, top: Number(b.base_m) + (f + 1) * h - 0.25,
            color: st ? UNIT_STATUS[st]?.color ?? NO_UNITS : NO_UNITS,
          },
          geometry: { type: "Polygon", coordinates: [b.footprint] },
        });
      }
    }
    const own: GeoJSON.Feature[] = units
      .filter((u) => u.footprint && inPhase(u.phase_id) && (!building || u.building_id === building))
      .map((u, i) => {
        const b = buildings.find((x) => x.id === u.building_id);
        const h = Number(b?.floor_height_m) || 3.2;
        const base = Number(b?.base_m ?? 0) + Math.max(0, u.floor ?? 0) * h;
        return {
          type: "Feature", id: 100000 + i,
          properties: { kind: "unit", unit: u.id, base, top: base + (u.floor == null && !b ? 2 * h : h) - 0.25, color: UNIT_STATUS[u.status]?.color ?? NO_UNITS },
          geometry: { type: "Polygon", coordinates: [u.footprint!] },
        };
      });
    const areas: GeoJSON.Feature[] = phases
      .filter((p) => p.boundary && (!phase || p.id === phase))
      .map((p, i) => ({ type: "Feature", id: i + 1, properties: { phase: p.id, name: p.name }, geometry: { type: "Polygon", coordinates: [p.boundary!] } }));
    return {
      solids: { type: "FeatureCollection", features: [...floors, ...own] } as GeoJSON.FeatureCollection,
      areas: { type: "FeatureCollection", features: areas } as GeoJSON.FeatureCollection,
    };
  }, [buildings, units, phases, phase, building, unitsBy]);

  // Build the map once.
  useEffect(() => {
    if (view !== "map") return;
    let map: MlMap | undefined;
    let cancelled = false;
    import("maplibre-gl").then((ml) => {
      if (cancelled || !box.current) return;
      ml.setWorkerUrl("/maplibre-gl-worker.mjs");
      const firstShape = buildings.find((b) => b.footprint)?.footprint ?? phases.find((p) => p.boundary)?.boundary;
      map = new ml.Map({
        container: box.current,
        style: STYLE,
        center: center ?? (firstShape ? ringCenter(firstShape) : [31.35, 30.03]),
        zoom: center || firstShape ? 17 : 10,
        pitch: 58,
        bearing: -25,
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
        map!.addSource("areas", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map!.addSource("solids", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map!.addSource("sketch", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map!.addLayer({ id: "areas-fill", type: "fill", source: "areas", paint: { "fill-color": "#c9a24e", "fill-opacity": 0.14 } });
        map!.addLayer({ id: "areas-line", type: "line", source: "areas", paint: { "line-color": "#f2d38a", "line-width": 2, "line-dasharray": [2, 1] } });
        map!.addLayer({
          id: "solids", type: "fill-extrusion", source: "solids",
          paint: {
            "fill-extrusion-color": ["case", ["boolean", ["feature-state", "picked"], false], "#ffffff", ["get", "color"]],
            "fill-extrusion-base": ["get", "base"],
            "fill-extrusion-height": ["get", "top"],
            "fill-extrusion-opacity": 0.92,
          },
        });
        map!.addLayer({ id: "sketch-fill", type: "fill", source: "sketch", filter: ["==", "$type", "Polygon"], paint: { "fill-color": "#ffffff", "fill-opacity": 0.25 } });
        map!.addLayer({ id: "sketch-line", type: "line", source: "sketch", paint: { "line-color": "#ffffff", "line-width": 2.5 } });
        map!.addLayer({ id: "sketch-pts", type: "circle", source: "sketch", filter: ["==", "$type", "Point"], paint: { "circle-radius": 5, "circle-color": "#c9a24e", "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
        setReady(true);
      });

      map.on("click", (e) => {
        const d = drawRef.current;
        if (d) {
          setDraw({ ...d, points: [...d.points, [e.lngLat.lng, e.lngLat.lat]] });
          return;
        }
        const f = map!.queryRenderedFeatures(e.point, { layers: ["solids"] })[0];
        if (!f) return setPick(null);
        const p = f.properties as { kind: string; unit?: string; building?: string; floor?: number };
        if (p.kind === "unit") setPick({ kind: "unit", id: p.unit! });
        else {
          const bu = unitsRef.current.get(p.building!) ?? [];
          if (bu.length === 1) setPick({ kind: "unit", id: bu[0]!.id });
          else setPick({ kind: "floor", building: p.building!, floor: Number(p.floor) });
        }
      });
      map.on("mousemove", "solids", () => (map!.getCanvas().style.cursor = drawRef.current ? "crosshair" : "pointer"));
      map.on("mouseleave", "solids", () => (map!.getCanvas().style.cursor = drawRef.current ? "crosshair" : ""));
    });
    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // Push data and highlight to the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource("solids") as GeoJSONSource).setData(data.solids);
    (map.getSource("areas") as GeoJSONSource).setData(data.areas);
    map.removeFeatureState({ source: "solids" });
    for (const f of data.solids.features) {
      const p = f.properties as { kind: string; unit?: string; building?: string; floor?: number };
      const on = pick && ((pick.kind === "unit" && p.unit === pick.id) || (pick.kind === "floor" && p.building === pick.building && p.floor === pick.floor));
      if (on) map.setFeatureState({ source: "solids", id: f.id! }, { picked: true });
    }
  }, [data, pick, ready]);

  // The outline being drawn.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const pts = draw?.points ?? [];
    const features: GeoJSON.Feature[] = pts.map((p) => ({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: p } }));
    if (pts.length >= 3) features.push({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[...pts, pts[0]!]] } });
    else if (pts.length === 2) features.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: pts } });
    (map.getSource("sketch") as GeoJSONSource).setData({ type: "FeatureCollection", features });
    map.getCanvas().style.cursor = draw ? "crosshair" : "";
  }, [draw, ready]);

  // Fly to the chosen phase or building.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const shape = building ? buildings.find((b) => b.id === building)?.footprint : phase ? phases.find((p) => p.id === phase)?.boundary : null;
    if (!shape) return;
    import("maplibre-gl").then((ml) => {
      const b = new ml.LngLatBounds(shape[0], shape[0]);
      shape.forEach((p) => b.extend(p));
      map.fitBounds(b, { padding: 80, pitch: 58, maxZoom: 19, duration: 900 });
    });
  }, [phase, building, ready, buildings, phases]);

  function run(fn: () => Promise<ActionResult>) {
    start(async () => {
      const r = await fn();
      setNote(r);
      if (r?.ok) router.refresh();
    });
  }

  function finishDrawing() {
    if (!draw || draw.points.length < 3) return setNote({ error: "Click at least three corners on the map." });
    const d = draw;
    setDraw(null);
    run(() => saveOutline(d.kind, d.id, d.points));
  }

  const selectedUnit = pick?.kind === "unit" ? units.find((u) => u.id === pick.id) : undefined;
  const floorUnits = pick?.kind === "floor" ? (unitsBy.get(pick.building) ?? []).filter((u) => (u.floor ?? 0) === pick.floor) : [];
  const pickedBuilding = pick?.kind === "floor" ? buildings.find((b) => b.id === pick.building) : selectedUnit?.building_id ? buildings.find((b) => b.id === selectedUnit.building_id) : undefined;
  const shownBuildings = buildings.filter((b) => !phase || b.phase_id === phase);
  const missing = {
    phases: phases.filter((p) => !p.boundary).length,
    buildings: buildings.filter((b) => !b.footprint).length,
  };

  return (
    <div className="we-site">
      <div className="we-site__bar">
        <div className="we-seg we-seg--light">
          <button type="button" className={view === "map" ? "is-on" : ""} onClick={() => setView("map")}>3D site map</button>
          <button type="button" className={view === "model" ? "is-on" : ""} onClick={() => setView("model")}>3D models{models.length ? ` (${models.length})` : ""}</button>
        </div>
        {view === "map" && (
          <>
            <select className="we-input we-select we-input--sm" value={phase} onChange={(e) => { setPhase(e.target.value); setBuilding(""); }} aria-label="Phase">
              <option value="">All phases</option>
              {phases.map((p) => <option key={p.id} value={p.id}>{p.name || p.code}</option>)}
            </select>
            <select className="we-input we-select we-input--sm" value={building} onChange={(e) => setBuilding(e.target.value)} aria-label="Building">
              <option value="">All buildings</option>
              {shownBuildings.map((b) => <option key={b.id} value={b.id}>{b.code}{b.name && b.name !== b.code ? ` · ${b.name}` : ""}</option>)}
            </select>
          </>
        )}
        <span className="we-legend">
          {Object.entries(UNIT_STATUS).map(([k, v]) => <span key={k}><i style={{ background: v.color }} />{v.label}</span>)}
        </span>
      </div>

      {note?.error && <div className="we-banner we-banner--error" role="alert">{note.error}</div>}
      {note?.ok && <div className="we-banner we-banner--ok" role="status">{note.ok}</div>}

      <div className="we-site__body">
        <div className="we-site__stage">
          {view === "map" ? (
            <div className="we-map" style={{ height: "100%" }}>
              <div ref={box} className="we-map__canvas" role="region" aria-label="3D site map" />
              {draw && (
                <div className="we-map__tools">
                  <div className="we-seg">
                    <span className="we-seg__text">Drawing {draw.kind} · {draw.points.length} corners</span>
                    <button type="button" onClick={() => setDraw({ ...draw, points: draw.points.slice(0, -1) })} disabled={!draw.points.length}>Undo</button>
                    <button type="button" className="is-on" onClick={finishDrawing}>Finish</button>
                    <button type="button" onClick={() => setDraw(null)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <ModelViewer
              projectId={projectId}
              models={models}
              units={units}
              canUpload={canDraw}
              onPickUnit={(id) => setPick({ kind: "unit", id })}
              pickedCode={selectedUnit?.code}
              addModel={async (m) => {
                const r = await addModel(m);
                setNote(r);
                if (r?.ok) router.refresh();
                return r;
              }}
              removeModel={(id) => run(() => removeModel(id))}
            />
          )}
        </div>

        <aside className="we-site__panel">
          {selectedUnit ? (
            <div className="we-stack">
              <div>
                <div className="we-eyebrow">Unit{pickedBuilding ? ` · ${pickedBuilding.code}` : ""}</div>
                <h2 className="we-site__title">{selectedUnit.code}</h2>
                <span className="we-chip" style={{ background: UNIT_STATUS[selectedUnit.status]?.color, color: "#fff" }}>{UNIT_STATUS[selectedUnit.status]?.label ?? selectedUnit.status}</span>
              </div>
              <dl className="we-dl">
                <dt>Type</dt><dd>{selectedUnit.unit_type || "–"}</dd>
                <dt>Floor</dt><dd>{selectedUnit.floor ?? "–"}</dd>
                <dt>Area</dt><dd>{selectedUnit.area_m2 ? `${selectedUnit.area_m2} m²` : "–"}</dd>
                <dt>Garden</dt><dd>{selectedUnit.garden_m2 ? `${selectedUnit.garden_m2} m²` : "–"}</dd>
                <dt>Bedrooms</dt><dd>{selectedUnit.bedrooms ?? "–"}</dd>
                <dt>List price</dt><dd className="we-mono">{selectedUnit.list_price_egp ? `EGP ${Number(selectedUnit.list_price_egp).toLocaleString("en-US")}` : "–"}</dd>
              </dl>
              {canSell && (
                <div className="we-field">
                  <label htmlFor="ustatus">Status</label>
                  <select id="ustatus" className="we-input we-select" value={selectedUnit.status} disabled={pending}
                    onChange={(e) => run(() => changeStatus(selectedUnit.id, e.target.value))}>
                    {Object.entries(UNIT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              )}
              <div className="we-actionsbar">
                {selectedUnit.status === "available" && <a className="we-btn we-btn--primary we-btn--sm" href={`/docs/sales/new?project=${projectId}`}>Start a sale</a>}
                <a className="we-btn we-btn--secondary we-btn--sm" href={`/docs/work-orders/new?project=${projectId}`}>Report a problem</a>
              </div>
              {canDraw && (
                <div className="we-actionsbar">
                  <button type="button" className="we-btn we-btn--ghost we-btn--sm" onClick={() => { setView("map"); setDraw({ kind: "unit", id: selectedUnit.id, points: [] }); }}>
                    {selectedUnit.footprint ? "Redraw outline" : "Draw its outline"}
                  </button>
                  {selectedUnit.footprint && <button type="button" className="we-link" onClick={() => run(() => saveOutline("unit", selectedUnit.id, null))}>Remove outline</button>}
                </div>
              )}
            </div>
          ) : pick?.kind === "floor" && pickedBuilding ? (
            <div className="we-stack">
              <div>
                <div className="we-eyebrow">{pickedBuilding.name || pickedBuilding.code}</div>
                <h2 className="we-site__title">Floor {pick.floor}</h2>
              </div>
              {floorUnits.length === 0 ? <p className="we-help">No units on this floor yet.</p> : (
                <ul className="we-unitlist">
                  {floorUnits.map((u) => (
                    <li key={u.id}>
                      <button type="button" onClick={() => setPick({ kind: "unit", id: u.id })}>
                        <i style={{ background: UNIT_STATUS[u.status]?.color }} /><b>{u.code}</b>
                        <span className="we-help">{[u.unit_type, u.area_m2 ? `${u.area_m2} m²` : ""].filter(Boolean).join(" · ")}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="we-stack">
              <div>
                <div className="we-eyebrow">3D site</div>
                <h2 className="we-site__title">Click a building or unit</h2>
              </div>
              <p className="we-help" style={{ margin: 0 }}>
                Floors are coloured by the status of their units. Right-drag or Ctrl-drag to tilt and turn. Pick a phase or building above to zoom in.
              </p>
              {canDraw && (
                <div className="we-stack" style={{ gap: 8 }}>
                  <h3 className="we-h3">Draw on the map</h3>
                  {(missing.phases > 0 || missing.buildings > 0) && (
                    <span className="we-help">{missing.phases} phases and {missing.buildings} buildings have no outline yet.</span>
                  )}
                  <DrawPicker phases={phases} buildings={buildings} onStart={(kind, id) => { setPick(null); setDraw({ kind, id, points: [] }); }} />
                </div>
              )}
              {children}
            </div>
          )}
          {pick && <button type="button" className="we-link" onClick={() => setPick(null)}>Back</button>}
        </aside>
      </div>
    </div>
  );
}

function DrawPicker({ phases, buildings, onStart }: { phases: SitePhase[]; buildings: SiteBuilding[]; onStart: (kind: "phase" | "building", id: string) => void }) {
  const [target, setTarget] = useState("");
  return (
    <div className="we-row" style={{ gap: 6 }}>
      <select className="we-input we-select we-input--sm" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="What to draw" style={{ flex: 1 }}>
        <option value="">Choose a phase or building…</option>
        <optgroup label="Phases">
          {phases.map((p) => <option key={p.id} value={`phase:${p.id}`}>{p.name || p.code}{p.boundary ? " ✓" : ""}</option>)}
        </optgroup>
        <optgroup label="Buildings">
          {buildings.map((b) => <option key={b.id} value={`building:${b.id}`}>{b.code}{b.footprint ? " ✓" : ""}</option>)}
        </optgroup>
      </select>
      <button
        type="button"
        className="we-btn we-btn--primary we-btn--sm"
        disabled={!target}
        onClick={() => {
          const [k, id] = target.split(":");
          onStart(k as "phase" | "building", id!);
        }}
      >
        Draw
      </button>
      <span className="we-help" style={{ flexBasis: "100%" }}>Click each corner on the map, then press Finish.</span>
    </div>
  );
}
