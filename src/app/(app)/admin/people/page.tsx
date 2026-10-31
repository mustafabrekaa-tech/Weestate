import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { getMe, type Department, type Profile } from "@/lib/data";
import { date } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { mailReady } from "@/lib/mail";
import { addPerson, resetAuthenticator, resetPassword, updatePerson } from "../actions";
import { Select } from "@/components/Select";

export const metadata: Metadata = { title: "People and access" };

export default async function People({ searchParams }: { searchParams: Promise<{ company?: string; q?: string; dept?: string }> }) {
  const me = await getMe();
  if (!me?.is_admin) redirect("/");
  const { company: asked, q, dept } = await searchParams;
  const company = (me.is_platform_admin && asked) || me.company_id;
  const supabase = await createClient();
  const [{ data: people }, { data: depts }, { data: comp }, { data: projects }, { data: access }, { data: mfa }] = await Promise.all([
    supabase.from("profiles").select("*").eq("company_id", company ?? "").order("full_name"),
    supabase.from("departments").select("*").order("sort"),
    supabase.from("companies").select("name, max_users").eq("id", company ?? "").maybeSingle(),
    supabase.from("projects").select("id, name").eq("company_id", company ?? "").order("name"),
    supabase.from("project_access").select("user_id, project_id"),
    supabase.rpc("company_people_mfa"),
  ]);
  const dl = (depts ?? []) as Department[];
  const deptName = new Map(dl.map((d) => [d.code, d.name]));
  const mfaBy = new Map(((mfa ?? []) as { id: string; has_mfa: boolean; last_sign_in: string | null }[]).map((m) => [m.id, m]));
  const all = (people ?? []) as Profile[];
  const list = all.filter((p) =>
    (!dept || p.department === dept || (p.extra_roles ?? []).includes(dept)) &&
    (!q || `${p.full_name} ${p.email}`.toLowerCase().includes(q.toLowerCase())));
  const deptOptions = dl.map((d) => <option key={d.code} value={d.code}>{d.name}</option>);

  return (
    <>
      <div className="we-pagehead">
        <div>
          <div className="we-eyebrow">Admin · {comp?.name}</div>
          <h1>People and access</h1>
        </div>
        <Link className="we-btn we-btn--secondary we-btn--sm" href="/admin/permissions">What each department sees</Link>
      </div>

      <div className="we-grid we-grid--side">
        <section className="we-stack">
          <form className="we-row we-filterbar" action="/admin/people">
            {asked && <input type="hidden" name="company" value={asked} />}
            <input name="q" defaultValue={q} className="we-input we-input--sm" placeholder="Search name or email" aria-label="Search" style={{ maxWidth: 260 }} />
            <Select name="dept" defaultValue={dept ?? ""} className="we-input we-select we-input--sm" aria-label="Department">
              <option value="">All departments</option>{deptOptions}
            </Select>
            <button className="we-btn we-btn--secondary we-btn--sm">Filter</button>
            <span className="we-help">{list.length} of {all.length}{comp?.max_users ? ` · plan allows ${comp.max_users}` : ""}</span>
          </form>

          <ul className="we-people">
            {list.map((p) => {
              const m = mfaBy.get(p.id);
              const mine = new Set((access ?? []).filter((a) => a.user_id === p.id).map((a) => a.project_id as string));
              const initials = (p.full_name || p.email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join("");
              return (
                <li key={p.id}>
                  <details className="we-person">
                    <summary>
                      <span className="we-avatar we-avatar--sm" aria-hidden="true">{initials}</span>
                      <span className="we-person__who"><b>{p.full_name || p.email}</b><span className="we-help">{p.email}</span></span>
                      <span className="we-person__tags">
                        <span className="we-chip">{p.department ? deptName.get(p.department) : "No department"}</span>
                        {(p.extra_roles ?? []).map((r) => <span key={r} className="we-chip we-chip--draft">+ {deptName.get(r) ?? r}</span>)}
                        {p.is_admin && <span className="we-chip we-chip--done">Admin</span>}
                        {p.read_only && <span className="we-chip">View only</span>}
                        {!p.all_projects && <span className="we-chip">{mine.size} projects</span>}
                        <span className={`we-chip ${m?.has_mfa ? "we-chip--done" : "we-chip--overdue"}`}>{m?.has_mfa ? "Authenticator on" : "No authenticator yet"}</span>
                      </span>
                      <span className="we-help we-hide-sm">{m?.last_sign_in ? `Last in ${date(m.last_sign_in)}` : "Never signed in"}</span>
                    </summary>
                    <ActionForm action={updatePerson} className="we-stack we-person__form">
                      <input type="hidden" name="id" value={p.id} />
                      <div className="we-form-grid">
                        <div className="we-field"><label htmlFor={`n-${p.id}`}>Full name</label><input id={`n-${p.id}`} name="full_name" defaultValue={p.full_name} className="we-input" /></div>
                        <div className="we-field">
                          <label htmlFor={`d-${p.id}`}>Main department</label>
                          <Select id={`d-${p.id}`} name="department" defaultValue={p.department ?? ""} className="we-input we-select"><option value="">No department</option>{deptOptions}</Select>
                        </div>
                      </div>
                      <fieldset className="we-fieldset we-choice">
                        <legend>Also acts for <span className="we-help">· can do these departments&apos; work too</span></legend>
                        {dl.map((d) => (
                          <label key={d.code}><input type="checkbox" name="extra_roles" value={d.code} defaultChecked={(p.extra_roles ?? []).includes(d.code)} /> {d.name}</label>
                        ))}
                      </fieldset>
                      <fieldset className="we-fieldset we-choice">
                        <legend>Projects</legend>
                        <label><input type="radio" name="all_projects" value="all" defaultChecked={p.all_projects} /> All projects, including new ones</label>
                        <label><input type="radio" name="all_projects" value="only" defaultChecked={!p.all_projects} /> Only these:</label>
                        {(projects ?? []).map((pr) => (
                          <label key={pr.id} className="we-choice__sub"><input type="checkbox" name="projects" value={pr.id} defaultChecked={mine.has(pr.id)} /> {pr.name}</label>
                        ))}
                      </fieldset>
                      <fieldset className="we-fieldset we-choice">
                        <legend>Rights</legend>
                        <label><input type="checkbox" name="is_admin" defaultChecked={p.is_admin} /> Admin: adds people, changes settings and can do every department&apos;s work</label>
                        <label><input type="checkbox" name="read_only" defaultChecked={p.read_only} /> View only: sees their projects but can&apos;t change or approve anything</label>
                      </fieldset>
                      <div className="we-row"><button className="we-btn we-btn--primary we-btn--sm">Save</button></div>
                    </ActionForm>
                    {p.id !== me.id && (
                      <div className="we-row we-person__tools">
                        <ActionForm action={resetPassword.bind(null, p.id)} className=""><button className="we-link">Reset password</button></ActionForm>
                        {m?.has_mfa && <ActionForm action={resetAuthenticator.bind(null, p.id)} className=""><button className="we-link">Reset authenticator (lost phone)</button></ActionForm>}
                      </div>
                    )}
                  </details>
                </li>
              );
            })}
            {!list.length && <li className="we-empty">Nobody matches.</li>}
          </ul>
        </section>

        <section className="we-card we-stack">
          <h2 style={{ margin: 0 }}>Add a person</h2>
          <ActionForm action={addPerson.bind(null, company)} className="we-stack" resetOnOk>
            <div className="we-field"><label htmlFor="email">Work email</label><input id="email" name="email" type="email" className="we-input" required /></div>
            <div className="we-field"><label htmlFor="full_name">Full name</label><input id="full_name" name="full_name" className="we-input" required /></div>
            <div className="we-field">
              <label htmlFor="department">Department</label>
              <Select id="department" name="department" className="we-input we-select" required>{deptOptions}</Select>
            </div>
            <div className="we-field">
              <label htmlFor="password">Temporary password <span className="we-help">· optional</span></label>
              <input id="password" name="password" className="we-input we-mono" placeholder="Made for you if empty" />
            </div>
            <label className="we-row" style={{ gap: 8 }}><input type="checkbox" name="is_admin" /> Admin</label>
            {mailReady() && <label className="we-row" style={{ gap: 8 }}><input type="checkbox" name="send_email" defaultChecked /> Email them their sign-in details</label>}
            <span className="we-help">They sign in with the temporary password, then set up an authenticator app. Open them in the list to add extra roles or limit their projects.</span>
            <div><button className="we-btn we-btn--primary">Add person</button></div>
          </ActionForm>
        </section>
      </div>
    </>
  );
}
