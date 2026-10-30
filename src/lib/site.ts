// Shapes and colours shared by the 3D site map and the 3D model viewer.
export type SitePhase = { id: string; code: string; name: string; boundary: [number, number][] | null };
export type SiteZone = { id: string; code: string; name: string; phase_id: string | null; boundary: [number, number][] | null };
export type SiteBuilding = {
  id: string; code: string; name: string; phase_id: string | null; zone_id: string | null; floors: number | null;
  floor_height_m: number; base_m: number; footprint: [number, number][] | null;
};
export type SiteUnit = {
  id: string; code: string; building_id: string | null; phase_id: string | null; zone_id: string | null; floor: number | null; status: string;
  unit_type: string; area_m2: number | null; garden_m2: number | null; bedrooms: number | null; list_price_egp: number | null;
  footprint: [number, number][] | null;
};
export type SiteModel = { id: string; name: string; url: string };

export const UNIT_STATUS: Record<string, { label: string; color: string }> = {
  available: { label: "Available", color: "#3f9a68" },
  reserved: { label: "Reserved", color: "#d9a520" },
  sold: { label: "Sold", color: "#8a6420" },
  ready: { label: "Ready", color: "#3f78b5" },
  handed_over: { label: "Handed over", color: "#6b7781" },
  blocked: { label: "Blocked", color: "#a1241b" },
};
