import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { getMe } from "@/lib/data";
import { date } from "@/lib/format";
import { IMPORTS, type Column } from "@/lib/imports";
import { createClient } from "@/lib/supabase/server";
import { saveEntry } from "../actions";
import { Select } from "@/components/Select";

const PAGES = {
  customers: { title: "Customers and owners", table: "customers", order: "full_name", search: "full_name", list: ["full_name", "national_id", "phone", "email", "source", "broker"], writers: ["sales", "handover", "community"] },
  suppliers: { title: "Suppliers and contractors", table: "suppliers", order: "name", search: "name", list: ["name", "kind", "trade", "contact_name", "phone", "rating"], writers: ["procurement", "pm", "facility"] },
} as const;
type Kind = keyof typeof PAGES;

export async function generateMetadata({ params }: { params: Promise<{ kind: string }> }): Promise<Metadata> {
  const { kind } = await params;
  return { title: PAGES[kind as Kind]?.title ?? "Directory" };
}

export default async function Directory({ params, searchParams }: { params: Promise<{ kind: string }>; searchParams: Promise<{ q?: string; edit?: string }> }) {
  const { kind } = await params;
  const { q, edit } = await searchParams;
  const page = PAGES[kind as Kind];
  if (!page) notFound();
  const me = await getMe();
  const supabase = await createClient();
  let query = supabase.from(page.table).select("*").eq("company_id", me?.company_id ?? "").order(page.order).limit(500);
  if (q) query = query.ilike(page.search, `%${q}%`);
  const { data } = await query;
  const rows = (data ?? []) as Record<string, unknown>[];
  const cols = IMPORTS[kind as Kind].columns;
  const byKey = new Map(cols.map((c) => [c.key, c]));
  const editing = edit ? rows.find((r) => r.id === edit) : undefined;
  const canWrite = me?.is_admin || (page.writers as readonly string[]).includes(me?.department ?? "");

  return (
    <>
      <div className="we-pagehead">
        <div><div className="we-eyebrow">Shared by all your projects</div><h1>{page.title}</h1></div>
        <div className="we-actionsbar">
          <form className="we-row" style={{ gap: 6 }}>
            <input name="q" defaultValue={q} className="we-input" placeholder="Search by name" style={{ width: 220 }} aria-label="Search" />
            <button className="we-btn we-btn--secondary we-btn--sm">Search</button>
          </form>
          <Link className="we-btn we-btn--secondary we-btn--sm" href={`/import?kind=${kind}`}>Upload from Excel</Link>
        </div>
      </div>

      <div className="we-table-wrap">
        <table className="we-table">
          <thead><tr>{page.list.map((k) => <th key={k} className={byKey.get(k)?.type === "number" ? "num" : ""}>{byKey.get(k)?.label}</th>)}<th /></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={page.list.length + 1} className="we-empty">{q ? "No matches." : "Nothing here yet. Add one below or upload your Excel sheet."}</td></tr>}
            {rows.map((r) => (
              <tr key={String(r.id)}>
                {page.list.map((k, i) => (
                  <td key={k} className={byKey.get(k)?.type === "number" ? "num" : ""}>
                    {i === 0 ? <b>{String(r[k] ?? "")}</b> : String(r[k] ?? "")}
                  </td>
                ))}
                <td>{canWrite && <Link href={`?edit=${r.id}${q ? `&q=${encodeURIComponent(q)}` : ""}#form`}>Edit</Link>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canWrite && (
        <section className="we-card" id="form">
          <h2>{editing ? `Edit ${String(editing[page.order])}` : "Add"} {editing && <Link className="we-link" style={{ fontSize: 13 }} href={`/directory/${kind}`}>Cancel</Link>}</h2>
          <ActionForm key={String(editing?.id ?? "new")} action={saveEntry.bind(null, kind as Kind)} className="we-form-grid" resetOnOk={!editing}>
            <input type="hidden" name="id" value={String(editing?.id ?? "")} />
            {cols.map((c) => <Input key={c.key} c={c} value={editing?.[c.key]} kind={kind as Kind} />)}
            <div className="we-field" style={{ alignSelf: "end" }}><button className="we-btn we-btn--primary">{editing ? "Save" : "Add"}</button></div>
          </ActionForm>
          {editing?.created_at != null && <p className="we-help">On file since {date(String(editing.created_at))}.</p>}
        </section>
      )}
    </>
  );
}

function Input({ c, value, kind }: { c: Column; value: unknown; kind: Kind }) {
  const v = value == null ? "" : String(value);
  const id = `f-${c.key}`;
  const wide = c.key === "notes" || c.key === "address";
  return (
    <div className="we-field" style={wide ? { gridColumn: "1 / -1" } : undefined}>
      <label htmlFor={id}>{c.label}{c.required && " *"}</label>
      {kind === "suppliers" && c.key === "kind" ? (
        <Select id={id} name={c.key} className="we-input we-select" defaultValue={v || "contractor"}>
          {["contractor", "supplier", "consultant", "facility", "other"].map((k) => <option key={k} value={k}>{k[0]!.toUpperCase() + k.slice(1)}</option>)}
        </Select>
      ) : c.key === "notes" ? (
        <textarea id={id} name={c.key} className="we-input" rows={2} defaultValue={v} />
      ) : (
        <input
          id={id}
          name={c.key}
          className={`we-input${c.type === "number" ? " we-mono" : ""}`}
          type={c.type === "date" ? "date" : c.key.includes("email") ? "email" : "text"}
          inputMode={c.type === "number" ? "decimal" : c.key.includes("phone") ? "tel" : undefined}
          defaultValue={c.type === "date" ? v.slice(0, 10) : v}
          required={c.required}
          dir={c.key.endsWith("_ar") ? "rtl" : undefined}
        />
      )}
    </div>
  );
}
