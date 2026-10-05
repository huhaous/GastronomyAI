/**
 * Coach vs research Studio.
 *
 * Production (Vercel) is the PT surface: Elevate, supermarket, weeknight.
 * Local `next dev` stays the lab. Override with NEXT_PUBLIC_STUDIO_RESEARCH=
 * true|false when you need the other surface on a given deploy.
 */

export const RESEARCH_STUDIO =
  process.env.NEXT_PUBLIC_STUDIO_RESEARCH === "true" ||
  (process.env.NEXT_PUBLIC_STUDIO_RESEARCH !== "false" &&
    process.env.NODE_ENV !== "production");
