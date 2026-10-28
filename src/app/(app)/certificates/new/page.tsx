import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { NewForm } from "./NewForm";

export const metadata: Metadata = { title: "New payment certificate" };

export default async function NewCertificate() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("contracts")
    .select("id, code, contractor, projects(name)")
    .order("code");
  const contracts = ((data ?? []) as unknown as { id: string; code: string; contractor: string; projects: { name: string } | null }[]).map(
    (c) => ({ id: c.id, label: `${c.projects?.name ?? ""} · ${c.code} · ${c.contractor}` }),
  );
  return (
    <>
      <div className="we-pagehead">
        <div>
          <div className="we-eyebrow">Site · step 1 of 5</div>
          <h1>New payment certificate</h1>
        </div>
      </div>
      <NewForm contracts={contracts} />
    </>
  );
}
