import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hostKind } from "@/lib/host";
import { IDLE_MS } from "@/lib/idle";

const SEEN = "we-seen";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Project address names (trio-gardens) and ids, remembered for a few minutes per person.
const slugCache = new Map<string, { v: string | null; at: number }>();
function cached(key: string) {
  const hit = slugCache.get(key);
  return hit && Date.now() - hit.at < 5 * 60 * 1000 ? hit : null;
}

// Refreshes the Supabase session on every request and sends signed-out
// visitors to the login page.
export async function proxy(request: NextRequest) {
  // Lets server layouts know which page is being opened.
  request.headers.set("x-pathname", request.nextUrl.pathname);
  const kind = hostKind(request.headers.get("host") ?? "");

  // The root domain is the public website: the landing page, the
  // "go to your workspace" box and the enquiry form. No app pages.
  if (kind === "site") {
    const path = request.nextUrl.pathname;
    const url = request.nextUrl.clone();
    if (path === "/") { url.pathname = "/site"; return NextResponse.rewrite(url); }
    if (["/privacy", "/terms", "/refund", "/about"].includes(path)) { url.pathname = `/site${path}`; return NextResponse.rewrite(url); }
    if (path.startsWith("/site")) return NextResponse.next();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const path = request.nextUrl.pathname;

  // admin.<root domain> opens the WE-estate admin portal.
  if (signedIn && path === "/" && kind === "admin") {
    const url = request.nextUrl.clone();
    url.pathname = "/platform";
    return NextResponse.redirect(url);
  }

  if (!signedIn && !path.startsWith("/login") && !path.startsWith("/auth") && !path.startsWith("/site")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  // Hand back a response with the refreshed session cookies and the activity stamp.
  const finish = (res: NextResponse) => {
    if (res !== response) {
      response.cookies.getAll().forEach((c) => res.cookies.set(c));
    }
    if (signedIn) res.cookies.set(SEEN, String(Date.now()), { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 30 });
    return res;
  };

  // Idle for too long: sign out and say why on the login page.
  if (signedIn && !path.startsWith("/auth")) {
    const seen = Number(request.cookies.get(SEEN)?.value || 0);
    if (seen && Date.now() - seen > IDLE_MS) {
      await supabase.auth.signOut({ scope: "local" });
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "?idle=1";
      const res = NextResponse.redirect(url);
      response.cookies.getAll().forEach((c) => res.cookies.set(c));
      res.cookies.delete(SEEN);
      return res;
    }
  }

  if (signedIn && !path.startsWith("/auth")) {
    // Signing in always takes an authenticator code: accounts without an
    // app set one up first, the rest type the code.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const step = aal?.currentLevel === "aal2" ? null : aal?.nextLevel === "aal2" ? "/login/verify" : "/login/setup";
    if (step && path !== step) {
      const url = request.nextUrl.clone();
      url.pathname = step;
      url.search = "";
      return finish(NextResponse.redirect(url));
    }
    if (!step && path.startsWith("/login")) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return finish(NextResponse.redirect(url));
    }
  }

  // Readable project addresses: /projects/trio-gardens/... is served by the page for the project's id,
  // and an old link with the id opens at the readable address.
  const pm = signedIn ? path.match(/^\/projects\/([^/]+)(\/.*)?$/) : null;
  if (pm && pm[1] !== "new") {
    const seg = decodeURIComponent(pm[1]!);
    const rest = pm[2] ?? "";
    const who = String(data?.claims?.sub ?? "");
    if (UUID.test(seg)) {
      const page = request.method === "GET" && !request.headers.get("rsc") && !request.headers.get("next-router-prefetch") && !request.headers.get("next-action");
      if (page) {
        let hit = cached(`${who}|id|${seg}`);
        if (!hit) {
          const { data: row } = await supabase.from("projects").select("slug").eq("id", seg).maybeSingle();
          hit = { v: (row?.slug as string | null) ?? null, at: Date.now() };
          slugCache.set(`${who}|id|${seg}`, hit);
        }
        if (hit.v) {
          const url = request.nextUrl.clone();
          url.pathname = `/projects/${hit.v}${rest}`;
          return finish(NextResponse.redirect(url));
        }
      }
    } else {
      let hit = cached(`${who}|slug|${seg}`);
      if (!hit) {
        const { data: row } = await supabase.from("projects").select("id").eq("slug", seg).limit(1).maybeSingle();
        hit = { v: (row?.id as string | null) ?? null, at: Date.now() };
        slugCache.set(`${who}|slug|${seg}`, hit);
      }
      if (hit.v) {
        const url = request.nextUrl.clone();
        url.pathname = `/projects/${hit.v}${rest}`;
        return finish(NextResponse.rewrite(url, { request }));
      }
    }
  }
  return finish(response);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|robots.txt|sitemap.xml|.*\\.(?:svg|mjs|png|webp|ico|jpg|jpeg|gif|avif|glb|gltf)$).*)"],
};
