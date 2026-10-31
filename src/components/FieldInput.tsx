import type { Field } from "@/lib/docs";
import type { Option } from "@/lib/data";
import { Select } from "@/components/Select";

export function FieldInput({
  field,
  options = [],
  value,
  prefix = "",
  bare = false,
}: {
  field: Field;
  options?: Option[];
  value?: unknown;
  prefix?: string;
  bare?: boolean;
}) {
  const id = `${prefix}${field.name}`;
  const v = value == null ? undefined : String(value);
  let input: React.ReactNode;
  switch (field.kind) {
    case "textarea":
      input = <textarea id={id} name={id} className="we-input" defaultValue={v} required={field.required} />;
      break;
    case "select":
      input = (
        <Select id={id} name={id} className="we-input we-select" defaultValue={v}>
          {field.options?.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
        </Select>
      );
      break;
    case "ref":
      input = (
        <Select id={id} name={id} className="we-input we-select" defaultValue={v ?? ""} required={field.required}>
          <option value="">{field.required ? "Choose…" : "None"}</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      );
      break;
    case "check":
      return (
        <label className="we-row" style={{ gap: 8 }}>
          <input type="checkbox" id={id} name={id} defaultChecked={v === "true"} /> {field.label}
        </label>
      );
    default:
      input = (
        <input
          id={id}
          name={id}
          className={`we-input${field.kind === "money" || field.kind === "int" ? " we-mono" : ""}`}
          type={field.kind === "date" ? "date" : field.kind === "datetime" ? "datetime-local" : "text"}
          inputMode={field.kind === "money" ? "decimal" : field.kind === "int" ? "numeric" : undefined}
          defaultValue={v}
          required={field.required}
          aria-label={bare ? field.label : undefined}
          placeholder={bare ? field.label : undefined}
        />
      );
  }
  if (bare) return input;
  return (
    <div className="we-field">
      <label htmlFor={id}>{field.label}{field.required ? "" : <span className="we-help"> · optional</span>}</label>
      {input}
      {field.help && <span className="we-help">{field.help}</span>}
    </div>
  );
}

// Reads a field back from a form in the type the database expects.
export function readField(field: Field, form: FormData, prefix = ""): unknown {
  const raw = form.get(`${prefix}${field.name}`);
  if (field.kind === "check") return raw === "on";
  const s = raw == null ? "" : String(raw).trim();
  if (s === "") return null;
  if (field.kind === "money" || field.kind === "int") {
    const n = Number(s.replace(/[,\s]/g, "").replace("−", "-"));
    if (!Number.isFinite(n)) throw new Error(`${field.label}: enter a number, for example 1,250,000.`);
    return field.kind === "int" ? Math.round(n) : n;
  }
  if (field.kind === "datetime") return new Date(s).toISOString();
  return s;
}
