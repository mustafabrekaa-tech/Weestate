import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hostKind } from "@/lib/host";

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
  if (signedIn && !path.startsWith("/auth")) {
    // Signing in always takes an authenticator code: accounts without an
    // app set one up first, the rest type the code.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const step = aal?.currentLevel === "aal2" ? null : aal?.nextLevel === "aal2" ? "/login/verify" : "/login/setup";
    if (step && path !== step) {
      const url = request.nextUrl.clone();
      url.pathname = step;
      url.search = "";
      return NextResponse.redirect(url);
    }
    if (!step && path.startsWith("/login")) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|mjs|png|webp)$).*)"],
};
