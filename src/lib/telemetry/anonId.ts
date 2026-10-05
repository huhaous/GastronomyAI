/**
 * A per-browser id that exists only to group generations.
 *
 * The gate cookie cannot do this job: its value is an HMAC of a fixed message
 * keyed by SITE_PASSWORD, so every signed-in browser presents a byte-identical
 * cookie. With two or three seed users sharing one password, their coverage
 * records interleave into a single undifferentiated stream and "this person
 * hit four bad plates in a row" becomes unreadable.
 *
 * This is deliberately not identity. It is a random value with no account, no
 * email, and no server record of who holds it — it survives a page reload and
 * dies with the browser profile. It answers "same person?", never "which
 * person?".
 */

export const ANON_COOKIE = "gastronomy_anon";

/** A year: long enough to follow a seed user across a few weeks of cooking. */
const ANON_MAX_AGE = 60 * 60 * 24 * 365;

export function anonCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: ANON_MAX_AGE,
  };
}

export function newAnonId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

/** Ignore anything that isn't our own shape, so a hand-set cookie can't skew the log. */
export function isAnonId(value: string | undefined): value is string {
  return typeof value === "string" && /^[0-9a-f]{16}$/.test(value);
}

/**
 * Route handlers receive a plain Request, so read the header rather than
 * reaching for next/headers — that keeps this callable from the smoke scripts.
 */
export function readAnonId(headers: Headers): string | undefined {
  const raw = headers.get("cookie");
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    if (part.slice(0, eq).trim() !== ANON_COOKIE) continue;
    const value = part.slice(eq + 1).trim();
    return isAnonId(value) ? value : undefined;
  }
  return undefined;
}
