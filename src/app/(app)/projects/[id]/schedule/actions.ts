"use server";

import { revalidatePath } from "next/cache";
import { parsePreds, schedule, type LinkType } from "@/lib/cpm";
import type { ActionResult } from "@/lib/data";
import { STANDARD } from "@/lib/scheduleTemplate";
import { createClient } from "@/lib/supabase/server";

type Supa = Awaited<ReturnType<typeof createClient>>;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const denied = (e: { code?: string; message: string }) =>
  e.code === "42501" ? "Only Planning and cost control, the Technical office or the PM can change the schedule." : e.message;

// The schedule shown and edited: the baseline, or the first one; made if there is none.
async function workingVersion(supabase: Supa, project: string, make = true) {
  const { data } = await supabase.from("schedule_versions").select("id, is_baseline").eq("project_id", project).order("created_at");
  const v = (data ?? []).find((x) => x.is_baseline) ?? data?.[0];
  if (v || !make) return v?.id as string | undefined;
  const { data: nv, error } = await supabase
    .from("schedule_versions").insert({ project_id: project, name: "Baseline", is_baseline: true, source: "manual" }).select("id").single();
  if (error) throw new Error(denied(error));
  return nv.id as string;
}

// Works out every activity's dates from durations and links, and saves them.
async function reschedule(supabase: Supa, project: string, version: string) {
  const [{ data: acts }, { data: links }, { data: phases }] = await Promise.all([
    supabase.from("activities").select("id, start_date, finish_date, duration_days, is_milestone").eq("version_id", version).limit(5000),
    supabase.from("activity_links").select("pred_id, succ_id, type:kind, lag_days").eq("project_id", project).limit(20000),
    supabase.from("phases").select("start_date").eq("project_id", project),
  ]);
  const list = acts ?? [];
  if (!list.length) return { loops: false };
  const hasPred = new Set((links ?? []).map((l) => l.succ_id));
  const starts = [...list.map((a) => a.start_date), ...(phases ?? []).map((p) => p.start_date)].filter(Boolean).sort() as string[];
  const projectStart = starts[0] ?? new Date().toISOString().slice(0, 10);
  const span = (a: (typeof list)[number]) =>
    a.is_milestone ? 0 : a.duration_days ?? (a.start_date && a.finish_date ? Math.round((Date.parse(a.finish_date) - Date.parse(a.start_date)) / 86400000) + 1 : 1);
  const { dates, loops } = schedule(
    list.map((a) => ({ id: a.id, duration: span(a), notBefore: hasPred.has(a.id) ? null : a.start_date })),
    (links ?? []).map((l) => ({ pred: l.pred_id, succ: l.succ_id, type: l.type as LinkType, lag: l.lag_days })),
    projectStart,
  );
  const rows = list.map((a) => {
    const d = dates.get(a.id)!;
    return { id: a.id, start_date: d.start, finish_date: d.finish, total_float: d.float, is_critical: d.critical, duration_days: span(a) };
  });
  for (let i = 0; i < rows.length; i += 200) {
    await Promise.all(rows.slice(i, i + 200).map((r) => supabase.from("activities").update(r).eq("id", r.id)));
  }
  return { loops };
}

// Replaces an activity's predecessors with the ones typed in.
async function setPreds(supabase: Supa, project: string, version: string, succ: string, text: string) {
  const want = parsePreds(text);
  await supabase.from("activity_links").delete().eq("succ_id", succ);
  if (!want.length) return [];
  const { data: found } = await supabase.from("activities").select("id, code").eq("version_id", version).in("code", want.map((w) => w.code));
  const byCode = new Map((found ?? []).map((a) => [a.code, a.id]));
  const missing = want.filter((w) => !byCode.has(w.code)).map((w) => w.code);
  const rows = want.filter((w) => byCode.has(w.code) && byCode.get(w.code) !== succ)
    .map((w) => ({ project_id: project, pred_id: byCode.get(w.code)!, succ_id: succ, kind: w.type, lag_days: w.lag }));
  if (rows.length) await supabase.from("activity_links").insert(rows);
  return missing;
}

