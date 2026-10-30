"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MlMap, Marker, StyleSpecification } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

export type Pin = { id: string; lat: number; lng: number; label: string; sub?: string; href?: string };

type Base = "satellite" | "hybrid" | "map";

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
const CAIRO: [number, number] = [31.35, 30.03];

// Satellite imagery, labels, street map, terrain heights and building
// footprints, all keyless. Layers are switched on and off rather than
// rebuilding the style, so the camera stays where it is.
const STYLE: StyleSpecification = {
  version: 8,
  projection: { type: "globe" },
  sky: { "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 6, 0.4, 10, 0] },
  sources: {
    imagery: { type: "raster", tiles: [`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`], tileSize: 256, maxzoom: 19,
      attribution: "Imagery © Esri, Maxar, Earthstar Geographics" },
    places: { type: "raster", tiles: [`${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`], tileSize: 256, maxzoom: 19 },
    roads: { type: "raster", tiles: [`${ESRI}/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}`], tileSize: 256, maxzoom: 19 },
    streets: { type: "raster", tiles: [`${ESRI}/World_Street_Map/MapServer/tile/{z}/{y}/{x}`], tileSize: 256, maxzoom: 19,
      attribution: "Map © Esri, HERE, Garmin, OpenStreetMap contributors" },
    dem: { type: "raster-dem", tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"], tileSize: 256,
      encoding: "terrarium", maxzoom: 15, attribution: "Terrain: Mapzen, AWS Open Data" },
    buildings: { type: "vector", url: "https://tiles.openfreemap.org/planet", attribution: "Buildings © OpenStreetMap contributors" },
  },
  layers: [
    { id: "streets", type: "raster", source: "streets", layout: { visibility: "none" } },
    { id: "imagery", type: "raster", source: "imagery" },
    { id: "roads", type: "raster", source: "roads", layout: { visibility: "none" } },
    { id: "places", type: "raster", source: "places" },
    {
      id: "buildings-3d", type: "fill-extrusion", source: "buildings", "source-layer": "building", minzoom: 14,
      layout: { visibility: "none" },
      paint: {
        "fill-extrusion-color": "#e9e4da",
        "fill-extrusion-height": ["coalesce", ["get", "render_height"], 9],
        "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
        "fill-extrusion-opacity": 0.85,
      },
    },
  ],
};

// Earth-style map of the projects: satellite, hybrid or street base, 3D terrain
// and buildings, tilt and rotate, globe view and full screen. With `pick`, a
// click places the project and fills hidden lat/lng inputs for the form around it.
export function SiteMap({
  pins = [],
  zoom,
  pick,
  height = 420,
}: {
  pins?: Pin[];
  zoom?: number;
  pick?: { lat?: number | null; lng?: number | null };
  height?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [picked, setPicked] = useState<[number, number] | null>(
    pick?.lat != null && pick?.lng != null ? [pick.lat, pick.lng] : null,
  );
  const close = pins.length === 1 || (pick?.lat != null && pick?.lng != null);
  const [base, setBase] = useState<Base>("hybrid");
  const [threeD, setThreeD] = useState(close);
  const [globe, setGlobe] = useState(!close);

  useEffect(() => {
    let map: MlMap | undefined;
    let cancelled = false;
    import("maplibre-gl").then((ml) => {
      if (cancelled || !box.current) return;
      ml.setWorkerUrl("/maplibre-gl-worker.mjs");
      const pts = pins.map((p) => [p.lng, p.lat] as [number, number]);
      const start: [number, number] =
        pick?.lat != null && pick?.lng != null ? [pick.lng, pick.lat] : pts.length === 1 ? pts[0]! : CAIRO;
      map = new ml.Map({
        container: box.current,
        style: STYLE,
        center: start,
        zoom: close ? (zoom ?? 16) : pts.length ? 9 : 10,
        pitch: close ? 55 : 0,
        bearing: close ? -20 : 0,
        maxPitch: 80,
        attributionControl: { compact: true },
      });
      mapRef.current = map;
      map.addControl(new ml.NavigationControl({ visualizePitch: true, showCompass: true }), "top-right");
      map.addControl(new ml.FullscreenControl(), "top-right");
      map.addControl(new ml.GeolocateControl({ trackUserLocation: false }), "top-right");
      map.addControl(new ml.ScaleControl({ unit: "metric" }), "bottom-left");

      // Maps inside hidden wizard steps need a redraw once they are shown.
      const ro = new ResizeObserver(() => map?.resize());
      ro.observe(box.current);
      map.on("remove", () => ro.disconnect());

      for (const p of pins) {
        const el = document.createElement("button");
        el.type = "button";
        el.className = "we-pin";
        el.setAttribute("aria-label", p.label);
        const html = `<b>${escapeHtml(p.label)}</b>${p.sub ? `<br><span>${escapeHtml(p.sub)}</span>` : ""}${
          p.href ? `<br><a href="${p.href}">Open project</a>` : ""
        }`;
        const popup = new ml.Popup({ offset: 14, closeButton: false, className: "we-pin-tip" }).setHTML(html);
        new ml.Marker({ element: el }).setLngLat([p.lng, p.lat]).setPopup(popup).addTo(map);
        if (pins.length <= 6) popup.setLngLat([p.lng, p.lat]).addTo(map);
      }

      if (pts.length > 1 && !pick) {
        const b = new ml.LngLatBounds(pts[0], pts[0]);
        pts.forEach((pt) => b.extend(pt));
        map.fitBounds(b, { padding: 64, maxZoom: 15, duration: 0 });
      }

      if (pick) {
        let marker: Marker | undefined;
        const place = (lng: number, lat: number) => {
          if (!marker) {
            const el = document.createElement("div");
            el.className = "we-pin we-pin--pick";
            marker = new ml.Marker({ element: el, draggable: true }).setLngLat([lng, lat]).addTo(map!);
            marker.on("dragend", () => {
              const ll = marker!.getLngLat();
              setPicked([ll.lat, ll.lng]);
            });
          }
          marker.setLngLat([lng, lat]);
          setPicked([lat, lng]);
        };
        if (pick.lat != null && pick.lng != null) place(pick.lng, pick.lat);
        map.on("click", (e) => place(e.lngLat.lng, e.lngLat.lat));
      }
    });
    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
    // The map is built once; pins come from the server render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Base layer, 3D and globe follow the toolbar.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const show = (id: string, on: boolean) => map.getLayer(id) && map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
      show("imagery", base !== "map");
      show("streets", base === "map");
      show("places", base !== "map");
      show("roads", base === "hybrid");
      show("buildings-3d", threeD);
      map.setTerrain(threeD ? { source: "dem", exaggeration: 1.2 } : null);
      map.setProjection({ type: globe ? "globe" : "mercator" });
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [base, threeD, globe]);

  function tilt(on: boolean) {
    setThreeD(on);
    mapRef.current?.easeTo({ pitch: on ? 60 : 0, bearing: on ? (mapRef.current.getBearing() || -20) : 0, duration: 800 });
  }

  return (
    <div className="we-map-wrap">
      <div className="we-map" style={{ height }}>
        <div ref={box} className="we-map__canvas" role="region" aria-label="Satellite map" />
        <div className="we-map__tools" role="toolbar" aria-label="Map view">
          <div className="we-seg">
            {(["satellite", "hybrid", "map"] as Base[]).map((b) => (
              <button key={b} type="button" className={base === b ? "is-on" : ""} onClick={() => setBase(b)} aria-pressed={base === b}>
                {b === "satellite" ? "Satellite" : b === "hybrid" ? "Hybrid" : "Map"}
              </button>
            ))}
          </div>
          <div className="we-seg">
            <button type="button" className={threeD ? "is-on" : ""} onClick={() => tilt(!threeD)} aria-pressed={threeD} title="Terrain, buildings and tilt">
              3D
            </button>
            <button type="button" className={globe ? "is-on" : ""} onClick={() => setGlobe(!globe)} aria-pressed={globe} title="Show the earth as a globe when zoomed out">
              Globe
            </button>
          </div>
        </div>
      </div>
      <span className="we-help">
        {pick
          ? picked
            ? `Placed at ${picked[0].toFixed(5)}, ${picked[1].toFixed(5)}. Drag the pin to adjust.`
            : "Click the map where the site is."
          : "Drag to move, right-drag or Ctrl-drag to tilt and turn, scroll to zoom."}
      </span>
      {pick && (
        <>
          <input type="hidden" name="lat" value={picked ? picked[0].toFixed(6) : ""} />
          <input type="hidden" name="lng" value={picked ? picked[1].toFixed(6) : ""} />
        </>
      )}
    </div>
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
