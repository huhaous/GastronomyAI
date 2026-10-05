import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  GATE_COOKIE,
  GATE_PATH,
  gateIsRequired,
  isPublicGatePath,
  isValidGateCookie,
  sitePassword,
} from "@/lib/auth/gate";
import {
  ANON_COOKIE,
  anonCookieOptions,
  isAnonId,
  newAnonId,
} from "@/lib/telemetry/anonId";

export function proxy(request: NextRequest) {
  const existing = request.cookies.get(ANON_COOKIE)?.value;
  const anonId = isAnonId(existing) ? existing : newAnonId();

  // Issued here rather than at the gate so a record exists even on the paths
  // that never see a password: the id is what separates two seed users whose
  // gate cookies are identical by construction.
  const stamp = (response: NextResponse) => {
    if (existing !== anonId) {
      response.cookies.set({
        name: ANON_COOKIE,
        value: anonId,
        ...anonCookieOptions(),
      });
    }
    return response;
  };

  if (!gateIsRequired()) return stamp(NextResponse.next());

  const { pathname } = request.nextUrl;
  if (isPublicGatePath(pathname)) return stamp(NextResponse.next());

  const password = sitePassword();
  if (!password) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          error: "Site lock is not configured",
          details: "Set SITE_PASSWORD on the host before anyone can Elevate.",
        },
        { status: 503 }
      );
    }
    return stamp(NextResponse.redirect(new URL(GATE_PATH, request.url)));
  }

  const cookie = request.cookies.get(GATE_COOKIE)?.value;
  if (isValidGateCookie(cookie, password)) return stamp(NextResponse.next());

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        error: "Sign in required",
        details: "Open the site and enter the password first.",
      },
      { status: 401 }
    );
  }

  const gate = new URL(GATE_PATH, request.url);
  const from = `${pathname}${request.nextUrl.search}`;
  if (from && from !== "/") gate.searchParams.set("from", from);
  return stamp(NextResponse.redirect(gate));
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
