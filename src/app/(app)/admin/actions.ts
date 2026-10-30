"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/data";
import { getBrand } from "@/lib/brand";
import { esc, layout, mailReady, trySend } from "@/lib/mail";
import { createClient } from "@/lib/supabase/server";
import { connectDomain } from "@/lib/vercel";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const n = (f: FormData, k: string) => Number(s(f, k).replace(/[,\s]/g, "") || 0);

export async function addPerson(company: string | null, _: ActionResult, form: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  // Plans can cap the number of people in a workspace.
  if (company) {
    const [{ data: c }, { count }] = await Promise.all([
      supabase.from("companies").select("max_users").eq("id", company).single(),
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("company_id", company),
    ]);
    if (c?.max_users && (count ?? 0) >= c.max_users) {
      return { error: `Your plan allows ${c.max_users} people and all places are taken. Ask WE-estate to raise the limit.` };
    }
  }
  const { data, error } = await supabase.rpc("admin_create_user", {
    p_email: s(form, "email"),
    p_full_name: s(form, "full_name"),
    p_department: s(form, "department") || null,
    p_is_admin: form.get("is_admin") === "on",
    p_company: company,
    p_password: s(form, "password") || null,
  });
  if (error) return { error: error.message };
  const row = (data as { temp_password: string }[])[0];
  revalidatePath("/admin/people");
  const email = s(form, "email");
  if (mailReady() && row?.temp_password && form.get("send_email") === "on") {
    const { data: c } = await supabase.from("companies").select("name, slug").eq("id", company ?? "").maybeSingle();
    await welcome(email, s(form, "full_name"), row.temp_password, c);
    return { ok: `Added ${email} and emailed them their sign-in details. Their temporary password is ${row.temp_password}.` };
  }
  return { ok: `Added ${email}. Their temporary password is ${row?.temp_password}. Send it to them; they change it under My account.` };
}

export async function updatePerson(_: ActionResult, form: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const id = s(form, "id");
  const department = s(form, "department");
  const all = form.get("all_projects") !== "only";
  const { data, error } = await supabase
    .from("profiles")
    .update({
      full_name: s(form, "full_name"),
      department: department || null,
      is_admin: form.get("is_admin") === "on",
      read_only: form.get("read_only") === "on",
      extra_roles: form.getAll("extra_roles").map(String).filter((r) => r && r !== department),
      all_projects: all,
    })
    .eq("id", id)
    .select("id, company_id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Not saved. Only admins can change people." };
  // Which projects someone limited to some projects can open.
  if (!all) {
    const chosen = form.getAll("projects").map(String);
    if (!chosen.length) return { error: "Pick at least one project, or let them see all projects." };
    const { data: had } = await supabase.from("project_access").select("project_id").eq("user_id", id);
    const before = new Set((had ?? []).map((r) => r.project_id as string));
    const add = chosen.filter((p) => !before.has(p)).map((p) => ({ user_id: id, project_id: p }));
    const drop = [...before].filter((p) => !chosen.includes(p));
    if (add.length) {
      const { error: e } = await supabase.from("project_access").insert(add);
      if (e) return { error: e.message };
    }
    if (drop.length) await supabase.from("project_access").delete().eq("user_id", id).in("project_id", drop);
  }
  revalidatePath("/", "layout");
  return { ok: "Saved." };
}

export async function resetAuthenticator(id: string, _: ActionResult): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_reset_mfa", { p_user: id });
  if (error) return { error: error.message };
  revalidatePath("/admin/people");
  return { ok: "Authenticator reset. They set up a new one the next time they sign in." };
}

// Which sections each department sees. Unticked boxes become hidden sections.
export async function saveVisibility(company: string, departments: string[], modules: string[], _: ActionResult, form: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const hide: { company_id: string; department: string; module: string }[] = [];
  for (const d of departments) for (const m of modules) if (form.get(`${d}:${m}`) !== "on") hide.push({ company_id: company, department: d, module: m });
  const { error: e1 } = await supabase.from("hidden_modules").delete().eq("company_id", company);
  if (e1) return { error: e1.message };
  if (hide.length) {
    const { error } = await supabase.from("hidden_modules").insert(hide);
    if (error) return { error: error.message };
  }
  revalidatePath("/", "layout");
  return { ok: "Saved. Menus update the next time each person opens a page." };
}

export async function resetPassword(id: string, _: ActionResult): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_reset_password", { p_user: id });
  if (error) return { error: error.message };
  return { ok: `New temporary password: ${data}` };
}

export async function saveCompany(id: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .update({
      name: s(form, "name"),
      name_ar: s(form, "name_ar"),
      logo_url: s(form, "logo_url"),
      currency: s(form, "currency") || "EGP",
      brand_color: form.get("default_color") === "on" ? "" : s(form, "brand_color").toLowerCase(),
      tagline: s(form, "tagline"),
    })
    .eq("id", id)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Only an admin can change the company." };
  revalidatePath("/", "layout");
  return { ok: "Company saved." };
}

export async function saveLimit(company: string, docType: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("approval_limits").upsert({
    company_id: company,
    doc_type: docType,
    amount_egp: n(form, "amount_egp"),
    any_time_impact: form.get("any_time_impact") === "on",
  });
  if (error) return { error: error.message };
  revalidatePath("/admin/limits");
  return { ok: "Limit saved." };
}

export async function customizeSteps(company: string, docType: string, _: ActionResult): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: defaults } = await supabase
    .from("workflow_steps")
    .select("doc_type, seq, name, name_ar, department, action, due_days, only_above_limit")
    .eq("doc_type", docType)
    .is("company_id", null);
  const { error } = await supabase.from("workflow_steps").insert((defaults ?? []).map((d) => ({ ...d, company_id: company })));
  if (error) return { error: error.message };
  revalidatePath("/admin/workflows");
  return { ok: "You now have your own copy of these steps. Edit them below." };
}

