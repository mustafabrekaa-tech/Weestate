// Shapes and labels for the WE-estate staff portal.
export type Workspace = {
  id: string; slug: string; name: string; created_at: string; people: number; projects: number; units: number;
  domain: string; domain_status: string; logo_url: string; brand_color: string; status: string; plan: string;
  max_users: number | null; max_projects: number | null; trial_ends: string | null; contact_name: string;
  contact_email: string; contact_phone: string; staff_notes: string; last_active: string | null;
};

export const STATUS: Record<string, { label: string; chip: string }> = {
  active: { label: "Active", chip: "we-chip--done" },
  trial: { label: "Trial", chip: "we-chip--waiting" },
  suspended: { label: "Paused", chip: "we-chip--overdue" },
};
export const PLANS: Record<string, string> = { starter: "Starter", standard: "Standard", enterprise: "Enterprise" };
export const DOMAIN_STATE: Record<string, string> = { connected: "Live", "waiting for DNS": "Waiting for DNS", "not added": "Not connected yet", error: "Problem" };
