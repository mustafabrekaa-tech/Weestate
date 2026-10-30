import { Importer } from "@/components/Importer";
import { IMPORT_ORDER } from "@/lib/imports";
import { importRows } from "../actions";

export default async function ImportPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ kind?: string }> }) {
  const { id } = await params;
  const { kind } = await searchParams;
  async function save(k: string, rows: Record<string, unknown>[]) {
    "use server";
    return importRows(id, k, rows);
  }
  return (
    <>
      <p className="we-help" style={{ margin: 0 }}>
        Bring existing data in from Excel, CSV, Primavera P6 or MS Project. Download a template if you need the headings, check the preview, then save.
      </p>
      <Importer save={save} kinds={IMPORT_ORDER} initial={kind} />
    </>
  );
}
