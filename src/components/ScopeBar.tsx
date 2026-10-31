"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Select } from "@/components/Select";

type Opt = { id: string; code: string; name: string; phase_id?: string | null; zone_id?: string | null };

// Phase → zone → building picker shown on every project tab. The choice is
// remembered for the project and every tab narrows its figures to it.
export function ScopeBar({
  projectId, phases, zones, buildings, value, counts,
}: {
  projectId: string;
  phases: Opt[];
  zones: Opt[];
  buildings: Opt[];
  value: { phase: string; zone: string; building: string };
  counts: { units: number; label: string };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const set = (v: { phase: string; zone: string; building: string }) => {
    document.cookie = `we-scope-${projectId}=${encodeURIComponent(JSON.stringify(v))}; path=/; max-age=31536000; samesite=lax`;
    start(() => router.refresh());
  };
  const name = (o: Opt) => (o.name && o.name !== o.code ? `${o.code} · ${o.name}` : o.code);
  const zoneList = zones.filter((z) => !value.phase || z.phase_id === value.phase);
  const buildingList = buildings.filter((b) => (!value.phase || b.phase_id === value.phase) && (!value.zone || b.zone_id === value.zone));
  const any = value.phase || value.zone || value.building;

  return (
    <div className={`we-scope${any ? " is-on" : ""}`} aria-busy={pending}>
      <span className="we-scope__title">Showing</span>
      <Select className="we-input we-select we-input--sm" value={value.phase} aria-label="Phase"
        onChange={(e) => set({ phase: e.target.value, zone: "", building: "" })}>
        <option value="">All phases</option>
        {phases.map((p) => <option key={p.id} value={p.id}>{name(p)}</option>)}
      </Select>
      {zones.length > 0 && (
        <Select className="we-input we-select we-input--sm" value={value.zone} aria-label="Zone"
          onChange={(e) => {
            const z = zones.find((x) => x.id === e.target.value);
            set({ phase: z?.phase_id ?? value.phase, zone: e.target.value, building: "" });
          }}>
          <option value="">All zones</option>
          {zoneList.map((z) => <option key={z.id} value={z.id}>{name(z)}</option>)}
        </Select>
      )}
      {buildings.length > 0 && (
        <Select className="we-input we-select we-input--sm" value={value.building} aria-label="Building"
          onChange={(e) => {
            const b = buildings.find((x) => x.id === e.target.value);
            set({ phase: b?.phase_id ?? value.phase, zone: b?.zone_id ?? value.zone, building: e.target.value });
          }}>
          <option value="">All buildings</option>
          {buildingList.map((b) => <option key={b.id} value={b.id}>{name(b)}</option>)}
        </Select>
      )}
      <span className="we-help">{pending ? "Updating…" : any ? `${counts.label} · ${counts.units.toLocaleString("en-US")} units` : `Whole project · ${counts.units.toLocaleString("en-US")} units`}</span>
      {any && <button type="button" className="we-link" onClick={() => set({ phase: "", zone: "", building: "" })}>Show whole project</button>}
      <Link className="we-link we-scope__manage" href={`/projects/${projectId}/structure`}>Manage phases, zones and buildings</Link>
    </div>
  );
}
