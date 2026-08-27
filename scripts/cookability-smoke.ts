import {
  batchHostileIngredientNames,
  specialtyIngredientNames,
} from "../src/data/knowledgeGraph";
import { validateCookability } from "../src/lib/cookability";
import type { GourmetRecipe } from "../src/types/recipe";

const names = specialtyIngredientNames();
if (!names.includes("Xanthan Gum") || !names.includes("Konjac / Shirataki Noodles")) {
  throw new Error(`missing specialty nodes: ${names.join(", ")}`);
}

const hostile = batchHostileIngredientNames();
for (const expected of [
  "Avocado",
  "Cucumber",
  "Mixed Greens",
  "White Fish (cod/tilapia)",
  "Whole Wheat Burger Bun",
]) {
  if (!hostile.includes(expected)) {
    throw new Error(`missing same-day node ${expected}: ${hostile.join(", ")}`);
  }
}

const base = {
  name: "Test",
  tagline: "",
  total_time_minutes: 40,
  active_time_minutes: 20,
  servings: 1,
  macros: { calories: 400, protein_g: 40, carbs_g: 20, fat_g: 10 },
  fat_loss_metrics: {
    satiety_index: 8,
    satiety_label: "High",
    tef_kcal: 40,
    glycemic_impact: "low" as const,
    glycemic_note: "x",
  },
  fat_mimicry_tech: {
    title: "Yogurt",
    replaces: "cream",
    mechanism: "blend",
    mouthfeel_result: "silk",
    agents: ["yogurt"],
  },
  culinary_physics_tips: [],
  flavor_radar: { sweet: 1, sour: 2, salty: 3, umami: 4, aroma_complexity: 5 },
  texture_balance: [],
  psychological_reward_note: "",
  plating: { composition: "x" },
  tools_used: ["stovetop" as const],
};

const bad = {
  ...base,
  ingredients: [
    { name: "Chicken breast", quantity: "200", unit: "g" },
    { name: "Xanthan Gum", quantity: "2", unit: "g" },
  ],
  steps: [1, 2, 3, 4, 5, 6, 7].map((n) => ({
    order: n,
    instruction: `step ${n}`,
  })),
} as GourmetRecipe;

const v = validateCookability(bad, { allowSpecialty: false, effort: "weeknight" });
if (v.supermarket) throw new Error("xanthan should fail supermarket");
if (v.weeknight) throw new Error("7 steps should fail weeknight");
if (!v.batch) throw new Error("weeknight plates should not fail batch");

const ok = validateCookability(
  {
    ...base,
    ingredients: [{ name: "Chicken breast", quantity: "200", unit: "g" }],
    steps: bad.steps.slice(0, 4),
  } as GourmetRecipe
);
if (!ok.supermarket || !ok.weeknight || !ok.batch) {
  throw new Error("plain chicken should pass");
}

const salad = validateCookability(
  {
    ...base,
    servings: 1,
    ingredients: [
      { name: "Mixed Greens", quantity: "80", unit: "g" },
      { name: "Chicken breast", quantity: "180", unit: "g" },
    ],
    steps: [{ order: 1, instruction: "Toss and serve." }],
  } as GourmetRecipe,
  { effort: "batch" }
);
if (salad.batch) throw new Error("dressed greens at 1 serving should fail batch");
if (!salad.weeknight) throw new Error("batch effort should not fail weeknight");

const tray = validateCookability(
  {
    ...base,
    servings: 4,
    ingredients: [
      { name: "Chicken breast", quantity: "720", unit: "g" },
      { name: "White Rice (dry)", quantity: "240", unit: "g" },
    ],
    steps: [
      { order: 1, instruction: "Season the chicken." },
      { order: 2, instruction: "Roast with the rice." },
      {
        order: 3,
        instruction: "Pack four containers. Reheat 3 minutes from the fridge.",
      },
    ],
  } as GourmetRecipe,
  { effort: "batch", timeLimitMinutes: 60 }
);
if (!tray.batch || !tray.supermarket) {
  throw new Error(`chicken rice batch should pass: ${tray.violations.join("; ")}`);
}

const longBatch = validateCookability(
  {
    ...base,
    servings: 4,
    ingredients: [{ name: "Chicken breast", quantity: "720", unit: "g" }],
    steps: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
      order: n,
      instruction: n === 8 ? "Pack and reheat from the fridge." : `step ${n}`,
    })),
  } as GourmetRecipe,
  { effort: "batch" }
);
if (!longBatch.weeknight) throw new Error("batch may exceed 6 steps");
if (!longBatch.batch) {
  throw new Error(`8-step batch with reheat should pass: ${longBatch.violations.join("; ")}`);
}

console.log(`specialty: ${names.join(", ")}`);
console.log(`same-day: ${hostile.join(", ")}`);
console.log("OK");
