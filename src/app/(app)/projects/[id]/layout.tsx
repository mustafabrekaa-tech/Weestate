import { notFound } from "next/navigation";
import { ProjectTabs } from "@/components/ProjectTabs";
import { createClient } from "@/lib/supabase/server";

const statusLabel: Record<string, string> = {
  planning: "Planning", design: "Design", construction: "Construction", handover: "Handover", operation: "Operation", closed: "Closed",
};

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: p } = await supabase.from("projects").select("id, code, name, location, status").eq("id", id).maybeSingle();
  if (!p) notFound();
  return (
    <>
      <div className="we-pagehead">
        <div>
          <div className="we-eyebrow">{[p.code, p.location, statusLabel[p.status]].filter(Boolean).join(" · ")}</div>
          <h1>{p.name}</h1>
        </div>
      </div>
      <ProjectTabs id={id} />
      {children}
    </>
  );
}
