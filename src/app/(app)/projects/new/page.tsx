import type { Metadata } from "next";
import { getMe, acts } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { createProject } from "./actions";
import { Wizard } from "./Wizard";

export const metadata: Metadata = { title: "New project" };

export default async function NewProject() {
  const me = await getMe();
  const supabase = await createClient();
  const { data } = await supabase.from("project_templates").select("id, name, project_type, payload").order("name");
  const allowed = acts(me, ["pm", "cost_control"]);
  return (
    <>
      <div className="we-pagehead">
        <div><div className="we-eyebrow">Setup</div><h1>New project</h1></div>
      </div>
      {allowed ? (
        <Wizard templates={data ?? []} action={createProject} />
      ) : (
        <div className="we-banner we-banner--info">Projects are set up by project management or planning.</div>
      )}
    </>
  );
}
