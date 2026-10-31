"use client";

import {
  Children, type CSSProperties, isValidElement, type ReactNode, type SelectHTMLAttributes,
  useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState,
} from "react";
import { createPortal } from "react-dom";

// WE-estate dropdowns. The browser's own select menu can't be styled, so these draw their own list
// (search, keyboard, ticks) while a hidden native control keeps forms, validation and onChange working.

type Opt = { value: string; label: string; disabled?: boolean; group?: string };

const textOf = (n: ReactNode): string =>
  n == null || typeof n === "boolean" ? "" : typeof n === "string" || typeof n === "number" ? String(n)
    : Array.isArray(n) ? n.map(textOf).join("") : isValidElement(n) ? textOf((n.props as { children?: ReactNode }).children) : "";

function readOptions(children: ReactNode, group?: string): Opt[] {
  const out: Opt[] = [];
  Children.forEach(children, (c) => {
    if (!isValidElement(c)) return;
    const p = c.props as { value?: string | number; children?: ReactNode; disabled?: boolean; label?: string };
    if (c.type === "option") {
      const label = textOf(p.children);
      out.push({ value: p.value != null ? String(p.value) : label, label, disabled: p.disabled, group });
    } else if (c.type === "optgroup") out.push(...readOptions(p.children, p.label));
    else if (p.children) out.push(...readOptions(p.children, group));
  });
  return out;
}

// The floating list, placed under (or above) its button and kept there on scroll.
function usePopover(open: boolean, close: () => void) {
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<CSSProperties>({});
  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom, above = r.top;
    const up = below < 260 && above > below;
    const maxH = Math.max(160, Math.min(360, (up ? above : below) - 16));
    setPos({ position: "fixed", left: Math.max(8, Math.min(r.left, window.innerWidth - Math.max(r.width, 220) - 8)), minWidth: Math.max(r.width, 200), maxWidth: Math.max(r.width, 360), maxHeight: maxH,
      ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }) });
  }, []);
  useLayoutEffect(() => { if (open) place(); }, [open, place]);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { const t = e.target as Node; if (!btn.current?.contains(t) && !pop.current?.contains(t)) close(); };
    const move = (e: Event) => { if (pop.current?.contains(e.target as Node)) return; place(); };
    document.addEventListener("pointerdown", away, true);
    window.addEventListener("scroll", move, true);
    window.addEventListener("resize", place);
    return () => { document.removeEventListener("pointerdown", away, true); window.removeEventListener("scroll", move, true); window.removeEventListener("resize", place); };
  }, [open, close, place]);
  return { btn, pop, pos };
}

function List({ opts, isOn, onPick, multi, popRef, style, close, search, foot }: {
  foot?: ReactNode; opts: Opt[]; isOn: (v: string) => boolean; onPick: (v: string) => void; multi?: boolean;
  popRef: React.RefObject<HTMLDivElement | null>; style: CSSProperties; close: (focus?: boolean) => void; search: boolean;
}) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => (q ? opts.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : opts), [opts, q]);
  const [hi, setHi] = useState(() => Math.max(0, shown.findIndex((o) => isOn(o.value))));
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => { listRef.current?.querySelector<HTMLElement>(`[data-i="${hi}"]`)?.scrollIntoView({ block: "nearest" }); }, [hi]);
  useEffect(() => { (search ? popRef.current?.querySelector("input") : listRef.current)?.focus(); }, [search, popRef]);
  const key = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(shown.length - 1, h + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); const o = shown[hi]; if (o && !o.disabled) onPick(o.value); }
    else if (e.key === "Escape" || e.key === "Tab") { if (e.key === "Escape") e.preventDefault(); close(e.key === "Escape"); }
  };
  let lastGroup: string | undefined;
  return (
    <div ref={popRef} className="we-sel__pop" style={style} onKeyDown={key}>
      {search && <input className="we-sel__search" placeholder="Search…" value={q} onChange={(e) => { setQ(e.target.value); setHi(0); }} aria-label="Search the list" />}
      <ul ref={listRef} role="listbox" aria-multiselectable={multi || undefined} tabIndex={-1}>
        {shown.length === 0 && <li className="we-sel__none">Nothing matches</li>}
        {shown.map((o, i) => {
          const head = o.group && o.group !== lastGroup ? o.group : null;
          lastGroup = o.group;
          const on = isOn(o.value);
          return (
            <li key={`${o.group ?? ""}:${o.value}:${i}`} role="presentation">
              {head && <div className="we-sel__group">{head}</div>}
              <div role="option" aria-selected={on} aria-disabled={o.disabled || undefined} data-i={i}
                className={`we-sel__opt${on ? " is-on" : ""}${i === hi ? " is-hi" : ""}${o.disabled ? " is-off" : ""}`}
                onMouseEnter={() => setHi(i)} onClick={() => !o.disabled && onPick(o.value)}>
                {multi ? <i className="we-sel__box" aria-hidden="true" /> : <i className="we-sel__tick" aria-hidden="true" />}
                <span>{o.label || " "}</span>
              </div>
            </li>
          );
        })}
      </ul>
      {foot && <div className="we-sel__foot">{foot}</div>}
    </div>
  );
}

