# GastronomyAI — status and roadmap

Last updated: 9 September 2026.

This is the working picture of what the product is, what is already in the repo, and what still has to be built before a personal trainer can use it. It is not a marketing brief. When a choice below conflicts with a later impulse, keep this document unless the thesis itself changed.

---

## Thesis

Sell **permission**, not restriction. Elevate a named craving to verified macros. Deliciousness lives in salt, acid, umami, aroma and texture; calories live in fat and sugar (the Chef’s Arbitrage).

The first real user is a **PT**: they open a URL, Elevate a **named client** craving, **keep** the plate, **send** it, and find it again next week.

Treat that as **supervised research**, not an unsupervised client product. Nutrition figures are estimates. Deep Cut / PSMF stays gated.

---

## Architectural rule

The engine is **prompt + graph + post-check**. Cook identity is **physics on the plate and the graph**, not a function or regex per dish name.

- Starch cook lives on a graph node: `boil_reserve_toss` | `simmer` | `reheat` | `toast_assemble`.
- Sauce physics lives on a graph node: `cold_dairy` | `starch_gloss`, plus lecithin when pasta + dairy + egg are together. One plate, one sauce. Yogurt is not a default gloss for a slurry plate. Egg is not injected from the word “carbonara”.
- Signature flavour agents come from graph `flavorPairs`, not a hardcoded cuisine list.
- A new *kind of cook* gets a new `starchCook` on a node. Do not add `ensureCarbonara`, `ensureTikka`, or any other dish-named hook.

Live test throughout: Elevate, supermarket, weeknight, ~480 kcal, 40 g protein, 15 minutes.

---

## Current status

The recipe engine is the product. Local `next dev` is the research lab. Path A (coach URL) is in the repo: OpenAI pairing, coach Studio, site password. It is not live until you set `OPENAI_API_KEY` + `SITE_PASSWORD` and deploy.

### What works today

| Area | State |
|---|---|
| **Elevate / Generate APIs** | `POST /api/elevate-recipe`, `POST /api/generate-recipe`. Zod-validated. Node runtime, `maxDuration = 60` (Hobby). |
| **LLM wiring** | Default `LLM_PROVIDER=local` → Ollama. `LLM_PROVIDER=openai` uses `OPENAI_API_KEY` / `gpt-4o`. Local Qwen ids are stripped on the OpenAI path so Studio cannot send `qwen2.5:32b` to OpenAI. |
| **Plate physics** | `inferMealIdentity` / `applySignaturePlate` / method integrity / portion scaler / gap-fill. Protein floor is lean meat, not yogurt. Calorie cap is hard. Weeknight compiles to short actions; no blender unless the craving is a smoothie/soup. |
| **Knowledge graph** | Foods carry `starchCook`, aliases (bun ← burger; pasta ← lasagna), flavour pairs. Coverage log + `npm run coverage` ranks missing nodes. |
| **Studio** | Production = coach: Elevate, supermarket, weeknight, everyday strategies, client name, 15 min default. Local `next dev` = research lab (Generate, 32B/14B, PSMF, specialty). Override with `NEXT_PUBLIC_STUDIO_RESEARCH`. |
| **Kept plates** | `RecipeStore` is async. Only adapter is `localRecipeStore` (`localStorage`, cap 60). Coach can set **For (client)**; stored as `client` + `note`. |
| **Share** | Print stylesheet + `navigator.share` on the plating card. No stable share URL. |
| **Site lock** | `SITE_PASSWORD` + `/gate`. Required in production; open in `next dev` unless the password is set. `src/proxy.ts` blocks pages and `/api/*`. |
| **Safety copy** | Nutrition disclaimer + PSMF acknowledgement in `src/lib/safety.ts`. |

### What is not built

| Gap | Consequence |
|---|---|
| Live host | Code is ready. You still need an OpenAI key, `SITE_PASSWORD`, and a Vercel project. |
| Server persistence | Kept plates die if the PT clears site data or switches phones. You cannot see their kitchen. |
| Durable share link | Print / native share only. |
| Auth / database client | `.env.example` has empty Supabase keys. No `@supabase/supabase-js`, no tables. Path B. |
| Per-user identity | One shared `SITE_PASSWORD`; the gate cookie is an HMAC of a fixed message, so every browser presents the same value. You cannot revoke one person without locking out all of them. |
| Spend control | No rate limit, no quota, no `max_tokens`, `maxDuration = 300`. Anyone past the gate can spend the OpenAI key without attribution. |

### Before widening past two or three seed users

Both rows above become real the moment the password travels further than a
conversation. The spend ceiling is the cheaper of the two and does not need
accounts; per-user revocation does, which makes it Path B work.

### Known engine gaps (not deploy blockers)

- Stir-fry compactness is still not a wok cook. Leftover / pouch rice is `reheat`, not a dry `simmer`. A new cook is a new `starchCook` on a node, not a dish file.
- `carbonaraEmulsion.ts` remains as a lecithin helper; identity must stay plate-driven.

### Seeing what users actually cooked

Hosted generations write a coverage record to a private Blob store
(`npm run coverage:pull`, then `npm run coverage -- var/coverage-prod.jsonl`).
The report names cravings that came back unverified, which is the list of dishes
the engine cannot yet cook — distinct from the unresolved-ingredient backlog,
which is the list of foods the graph cannot yet price. Without a store
configured, production logs to the console and the history is only as long as
Vercel's retention.

### Explicit non-goals for the next cut

Client login for end eaters, weekly meal plans, grocery lists, a mobile app, Clerk, Stripe, a second backend language.

---

## Definition of done (seed)

A PT can:

1. Open a URL you sent them.
2. Elevate a craving for a **named client**.
3. Keep the plate.
4. Send it (print or share).
5. Find it again next week.

