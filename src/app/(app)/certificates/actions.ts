"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createCertificate(_: string | null, form: FormData) {
  const supabase = await createClient();
  const contractId = String(form.get("contract_id") ?? "");
  const { data: contract } = await supabase.from("contracts").select("id, project_id").eq("id", contractId).maybeSingle();
  if (!contract) return "Choose the contract this certificate is for.";

  const gross = Number(String(form.get("gross_egp") ?? "").replace(/[,\s]/g, ""));
  if (!Number.isFinite(gross) || gross <= 0) return "Enter the certified amount in EGP, for example 18,400,000.";

  const { data: last } = await supabase
    .from("payment_certificates")
    .select("number")
    .eq("contract_id", contractId)
    .order("number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("payment_certificates")
    .insert({
      project_id: contract.project_id,
      contract_id: contractId,
      number: (last?.number ?? 0) + 1,
      period_end: String(form.get("period_end")),
      gross_egp: gross,
      description: String(form.get("description") ?? "").trim(),
    })
    .select("id")
    .single();
  if (error) return error.code === "42501" ? "Only Site and the Technical office can raise certificates." : error.message;

  revalidatePath("/", "layout");
  redirect(`/certificates/${data.id}`);
}

export async function certificateAction(id: string, _: string | null, form: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("certificate_action", {
    p_id: id,
    p_action: String(form.get("action")),
    p_comment: String(form.get("comment") ?? ""),
  });
  if (error) return error.message;
  revalidatePath("/", "layout");
  return null;
}
