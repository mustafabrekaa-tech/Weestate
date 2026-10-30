import type { Metadata } from "next";
import Link from "next/link";
import { Importer } from "@/components/Importer";
import { getProjects } from "@/lib/data";
import { IMPORT_ORDER } from "@/lib/imports";
import { importRows } from "../projects/[id]/actions";

export const metadata: Metadata = { title: "Import from Excel" };

export default async function ImportHub({ searchParams }: { searchParams: Promise<{ project?: string; kind?: string }> }) {
  const { project, kind } = await searchParams;
  const projects = await getProjects();
  const current = projects.find((p) => p.id === project) ?? projects[0];

  async function save(k: string, rows: Record<string, unknown>[]) {
    "use server";
    if (!current) return { error: "Create a project first." };
    return importRows(current.id, k, rows);
  }

  return (
    <>
      <div className="we-pagehead">
        <div><div className="we-eyebrow">Bring your sheets in</div><h1>Import from Excel</h1></div>
      </div>
      {!current ? (
        <div className="we-card we-empty">
          No projects yet. <Link href="/projects/new">Create the first project</Link>, then import its data here.
        </div>
      ) : (
        <>
          <section className="we-card we-stack">
            <div className="we-row" style={{ justifyContent: "space-between" }}>
              <div className="we-row">
                <span className="we-eyebrow">Project</span>
                {projects.map((p) => (
                  <Link key={p.id} href={`/import?project=${p.id}${kind ? `&kind=${kind}` : ""}`} className={`we-pill${p.id === current.id ? " is-on" : ""}`}>{p.name}</Link>
                ))}
              </div>
            </div>
            <p className="we-help" style={{ margin: 0 }}>
              Pick what you are uploading, download its Excel template if you need the headings, then choose your file.
              You will see a preview before anything is saved. Suppliers, customers and cost codes are shared by all your projects.
              Work in this order for a new project: phases, buildings, unit types, units, then budget, schedule, contracts and BOQ.
            </p>
          </section>
          <Importer key={current.id} save={save} kinds={IMPORT_ORDER} initial={kind} />
        </>
      )}
    </>
  );
}
