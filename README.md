# GastronomyAI

Ask for a cheeseburger at 480 kcal and 40g protein. Get a real recipe whose
numbers are checked against a food graph rather than taken from the model.

This is a study in one problem: **a language model will hand you a finished,
plausible, confidently wrong answer, and nothing in the output tells you
which parts it actually knew.** Recipes make that problem concrete, because
the model's mistakes are numeric and a diner acts on them.

Live, password-gated. Next.js 16 · TypeScript · OpenAI structured outputs.

## The failure this is built around

An early hosted plate reported **478 kcal**. The graph could only vouch for
**268**. The card looked finished — no error, nothing a careful reader would
catch — and 44% of the stated energy was the model's own arithmetic.

That is the whole thesis. Generation is the easy half. Knowing which half of
the output is grounded, and saying so, is the part that needs engineering.

## How it works

Three stages, and the model only owns the first.

**1. Generate.** A prompt built from the graph asks for JSON constrained by a
schema (`response_format: json_schema`, then Zod). The model proposes a dish,
ingredient lines, and a method.

**2. Price it against the graph.** Every ingredient line is resolved to a node
in `src/data/knowledgeGraph.ts` — 87 food nodes plus 76 negligible seasonings —
and re-costed from grams. The model's claimed macros are discarded in favour of
what the graph can actually vouch for. Lines that resolve to nothing are
recorded, not quietly dropped.

**3. Post-check and repair.** Deterministic passes fix what the model reliably
gets wrong: portions are solved against the calorie ceiling and protein floor
(`portionScaling.ts`), and the method is recompiled so it describes the plate
that is actually listed (`methodIntegrity.ts`).

Each ingredient carries physics rather than a dish name — `starchCook`,
`methodRole`, `saucePhysics` — so a new cook is a field on a node, never a
`handleCarbonara()`. That rule is written down and enforced in
[`.cursor/skills/graph-physics/SKILL.md`](.cursor/skills/graph-physics/SKILL.md),
because the tempting fix is always a regex for the dish that just broke.

## Saying how much it knew

Every plate carries a confidence — `verified`, `partial`, `unverified` — from
whether all, some, or few of its lines resolved. The UI shows it. A plate the
graph cannot fully price says so on the card instead of presenting a confident
number.

Every generation also writes a record: the craving, the dish, verified versus
reported calories, and each unresolved line with a reason.

```
Coverage over 3 generation(s)

  fully verified   2 (67%)
  unverified       1 (33%)
  ingredient lines 35/40 priced (88%)

Cravings that came back unverified:
    1/2  chicken tikka masala

Backlog — most frequent first:
    1x  cooked white basmati rice  not in graph
    1x  tomato passata             not in graph
```

Two different signals sit in that report. The backlog names **foods the graph
cannot price**. The craving list names **dishes the engine cannot cook**. Only
the second one tells you the product has a hole.

### What it caught

The 478-versus-268 plate above produced five unresolved lines, which looked
like five missing foods. Four were foods the graph already had.

`looseMatch` gated on a contiguous phrase, so the alias `cooked basmati rice`
could not be found inside `cooked white basmati rice` — the adjective
interrupts it. Qualifiers only ever worked at the *edges* of a name. One
structural bug, not five data gaps.

The first fix made it worse: dropping `cooked` as a qualifier let dry rice
(365 kcal/100g) answer to cooked rice (130), understating the line almost
threefold. A wrong match is worse than no match, because the system believes
it. Cook state is now content rather than wording, and
`scripts/graph-match-smoke.ts` pins both directions.

Same craving after the fix: **16/16 lines priced, 461 kcal verified against
461 reported.**

## Where to look

| | |
|---|---|
| `src/data/knowledgeGraph.ts` | Food nodes, cook physics, and the name matcher |
| `src/lib/ai/openai.ts` | `finalizeRecipe` — the whole post-generation pipeline |
| `src/lib/nutrition/portionScaling.ts` | Coordinate-descent solver for macro targets |
| `src/lib/cook/methodIntegrity.ts` | Recompiles the method to match the plate |
| `src/lib/telemetry/` | Coverage records, pluggable sinks, anonymous grouping |
| `scripts/*-smoke.ts` | 56 assertions, most written from a plate that broke |

The commit messages carry the reasoning; `git log` is a reasonable way to read
this project.

## Running it

```bash
cp .env.example .env.local
npm install
npm run dev
```

Defaults to a local Ollama model, so it runs with no API key. Set
`LLM_PROVIDER=openai` and `OPENAI_API_KEY` to use hosted models instead;
`OPENAI_MODEL` picks the version. Local `next dev` exposes the research
surface (Generate, model switching); production shows only Elevate.

```bash
npm test        # 8 smoke suites, no network, no API calls
npm run lint
npm run coverage   # graph backlog from local generations
```

### Hosted

`node scripts/vercel-path-a-deploy.mjs` deploys to Vercel, reading credentials
from `.env.local` and never printing them. Production requires `SITE_PASSWORD`.

Coverage records need somewhere durable, because a serverless filesystem is
read-only and the write fails silently. Connect a **private** Vercel Blob store
— private because a record contains the craving someone typed. With none
configured, production falls back to console logging so a misconfigured deploy
is noisy rather than silent.

```bash
npm run coverage:pull                       # store → var/coverage-prod.jsonl
npm run coverage -- var/coverage-prod.jsonl
```

## What is not built

Honest list, kept current in
[`docs/STATUS-AND-ROADMAP.md`](docs/STATUS-AND-ROADMAP.md):

- **No server persistence.** Saved plates live in `localStorage`, capped at 60.
  The store interface is async and swappable, but only the browser adapter exists.
- **One shared password, no accounts.** The gate cookie is an HMAC of a fixed
  message, so every browser presents the same value. You cannot revoke one person.
- **No spend ceiling.** No rate limit and no `max_tokens` on generation.
- **Cooks the engine does not have.** No wok, dough, tortilla, or bake. Pizza,
  tacos, risotto, ramen, and sushi will miss, and the docs say which and why.
- **Latency.** A hosted Elevate takes 60–90 seconds.

Nutrition output is informational. Aggressive protein-sparing settings sit
behind an explicit acknowledgement gate (`src/lib/safety.ts`), and the UI
carries a disclaimer.
