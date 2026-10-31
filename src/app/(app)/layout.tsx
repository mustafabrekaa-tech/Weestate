import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppNav, Icon, type IconName } from "@/components/AppNav";
import { SECTIONS } from "@/lib/sections";
import { MenuCloser } from "@/components/MenuCloser";
import { ProjectSwitch } from "@/components/ProjectSwitch";
import { Suspense } from "react";
import { NavToggle } from "@/components/NavToggle";
import { IdleGuard } from "@/components/IdleGuard";
import { DOC_MODULE, TAB_MODULE } from "@/lib/access";
import { brandStyle, getBrand } from "@/lib/brand";
import { getMe, type Department, type QueueItem, acts } from "@/lib/data";
import { docBySlug, docByType } from "@/lib/docs";
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
  const [{ data: depts }, { data: queue }, { data: projects }, { data: company }, brand, { data: hiddenRows }, { data: ws }] = await Promise.all([
    supabase.from("departments").select("*").order("sort"),
    supabase.from("work_queue").select("doc_type, department, overdue, company_id").eq("company_id", me.company_id ?? ""),
    supabase.from("projects").select("id, name, slug").eq("company_id", me.company_id ?? "").order("name"),
    supabase.from("companies").select("name, logo_url, brand_color, brand_colors, require_mfa").eq("id", me.company_id ?? "").maybeSingle(),
    getBrand(),
    supabase.from("hidden_modules").select("module").eq("company_id", me.company_id ?? "").eq("department", me.department ?? ""),
    supabase.rpc("my_workspace").maybeSingle<{ status: string; trial_ends: string | null }>(),
  ]);
  // Admins see everything; everyone else loses the sections hidden from their department.
  const hidden = new Set(me.is_admin || me.is_platform_admin ? [] : (hiddenRows ?? []).map((r) => r.module as string));
  const suspended = ws?.status === "suspended" && !me.is_platform_admin;

  // Opening a hidden section by its address shows a note instead of the page.
  const path = (await headers()).get("x-pathname") ?? "";
  const seg = path.split("/");
  const section =
    seg[1] === "docs" ? DOC_MODULE[docBySlug(seg[2] ?? "")?.type ?? ""]
    : seg[1] === "projects" && seg[3] ? TAB_MODULE[seg[3]]
    : seg[1] === "import" ? "import"
    : seg[1] === "directory" ? (seg[2] === "suppliers" ? "procurement" : "sales")
    : seg[1] === "departments" && seg[2] !== me.department ? "departments"
    : undefined;
  const blocked = !!section && hidden.has(section);
  // On a company's own address, only that company's people (and WE-estate staff) get in.
  const elsewhere = !!brand.company && brand.company.id !== me.company_id && !me.is_platform_admin;

  const items = (queue ?? []) as Pick<QueueItem, "doc_type" | "department" | "overdue">[];
  const mine = items.filter((q) => q.department === me.department);
  const initials = (me.full_name || me.email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join("");
  const canSetup = acts(me, ["pm", "cost_control"]);
  const waiting = (type: string) => items.filter((q) => q.doc_type === type);

  // The project the person is in (from the address), else their first one: its pages sit open in the menu.
  const list = projects ?? [];
  const visible = SECTIONS.filter((x) => !hidden.has(TAB_MODULE[x.slug] ?? ""));

  const groups = [
    ...AREAS.filter((a) => !hidden.has(a.key)).map((a) => ({
      key: a.key, label: a.label, icon: a.icon,
      items: [
        ...a.docs.filter((t) => !hidden.has(DOC_MODULE[t] ?? "")).map((t) => {
          const d = docByType(t)!;
          const w = waiting(t);
          return { href: `/docs/${d.slug}`, label: d.plural, count: w.length, late: w.some((q) => q.overdue) };
        }),
        ...(a.extra ?? []),
      ],
    })),
    {
      key: "departments", label: "Department queues", icon: "teams" as const,
      items: ((depts ?? []) as Department[]).filter((d) => !hidden.has("departments") || d.code === me.department).map((d) => {
        const w = items.filter((q) => q.department === d.code);
        return { href: `/departments/${d.code}`, label: d.name, count: w.length, late: w.some((q) => q.overdue) };
      }),
    },
    ...(me.is_admin
      ? [{
          key: "admin", label: "Company admin", icon: "admin" as const,
          items: [
            { href: "/admin/people", label: "People and access" },
            { href: "/admin/permissions", label: "What each department sees" },
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
            { href: "/platform", label: "Admin portal" },
          ],
        }]
      : []),
  ];

  const css = brandStyle(company?.brand_color ?? "", company?.brand_colors as { accent?: string; dark?: string } | null);

  return (
    <>
      {css ? <style>{css}</style> : null}
      <header className="we-appbar">
        <label className="we-menu-toggle we-btn we-btn--secondary we-btn--sm" htmlFor="we-menu">Menu</label>
        <NavToggle />
        <IdleGuard />
        <Link href="/" className="we-appbar__home">
          {company?.logo_url ? (
            <img src={company.logo_url} alt={company.name} className="we-appbar__logo" />
          ) : (
            <img src={brand.logo || "/weestate-horizontal.svg"} alt={brand.appName} className="we-appbar__logo" />
          )}
        </Link>
        <Suspense fallback={null}><ProjectSwitch list={list} company={company?.name ?? "Projects"} canSetup={canSetup} /></Suspense>
        <span className="we-appbar__spacer" />
        <Link href="/my-work" className="we-iconbtn" aria-label={`Waiting on me: ${mine.length}`} title="Waiting on me">
          <Icon name="inbox" />
          {mine.length > 0 && <span className={`we-iconbtn__dot${mine.some((q) => q.overdue) ? " is-late" : ""}`}>{mine.length}</span>}
        </Link>
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
      <MenuCloser />
      <input type="checkbox" id="we-menu" hidden />
      <div className="we-shell">
        <AppNav
          top={[
            { href: "/", label: "Dashboard", icon: "chart" },
            { href: "/my-work", label: "Waiting on me", count: mine.length, late: mine.some((q) => q.overdue), icon: "inbox" },
          ]}
          projects={list}
          sections={visible.map((x) => ({ slug: x.slug, label: x.label, icon: x.icon as IconName, main: !!x.main }))}
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
          {elsewhere ? (
            <section className="we-card we-stack" style={{ maxWidth: 560 }}>
              <h1 style={{ margin: 0 }}>Wrong workspace</h1>
              <p style={{ margin: 0 }}>This address belongs to {brand.company!.name}, and your account is with another company. Sign out and use your own company&apos;s address.</p>
              <form action="/auth/signout" method="post"><button className="we-btn we-btn--secondary we-btn--sm">Sign out</button></form>
            </section>
          ) : suspended ? (
            <section className="we-card we-stack" style={{ maxWidth: 560 }}>
              <h1 style={{ margin: 0 }}>This workspace is paused</h1>
              <p style={{ margin: 0 }}>
                {company?.name ?? "Your company"}&apos;s {brand.appName} workspace is paused, so projects can&apos;t be opened right now.
                Your data is kept safe. Ask your admin, or contact {brand.appName}{brand.supportEmail ? ` at ${brand.supportEmail}` : ""}.
              </p>
            </section>
          ) : blocked ? (
            <section className="we-card we-stack" style={{ maxWidth: 560 }}>
              <h1 style={{ margin: 0 }}>Not part of your work</h1>
              <p style={{ margin: 0 }}>Your admin has kept this section out of your department&apos;s menu. Ask them if you need it.</p>
              <div><Link className="we-btn we-btn--secondary we-btn--sm" href="/">Back to the dashboard</Link></div>
            </section>
          ) : (
            children
          )}
        </main>
      </div>
    </>
  );
}
