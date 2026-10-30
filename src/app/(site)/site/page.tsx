import type { Metadata } from "next";
import { EnquiryForm } from "@/components/SiteForms";
import { getBrand } from "@/lib/brand";
import { money } from "@/lib/format";
import { getSiteInfo, telLink, waLink } from "@/lib/siteinfo";
import { createClient } from "@/lib/supabase/server";
import { sendEnquiry } from "./actions";

export const metadata: Metadata = {
  title: { absolute: "WE-estate · The operating system for real-estate developers" },
  description: "Budget, schedule, contracts, procurement, sales, handover and facility management for real-estate developers, with a 3D site and approvals between departments.",
};

const FEATURES: { t: string; d: string; i: string }[] = [
  { t: "Budget and cost control", d: "Budgets by phase and cost code, revisions with approval, committed and actual cost, EAC and CPI.", i: "M10 3v14M14 6.5C14 5 12.5 4 10 4S6 5 6 7s2 2.5 4 3 4 1 4 3-1.5 3-4 3-4-1-4-2.5" },
  { t: "Schedule and progress", d: "Import Primavera P6 or MS Project, record monthly progress and see planned against actual with SPI.", i: "M3 16l4-5 3 3 4-6 3 3M3 3v14h14" },
  { t: "Contracts and payments", d: "Contracts, BOQ, payment certificates with retention and advance recovery, and variations, all routed for approval.", i: "M5 3h7l3 3v11H5zM12 3v3h3M8 10h5M8 13h5" },
  { t: "Procurement", d: "Purchase requests from site to award, with a suppliers and contractors directory.", i: "M3 4h2l2 9h9l2-6H6M8 16.5a1 1 0 1 0 0 .01M15 16.5a1 1 0 1 0 0 .01" },
  { t: "Sales and units", d: "Unit inventory, reservations and sales, prices and payment plans, live availability by phase and building.", i: "M4 10l6-6 6 6M6 8.5V16h8V8.5M9 16v-3h2v3" },
  { t: "Handover and community", d: "Snag lists, handover appointments, and owner requests after delivery.", i: "M12 3a4 4 0 1 1-3.5 6L3 14.5V17h2.5v-2h2v-2h2l1-1A4 4 0 0 1 12 3z" },
  { t: "Facility management", d: "Work orders, assets and maintenance once the compound is lived in.", i: "M14.5 3.5a3.5 3.5 0 0 0-4.6 4.4L3.5 14.3a1.4 1.4 0 0 0 2 2l6.4-6.4a3.5 3.5 0 0 0 4.4-4.6l-2 2-2-.5-.5-2z" },
  { t: "Approvals between departments", d: "Every document moves step by step: site, technical office, cost control, finance. Everyone sees what waits on them.", i: "M3 10h4l2-4 2 8 2-4h4" },
  { t: "Excel in, Excel out", d: "Start from the sheets you already keep. Templates for units, BOQ, budgets, contracts, customers and more.", i: "M4 3h12v14H4zM4 8h12M4 13h12M9 3v14" },
];

const FAQ: [string, string][] = [
  ["Do we have to change how our departments work?", "No. You set the steps and approval limits for each document to match how your company already signs things off."],
  ["Can we bring our existing data?", "Yes. Upload units, BOQ, budgets, contracts, suppliers, customers and schedules from Excel, Primavera P6 or MS Project."],
  ["Where is our data kept?", "In a secure database in Frankfurt, Germany, separate from every other company's. Sign-in always needs an authenticator app code."],
  ["Does it work on phones?", "Yes. It runs in the browser on phones, tablets and computers, so site teams can record progress from the field."],
  ["Can it carry our own name and logo?", "Yes. Your workspace gets its own address, your logo and colours, and can run on your own domain."],
];