Path A below gets 1–4 with “find it again” limited to the same browser. Path B makes 5 true across devices and lets you see the kitchen.

---

## What the PT should try (seed)

He can type **anything**. There is no dish allowlist. That is not the same as “anything will come back as the food he asked for.”

The engine holds a plate when the craving maps to **foods in the graph** and one of four cooks: boil pasta and toss, simmer a dry grain, reheat leftover or pouch rice, or toast a bun and assemble. Alfredo, carbonara, and a burger are the three already proven. Pouch rice is the fourth cook (`reheat`). Everything else is either the same physics with a different name, or a guess.

Settings for every seed trial: Elevate, supermarket, weeknight, everyday strategy, ~480 kcal, 40 g protein, 15 minutes. Name the dish he actually wants (“mac and cheese”), not a category (“high-protein comfort food”).

### Safe first-week menu

Pasta family — boil, reserve water, toss off the heat:

- Fettuccine Alfredo
- Carbonara
- Mac and cheese
- Cacio e pepe
- Unnamed creamy pasta
- Chicken pesto pasta (pesto is improvised; basil and Parmesan are in the graph, pine nuts are not)

Bun family — toast, sear, assemble:

- Cheeseburger
- Chicken sandwich
- Turkey burger
- Steak sandwich (lean beef is in the graph)

Simple protein plates — no special starch; usually the most honest cards:

- Lemon-garlic chicken and broccoli
- Salmon with asparagus and capers
- Shrimp with garlic and green beans
- Tuna salad (same-day leftovers)

Yogurt-sauced bowls — identity holds if he does not ask for naan:

- Chicken tikka masala
- Chicken or shrimp rice bowl

### Expect a miss (he may still type these)

The model will answer. Macros may look fine. The plate often will not be the craving.

| Craving | Why it slips |
|---|---|
| Pizza | No dough, no oven-starch cook |
| Tacos / burritos / wraps | No tortilla |
| Lasagna | Aliased to pasta, then cooked like spaghetti |
| Fried rice / stir-fry | Leftover rice reheats; there is still no wok cook |
| Risotto | Same rice node, not a risotto method |
| Ramen / pho | “Noodles” become wheat pasta |
| Sushi / poke | No nori, no sushi rice |
| Pancakes, desserts, loaded fries | No bake cook; cocoa and berries exist as seasoning, not a pastry |

A miss looks like a starch swap (burger → pasta, pizza → cauliflower) or a method that is a paragraph of verbs. Keep it and send it back — useful as research, not a client plate.

Free to wander. Not free to trust every card. For week one, use the pasta / bun / lemon-chicken list.

---

## Roadmap

### Path A — PT can use a URL

**In the repo.** Remaining: your OpenAI key, `SITE_PASSWORD`, and a Vercel project.

1. **OpenAI project** — still yours: billing on, `OPENAI_API_KEY`, `OPENAI_MODEL=gpt-4o`.
2. **Switch provider** — set `LLM_PROVIDER=openai` in `.env.local` and on Vercel. Confirm Elevate on localhost against the API before deploying. Qwen ids are ignored on this path.
3. **Studio for a coach** — done. Production Elevate / weeknight / supermarket / everyday. Generate, 32B/14B, PSMF, specialty, and “I have time” stay on `next dev` or `NEXT_PUBLIC_STUDIO_RESEARCH=true`. Client name field on Elevate.
4. **Host** — still yours: `npx vercel`, same env vars.
5. **Lock the door** — done. `SITE_PASSWORD` + `/gate` + `src/proxy.ts`. Production without the password is a 503, not an open tab.
6. **Timeouts** — done at 60 s (Hobby). UI explains a miss / missing key / expired lock. Raise `maxDuration` on Pro if needed.
7. **Seed briefing** — first-week menu above. Keep the tab; plates live in **their** browser.

You will not see what they generated. That is acceptable for a first week.

### Path B — shared kitchen (build after Path A works)

Same app. Persistence and identity.

1. Supabase project. Email auth. Invite only you and the PT.
2. Table `recipes`: `id`, `user_id`, `saved_at`, `title`, `note`, `client`, `payload` (jsonb). RLS: `user_id = auth.uid()`.
3. `npm i @supabase/supabase-js @supabase/ssr`. Fill `NEXT_PUBLIC_SUPABASE_URL` and the anon key (already named in `.env.example`).
4. `src/lib/storage/supabaseRecipeStore.ts` implementing the existing `RecipeStore`. Point `useSavedRecipes` at it when those env vars are set.
5. Login page. Replace the site-password gate with a session. API routes refuse a missing session.
6. Client name is already on the card; persist it on the server.

### Later (not this month)

- Shareable plate URL (read-only link a client can open).
- You looking at the PT’s kitchen (shared org, not just per-user RLS).
- Graph coverage as an ops habit (`npm run coverage`), not a product feature.
- Remote Ollama only if cost or quality forces it; the OpenAI path is the deploy path.

---

## Stack map

**Keep.** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, Zod, OpenAI SDK, knowledge graph, cook post-checks, site password.

**Turn on.** `LLM_PROVIDER=openai`, `OPENAI_API_KEY`, `SITE_PASSWORD`, Vercel.

**Add when Path B starts.** Supabase Auth + one table + one store adapter.

**Do not add** to get a PT on a URL: a new framework, a mobile client, meal-plan schema, payment, or dish-specific cook files.

---

## Suggested build order

1. This document stays the source of “what we are doing.”
2. Path A remaining: key → localhost Elevate against OpenAI → deploy → you try the URL → PT tries the URL.
3. Only then Path B, if “find it next week” or “I need to see the plates” is actually blocking.

Commit and push only when asked. Do not treat local Ollama as the PT path.
