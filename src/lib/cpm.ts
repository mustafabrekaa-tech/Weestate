// Critical path scheduling in calendar days: works out each activity's dates
// from its duration and links (FS, SS, FF, SF with lag), then the float and
// which activities are critical. Pure, so it runs on the server or in tests.

export type LinkType = "FS" | "SS" | "FF" | "SF";
export type CpmActivity = {
  id: string;
  duration: number; // days; 0 for milestones
  // Not earlier than this date (from the plan or an import), if set.
  notBefore?: string | null;
};
export type CpmLink = { pred: string; succ: string; type: LinkType; lag: number };
export type CpmResult = Map<string, { start: string; finish: string; float: number; critical: boolean }>;

const DAY = 86400000;
const toDay = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / DAY);
const toDate = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);

// Durations are inclusive working spans: a 10-day task starting day 0 finishes day 9.
// Internally finish = start + duration (exclusive), shown as finish - 1 for tasks.
export function schedule(acts: CpmActivity[], links: CpmLink[], projectStart: string): { dates: CpmResult; loops: boolean } {
  const ids = new Set(acts.map((a) => a.id));
  const ls = links.filter((l) => ids.has(l.pred) && ids.has(l.succ) && l.pred !== l.succ);
  const preds = new Map<string, CpmLink[]>(), succs = new Map<string, CpmLink[]>();
  for (const l of ls) {
    preds.set(l.succ, [...(preds.get(l.succ) ?? []), l]);
    succs.set(l.pred, [...(succs.get(l.pred) ?? []), l]);
  }
  // Order so every activity comes after its predecessors.
  const indeg = new Map(acts.map((a) => [a.id, (preds.get(a.id) ?? []).length]));
  const queue = acts.filter((a) => !indeg.get(a.id)).map((a) => a.id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const l of succs.get(id) ?? []) {
      indeg.set(l.succ, indeg.get(l.succ)! - 1);
      if (indeg.get(l.succ) === 0) queue.push(l.succ);
    }
  }
  const loops = order.length < acts.length;
  // Anything caught in a loop is scheduled on its own.
  for (const a of acts) if (!order.includes(a.id)) order.push(a.id);

  const dur = new Map(acts.map((a) => [a.id, Math.max(0, Math.round(a.duration))]));
  const p0 = toDay(projectStart);
  const es = new Map<string, number>(), ef = new Map<string, number>();
  for (const id of order) {
    const a = acts.find((x) => x.id === id)!;
    const d = dur.get(id)!;
    let s = a.notBefore ? Math.max(p0, toDay(a.notBefore)) : p0;
    for (const l of preds.get(id) ?? []) {
      if (!es.has(l.pred)) continue;
      const ps = es.get(l.pred)!, pf = ef.get(l.pred)!;
      if (l.type === "FS") s = Math.max(s, pf + l.lag);
      else if (l.type === "SS") s = Math.max(s, ps + l.lag);
      else if (l.type === "FF") s = Math.max(s, pf + l.lag - d);
      else s = Math.max(s, ps + l.lag - d); // SF
    }
    es.set(id, s);
    ef.set(id, s + d);
  }
  const end = Math.max(...[...ef.values(), p0]);
  const lf = new Map<string, number>(), lsd = new Map<string, number>();
  for (const id of [...order].reverse()) {
    const d = dur.get(id)!;
    let f = end;
    for (const l of succs.get(id) ?? []) {
      if (!lsd.has(l.succ)) continue;
      const ss = lsd.get(l.succ)!, sf = lf.get(l.succ)!;
      if (l.type === "FS") f = Math.min(f, ss - l.lag);
      else if (l.type === "SS") f = Math.min(f, ss - l.lag + d);
      else if (l.type === "FF") f = Math.min(f, sf - l.lag);
      else f = Math.min(f, sf - l.lag + d); // SF
    }
    lf.set(id, f);
    lsd.set(id, f - d);
  }
  const dates: CpmResult = new Map();
  for (const a of acts) {
    const s = es.get(a.id)!, d = dur.get(a.id)!;
    const float = lsd.get(a.id)! - s;
    dates.set(a.id, { start: toDate(s), finish: toDate(d > 0 ? s + d - 1 : s), float, critical: float <= 0 });
  }
  return { dates, loops };
}

// "A100 FS+5, A110 SS, A120FF-3" → links. Bare codes are finish-to-start.
export function parsePreds(text: string): { code: string; type: LinkType; lag: number }[] {
  return text
    .split(/[,;\n]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      const m = t.match(/^(.+?)\s*(FS|SS|FF|SF)?\s*([+-]\s*\d+)?\s*d?$/i);
      if (!m) return null;
      return { code: m[1]!.trim(), type: ((m[2] ?? "FS").toUpperCase() as LinkType), lag: m[3] ? Number(m[3].replace(/\s/g, "")) : 0 };
    })
    .filter((x): x is { code: string; type: LinkType; lag: number } => !!x && !!x.code);
}

export const daysBetween = (a: string, b: string) => toDay(b) - toDay(a);
