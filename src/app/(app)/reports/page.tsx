import type { Metadata } from "next";
import type { EarthProject } from "@/components/EarthMap";
import { ReportsConsole, type RContractor, type RIssue, type RPhase, type RProject, type RUnit } from "@/components/ReportsConsole";
import { fetchAll } from "@/lib/construction";
import { getMe } from "@/lib/data";
import { docHref } from "@/lib/docs";
import { readGeo } from "@/lib/geo";
import { getHidden } from "@/lib/modules";
import type { ModelPlacement } from "@/lib/site";
import { projectSlugs } from "@/lib/slug";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Reports" };

type PS = {
  id: string; code: string; name: string; location: string; status: string; lat: number | null; lng: number | null;
  budget_egp: number | null; bac_egp: number | null; pv_egp: number | null; ev_egp: number | null; ac_egp: number | null; eac_egp: number | null;
  spi: number | null; cpi: number | null; actual_pct: number | null; planned_pct: number | null; as_of: string | null;
};
type PhS = { id: string; project_id: string; code: string; name: string; bac_egp: number | null; planned_pct: number | null; actual_pct: number | null; pv_egp: number | null; ev_egp: number | null; ac_egp: number | null };
type Prog = { project_id: string; phase_id: string; period: string; planned_pct: number; actual_pct: number };
type U = { id: string; code: string; project_id: string; phase_id: string | null; building_id: string | null; zone_id: string | null; status: string; handover_stage: string | null; delivery_date: string | null };
type Con = { id: string; project_id: string; phase_id: string | null; contractor: string; value_egp: number | null; status: string | null };
type Cert = { contract_id: string; gross_egp: number | null; status: string };
type Pay = { project_id: string; certificate_id: string | null; amount_egp: number | null };
type Q = { doc_type: string; doc_id: string; ref: string; title: string; project_id: string; department_name: string; days_waiting: number; overdue: boolean; step_name: string };

const n = (v: unknown) => Number(v ?? 0) || 0;

// Weighted planned and actual curve from monthly progress, phase weights by budget.
function curveOf(rows: Prog[], weight: Map<string, number>) {
  const total = [...weight.values()].reduce((a, b) => a + b, 0) || 1;
  const periods = [...new Set(rows.map((r) => r.period))].sort();
  const seen = new Map<string, Prog>();
  return periods.map((period) => {
    for (const r of rows.filter((x) => x.period === period)) seen.set(r.phase_id, r);
    let planned = 0, actual = 0;
    for (const [ph, r] of seen) {
      const w = (weight.get(ph) ?? 1) / total;
      planned += n(r.planned_pct) * w;
      actual += n(r.actual_pct) * w;
    }
    return { period: period.slice(0, 10), planned, actual };
  });
}

