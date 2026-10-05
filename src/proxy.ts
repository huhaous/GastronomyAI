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

export function proxy(request: NextRequest) {
  if (!gateIsRequired()) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (isPublicGatePath(pathname)) return NextResponse.next();

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
    return NextResponse.redirect(new URL(GATE_PATH, request.url));
  }

  const cookie = request.cookies.get(GATE_COOKIE)?.value;
  if (isValidGateCookie(cookie, password)) return NextResponse.next();

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
  return NextResponse.redirect(gate);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
