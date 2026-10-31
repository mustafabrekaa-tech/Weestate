// The handover (unit delivery) workflow, from planned submission to the client.
export const HANDOVER: { key: string; label: string; short: string; color: string; ink: string }[] = [
  { key: "not_started", label: "Not started", short: "Not started", color: "#c9d0d8", ink: "#39414a" },
  { key: "submitted", label: "Planned to submit", short: "Planned", color: "#06b6d4", ink: "#052b33" },
  { key: "submitted_consultant", label: "Submitted to consultant", short: "To consultant", color: "#2563eb", ink: "#ffffff" },
  { key: "snagging_con", label: "Snagging (consultant)", short: "Snag con", color: "#f97316", ink: "#2b1202" },
  { key: "submitted_qc", label: "Submitted to QC", short: "To QC", color: "#eab308", ink: "#241d02" },
  { key: "snagging_qc", label: "Snagging (QC)", short: "Snag QC", color: "#be123c", ink: "#ffffff" },
  { key: "qc_approved", label: "Approved by QC", short: "QC approved", color: "#4ade80", ink: "#0b1220" },
  { key: "initial", label: "Initial handover", short: "Initial", color: "#16a34a", ink: "#ffffff" },
  { key: "client_delivered", label: "Delivered to client", short: "Delivered", color: "#166534", ink: "#ffffff" },
];
export const HANDOVER_BY_KEY = Object.fromEntries(HANDOVER.map((s, i) => [s.key, { ...s, i }]));