// The company's reporting dashboard: every project on the map, then one
// project, then one phase, each figure linking to the page it comes from.
export default async function Reports({ searchParams }: { searchParams: Promise<{ p?: string; ph?: string }> }) {
  const initial = await searchParams;
  const supabase = await createClient();
  const me = await getMe();
  const company = me?.company_id ?? "";
  const [{ hidden }, { data: ps }, slugs] = await Promise.all([
    getHidden(),
    supabase.from("project_status").select("*").eq("company_id", company).order("name"),
    projectSlugs(),
  ]);
  const list = (ps ?? []) as PS[];
  const ids = list.map((p) => p.id);
  const none = ["00000000-0000-0000-0000-000000000000"];
  const pids = ids.length ? ids : none;

  const [{ data: phs }, { data: phases }, { data: prog }, units, { data: cons }, { data: pays }, { data: queue }, { data: facts }, { data: blds }, { data: zones }, { data: mods }, { data: stageRows }, latest] = await Promise.all([
    supabase.from("phase_status").select("*").in("project_id", pids).order("code"),
    supabase.from("phases").select("id, finish_date, start_date").in("project_id", pids),
    supabase.from("progress_updates").select("project_id, phase_id, period, planned_pct, actual_pct").in("project_id", pids).order("period"),
    fetchAll<U>((a, b) => supabase.from("units").select("id, code, project_id, phase_id, building_id, zone_id, status, handover_stage, delivery_date").in("project_id", pids).order("code").range(a, b)),
    supabase.from("contracts").select("id, project_id, phase_id, contractor, value_egp, status").in("project_id", pids),
    supabase.from("payments_out").select("project_id, certificate_id, amount_egp").in("project_id", pids).limit(20000),
    supabase.from("work_queue").select("doc_type, doc_id, ref, title, project_id, department_name, days_waiting, overdue, step_name").eq("company_id", company),
    supabase.from("projects").select("id, plan_image, plan_w, plan_h, plan_geo, finish_date").in("id", pids),
    supabase.from("buildings").select("id, project_id, code, zone_id, footprint, floors, floor_height_m, base_m").in("project_id", pids).limit(10000),
    supabase.from("zones").select("id, code, name").in("project_id", pids),
    supabase.from("project_models").select("id, project_id, url, placement").in("project_id", pids).not("placement", "is", null),
    supabase.from("construction_stages").select("id, project_id, seq, name, weight").in("project_id", pids).order("seq"),
    Promise.all(ids.map((id) => supabase.rpc("unit_stage_latest", { p_project: id }).then(({ data }) => (data ?? []) as [string, string, number, string][]))),
  ]);
  const conList = (cons ?? []) as Con[];
  const { data: certs } = conList.length
    ? await supabase.from("payment_certificates").select("contract_id, gross_egp, status").in("contract_id", conList.map((c) => c.id))
    : { data: [] as Cert[] };

  // Construction: each unit's built percent, from its work stages and their weights.
  type St = { id: string; project_id: string; seq: number; name: string; weight: number };
  const stages = (stageRows ?? []) as St[];
  const byUnit = new Map<string, Map<string, number>>();
  for (const rows of latest) for (const [u, s, p] of rows) {
    if (!byUnit.has(u)) byUnit.set(u, new Map());
    byUnit.get(u)!.set(s, n(p));
  }
  const stagesOf = (pid: string) => stages.filter((s) => s.project_id === pid);
  const unitPct = (u: U) => {
    const st = stagesOf(u.project_id), m = byUnit.get(u.id);
    const tw = st.reduce((a, s) => a + n(s.weight), 0) || 1;
    return m ? st.reduce((a, s) => a + (m.get(s.id) ?? 0) * n(s.weight), 0) / tw : 0;
  };

  const certByContract = new Map<string, number>();
  for (const c of (certs ?? []) as Cert[]) {
    if (["approved", "paid"].includes(c.status)) certByContract.set(c.contract_id, (certByContract.get(c.contract_id) ?? 0) + n(c.gross_egp));
  }
  const bldOf = new Map(((blds ?? []) as { id: string; code: string; zone_id: string | null }[]).map((b) => [b.id, b]));
  const zoneOf = new Map(((zones ?? []) as { id: string; code: string; name: string }[]).map((z) => [z.id, z]));
  const phaseDates = new Map(((phases ?? []) as { id: string; finish_date: string | null; start_date: string | null }[]).map((p) => [p.id, p]));
  const allProg = (prog ?? []) as Prog[];
  const queueList = (queue ?? []) as Q[];

  const contractorsOf = (cs: Con[]): RContractor[] => {
    const m = new Map<string, RContractor>();
    for (const c of cs) {
      const k = c.contractor || "Unnamed";
      const r = m.get(k) ?? { name: k, value: 0, certified: 0, contracts: 0 };
      r.value += n(c.value_egp); r.certified += certByContract.get(c.id) ?? 0; r.contracts++;
      m.set(k, r);
    }
    return [...m.values()].sort((a, b) => b.value - a.value);
  };
  const slim = (u: U): RUnit => ({ id: u.id, code: u.code, phase: u.phase_id, stage: u.handover_stage ?? "not_started", status: u.status, due: u.delivery_date, pct: Math.round(unitPct(u)) });

  const projects: RProject[] = list.map((p) => {
    const slug = slugs.get(p.id) ?? p.id;
    const us = units.filter((u) => u.project_id === p.id);
    const myPh = ((phs ?? []) as PhS[]).filter((x) => x.project_id === p.id);
    const myProg = allProg.filter((r) => r.project_id === p.id);
    const myCons = conList.filter((c) => c.project_id === p.id);
    const weight = new Map(myPh.map((x) => [x.id, n(x.bac_egp) || 1]));
    const issues: RIssue[] = queueList.filter((q) => q.project_id === p.id).sort((a, b) => Number(b.overdue) - Number(a.overdue) || b.days_waiting - a.days_waiting)
      .slice(0, 8).map((q) => ({ title: q.title || q.ref, ref: q.ref, href: docHref(q.doc_type, q.doc_id), days: q.days_waiting, who: q.department_name, step: q.step_name, overdue: q.overdue }));
    const st = stagesOf(p.id);
    const phasesOut: RPhase[] = myPh.map((x) => {
      const pu = us.filter((u) => u.phase_id === x.id);
      const rows = myProg.filter((r) => r.phase_id === x.id);
      // Buildings grouped by cluster, units as cells.
      const groups = new Map<string, Map<string, RUnit[]>>();
      for (const u of pu) {
        const b = u.building_id ? bldOf.get(u.building_id) : null;
        const z = (b?.zone_id ?? u.zone_id) ? zoneOf.get((b?.zone_id ?? u.zone_id)!) : null;
        const g = z?.code ?? "–", bk = b?.code ?? u.code.split("-")[0] ?? "–";
        if (!groups.has(g)) groups.set(g, new Map());
        const gm = groups.get(g)!;
        if (!gm.has(bk)) gm.set(bk, []);
        gm.get(bk)!.push(slim(u));
      }
      return {
        id: x.id, code: x.code, name: x.name, bac: n(x.bac_egp), pv: n(x.pv_egp), ev: n(x.ev_egp), ac: n(x.ac_egp),
        actual: n(x.actual_pct), planned: n(x.planned_pct), finish: phaseDates.get(x.id)?.finish_date ?? null,
        curve: rows.map((r) => ({ period: r.period.slice(0, 10), planned: n(r.planned_pct), actual: n(r.actual_pct) })),
        packages: st.map((s) => ({ name: s.name, pct: pu.length ? pu.reduce((a, u) => a + (byUnit.get(u.id)?.get(s.id) ?? 0), 0) / pu.length : 0 })),
        groups: [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true }))
          .map(([label, m]) => ({ label, blds: [...m.entries()].sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true })).map(([code, cells]) => ({ code, cells })) })),
        contractors: contractorsOf(myCons.filter((c) => c.phase_id === x.id)),
      };
    });
    const f = (facts ?? []).find((y) => y.id === p.id);
    return {
      id: p.id, slug, name: p.name, code: p.code, location: p.location, status: p.status, asOf: p.as_of,
      bac: n(p.bac_egp) || n(p.budget_egp), pv: n(p.pv_egp), ev: n(p.ev_egp), ac: n(p.ac_egp), eac: p.eac_egp == null ? null : n(p.eac_egp),
      actual: n(p.actual_pct), planned: n(p.planned_pct), spi: p.spi, cpi: p.cpi, finish: f?.finish_date ?? null,
      awarded: myCons.reduce((a, c) => a + n(c.value_egp), 0),
      certified: myCons.reduce((a, c) => a + (certByContract.get(c.id) ?? 0), 0),
      paid: ((pays ?? []) as Pay[]).filter((y) => y.project_id === p.id).reduce((a, y) => a + n(y.amount_egp), 0),
      units: us.map(slim),
      phases: phasesOut,
      curve: curveOf(myProg, weight),
      contractors: contractorsOf(myCons),
      issues,
      open: queueList.filter((q) => q.project_id === p.id).length,
      overdue: queueList.filter((q) => q.project_id === p.id && q.overdue).length,
    };
  });

  type B = { project_id: string; footprint: [number, number][] | null; floors: number | null; floor_height_m: number | null; base_m: number | null };
  type M = { id: string; project_id: string; url: string; placement: ModelPlacement };
  const earth: EarthProject[] = list.filter((p) => p.lat != null && p.lng != null).map((p) => {
    const x = (facts ?? []).find((y) => y.id === p.id);
    return {
      id: p.id, name: p.name, lat: p.lat!, lng: p.lng!, href: `/projects/${slugs.get(p.id) ?? p.id}/console?view=earth`,
      plan: x?.plan_image && x.plan_w && x.plan_h ? { image: x.plan_image, w: Number(x.plan_w), h: Number(x.plan_h) } : null,
      geo: readGeo(x?.plan_geo),
      blocks: ((blds ?? []) as B[]).filter((b) => b.project_id === p.id && b.footprint).map((b) => {
        const base = n(b.base_m);
        return { ring: b.footprint!, base, top: base + Math.max(1, b.floors ?? 1) * Number(b.floor_height_m || 3.2) };
      }),
      models: ((mods ?? []) as M[]).filter((m) => m.project_id === p.id).map((m) => ({ id: m.id, url: m.url, placement: m.placement })),
    };
  });

  return <ReportsConsole projects={projects} earth={earth} hidden={[...hidden]} today={new Date().toISOString().slice(0, 10)} initial={initial} />;
}
