"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";

export type Pin = { id: string; lat: number; lng: number; label: string; sub?: string; href?: string };

const IMAGERY = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const LABELS = "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";
const CAIRO: [number, number] = [30.03, 31.35];

// Satellite map of the projects. With `pick`, a click places the project and
// fills hidden lat/lng inputs for the form around it.
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
  const [picked, setPicked] = useState<[number, number] | null>(
    pick?.lat != null && pick?.lng != null ? [pick.lat, pick.lng] : null,
  );

  useEffect(() => {
    let map: import("leaflet").Map | undefined;
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !box.current) return;
      map = L.map(box.current, { scrollWheelZoom: false, attributionControl: true });
      // Maps inside hidden wizard steps need a redraw once they are shown.
      const ro = new ResizeObserver(() => map?.invalidateSize());
      ro.observe(box.current);
      map.on("unload", () => ro.disconnect());
      L.tileLayer(IMAGERY, { maxZoom: 19, attribution: "Imagery © Esri, Maxar, Earthstar Geographics" }).addTo(map);
      L.tileLayer(LABELS, { maxZoom: 19 }).addTo(map);
      const icon = (cls = "") => L.divIcon({ className: `we-pin ${cls}`, iconSize: [18, 18], iconAnchor: [9, 9] });

      const pts = pins.map((p) => {
        const m = L.marker([p.lat, p.lng], { icon: icon() }).addTo(map!);
        const html = `<b>${escapeHtml(p.label)}</b>${p.sub ? `<br><span>${escapeHtml(p.sub)}</span>` : ""}${
          p.href ? `<br><a href="${p.href}">Open project</a>` : ""
        }`;
        m.bindTooltip(html, { direction: "top", offset: [0, -8], className: "we-pin-tip", permanent: pins.length <= 6 });
        if (p.href) m.on("click", () => (window.location.href = p.href!));
        return L.latLng(p.lat, p.lng);
      });

      if (pick) {
        let marker: import("leaflet").Marker | undefined;
        const place = (ll: import("leaflet").LatLng) => {
          marker ??= L.marker(ll, { icon: icon("we-pin--pick"), draggable: true }).addTo(map!);
          marker.setLatLng(ll);
          marker.off("dragend").on("dragend", () => {
            const p = marker!.getLatLng();
            setPicked([p.lat, p.lng]);
          });
          setPicked([ll.lat, ll.lng]);
        };
        if (pick.lat != null && pick.lng != null) {
          map.setView([pick.lat, pick.lng], zoom ?? 16);
          place(L.latLng(pick.lat, pick.lng));
        } else {
          map.setView(CAIRO, 10);
        }
        map.on("click", (e) => place(e.latlng));
      } else if (pts.length === 1) {
        map.setView(pts[0]!, zoom ?? 16);
      } else if (pts.length > 1) {
        map.fitBounds(L.latLngBounds(pts), { padding: [48, 48], maxZoom: 16 });
      } else {
        map.setView(CAIRO, 10);
      }
    });
    return () => {
      cancelled = true;
      map?.remove();
    };
    // The map is built once; pins come from the server render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="we-map-wrap">
      <div ref={box} className="we-map" style={{ height }} role="region" aria-label="Satellite map" />
      {pick && (
        <>
          <input type="hidden" name="lat" value={picked ? picked[0].toFixed(6) : ""} />
          <input type="hidden" name="lng" value={picked ? picked[1].toFixed(6) : ""} />
          <span className="we-help">
            {picked ? `Placed at ${picked[0].toFixed(5)}, ${picked[1].toFixed(5)}. Drag the pin to adjust.` : "Click the map where the site is."}
          </span>
        </>
      )}
    </div>
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
