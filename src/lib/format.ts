const egp = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export const money = (n: number | null | undefined) => (n == null ? "–" : egp.format(Number(n)));
export const pct = (n: number | null | undefined) => (n == null ? "–" : `${Number(n).toFixed(1)}%`);
export const index2 = (n: number | null | undefined) => (n == null ? "–" : Number(n).toFixed(2));
export const date = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }) : "–";
export const dateTime = (d: string) =>
  new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
export const certRef = (n: number) => `PC-${String(n).padStart(2, "0")}`;
