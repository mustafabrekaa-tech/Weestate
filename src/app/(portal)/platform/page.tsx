import type { Metadata } from "next";
import Link from "next/link";
import { PortalHead } from "@/components/PortalHead";
import { getBrand } from "@/lib/brand";
import { date, money } from "@/lib/format";
import { STATUS, type Workspace } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Overview" };

type Stats = { people: number; signed_in: number; without_mfa: number; projects: number; units: number; new_companies: number; staff: number };
type Plan = { code: string; name: string; price_egp: number };

export default async function Overview({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const days = [7, 30, 90].includes(Number((await searchParams).days)) ? Number((await searchParams).days) : 30;
  const supabase = await createClient();
  const [{ data: cos }, { data: st }, { data: plans }, brand, { count: fresh }] = await Promise.all([
    supabase.rpc("portal_companies"),
    supabase.rpc("portal_stats", { p_days: days }).maybeSingle<Stats>(),
    supabase.from("plans").select("code, name, price_egp"),
    getBrand(),
    supabase.from("enquiries").select("id", { count: "exact", head: true }).eq("status", "new"),
  ]);
  const all = (cos ?? []) as Workspace[];
  const s = st ?? { people: 0, signed_in: 0, without_mfa: 0, projects: 0, units: 0, new_companies: 0, staff: 0 };
  const price = new Map(((plans ?? []) as Plan[]).map((p) => [p.code, Number(p.price_egp)]));
  const n = (x: string) => all.filter((w) => w.status === x).length;
  const paying = all.filter((w) => w.status === "active");
  const monthly = paying.reduce((a, w) => a + (price.get(w.plan) ?? 0), 0);
  const trialValue = all.filter((w) => w.status === "trial").reduce((a, w) => a + (price.get(w.plan) ?? 0), 0);
  const unknownPlan = paying.filter((w) => !price.has(w.plan)).length;

  // Things for staff to act on.
  const today = new Date();
  const soon = new Date(Date.now() + 14 * 86400000);
  const attention: { href: string; text: string; tone: "bad" | "warn" }[] = [];
  for (const w of all) {
    const t = w.trial_ends ? new Date(w.trial_ends) : null;
    if (w.status === "trial" && t && t < today) attention.push({ href: `/platform/companies/${w.id}`, text: `${w.name}: trial ended ${date(w.trial_ends)}`, tone: "bad" });
    else if (w.status === "trial" && t && t < soon) attention.push({ href: `/platform/companies/${w.id}`, text: `${w.name}: trial ends ${date(w.trial_ends)}`, tone: "warn" });
    if (!w.people) attention.push({ href: `/platform/companies/${w.id}`, text: `${w.name}: nobody added yet`, tone: "warn" });
    else if (!w.last_active) attention.push({ href: `/platform/companies/${w.id}`, text: `${w.name}: nobody has signed in yet`, tone: "warn" });
    if (w.max_users && w.people >= w.max_users) attention.push({ href: `/platform/companies/${w.id}`, text: `${w.name}: at its limit of ${w.max_users} people`, tone: "warn" });
    if (w.domain && w.domain_status !== "connected") attention.push({ href: `/platform/companies/${w.id}`, text: `${w.name}: ${w.domain} isn't live yet`, tone: "warn" });
  }
  if (fresh) attention.unshift({ href: "/platform/enquiries", text: `${fresh} new website ${fresh === 1 ? "enquiry" : "enquiries"} to answer`, tone: "bad" });
  if (s.without_mfa) attention.push({ href: "/platform/users", text: `${s.without_mfa} people haven't set up their authenticator app yet`, tone: "warn" });

  return (
    <>
      <PortalHead title="Overview" lead={`How ${brand.appName} is doing across every company: people, subscriptions and anything that needs you.`}>
        <Link className="we-btn we-btn--primary" href="/platform/companies/new">+ Add a company</Link>
      </PortalHead>

      <div className="we-seg we-seg--light" role="group" aria-label="Period">
        {[7, 30, 90].map((d) => (
          <Link key={d} href={`/platform?days=${d}`} className={d === days ? "is-on" : ""} aria-current={d === days ? "true" : undefined}>{d} days</Link>
        ))}
      </div>

      <div className="we-portal__cards">
        <Link href="/platform/companies" className="we-pcard">
          <span>Companies</span><b>{all.length}</b>
          <small>{n("active")} active · {n("trial")} on trial · {n("suspended")} paused{s.new_companies ? ` · ${s.new_companies} new in ${days} days` : ""}</small>
        </Link>
        <Link href="/platform/users" className="we-pcard">
          <span>People on {brand.appName}</span><b>{s.people.toLocaleString("en-US")}</b>
          <small>{s.signed_in} signed in during the last {days} days · {s.without_mfa} without an authenticator</small>
        </Link>
        <Link href="/platform/plans" className="we-pcard">
          <span>Subscriptions (monthly)</span><b>EGP {money(monthly)}</b>
          <small>From {paying.length} active companies{trialValue ? ` · EGP ${money(trialValue)} more when trials convert` : ""}{unknownPlan ? ` · ${unknownPlan} without a priced plan` : ""}</small>
        </Link>
        <div className="we-pcard">
          <span>Projects being run</span><b>{s.projects}</b>
          <small>{s.units.toLocaleString("en-US")} units · {s.staff} {brand.appName} staff</small>
        </div>
      </div>

      <div className="we-grid we-grid--side">
        <section className="we-card we-stack">
          <div className="we-row" style={{ justifyContent: "space-between" }}>
            <h2 style={{ margin: 0 }}>Companies</h2>
            <Link className="we-link" href="/platform/companies">See all</Link>
          </div>
          <div className="we-table-wrap">
            <table className="we-table">
              <thead><tr><th>Company</th><th>Status</th><th className="num">People</th><th className="num">Projects</th><th>Last active</th></tr></thead>
              <tbody>
                {[...all].sort((a, b) => (b.last_active ?? "").localeCompare(a.last_active ?? "")).slice(0, 8).map((w) => (
                  <tr key={w.id}>
                    <td><Link href={`/platform/companies/${w.id}`}><b>{w.name}</b></Link><div className="we-meta">{w.slug}.{brand.rootDomain}</div></td>
                    <td><span className={`we-chip ${STATUS[w.status]?.chip ?? ""}`}>{STATUS[w.status]?.label ?? w.status}</span></td>
                    <td className="num">{w.people}</td>
                    <td className="num">{w.projects}</td>
                    <td>{w.last_active ? date(w.last_active) : <span className="we-help">Never</span>}</td>
                  </tr>
                ))}
                {!all.length && <tr><td colSpan={5} className="we-empty">No companies yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
        <section className="we-card we-stack">
          <h2 style={{ margin: 0 }}>Needs you <small>{attention.length}</small></h2>
          {attention.length ? (
            <ul className="we-attention">
              {attention.map((a, i) => (
                <li key={i} className={`is-${a.tone}`}><Link href={a.href}>{a.text}</Link></li>
              ))}
            </ul>
          ) : (
            <p className="we-help" style={{ margin: 0 }}>Nothing right now.</p>
          )}
        </section>
      </div>
    </>
  );
}
