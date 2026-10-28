import { Importer } from "@/components/Importer";
import type { ImportKind } from "@/lib/imports";
import { importRows } from "../actions";

const KINDS: ImportKind[] = ["units", "budget", "activities", "boq", "contracts", "suppliers", "customers"];

export default async function ImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  async function save(kind: string, rows: Record<string, unknown>[]) {
    "use server";
    return importRows(id, kind, rows);
  }
  return (
    <>
      <p className="we-help" style={{ margin: 0 }}>
        Bring existing data in from Excel, CSV, Primavera P6 or MS Project. Check the preview, then save.
      </p>
      <Importer save={save} kinds={KINDS} />
    </>
  );
}
