import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { FieldInput } from "@/components/FieldInput";
import { getMe, getProjects, refOptions, type Option } from "@/lib/data";
import { canRaise, docBySlug } from "@/lib/docs";
import { createDoc } from "../../actions";

export default async function NewDoc({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ project?: string }>;
}) {
  const { slug } = await params;
  const d = docBySlug(slug);
  if (!d) notFound();
  const me = await getMe();
  const projects = await getProjects();
  const { project } = await searchParams;
  if (!project && projects.length === 1) redirect(`/docs/${slug}/new?project=${projects[0]!.id}`);
  const p = projects.find((x) => x.id === project);

  if (!canRaise(d, me?.department, !!me?.is_admin)) {
    return (
      <>
        <h1>New {d.name.toLowerCase()}</h1>
        <div className="we-banner we-banner--info">This is raised by another department. Ask an admin if you need to raise it.</div>
      </>
    );
  }
  if (!p) {
    return (
      <>
        <div className="we-pagehead"><div><div className="we-eyebrow">New {d.name.toLowerCase()}</div><h1>Which project?</h1></div></div>
        {projects.length === 0 && <div className="we-empty">No projects yet. <Link href="/projects/new">Set one up</Link> first.</div>}
        <div className="we-grid">
          {projects.map((x) => (
            <Link key={x.id} className="we-card we-cardlink" href={`/docs/${slug}/new?project=${x.id}`}>
              <b>{x.name}</b>
              <span className="we-help">{x.location || x.code}</span>
            </Link>
          ))}
        </div>
      </>
    );
  }

  const sources = [...new Set([...d.fields, ...(d.lines?.columns ?? [])].map((f) => f.ref).filter(Boolean))] as string[];
  const opts: Record<string, Option[]> = {};
  await Promise.all(sources.map(async (s) => (opts[s] = await refOptions(s, p.id, p.company_id))));

  return (
    <>
      <div className="we-pagehead">
        <div>
          <div className="we-eyebrow">{p.name}</div>
          <h1>New {d.name.toLowerCase()}</h1>
        </div>
      </div>
      <ActionForm action={createDoc.bind(null, slug, p.id)} className="we-card we-stack">
        <div className="we-form-grid">
          {d.fields.map((f) => (
            <div key={f.name} style={f.kind === "textarea" ? { gridColumn: "1 / -1" } : undefined}>
              <FieldInput field={f} options={f.ref ? opts[f.ref] : undefined} />
            </div>
          ))}
        </div>
        {d.lines && (
          <div className="we-stack">
            <h2 style={{ margin: 0 }}>{d.lines.label}</h2>
            <div className="we-table-wrap">
              <table className="we-table we-table--inputs">
                <thead><tr>{d.lines.columns.map((c) => <th key={c.name}>{c.label}</th>)}</tr></thead>
                <tbody>
                  {Array.from({ length: 8 }, (_, i) => (
                    <tr key={i}>
                      {d.lines!.columns.map((c) => (
                        <td key={c.name}>
                          <FieldInput field={{ ...c, required: false }} options={c.ref ? opts[c.ref] : undefined} prefix={`l${i}_`} bare />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <span className="we-help">Leave rows you don&apos;t need empty. The total is added up for you.</span>
          </div>
        )}
        <div className="we-row">
          <button className="we-btn we-btn--primary">Save as draft</button>
          <span className="we-help">You send it on from the next page, when it is ready.</span>
        </div>
      </ActionForm>
    </>
  );
}
