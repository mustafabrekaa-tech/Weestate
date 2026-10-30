import type { Metadata } from "next";
import { ActionForm } from "@/components/ActionForm";
import { PortalHead } from "@/components/PortalHead";
import { dateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { updateEnquiry } from "../actions";

export const metadata: Metadata = { title: "Website enquiries" };

const STAGES: Record<string, { label: string; chip: string }> = {
  new: { label: "New", chip: "we-chip--waiting" },
  contacted: { label: "Contacted", chip: "we-chip--active" },
  demo: { label: "Demo booked", chip: "we-chip--active" },
  won: { label: "Became a customer", chip: "we-chip--done" },
  lost: { label: "Not now", chip: "we-chip--draft" },
};

type E = { id: string; name: string; company: string; email: string; phone: string; role: string; projects: string; message: string; status: string; staff_notes: string; created_at: string };

export default async function Enquiries({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const supabase = await createClient();
  let q = supabase.from("enquiries").select("*").order("created_at", { ascending: false }).limit(500);
  if (status) q = q.eq("status", status);
  const { data } = await q;
  const rows = (data ?? []) as E[];
  return (
    <>
      <PortalHead title="Website enquiries" lead="Messages sent from the contact form on the public website." />
      <div className="we-seg we-seg--light" role="group" aria-label="Stage">
        <a href="/platform/enquiries" className={!status ? "is-on" : ""}>All</a>
        {Object.entries(STAGES).map(([k, v]) => <a key={k} href={`/platform/enquiries?status=${k}`} className={status === k ? "is-on" : ""}>{v.label}</a>)}
      </div>
      <div className="we-stack">
        {rows.map((e) => (
          <details key={e.id} className="we-person" open={e.status === "new"}>
            <summary>
              <span className="we-person__who"><b>{e.name}{e.company ? ` · ${e.company}` : ""}</b><span className="we-help">{e.email}{e.phone ? ` · ${e.phone}` : ""}</span></span>
              <span className="we-person__tags">
                <span className={`we-chip ${STAGES[e.status]?.chip ?? ""}`}>{STAGES[e.status]?.label ?? e.status}</span>
                {e.role && <span className="we-chip">{e.role}</span>}
                {e.projects && <span className="we-chip">{e.projects} projects</span>}
              </span>
              <span className="we-help">{dateTime(e.created_at)}</span>
            </summary>
            <div className="we-person__form we-stack">
              {e.message && <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{e.message}</p>}
              <div className="we-row">
                <a className="we-btn we-btn--secondary we-btn--sm" href={`mailto:${e.email}?subject=${encodeURIComponent("WE-estate demo")}`}>Email</a>
                {e.phone && <a className="we-btn we-btn--secondary we-btn--sm" href={`https://wa.me/${e.phone.replace(/[^\d]/g, "")}`} target="_blank" rel="noreferrer">WhatsApp</a>}
              </div>
              <ActionForm action={updateEnquiry.bind(null, e.id)} className="we-row" >
                <select name="status" defaultValue={e.status} className="we-input we-select we-input--sm" aria-label="Stage">
                  {Object.entries(STAGES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <input name="staff_notes" defaultValue={e.staff_notes} className="we-input we-input--sm" placeholder="Notes" aria-label="Notes" style={{ flex: 1, minWidth: 220 }} />
                <button className="we-btn we-btn--primary we-btn--sm">Save</button>
              </ActionForm>
            </div>
          </details>
        ))}
        {!rows.length && <div className="we-empty">No enquiries yet. They arrive here from the form on the website.</div>}
      </div>
    </>
  );
}
