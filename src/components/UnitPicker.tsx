// The "which units" fields of a bulk form: any mix of phase, zone, building,
// unit type and typed unit codes.
type Opt = { id: string; name: string };

export function UnitPicker({ phases, zones, buildings, types }: { phases: Opt[]; zones: Opt[]; buildings: Opt[]; types: string[] }) {
  return (
    <>
      <div className="we-field">
        <label htmlFor="up-phase">Phase</label>
        <select id="up-phase" name="phase_id" className="we-input we-select"><option value="">Any</option>{phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      </div>
      {zones.length > 0 && (
        <div className="we-field">
          <label htmlFor="up-zone">Zone</label>
          <select id="up-zone" name="zone_id" className="we-input we-select"><option value="">Any</option>{zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}</select>
        </div>
      )}
      {buildings.length > 0 && (
        <div className="we-field">
          <label htmlFor="up-building">Building</label>
          <select id="up-building" name="building_id" className="we-input we-select"><option value="">Any</option>{buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        </div>
      )}
      <div className="we-field">
        <label htmlFor="up-type">Unit type</label>
        <select id="up-type" name="unit_type" className="we-input we-select"><option value="">Any</option>{types.map((t) => <option key={t}>{t}</option>)}</select>
      </div>
      <div className="we-field" style={{ gridColumn: "1 / -1" }}>
        <label htmlFor="up-codes">Or these unit codes <span className="we-help">· separated by spaces or commas</span></label>
        <textarea id="up-codes" name="codes" className="we-input we-mono" rows={2} placeholder="V-101 V-102 T-14" />
      </div>
    </>
  );
}
