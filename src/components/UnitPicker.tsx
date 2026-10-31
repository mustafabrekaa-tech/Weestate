import { MultiSelect } from "./Select";

// The "which units" fields of a bulk form: any mix of phases, zones, buildings,
// unit types (several of each) and typed unit codes.
type Opt = { id: string; name: string };

export function UnitPicker({ phases, zones, buildings, types }: { phases: Opt[]; zones: Opt[]; buildings: Opt[]; types: string[] }) {
  return (
    <>
      <div className="we-field">
        <label htmlFor="up-phase">Phase</label>
        <MultiSelect id="up-phase" name="phase_id" options={phases.map((p) => ({ value: p.id, label: p.name }))} />
      </div>
      {zones.length > 0 && (
        <div className="we-field">
          <label htmlFor="up-zone">Zone</label>
          <MultiSelect id="up-zone" name="zone_id" options={zones.map((z) => ({ value: z.id, label: z.name }))} />
        </div>
      )}
      {buildings.length > 0 && (
        <div className="we-field">
          <label htmlFor="up-building">Building</label>
          <MultiSelect id="up-building" name="building_id" options={buildings.map((b) => ({ value: b.id, label: b.name }))} />
        </div>
      )}
      <div className="we-field">
        <label htmlFor="up-type">Unit type</label>
        <MultiSelect id="up-type" name="unit_type" options={types.map((t) => ({ value: t, label: t }))} />
      </div>
      <div className="we-field" style={{ gridColumn: "1 / -1" }}>
        <label htmlFor="up-codes">Or these unit codes <span className="we-help">· separated by spaces or commas</span></label>
        <textarea id="up-codes" name="codes" className="we-input we-mono" rows={2} placeholder="V-101 V-102 T-14" />
      </div>
    </>
  );
}