// Drop-in for <select>: same props, same <option> children.
export function Select({ children, className, style, id, value, defaultValue, onChange, disabled, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  const opts = useMemo(() => readOptions(children), [children]);
  const controlled = value !== undefined;
  const first = opts[0]?.value ?? "";
  const [inner, setInner] = useState<string>(defaultValue != null ? String(defaultValue) : first);
  const cur = controlled ? String(value ?? "") : inner;
  const [open, setOpen] = useState(false);
  const native = useRef<HTMLSelectElement>(null);
  const close = useCallback((focus?: boolean) => { setOpen(false); if (focus) setTimeout(() => btn.current?.focus(), 0); }, []);
  const { btn, pop, pos } = usePopover(open, close);
  const autoId = useId();

  // A form reset puts the native control back; follow it.
  useEffect(() => {
    const f = native.current?.form;
    if (!f || controlled) return;
    const r = () => setTimeout(() => native.current && setInner(native.current.value), 0);
    f.addEventListener("reset", r);
    return () => f.removeEventListener("reset", r);
  }, [controlled]);

  const pick = (v: string) => {
    setOpen(false);
    btn.current?.focus();
    if (v === cur) return;
    if (!controlled) setInner(v);
    const el = native.current;
    if (el) {
      // Let React see a real change on the native control so onChange, form listeners and requestSubmit work.
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
      setter?.call(el, v);
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
  };
  const label = opts.find((o) => o.value === cur)?.label ?? "";
  const cls = (className ?? "").split(/\s+/).filter((c) => c && c !== "we-select").join(" ");

  return (
    <>
      <select {...rest} ref={native} value={cur} onChange={onChange ?? (() => {})} disabled={disabled} tabIndex={-1} aria-hidden="true" className="we-sel__native">
        {opts.map((o, i) => <option key={`${o.value}:${i}`} value={o.value} disabled={o.disabled}>{o.label}</option>)}
      </select>
      <button ref={btn} type="button" id={id ?? autoId} disabled={disabled} style={style}
        className={`we-sel${cls ? ` ${cls}` : " we-sel--plain"}${open ? " is-open" : ""}`}
        aria-haspopup="listbox" aria-expanded={open} aria-label={rest["aria-label"]} title={rest.title}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setOpen(true); } }}>
        <span className="we-sel__val">{label || " "}</span>
        <i className="we-sel__chev" aria-hidden="true" />
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <List opts={opts} isOn={(v) => v === cur} onPick={pick} popRef={pop} style={pos} close={close} search={opts.length > 10} />,
        document.body,
      )}
    </>
  );
}

// Pick several values. In a form it sends one field per value (read them with formData.getAll(name)).
export function MultiSelect({ name, options, value, defaultValue = [], onChange, placeholder = "Any", id, className, allLabel }: {
  name?: string; options: { value: string; label: string }[]; value?: string[]; defaultValue?: string[];
  onChange?: (v: string[]) => void; placeholder?: string; id?: string; className?: string; allLabel?: string;
}) {
  const controlled = value !== undefined;
  const [inner, setInner] = useState<string[]>(defaultValue);
  const cur = controlled ? value! : inner;
  const set = (v: string[]) => { if (!controlled) setInner(v); onChange?.(v); };
  const [open, setOpen] = useState(false);
  const close = useCallback((focus?: boolean) => { setOpen(false); if (focus) setTimeout(() => btn.current?.focus(), 0); }, []);
  const { btn, pop, pos } = usePopover(open, close);
  const hidden = useRef<HTMLSpanElement>(null);
  const autoId = useId();
  useEffect(() => {
    const f = hidden.current?.closest("form");
    if (!f || controlled) return;
    const r = () => setInner(defaultValue);
    f.addEventListener("reset", r);
    return () => f.removeEventListener("reset", r);
  }, [controlled, defaultValue]);

  const labels = options.filter((o) => cur.includes(o.value)).map((o) => o.label);
  const summary = !labels.length ? placeholder : labels.length <= 2 ? labels.join(", ") : `${labels[0]}, ${labels[1]} +${labels.length - 2}`;
  const opts = options.map((o) => ({ value: o.value, label: o.label }));

  return (
    <>
      <span ref={hidden} hidden>{name && cur.map((v) => <input key={v} type="hidden" name={name} value={v} />)}</span>
      <button ref={btn} type="button" id={id ?? autoId} className={`we-sel we-input${className ? ` ${className}` : ""}${open ? " is-open" : ""}${labels.length ? " has-val" : ""}`}
        aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); } }}>
        <span className="we-sel__val">{summary}</span>
        {labels.length > 0 && <span className="we-sel__count">{labels.length}</span>}
        <i className="we-sel__chev" aria-hidden="true" />
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <List opts={opts} multi isOn={(v) => cur.includes(v)} popRef={pop} close={close} search={options.length > 8} style={pos}
          onPick={(v) => set(cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v])}
          foot={<><button type="button" onClick={() => set(options.map((o) => o.value))}>{allLabel ?? "Select all"}</button><button type="button" onClick={() => set([])}>Clear</button></>} />,
        document.body,
      )}
    </>
  );
}
