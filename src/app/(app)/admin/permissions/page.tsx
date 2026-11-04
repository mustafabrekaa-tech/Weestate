import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { MODULES } from "@/lib/access";
import { getMe, type Department } from "@/lib/data";
import { getHidden } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { saveVisibility } from "../actions";

export const metadata: Metadata = { title: "What each department sees" };

// One grid for the whole company: a tick shows that section to the department.
export default async function Permissions() {
  const me = await getMe();
  if (!me?.is_admin || !me.company_id) redirect("/");
  const supabase = await createClient();
  const [{ data: depts }, { data: hidden }, { data: people }, { off: companyOff }] = await Promise.all([
    supabase.from("departments").select("*").order("sort"),
    supabase.from("hidden_modules").select("department, module").eq("company_id", me.company_id),
    supabase.from("profiles").select("department").eq("company_id", me.company_id),
    getHidden(),
  ]);
  // Modules not switched on for the company don't appear here at all.
  const mods = MODULES.filter((m) => !companyOff.has(m.key));
  const dl = (depts ?? []) as Department[];
  const off = new Set((hidden ?? []).map((h) => `${h.department}:${h.module}`));
  const count = (code: string) => (people ?? []).filter((p) => p.department === code).length;

  return (
    <>
      <div className="we-pagehead">
        <div>
          <div className="we-eyebrow">Admin</div>
          <h1>What each department sees</h1>
        </div>
        <Link className="we-btn we-btn--secondary we-btn--sm" href="/admin/people">People and access</Link>
      </div>

      <div className="we-grid we-grid--side">
        <section className="we-card we-stack">
          <p className="we-help" style={{ margin: 0 }}>
            Untick a section to take it out of a department&apos;s menu and project tabs. Admins always see everything.
          </p>
          <ActionForm action={saveVisibility.bind(null, me.company_id, dl.map((d) => d.code), mods.map((m) => m.key))} className="we-stack">
            <div className="we-table-wrap">
              <table className="we-table we-matrix">
                <thead>
                  <tr>
                    <th>Department</th>
                    {mods.map((m) => <th key={m.key} title={m.help}>{m.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {dl.map((d) => (
                    <tr key={d.code}>
                      <th scope="row"><div className="we-title">{d.name}</div><div className="we-meta">{count(d.code)} people</div></th>
                      {mods.map((m) => (
                        <td key={m.key}>
                          <input type="checkbox" name={`${d.code}:${m.key}`} defaultChecked={!off.has(`${d.code}:${m.key}`)} aria-label={`${d.name} sees ${m.label}`} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div><button className="we-btn we-btn--primary">Save</button></div>
          </ActionForm>
        </section>

        <section className="we-card we-stack">
          <h2 style={{ margin: 0 }}>How access works</h2>
          <ul className="we-list we-list--plain">
            <li><b>Sections</b>: this grid decides which parts of the app each department sees.</li>
            <li><b>Doing the work</b>: each department enters and approves its own documents. Give someone extra roles under <Link href="/admin/people">People</Link> to let them act for another department as well.</li>
            <li><b>Projects</b>: people see every project unless you limit them to some.</li>
            <li><b>View only</b>: for owners, auditors and partners who should see but not change anything.</li>
            <li><b>Approval amounts</b>: set who signs off what under <Link href="/admin/limits">Approval limits</Link> and <Link href="/admin/workflows">Workflow steps</Link>.</li>
          </ul>
        </section>
      </div>
    </>
  );
}
