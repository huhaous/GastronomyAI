# GastronomyAI

Zero-willpower fat loss through gourmet culinary physics.

Michelin Dark / Nordic Minimalist MVP bridging molecular culinary technique with strict macronutrient targets.

## Stack

- **Next.js 16** (App Router) · React · TypeScript · Tailwind CSS v4
- **Local LLM (default)**: [Ollama](https://ollama.com) + **Qwen2.5 14B** on NVIDIA GPU (OpenAI-compatible API)
- **Cloud LLM (Path A)**: OpenAI Structured Outputs (`gpt-4o`) via `LLM_PROVIDER=openai`
- **Site lock**: `SITE_PASSWORD` (required in production)
- **Zod** request validation
- **Supabase** env slots only (Auth / Postgres — Path B)

## Local LLM (recommended for MVP)

Your machine (RTX 5090 Laptop · 24GB VRAM) is already wired as the default provider.

```bash
# Ollama is installed at ~/.local/bin/ollama
export PATH="$HOME/.local/bin:$PATH"
ollama serve          # keep this running
# models: qwen2.5:32b (default quality) + qwen2.5:14b (fast fallback)
```

App defaults (`LLM_PROVIDER=local`, `OLLAMA_MODEL=qwen2.5:32b`) call `http://127.0.0.1:11434/v1`.
In Recipe Studio you can toggle **32B** (quality) vs **14B** (speed) without restarting.

## Setup

```bash
cp .env.example .env.local   # already defaults to local Ollama
# Optional: OPENAI_API_KEY only if LLM_PROVIDER=openai

npm install
ollama serve &               # terminal 1
npm run dev                  # terminal 2
```

Open [http://localhost:3000](http://localhost:3000). Local `next dev` is the research lab (Generate, 32B/14B, PSMF).

## Path A — hosted coach URL

The PT-facing surface is OpenAI + a site password. Production hides Generate, model chips, and PSMF.

1. Create an OpenAI project, turn on billing, copy a key.
2. In `.env.local` (and later Vercel env):

```bash
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o
SITE_PASSWORD=choose-a-long-secret
```

3. Confirm Elevate on localhost against OpenAI before deploying.
4. `npx vercel` (or connect the GitHub repo). Set the same env vars on the project. Production is coach Studio automatically.
5. Send the PT the URL and `SITE_PASSWORD`. First-week menu is in `docs/STATUS-AND-ROADMAP.md`.

Route handlers cap at 60 seconds (Vercel Hobby). GPT-4o is usually inside a minute. Raise `maxDuration` on Pro if a call dies early.

Plates still live in **the PT's browser**. Clearing site data deletes the kitchen.

## API

### `POST /api/generate-recipe`

```json
{
  "target_macros": { "calories": 450, "protein_g": 35, "carbs_g": 25, "fat_g": 12 },
  "available_ingredients": ["chicken breast", "cauliflower", "lemon", "greek yogurt"],
  "kitchen_tools": ["sous_vide", "blender", "oven"],
  "time_limit_minutes": 60
}
```

### `POST /api/elevate-recipe`

```json
{
  "craving_meal": "Fettuccine Alfredo",
  "target_macros": { "calories": 480, "protein_g": 40 },
  "kitchen_tools": ["stovetop", "blender"],
  "time_limit_minutes": 45
}
```

## Graph coverage log

Every generation appends a record to `var/coverage.jsonl` (gitignored) describing
which ingredient lines the Knowledge Graph could price and why the rest failed —
missing node, unparseable quantity, or unknown unit.

```bash
npm run coverage             # ranked backlog of what to add to the graph next
COVERAGE_LOG=off npm run dev # opt out
```

## Core types

Nutrition-domain types (`MacroProfile`, `NutritionalStrategy`, validation results)
live in `src/types/nutrition.ts` and are re-exported by `src/types/recipe.ts`,
which adds `GourmetRecipe`, `ElevatedRecipe`, `FlavorRadarScores`,
`CulinaryPhysicsTip`, and the request contracts.

Macro verification is split the same way: `src/lib/nutrition/foodLines.ts` turns
food lines into grams and macros with no knowledge of recipes, while
`src/lib/ai/nutritionRecalc.ts` layers on the recipe-specific policy (per-serving
division, when to override the model's claimed macros).
