import Link from "next/link";
import { redirect } from "next/navigation";
import { getMe, type Department, type QueueItem } from "@/lib/data";
import { canRaise, DOCS } from "@/lib/docs";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) redirect("/login");

  const supabase = await createClient();
  const [{ data: depts }, { data: queue }, { data: projects }, { data: company }] = await Promise.all([
    supabase.from("departments").select("*").order("sort"),
    supabase.from("work_queue").select("department, overdue, company_id").eq("company_id", me.company_id ?? ""),
    supabase.from("projects").select("id, name").eq("company_id", me.company_id ?? "").order("name"),
    supabase.from("companies").select("name").eq("id", me.company_id ?? "").maybeSingle(),
  ]);
  const items = (queue ?? []) as Pick<QueueItem, "department" | "overdue">[];
  const count = (code: string) => items.filter((q) => q.department === code);
  const mine = me.department ? count(me.department) : [];
  const initials = (me.full_name || me.email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join("");
  const raise = DOCS.filter((d) => canRaise(d, me.department, me.is_admin));
  const canSetup = me.is_admin || ["pm", "cost_control"].includes(me.department ?? "");

  return (
    <>
      <header className="we-appbar">
        <label className="we-menu-toggle we-btn we-btn--secondary we-btn--sm" htmlFor="we-menu">Menu</label>
        <Link href="/">
          <img src="/weestate-horizontal.svg" alt="WE-estate" />
        </Link>
        <span className="we-appbar__project">{company?.name ?? "Projects"}</span>
        <span className="we-appbar__spacer" />
        <Link className="we-link" href="/account">My account</Link>
        <form action="/auth/signout" method="post">
          <button className="we-link">Sign out</button>
        </form>
        <span className="we-avatar" title={me.full_name || me.email}>{initials}</span>
      </header>
      <input type="checkbox" id="we-menu" hidden />
      <div className="we-shell">
        <nav className="we-nav" aria-label="Main">
          <span className="we-nav__group">My work</span>
          <Link href="/my-work">
            Waiting on me <Count items={mine} />
          </Link>
          {raise.length > 0 && (
            <details className="we-nav__more">
              <summary>Raise a document</summary>
              {raise.map((d) => <Link key={d.type} href={`/docs/${d.slug}/new`}>{d.name}</Link>)}
            </details>
          )}
          <span className="we-nav__group">Projects</span>
          <Link href="/">Overview and map</Link>
          {(projects ?? []).map((p) => <Link key={p.id} href={`/projects/${p.id}`}>{p.name}</Link>)}
          {canSetup && <Link href="/projects/new">+ New project</Link>}
          <span className="we-nav__group">Workflows</span>
          {DOCS.map((d) => <Link key={d.type} href={`/docs/${d.slug}`}>{d.plural}</Link>)}
          <details className="we-nav__more">
            <summary>Departments</summary>
            {((depts ?? []) as Department[]).map((d) => (
              <Link key={d.code} href={`/departments/${d.code}`}>
                {d.name} <Count items={count(d.code)} />
              </Link>
            ))}
          </details>
          {me.is_admin && (
            <>
              <span className="we-nav__group">Admin</span>
              <Link href="/admin/people">People</Link>
              <Link href="/admin/limits">Approval limits</Link>
              <Link href="/admin/workflows">Workflow steps</Link>
              <Link href="/admin/company">Company</Link>
            </>
          )}
          {me.is_platform_admin && (
            <>
              <span className="we-nav__group">WE-estate</span>
              <Link href="/platform">Workspaces</Link>
            </>
          )}
        </nav>
        <main className="we-main">
          {!me.company_id && (
            <div className="we-banner we-banner--info">
              You are signed in but not part of a company yet. Ask your admin to add you.
            </div>
          )}
          {me.company_id && !me.department && !me.is_admin && (
            <div className="we-banner we-banner--info">
              You are signed in but not in a department yet. Ask an admin to add you, then your work shows up here.
            </div>
          )}
          {children}
        </main>
      </div>
    </>
  );
}

function Count({ items }: { items: { overdue: boolean }[] }) {
  if (items.length === 0) return null;
  const late = items.some((i) => i.overdue);
  return <span className={`we-count${late ? " we-count--overdue" : ""}`}>{items.length}</span>;
}
