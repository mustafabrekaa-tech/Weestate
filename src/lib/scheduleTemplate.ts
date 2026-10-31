// A standard residential schedule for one phase: engineering, procurement,
// execution and handover, with milestones and the usual links between them.
// Durations are calendar days; links are "code TYPE±lag".

export const CATEGORIES = ["Engineering", "Procurement", "Execution", "Handover"] as const;

type Row = { code: string; name: string; cat: (typeof CATEGORIES)[number]; days: number; ms?: "start" | "finish"; preds?: string };

export const STANDARD: Row[] = [
  { code: "M010", name: "Notice to proceed", cat: "Engineering", days: 0, ms: "start" },
  { code: "E100", name: "Concept and schematic design", cat: "Engineering", days: 45, preds: "M010" },
  { code: "E110", name: "Detailed design", cat: "Engineering", days: 90, preds: "E100 SS+30" },
  { code: "E120", name: "Building permit application", cat: "Engineering", days: 60, preds: "E100 FS+15" },
  { code: "M020", name: "Building permit approved", cat: "Engineering", days: 0, ms: "finish", preds: "E120" },
  { code: "E130", name: "Shop drawings", cat: "Engineering", days: 120, preds: "E110 SS+60" },
  { code: "M025", name: "Issued for construction drawings", cat: "Engineering", days: 0, ms: "finish", preds: "E110" },
  { code: "P100", name: "Main contractor tender", cat: "Procurement", days: 45, preds: "E110 SS+30" },
  { code: "P110", name: "Tender evaluation and award", cat: "Procurement", days: 15, preds: "P100" },
  { code: "M030", name: "Main contractor awarded", cat: "Procurement", days: 0, ms: "finish", preds: "P110" },
  { code: "P120", name: "Long-lead MEP and lifts procurement", cat: "Procurement", days: 120, preds: "P110 FS+30" },
  { code: "P130", name: "Finishing materials procurement", cat: "Procurement", days: 90, preds: "E130 SS+60" },
  { code: "X100", name: "Mobilisation", cat: "Execution", days: 15, preds: "M020, M030" },
  { code: "X110", name: "Excavation", cat: "Execution", days: 45, preds: "X100" },
  { code: "X120", name: "Foundations", cat: "Execution", days: 60, preds: "X110 SS+20" },
  { code: "X130", name: "Concrete structure", cat: "Execution", days: 180, preds: "X120 SS+40" },
  { code: "M040", name: "Structure complete", cat: "Execution", days: 0, ms: "finish", preds: "X130" },
  { code: "X140", name: "Masonry", cat: "Execution", days: 120, preds: "X130 SS+60" },
  { code: "X150", name: "MEP rough-in", cat: "Execution", days: 150, preds: "X140 SS+30, P120" },
  { code: "X160", name: "Plaster and screed", cat: "Execution", days: 90, preds: "X150 SS+40" },
  { code: "X170", name: "Facade", cat: "Execution", days: 120, preds: "X140 SS+60" },
  { code: "X180", name: "Finishes", cat: "Execution", days: 150, preds: "X160 SS+30, P130" },
  { code: "X190", name: "MEP fit-out and testing", cat: "Execution", days: 90, preds: "X180 FF+0" },
  { code: "X200", name: "External works and landscape", cat: "Execution", days: 120, preds: "X180 FF+30" },
  { code: "M050", name: "Practical completion", cat: "Execution", days: 0, ms: "finish", preds: "X170, X190, X200" },
  { code: "H100", name: "Snagging and de-snagging", cat: "Handover", days: 60, preds: "X180 FF+15" },
  { code: "H110", name: "Unit handovers", cat: "Handover", days: 90, preds: "M050, H100 SS+30" },
  { code: "M060", name: "Handover complete", cat: "Handover", days: 0, ms: "finish", preds: "H110" },
];