export default async function Landing() {
  const supabase = await createClient();
  const [b, info, { data: plans }] = await Promise.all([
    getBrand(),
    getSiteInfo(),
    supabase.from("plans").select("code, name, price_egp, max_users, max_projects, features").eq("active", true).order("sort"),
  ]);
  const icon = (d: string) => (
    <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
  );

  return (
    <main>
      <section className="ws-hero">
        <div className="ws-wrap ws-hero__in">
          <div className="ws-hero__copy">
            <span className="ws-kicker">For real-estate developers</span>
            <h1>Every project, every department, <em>one line.</em></h1>
            <p>{b.appName} brings budget, schedule, contracts, procurement, sales, handover and facility management into one place, so you always know where each project stands and what is waiting on whom.</p>
            <div className="ws-hero__cta">
              <a href="#contact" className="ws-btn ws-btn--gold ws-btn--lg">Book a demo</a>
              <a href="#features" className="ws-btn ws-btn--ghost ws-btn--lg">See what it does</a>
            </div>
            <ul className="ws-ticks">
              <li>Phone, tablet and desktop</li><li>Your own web address</li><li>Set up from your Excel sheets</li>
            </ul>
          </div>
          <div className="ws-hero__art" aria-hidden="true">
            <div className="ws-mock">
              <div className="ws-mock__bar"><i /><i /><i /><span>yourcompany.{b.rootDomain}</span></div>
              <div className="ws-mock__body">
                <div className="ws-mock__side">{["Dashboard", "Waiting on me", "Projects", "Budget", "Construction", "Sales", "Handover"].map((x, i) => <span key={x} className={i === 0 ? "on" : ""}>{x}</span>)}</div>
                <div className="ws-mock__main">
                  <div className="ws-mock__kpis">
                    {[["Budget", "5.78B"], ["Progress", "40%"], ["SPI", "0.95"], ["Sold", "71%"]].map(([k, v]) => <div key={k}><small>{k}</small><b>{v}</b></div>)}
                  </div>
                  <svg viewBox="0 0 300 110" className="ws-mock__chart">
                    <path d="M0 105 C60 100 90 80 130 60 S220 15 300 8" fill="none" stroke="#c9a24e" strokeWidth="3" />
                    <path d="M0 105 C60 102 95 86 135 68 S190 45 205 42" fill="none" stroke="#26313a" strokeWidth="3" />
                    <circle cx="205" cy="42" r="5" fill="#26313a" />
                  </svg>
                  <div className="ws-mock__units">{Array.from({ length: 40 }, (_, i) => <i key={i} className={["a", "s", "s", "r", "s", "h"][i % 6]} />)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="ws-strip">
        <div className="ws-wrap ws-strip__in">
          {[["9", "approval workflows"], ["14", "kinds of data from Excel"], ["3D", "site and units"], ["2-step", "sign-in for everyone"]].map(([n, t]) => (
            <div key={t}><b>{n}</b><span>{t}</span></div>
          ))}
        </div>
      </section>

      <section id="features" className="ws-sec">
        <div className="ws-wrap">
          <div className="ws-sec__head">
            <span className="ws-kicker">Features</span>
            <h2>From land to handover, in one system</h2>
            <p>Each department enters its own work. {b.appName} adds it up, so management sees the whole picture without chasing spreadsheets.</p>
          </div>
          <div className="ws-features">
            {FEATURES.map((f) => (
              <article key={f.t} className="ws-feature">
                <span className="ws-feature__icon">{icon(f.i)}</span>
                <h3>{f.t}</h3>
                <p>{f.d}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="site3d" className="ws-sec ws-sec--dark">
        <div className="ws-wrap ws-split">
          <div>
            <span className="ws-kicker">3D site</span>
            <h2>See the compound the way a buyer would</h2>
            <p>Phases, zones and buildings on satellite imagery, every floor coloured by sales status. Click a floor to see its units, change a status or start a sale. Upload your BIM or SketchUp model and units light up by name.</p>
            <ul className="ws-list">
              <li>Filter by phase, zone or building, and every screen follows</li>
              <li>Draw outlines on the map, or start from a suggested layout</li>
              <li>Upload glTF models from Revit, SketchUp, Rhino or Blender</li>
            </ul>
          </div>
          <div className="ws-iso" aria-hidden="true">
            <svg viewBox="0 0 420 300">
              {Array.from({ length: 12 }, (_, i) => {
                const col = i % 4, row = Math.floor(i / 4);
                const x = 60 + col * 78 - row * 30, y = 190 + row * 34 - col * 12;
                const floors = 3 + ((i * 7) % 5);
                const colors = ["#3f9a68", "#8a6420", "#d9a520", "#8a6420", "#3f78b5"];
                return (
                  <g key={i}>
                    {Array.from({ length: floors }, (_, f) => (
                      <g key={f} transform={`translate(${x} ${y - f * 14})`}>
                        <path d="M0 0 L28 -10 L56 0 L28 10 Z" fill={colors[(i + f) % 5]} opacity=".95" />
                        <path d="M0 0 L28 10 L28 22 L0 12 Z" fill={colors[(i + f) % 5]} opacity=".7" />
                        <path d="M28 10 L56 0 L56 12 L28 22 Z" fill={colors[(i + f) % 5]} opacity=".5" />
                      </g>
                    ))}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      </section>

      <section id="workflow" className="ws-sec">
        <div className="ws-wrap">
          <div className="ws-sec__head">
            <span className="ws-kicker">How it works</span>
            <h2>Work moves between departments, not inboxes</h2>
          </div>
          <ol className="ws-steps">
            {[
              ["Site", "Records progress and raises the contractor's certificate."],
              ["Technical office", "Checks quantities against the BOQ and drawings."],
              ["Cost control", "Checks the budget, retention and deductions."],
              ["Management", "Approves above the limits you set."],
              ["Finance", "Pays, and the contractor's balance updates."],
            ].map(([t, d], i) => (
              <li key={t}><span>{i + 1}</span><b>{t}</b><p>{d}</p></li>
            ))}
          </ol>
          <p className="ws-muted ws-center">The same flow runs for variations, purchases, budget revisions, sales, handovers, work orders and owner requests, each with its own steps.</p>
        </div>
      </section>

      <section id="security" className="ws-sec ws-sec--soft">
        <div className="ws-wrap ws-cards3">
          {[
            ["Two-step sign-in for everyone", "Every account uses a password and a code from an authenticator app. Lost phones are reset by your admin."],
            ["Your company, your rules", "Roles by department, extra roles, view-only accounts, project-by-project access and approval limits."],
            ["Your own address and brand", `Your workspace at yourcompany.${b.rootDomain} or your own domain, with your logo and colours.`],
          ].map(([t, d]) => (
            <div key={t} className="ws-card"><h3>{t}</h3><p>{d}</p></div>
          ))}
        </div>
      </section>

      {(plans ?? []).length > 0 && (
        <section id="plans" className="ws-sec">
          <div className="ws-wrap">
            <div className="ws-sec__head">
              <span className="ws-kicker">Plans</span>
              <h2>Simple monthly plans</h2>
              <p>Every plan includes set-up help and data import from your existing sheets.</p>
            </div>
            <div className="ws-plans">
              {(plans ?? []).map((p, i) => (
                <div key={p.code} className={`ws-plan${i === 1 ? " ws-plan--hi" : ""}`}>
                  {i === 1 && <span className="ws-plan__tag">Most chosen</span>}
                  <h3>{p.name}</h3>
                  <div className="ws-plan__price">{Number(p.price_egp) ? <>EGP {money(p.price_egp)}<small> / month</small></> : "Talk to us"}</div>
                  <ul>
                    <li>{p.max_projects ? `Up to ${p.max_projects} project${p.max_projects > 1 ? "s" : ""}` : "Unlimited projects"}</li>
                    <li>{p.max_users ? `Up to ${p.max_users} people` : "Unlimited people"}</li>
                    {String(p.features || "").split(",").map((f: string) => f.trim()).filter(Boolean).map((f: string) => <li key={f}>{f}</li>)}
                  </ul>
                  <a href="#contact" className={`ws-btn ${i === 1 ? "ws-btn--gold" : "ws-btn--dark"}`}>Ask for a demo</a>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="ws-sec ws-sec--soft">
        <div className="ws-wrap ws-faq">
          <div className="ws-sec__head"><span className="ws-kicker">Questions</span><h2>Good to know</h2></div>
          <div>
            {FAQ.map(([q, a]) => (
              <details key={q}><summary>{q}</summary><p>{a}</p></details>
            ))}
          </div>
        </div>
      </section>

      <section id="contact" className="ws-sec ws-sec--dark">
        <div className="ws-wrap ws-split">
          <div>
            <span className="ws-kicker">Contact</span>
            <h2>See it with your own project</h2>
            <p>Tell us a little about your company. We&apos;ll set up a demo with one of your projects, so your team sees their own numbers, not a sample.</p>
            <ul className="ws-reach">
              {(info.sales_email || info.support_email) && <li><span>Email</span><a href={`mailto:${info.sales_email || info.support_email}`}>{info.sales_email || info.support_email}</a></li>}
              {info.phone && <li><span>Phone</span><a href={telLink(info.phone)}>{info.phone}</a></li>}
              {info.whatsapp && <li><span>WhatsApp</span><a href={waLink(info.whatsapp)} target="_blank" rel="noreferrer">{info.whatsapp}</a></li>}
              {info.address && <li><span>Office</span>{info.map_url ? <a href={info.map_url} target="_blank" rel="noreferrer">{info.address}</a> : info.address}</li>}
              {info.hours && <li><span>Hours</span>{info.hours}</li>}
            </ul>
          </div>
          <div className="ws-card ws-card--form"><EnquiryForm action={sendEnquiry} /></div>
        </div>
      </section>
    </main>
  );
}