export async function saveStep(company: string, docType: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const id = s(form, "id");
  const row = {
    name: s(form, "name"),
    action: s(form, "action") || "Send on",
    department: s(form, "department"),
    due_days: n(form, "due_days") || 2,
    only_above_limit: form.get("only_above_limit") === "on",
  };
  if (!row.name || !row.department) return { error: "Each step needs a name and a department." };
  if (id) {
    const { error } = await supabase.from("workflow_steps").update(row).eq("id", id).eq("company_id", company);
    if (error) return { error: error.message };
  } else {
    const { data: last } = await supabase.from("workflow_steps").select("seq").eq("doc_type", docType).eq("company_id", company).order("seq", { ascending: false }).limit(1).maybeSingle();
    const { error } = await supabase.from("workflow_steps").insert({ ...row, name_ar: row.name, doc_type: docType, company_id: company, seq: (last?.seq ?? 0) + 1 });
    if (error) return { error: error.message };
  }
  revalidatePath("/admin/workflows");
  return { ok: "Step saved." };
}

export async function removeLastStep(company: string, docType: string, table: string, _: ActionResult): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: last } = await supabase.from("workflow_steps").select("id, seq").eq("doc_type", docType).eq("company_id", company).order("seq", { ascending: false }).limit(1).maybeSingle();
  if (!last) return { error: "No steps to remove." };
  if (last.seq <= 2) return { error: "A workflow needs at least two steps." };
  const { count } = await supabase.from(table).select("id", { count: "exact", head: true }).eq("step", last.seq).not("status", "in", "(done,paid,rejected)");
  if (count) return { error: `${count} open documents are at this step. Move them on first.` };
  const { error } = await supabase.from("workflow_steps").delete().eq("id", last.id);
  if (error) return { error: error.message };
  revalidatePath("/admin/workflows");
  return { ok: "Last step removed." };
}

export async function useDefaultSteps(company: string, docType: string, _: ActionResult): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("workflow_steps").delete().eq("doc_type", docType).eq("company_id", company);
  if (error) return { error: error.message };
  revalidatePath("/admin/workflows");
  return { ok: "Back to the standard steps." };
}

export async function createWorkspace(_: ActionResult, form: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const slug = s(form, "slug").toLowerCase();
  if (["www", "admin", "app", "api", "mail"].includes(slug)) return { error: "That short name is reserved." };
  const { data: id, error } = await supabase.rpc("create_company", { p_slug: slug, p_name: s(form, "name"), p_name_ar: s(form, "name_ar") });
  if (error) {
    return { error: error.code === "23505" ? "That short name is taken." : error.code === "23514" ? "Short name: 3 to 40 lowercase letters, numbers or dashes." : error.message };
  }
  const trial = Number(s(form, "trial_days") || 0);
  await supabase.from("companies").update({
    plan: s(form, "plan") || "standard",
    status: trial > 0 ? "trial" : "active",
    trial_ends: trial > 0 ? new Date(Date.now() + trial * 86400000).toISOString().slice(0, 10) : null,
    max_users: s(form, "max_users") ? Number(s(form, "max_users")) : null,
    contact_name: s(form, "admin_name"),
    contact_email: s(form, "admin_email"),
  }).eq("id", id);
  const { rootDomain } = await getBrand();
  const st = await connectDomain(`${slug}.${rootDomain}`);
  let note = `Workspace ${s(form, "name")} created at ${slug}.${rootDomain}${st.state === "connected" ? " (live)" : ""}.`;
  if (s(form, "admin_email")) {
    const { data, error: ue } = await supabase.rpc("admin_create_user", {
      p_email: s(form, "admin_email"),
      p_full_name: s(form, "admin_name"),
      p_department: "pm",
      p_is_admin: true,
      p_company: id,
      p_password: null,
    });
    if (ue) return { error: `${note} The admin was not added: ${ue.message}` };
    const pw = (data as { temp_password: string }[])[0]?.temp_password ?? "";
    note += ` Admin ${s(form, "admin_email")} can sign in with the temporary password ${pw}.`;
    if (mailReady() && pw) {
      await welcome(s(form, "admin_email"), s(form, "admin_name"), pw, { name: s(form, "name"), slug });
      note += " We've emailed them their sign-in details.";
    }
  }
  revalidatePath("/platform");
  return { ok: note };
}

// Sign-in details for someone just added, sent to their work email.
async function welcome(email: string, name: string, password: string, c: { name: string; slug: string } | null) {
  const { appName, rootDomain } = await getBrand();
  const url = c?.slug ? `https://${c.slug}.${rootDomain}` : `https://${rootDomain}`;
  await trySend({
    to: email,
    subject: `Your ${appName} account${c?.name ? ` at ${c.name}` : ""}`,
    html: layout({
      appName,
      heading: `Welcome to ${appName}`,
      body: [
        `Hello ${esc(name.split(" ")[0] || "")},`,
        `An account has been made for you${c?.name ? ` at <b>${esc(c.name)}</b>` : ""}. Sign in at <b>${esc(url.replace("https://", ""))}</b> with:`,
        `Email: <b>${esc(email)}</b><br>Temporary password: <b style="font-family:Consolas,monospace">${esc(password)}</b>`,
        "The first time you sign in you'll set up an authenticator app (Microsoft Authenticator or Google Authenticator) on your phone. Then change your password under My account.",
      ],
      button: { href: `${url}/login`, label: "Sign in" },
      foot: "If you weren't expecting this, you can ignore it.",
    }),
  });
}
