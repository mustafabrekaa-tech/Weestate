import { NextResponse, type NextRequest } from "next/server";
import { scopeCookie } from "@/lib/scope";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Opens a project page with one phase chosen in the scope bar (or the whole
// project), so a link from the reports dashboard lands on that phase.
// /scope?p=<project id>&ph=<phase id>&to=/projects/trio-gardens/delivery?stage=initial
export function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const p = q.get("p") ?? "", ph = q.get("ph") ?? "";
  let to = q.get("to") ?? "/";
  if (!to.startsWith("/") || to.startsWith("//")) to = "/";
  const res = NextResponse.redirect(new URL(to, req.nextUrl.origin));
  if (UUID.test(p)) {
    res.cookies.set(scopeCookie(p), JSON.stringify({ phase: UUID.test(ph) ? ph : "", zone: "", building: "" }), {
      path: "/", maxAge: 31536000, sameSite: "lax",
    });
  }
  return res;
}