export async function saveActivity(project: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const code = str(form, "code"), name = str(form, "name");
  if (!code || !name) return { error: "Give the activity a code and a name." };
  const kind = str(form, "kind"); // task | start | finish
  const days = Number(str(form, "duration") || (kind === "task" ? 1 : 0));
  if (!Number.isFinite(days) || days < 0) return { error: "Duration is a number of days." };
  try {
    const version = (await workingVersion(supabase, project))!;
    const { data: a, error } = await supabase.from("activities").upsert({
      project_id: project, version_id: version, code, name,
      category: str(form, "category"), wbs: str(form, "wbs"),
      phase_id: str(form, "phase_id") || null, building_id: str(form, "building_id") || null,
      start_date: str(form, "start_date") || null, finish_date: null,
      duration_days: kind === "task" ? Math.max(1, Math.round(days)) : 0,
      is_milestone: kind !== "task", milestone_kind: kind === "task" ? null : kind,
      weight: kind === "task" ? Number(str(form, "weight") || days || 1) : 0,
    }, { onConflict: "version_id,code" }).select("id").single();
    if (error) return { error: denied(error) };
    const missing = await setPreds(supabase, project, version, a.id, str(form, "preds"));
    const { loops } = await reschedule(supabase, project, version);
    revalidatePath(`/projects/${project}`, "layout");
    return {
      ok: `Saved ${code}. Dates recalculated.${missing.length ? ` Not found: ${missing.join(", ")}.` : ""}${loops ? " Some links go round in a loop; check them." : ""}`,
    };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function deleteActivity(project: string, activity: string, _: ActionResult): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("activities").delete().eq("id", activity).select("version_id");
  if (error) return { error: denied(error) };
  if (!data?.length) return { error: "Not deleted. Only planners can change the schedule." };
  await reschedule(supabase, project, data[0]!.version_id);
  revalidatePath(`/projects/${project}`, "layout");
  return { ok: "Deleted." };
}

export async function recalculate(project: string, _: ActionResult): Promise<ActionResult> {
  const supabase = await createClient();
  const version = await workingVersion(supabase, project, false);
  if (!version) return { error: "There is no schedule yet." };
  const { loops } = await reschedule(supabase, project, version);
  revalidatePath(`/projects/${project}`, "layout");
  return { ok: loops ? "Dates recalculated, but some links go round in a loop." : "Dates, float and the critical path are recalculated." };
}

// Adds the standard engineering, procurement, execution and handover schedule for a phase.
export async function addStandardSchedule(project: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const start = str(form, "start_date");
  if (!start) return { error: "Pick the start date (notice to proceed)." };
  const phaseId = str(form, "phase_id") || null;
  const { data: ph } = phaseId ? await supabase.from("phases").select("code").eq("id", phaseId).single() : { data: null };
  const prefix = ph?.code ? `${ph.code.replace(/\s+/g, "")}-` : "";
  try {
    const version = (await workingVersion(supabase, project))!;
    const rows = STANDARD.map((r) => ({
      project_id: project, version_id: version, code: prefix + r.code, name: r.name, category: r.cat,
      wbs: `${ph?.code ?? "Project"}.${r.cat}`, phase_id: phaseId,
      start_date: r.ms === "start" ? start : null, finish_date: null,
      duration_days: r.days, is_milestone: !!r.ms, milestone_kind: r.ms ?? null, weight: r.days,
    }));
    const { data: made, error } = await supabase.from("activities").upsert(rows, { onConflict: "version_id,code" }).select("id, code");
    if (error) return { error: denied(error) };
    const id = new Map((made ?? []).map((a) => [a.code, a.id]));
    const links = STANDARD.flatMap((r) =>
      parsePreds(r.preds ?? "").map((p) => ({ project_id: project, pred_id: id.get(prefix + p.code)!, succ_id: id.get(prefix + r.code)!, kind: p.type, lag_days: p.lag })),
    ).filter((l) => l.pred_id && l.succ_id);
    await supabase.from("activity_links").delete().in("succ_id", [...id.values()]);
    const { error: le } = await supabase.from("activity_links").insert(links);
    if (le) return { error: denied(le) };
    await reschedule(supabase, project, version);
    revalidatePath(`/projects/${project}`, "layout");
    return { ok: `Added ${rows.length} activities and milestones with ${links.length} links${ph ? ` for ${ph.code}` : ""}. Change any of them below.` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// Links that came with an imported P6 or MS Project file.
export async function importLinks(project: string, links: { pred: string; succ: string; type: string; lag: number }[]) {
  if (!links.length) return { ok: "" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_links", { p_project: project, p_links: links });
  if (error) return { error: error.message };
  // Imported dates are kept as they came (P6 and MS Project use work calendars).
  revalidatePath(`/projects/${project}`, "layout");
  return { ok: `${data} links between activities.` };
}
