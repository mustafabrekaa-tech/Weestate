import Link from "next/link";
import { redirect } from "next/navigation";
import { getMe, type Department, type QueueItem } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) redirect("/login");

  const supabase = await createClient();
  const [{ data: depts }, { data: queue }] = await Promise.all([
    supabase.from("departments").select("*").order("sort"),
    supabase.from("work_queue").select("department, overdue"),
  ]);
  const items = (queue ?? []) as Pick<QueueItem, "department" | "overdue">[];
  const count = (code: string) => items.filter((q) => q.department === code);
  const mine = me.department ? count(me.department) : [];
  const initials = (me.full_name || me.email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join("");

  return (
    <>
      <header className="we-appbar">
        <label className="we-menu-toggle we-btn we-btn--sm" htmlFor="we-menu" style={{ color: "inherit" }}>Menu</label>
        <Link href="/">
          <img src="/weestate-lockup-reverse.svg" alt="WE-estate" />
        </Link>
        <span className="we-appbar__project">M Squared Developments</span>
        <span className="we-appbar__spacer" />
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
          <Link href="/certificates/new">New payment certificate</Link>
          <span className="we-nav__group">Company</span>
          <Link href="/">Overview</Link>
          <Link href="/certificates">Payment certificates</Link>
          <span className="we-nav__group">Departments</span>
          {((depts ?? []) as Department[]).map((d) => (
            <Link key={d.code} href={`/departments/${d.code}`}>
              {d.name} <Count items={count(d.code)} />
            </Link>
          ))}
          {me.is_admin && (
            <>
              <span className="we-nav__group">Admin</span>
              <Link href="/admin/people">People and departments</Link>
            </>
          )}
        </nav>
        <main className="we-main">
          {!me.department && !me.is_admin && (
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
