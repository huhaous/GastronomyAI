#!/usr/bin/env node
/**
 * Generates recipes against a running dev server to populate the coverage log.
 *
 * Two jobs at once: it fills var/coverage.jsonl so the graph backlog is decided
 * by what the model actually reaches for rather than by guesswork, and it soak
 * tests portion scaling across varied inputs. Nothing here is a unit test — the
 * point is breadth of real generations.
 *
 * Usage: npm run coverage:seed [-- --runs 25 --model qwen2.5:14b]
 */

import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const RUNS = Number(flag("runs", 25));
const MODEL = flag("model", "qwen2.5:14b");
const BASE = flag("base", "http://localhost:3000");
const REPORT = path.join(process.cwd(), "var", "seed-runs.jsonl");

const PANTRIES = [
  ["chicken breast", "broccoli", "white rice", "olive oil", "garlic", "lemon"],
  ["salmon", "asparagus", "sweet potato", "dijon mustard", "dill"],
  ["shrimp", "konjac noodles", "bok choy", "ginger", "soy sauce", "sesame oil"],
  ["greek yogurt", "oats", "berries", "whey protein isolate", "cinnamon"],
  ["tofu", "mushrooms", "spinach", "miso paste", "scallion"],
  ["egg whites", "whole egg", "bell pepper", "onion", "feta"],
  ["lean beef", "cauliflower", "tomato paste", "paprika", "parmesan"],
  ["cottage cheese", "cucumber", "quinoa", "olive oil", "mint"],
  ["white fish", "green beans", "potato", "capers", "butter"],
  ["turkey bacon", "zucchini", "pasta", "cream cheese", "chive"],
  ["tuna", "kale", "chickpeas", "tahini", "lemon"],
  ["chicken thigh", "carrot", "brown rice", "peanut butter", "lime"],
];

const CUISINES = [
  "Japanese", "Italian", "Mexican", "Thai", "French bistro", "Levantine",
  "Korean", "Nordic", "Spanish", "Indian", "Greek", "Vietnamese",
];

const STRATEGIES = [
  "post_workout_high_protein",
  "rest_day_low_carb",
  "balanced_deficit",
];

const TOOLSETS = [
  ["stovetop", "oven"],
  ["air_fryer", "stovetop"],
  ["blender", "stovetop"],
  ["sous_vide", "stovetop", "immersion_blender"],
  ["grill", "food_processor"],
];

const TARGETS = [
  { calories: 450, protein_g: 40, carbs_g: 30, fat_g: 15 },
  { calories: 620, protein_g: 55, carbs_g: 45, fat_g: 20 },
  { calories: 700, protein_g: 50, carbs_g: 60, fat_g: 25 },
  { calories: 380, protein_g: 45, carbs_g: 15, fat_g: 10 },
];

const pick = (list, i) => list[i % list.length];

async function run(i) {
  const body = {
    target_macros: pick(TARGETS, i),
    available_ingredients: pick(PANTRIES, i),
    kitchen_tools: pick(TOOLSETS, i),
    time_limit_minutes: 40,
    nutritional_strategy: pick(STRATEGIES, i),
    cuisine_style: pick(CUISINES, i),
    model: MODEL,
  };

  const started = Date.now();
  const res = await fetch(`${BASE}/api/generate-recipe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const seconds = Math.round((Date.now() - started) / 1000);
  const payload = await res.json();

  if (!res.ok) {
    console.log(`${String(i + 1).padStart(2)}/${RUNS}  HTTP ${res.status}  ${seconds}s  ${payload.details ?? payload.error}`);
    return { ok: false, seconds, error: payload.details ?? payload.error };
  }

  const r = payload.recipe;
  const target = body.target_macros.calories;
  const drift = Math.round(((r.macros.calories - target) / target) * 100);
  const pa = r.portion_adjustment;

  console.log(
    `${String(i + 1).padStart(2)}/${RUNS}  ${seconds}s  ${r.macros.calories} kcal ` +
      `(target ${target}, ${drift >= 0 ? "+" : ""}${drift}%)  ` +
      `${r.macro_validation.confidence}  ` +
      `${r.macro_validation.resolved_ingredients}/${r.macro_validation.total_ingredients} priced` +
      `${pa ? `  scaled from ${pa.before_calories}${pa.bounded ? " (bounded)" : ""}` : ""}` +
      `  — ${r.name}`
  );

  return {
    ok: true,
    seconds,
    dish: r.name,
    target,
    calories: r.macros.calories,
    drift_percent: drift,
    confidence: r.macro_validation.confidence,
    scaled: Boolean(pa),
    bounded: Boolean(pa?.bounded),
    strategy: body.nutritional_strategy,
    in_compliance: r.strategy_validation?.in_compliance ?? null,
  };
}

const results = [];
console.log(`Seeding ${RUNS} generations against ${BASE} with ${MODEL}\n`);

for (let i = 0; i < RUNS; i += 1) {
  try {
    results.push(await run(i));
  } catch (err) {
    console.log(`${String(i + 1).padStart(2)}/${RUNS}  failed: ${err.message}`);
    results.push({ ok: false, error: err.message });
  }
}

await mkdir(path.dirname(REPORT), { recursive: true });
await appendFile(
  REPORT,
  results.map((r) => JSON.stringify({ ts: new Date().toISOString(), ...r })).join("\n") + "\n",
  "utf8"
);

const ok = results.filter((r) => r.ok);
const scaled = ok.filter((r) => r.scaled);
const onTarget = ok.filter((r) => Math.abs(r.drift_percent) <= 10);
const verified = ok.filter((r) => r.confidence === "verified");
const avg = (list, key) =>
  list.length ? Math.round(list.reduce((sum, r) => sum + r[key], 0) / list.length) : 0;

console.log(`
${ok.length}/${RUNS} succeeded · median-ish ${avg(ok, "seconds")}s per generation
${verified.length}/${ok.length} fully verified
${scaled.length}/${ok.length} had portions rescaled (${scaled.filter((r) => r.bounded).length} hit a bound)
${onTarget.length}/${ok.length} landed within 10% of target
Run \`npm run coverage\` for the ingredient backlog.`);
