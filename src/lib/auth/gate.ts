/**
 * Shared site lock for Path A.
 *
 * Production refuses to run without SITE_PASSWORD. Local `next dev` stays
 * open so the lab still works. The cookie is an HMAC of a fixed string keyed
 * by the password — forging it requires knowing the password, not guessing
 * a boolean.
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const GATE_COOKIE = "gastronomy_gate";
export const GATE_PATH = "/gate";
export const GATE_API_PATH = "/api/gate";
export const GATE_INTENT_LOGOUT = "logout";

export function gateCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };
}

const HMAC_MESSAGE = "gastronomy-gate";

export function sitePassword(): string | undefined {
  const value = process.env.SITE_PASSWORD?.trim();
  return value ? value : undefined;
}

/** True when a request must present a valid gate cookie. */
export function gateIsRequired(): boolean {
  if (sitePassword()) return true;
  return process.env.NODE_ENV === "production";
}

export function gateCookieValue(password: string): string {
  return createHmac("sha256", password).update(HMAC_MESSAGE).digest("hex");
}

function equalBytes(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function passwordsMatch(submitted: string, expected: string): boolean {
  const left = createHash("sha256").update(submitted).digest();
  const right = createHash("sha256").update(expected).digest();
  return equalBytes(left, right);
}

export function isValidGateCookie(
  cookie: string | undefined,
  password: string
): boolean {
  if (!cookie) return false;
  return equalBytes(
    Buffer.from(cookie),
    Buffer.from(gateCookieValue(password))
  );
}

export function isPublicGatePath(pathname: string): boolean {
  return pathname === GATE_PATH || pathname === GATE_API_PATH;
}
