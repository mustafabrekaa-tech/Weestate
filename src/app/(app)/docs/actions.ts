"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { readField } from "@/components/FieldInput";
import { getMe, type ActionResult } from "@/lib/data";
import { docBySlug, docHref } from "@/lib/docs";
import { getBrand } from "@/lib/brand";
import { esc, layout, mailReady, origin, trySend } from "@/lib/mail";
import { createClient } from "@/lib/supabase/server";

const LINE_ROWS = 8;

export async function createDoc(slug: string, projectId: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const d = docBySlug(slug);
  if (!d) return { error: "Unknown document type." };
  const supabase = await createClient();
  const row: Record<string, unknown> = { project_id: projectId };
  try {
    for (const f of d.fields) {
      if (f.name.startsWith("new_customer_")) continue;
      const v = readField(f, form);
      if (v === null && f.required && !(d.type === "unit_sale" && f.name === "customer_id")) return { error: `${f.label} is needed.` };
      if (v !== null) row[f.name] = v;
    }
  } catch (e) {
    return { error: (e as Error).message };
  }

  if (d.type === "unit_sale" && !row.customer_id) {
    const name = String(form.get("new_customer_name") ?? "").trim();
    if (!name) return { error: "Choose a customer or add a new one." };
    const { data: proj } = await supabase.from("projects").select("company_id").eq("id", projectId).single();
    const { data: cust, error } = await supabase
      .from("customers")
      .insert({
        company_id: proj?.company_id,
        full_name: name,
        phone: String(form.get("new_customer_phone") ?? "").trim(),
        national_id: String(form.get("new_customer_national_id") ?? "").trim(),
      })
      .select("id")
      .single();
    if (error) return { error: `Could not add the customer: ${error.message}` };
    row.customer_id = cust.id;
  }
  if (d.type === "budget_revision") {
    const { data: bud } = await supabase
      .from("budgets")
      .select("id")
      .eq("project_id", projectId)
      .neq("status", "superseded")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!bud) return { error: "This project has no budget yet. Add the budget first." };
    row.budget_id = bud.id;
  }

  const { data, error } = await supabase.from(d.table).insert(row).select("id").single();
  if (error) {
    return {
      error: error.code === "42501" ? `Your department cannot raise a ${d.name.toLowerCase()}.` : error.message,
    };
  }

  if (d.lines) {
    const lines: Record<string, unknown>[] = [];
    try {
      for (let i = 0; i < LINE_ROWS; i++) {
        const line: Record<string, unknown> = { project_id: projectId, [d.lines.fk]: data.id };
        let any = false;
        for (const c of d.lines.columns) {
          const v = readField(c, form, `l${i}_`);
          if (v !== null) {
            line[c.name] = v;
            any = true;
          }
        }
        if (any) lines.push(line);
      }
    } catch (e) {
      return { error: (e as Error).message };
    }
    if (lines.length) {
      const { error: le } = await supabase.from(d.lines.table).insert(lines);
      if (le) return { error: `Saved, but the lines were not: ${le.message}` };
    }
  }

  revalidatePath("/", "layout");
  redirect(docHref(d.type, data.id));
}

export async function docAction(type: string, id: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("workflow_action", {
    p_doc_type: type,
    p_id: id,
    p_action: String(form.get("action")),
    p_comment: String(form.get("comment") ?? ""),
  });
  if (error) return { error: error.message };
  if (form.get("action") !== "comment") await alert(type, id);
  revalidatePath("/", "layout");
  return { ok: data === "returned" ? "Returned." : data === "rejected" ? "Rejected." : "Done." };
}

export async function updateDraft(slug: string, id: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const d = docBySlug(slug);
  if (!d) return { error: "Unknown document type." };
  const supabase = await createClient();
  const row: Record<string, unknown> = {};
  try {
    for (const f of d.fields) {
      if (f.name.startsWith("new_customer_")) continue;
      row[f.name] = readField(f, form);
    }
  } catch (e) {
    return { error: (e as Error).message };
  }
  const { data, error } = await supabase.from(d.table).update(row).eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Only the raising department can change a draft or a returned document." };
  revalidatePath(docHref(d.type, id));
  return { ok: "Saved." };
}

export async function deleteDraft(slug: string, id: string) {
  const d = docBySlug(slug);
  if (!d) return;
  const supabase = await createClient();
  await supabase.from(d.table).delete().eq("id", id);
  revalidatePath("/", "layout");
  redirect(`/docs/${slug}`);
}

type Target = { email: string; full_name: string; why: string; doc_name: string; ref: string; title: string; project: string; step_name: string };

const WHY: Record<string, (t: Target) => [string, string]> = {
  waiting: (t) => [`Waiting on you: ${t.doc_name} ${t.ref}`, `${t.doc_name} ${t.ref} on ${t.project} is now at "${t.step_name}" and waiting on your department.`],
  returned: (t) => [`Returned to you: ${t.doc_name} ${t.ref}`, `${t.doc_name} ${t.ref} on ${t.project} was returned to you for changes.`],
  rejected: (t) => [`Rejected: ${t.doc_name} ${t.ref}`, `${t.doc_name} ${t.ref} on ${t.project} was rejected.`],
};

// Emails the people a document now waits on, or whoever raised it once it's
// returned, rejected or finished. Sent after the response, so nobody waits.
async function alert(type: string, id: string) {
  if (!mailReady()) return;
  const supabase = await createClient();
  const { data } = await supabase.rpc("doc_mail_targets", { p_doc_type: type, p_id: id });
  const targets = (data ?? []) as Target[];
  if (!targets.length) return;
  const [{ appName }, site, me, events] = await Promise.all([
    getBrand(),
    origin(),
    getMe(),
    supabase.from("workflow_events").select("comment").eq("doc_type", type).eq("doc_id", id).order("created_at", { ascending: false }).limit(1),
  ]);
  const comment = (events.data?.[0]?.comment as string | undefined) ?? "";
  const href = `${site}${docHref(type, id)}`;
  after(async () => {
    for (const t of targets) {
      const [subject, line] = (WHY[t.why] ?? ((x: Target) => [`Done: ${x.doc_name} ${x.ref}`, `${x.doc_name} ${x.ref} on ${x.project} has gone through every step.`]))(t);
      await trySend({
        to: t.email,
        subject,
        html: layout({
          appName,
          heading: subject,
          body: [
            `Hello ${esc(t.full_name.split(" ")[0] || "")},`,
            esc(line) + (t.title ? `<br><b>${esc(t.title)}</b>` : ""),
            ...(comment ? [`${esc(me?.full_name || "They")} wrote: <i>"${esc(comment)}"</i>`] : []),
          ],
          button: { href, label: "Open it" },
          foot: "You can turn these emails off under My account.",
        }),
      });
    }
  });
}
