import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { brandStyle, getBrand } from "@/lib/brand";
import { getMe, type Department, type QueueItem } from "@/lib/data";
import { canRaise, DOCS, docByType } from "@/lib/docs";
import { createClient } from "@/lib/supabase/server";

// Which part of the business each workflow belongs to, for the menu.
const AREAS: { key: string; label: string; icon: "cost" | "build" | "cart" | "sales" | "keys" | "tools"; docs: string[]; extra?: { href: string; label: string }[] }[] = [
  { key: "planning", label: "Budget and planning", icon: "cost", docs: ["budget_revision", "schedule_update"] },
  { key: "construction", label: "Construction", icon: "build", docs: ["payment_certificate", "variation_order"] },
  { key: "procurement", label: "Procurement", icon: "cart", docs: ["purchase_request"], extra: [{ href: "/directory/suppliers", label: "Suppliers and contractors" }] },
  { key: "sales", label: "Sales and customers", icon: "sales", docs: ["unit_sale"], extra: [{ href: "/directory/customers", label: "Customers and owners" }] },
  { key: "handover", label: "Handover and community", icon: "keys", docs: ["unit_handover", "owner_request"] },
  { key: "facility", label: "Facility management", icon: "tools", docs: ["work_order"] },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) redirect("/login");

  const supabase = await createClient();
  const [{ data: depts }, { data: queue }, { data: projects }, { data: company }, brand] = await Promise.all([
    supabase.from("departments").select("*").order("sort"),
    supabase.from("work_queue").select("doc_type, department, overdue, company_id").eq("company_id", me.company_id ?? ""),
    supabase.from("projects").select("id, name").eq("company_id", me.company_id ?? "").order("name"),
    supabase.from("companies").select("name, logo_url, brand_color, require_mfa").eq("id", me.company_id ?? "").maybeSingle(),
    getBrand(),
  ]);

  // A company that requires an authenticator app sends people to set one up first.
  const path = (await headers()).get("x-pathname") ?? "";
  if (company?.require_mfa && !path.startsWith("/account")) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel !== "aal2") redirect("/account#security");
  }

  const items = (queue ?? []) as Pick<QueueItem, "doc_type" | "department" | "overdue">[];
  const mine = items.filter((q) => q.department === me.department);
  const initials = (me.full_name || me.email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join("");
  const raise = DOCS.filter((d) => canRaise(d, me.department, me.is_admin));
  const canSetup = me.is_admin || ["pm", "cost_control"].includes(me.department ?? "");
  const waiting = (type: string) => items.filter((q) => q.doc_type === type);

  const groups = [
    {
      key: "projects", label: "Projects", icon: "projects" as const,
      items: [
        ...(projects ?? []).map((p) => ({ href: `/projects/${p.id}`, label: p.name })),
        ...(canSetup ? [{ href: "/projects/new", label: "+ New project" }] : []),
      ],
    },
    ...AREAS.map((a) => ({
      key: a.key, label: a.label, icon: a.icon,
      items: [
        ...a.docs.map((t) => {
          const d = docByType(t)!;
          const w = waiting(t);
          return { href: `/docs/${d.slug}`, label: d.plural, count: w.length, late: w.some((q) => q.overdue) };
        }),
        ...(a.extra ?? []),
      ],
    })),
    {
      key: "departments", label: "Department queues", icon: "teams" as const,
      items: ((depts ?? []) as Department[]).map((d) => {
        const w = items.filter((q) => q.department === d.code);
        return { href: `/departments/${d.code}`, label: d.name, count: w.length, late: w.some((q) => q.overdue) };
      }),
    },
    ...(me.is_admin
      ? [{
          key: "admin", label: "Company admin", icon: "admin" as const,
          items: [
            { href: "/admin/people", label: "People" },
            { href: "/admin/limits", label: "Approval limits" },
            { href: "/admin/workflows", label: "Workflow steps" },
            { href: "/admin/company", label: "Company, branding and security" },
          ],
        }]
      : []),
    ...(me.is_platform_admin
      ? [{
          key: "platform", label: `${brand.appName} portal`, icon: "globe" as const,
          items: [
            { href: "/platform", label: "Companies and web addresses" },
            { href: "/platform/branding", label: `${brand.appName} branding` },
          ],
        }]
      : []),
  ];

  const css = brandStyle(company?.brand_color ?? "");

  return (
    <>
      {css ? <style>{css}</style> : null}
      <header className="we-appbar">
        <label className="we-menu-toggle we-btn we-btn--secondary we-btn--sm" htmlFor="we-menu">Menu</label>
        <Link href="/" className="we-appbar__home">
          {company?.logo_url ? (
            <img src={company.logo_url} alt={company.name} className="we-appbar__logo" />
          ) : (
            <img src={brand.logo || "/weestate-horizontal.svg"} alt={brand.appName} className="we-appbar__logo" />
          )}
        </Link>
        <span className="we-appbar__project">{company?.name ?? "Projects"}</span>
        <span className="we-appbar__spacer" />
        {raise.length > 0 && (
          <details className="we-menu">
            <summary className="we-btn we-btn--primary we-btn--sm">+ New</summary>
            <div className="we-menu__list">
              {raise.map((d) => <Link key={d.type} href={`/docs/${d.slug}/new`}>{d.name}</Link>)}
            </div>
          </details>
        )}
        <Link className="we-link we-hide-sm" href="/import">Import Excel</Link>
        <details className="we-menu">
          <summary className="we-avatar" title={me.full_name || me.email}>{initials}</summary>
          <div className="we-menu__list we-menu__list--right">
            <span className="we-menu__who"><b>{me.full_name || me.email}</b><br />{me.email}</span>
            <Link href="/account">My account</Link>
            <Link href="/account#security">Authenticator app</Link>
            <form action="/auth/signout" method="post"><button>Sign out</button></form>
          </div>
        </details>
      </header>
      <input type="checkbox" id="we-menu" hidden />
      <div className="we-shell">
        <AppNav
          top={[
            { href: "/", label: "Dashboard and map" },
            { href: "/my-work", label: "Waiting on me", count: mine.length, late: mine.some((q) => q.overdue) },
            { href: "/import", label: "Import from Excel" },
          ]}
          groups={groups}
        />
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
