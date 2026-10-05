import { NextResponse } from "next/server";
import {
  GATE_COOKIE,
  GATE_INTENT_LOGOUT,
  GATE_PATH,
  gateCookieOptions,
  gateCookieValue,
  passwordsMatch,
  sitePassword,
} from "@/lib/auth/gate";

export const runtime = "nodejs";

function redirectTo(request: Request, path: string) {
  return NextResponse.redirect(new URL(path, request.url), 303);
}

function clearGateCookie(response: NextResponse) {
  response.cookies.set({
    name: GATE_COOKIE,
    value: "",
    ...gateCookieOptions(),
    maxAge: 0,
  });
  return response;
}

export async function POST(request: Request) {
  const form = await request.formData();
  if (String(form.get("intent") ?? "") === GATE_INTENT_LOGOUT) {
    return clearGateCookie(redirectTo(request, GATE_PATH));
  }

  const password = sitePassword();
  if (!password) {
    return redirectTo(request, `${GATE_PATH}?error=unconfigured`);
  }

  const submitted = String(form.get("password") ?? "");
  const from = String(form.get("from") ?? "/");
  const next = from.startsWith("/") && !from.startsWith("//") ? from : "/";

  if (!passwordsMatch(submitted, password)) {
    return redirectTo(request, `${GATE_PATH}?error=1`);
  }

  const response = redirectTo(request, next);
  response.cookies.set({
    name: GATE_COOKIE,
    value: gateCookieValue(password),
    ...gateCookieOptions(),
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
