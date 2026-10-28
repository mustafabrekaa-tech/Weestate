import { createClient } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  full_name: string;
  email: string;
  department: string | null;
  is_admin: boolean;
};

export type QueueItem = {
  doc_type: string;
  doc_id: string;
  ref: string;
  title: string;
  subtitle: string;
  project_id: string;
  project_name: string;
  amount_egp: number;
  status: string;
  step: number;
  step_name: string;
  department: string;
  department_name: string;
  step_entered_at: string;
  due_days: number;
  days_waiting: number;
  overdue: boolean;
};

export type Department = { code: string; name: string; name_ar: string; sort: number };

export async function getMe() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const id = claims?.claims?.sub;
  if (!id) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", id).single();
  return data as Profile | null;
}

// Overdue first, then the longest waiting.
export function sortQueue(items: QueueItem[]) {
  return [...items].sort(
    (a, b) => Number(b.overdue) - Number(a.overdue) || b.days_waiting - a.days_waiting,
  );
}
