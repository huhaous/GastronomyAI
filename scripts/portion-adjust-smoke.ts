import { announcePlateAdditions } from "../src/lib/ai/elevationNotes";
import {
  adjustPortions,
  rebalanceProteinForStrategy,
  rewriteQuantitiesInText,
} from "../src/lib/ai/portionAdjust";
import { ensureCarbonaraEmulsion } from "../src/lib/cook/carbonaraEmulsion";
import { findIngredientNode } from "../src/data/knowledgeGraph";
import { resolveFoodLine, resolveFoodLines } from "../src/lib/nutrition/foodLines";
import { classifyGroup } from "../src/lib/nutrition/portionScaling";
import type { ElevatedRecipe } from "../src/types/recipe";

if (classifyGroup({ calories: 59, protein_g: 10.2, carbs_g: 3.6, fat_g: 0.4 }) !== "protein") {
  throw new Error("Greek yogurt must be protein, not produce");
}
if (classifyGroup({ calories: 25, protein_g: 1.9, carbs_g: 5, fat_g: 0.3 }) !== "produce") {
  throw new Error("zucchini should stay produce");
}

const rewritten = rewriteQuantitiesInText(
  "Ribbon 200g zucchini. Sear 160 g chicken. Blend 80 grams yogurt at 180C for 12 minutes.",
  [
    { from: "200", to: "600", unit: "g" },
    { from: "160", to: "300", unit: "g" },
    { from: "80", to: "240", unit: "g" },
  ]
);
if (!rewritten.includes("600g zucchini")) throw new Error(`missed 200g: ${rewritten}`);
if (!rewritten.includes("300 g chicken")) throw new Error(`missed 160 g: ${rewritten}`);
if (!rewritten.includes("240 grams yogurt")) throw new Error(`missed 80 grams: ${rewritten}`);
if (!rewritten.includes("180C") || !rewritten.includes("12 minutes")) {
  throw new Error(`touched timings: ${rewritten}`);
}

const base = {
  name: "Test Alfredo",
  tagline: "Silk from 80g yogurt over 200g zucchini.",
  total_time_minutes: 15,
  active_time_minutes: 12,
  servings: 1,
  macros: { calories: 140, protein_g: 28, carbs_g: 8, fat_g: 4 },
  fat_loss_metrics: {
    satiety_index: 8,
    satiety_label: "High",
    tef_kcal: 20,
    glycemic_impact: "low" as const,
    glycemic_note: "x",
  },
  fat_mimicry_tech: {
    title: "Yogurt silk",
    replaces: "cream",
    mechanism: "Shear 80g Greek yogurt until it coats like 80g cream.",
    mouthfeel_result: "silk",
    agents: ["80g Greek yogurt"],
  },
  culinary_physics_tips: [
    {
      technique: "Volume swap",
      explanation: "200g zucchini stands in for pasta.",
      agents: ["200g zucchini"],
      is_fat_mimicry: false,
    },
  ],
  flavor_radar: { sweet: 1, sour: 2, salty: 3, umami: 4, aroma_complexity: 5 },
  texture_balance: [],
  psychological_reward_note: "Permission, not a bowl of cream.",
  plating: { composition: "Twirl 200g ribbons around 160g chicken." },
  tools_used: ["stovetop" as const],
  ingredients: [
    { name: "Zucchini", quantity: "200", unit: "g" },
    { name: "Chicken breast", quantity: "160", unit: "g", notes: "skinless" },
    { name: "Greek yogurt", quantity: "80", unit: "g" },
  ],
  steps: [
    {
      order: 1,
      instruction: "Ribbon 200g zucchini and sear 160 g chicken.",
      tip: "The 80g yogurt is the cream.",
    },
  ],
  substitutions: [
    {
      technique: "Yogurt for cream",
      explanation: "80g yogurt replaces the Alfredo cream.",
      agents: ["80g yogurt"],
      is_fat_mimicry: true,
    },
  ],
  original_craving: "Fettuccine Alfredo",
} as ElevatedRecipe;

const { recipe, adjustment } = adjustPortions(base, {
  calories: 480,
  protein_g: 40,
});
if (!adjustment) throw new Error("expected scaling toward 480");

function grams(fragment: string): number {
  const item = recipe.ingredients.find((line) =>
    line.name.toLowerCase().includes(fragment)
  );
  return Number(item?.quantity);
}

if (grams("zucchini") > 400) {
  throw new Error(`zucchini became a trough: ${grams("zucchini")}g`);
}
if (grams("yogurt") > 150) {
  throw new Error(`yogurt sauce became a tub: ${grams("yogurt")}g`);
}
if (grams("chicken") < 160) {
  throw new Error(`chicken was cut while chasing volume: ${grams("chicken")}g`);
}

const chained = rewriteQuantitiesInText(
  "sear 160 g chicken. blend 80g yogurt",
  [
    { from: "160", to: "80", unit: "g", name: "Chicken breast" },
    { from: "80", to: "240", unit: "g", name: "Greek yogurt" },
  ]
);
if (chained !== "sear 80 g chicken. blend 240g yogurt") {
  throw new Error(`chained rewrite: ${chained}`);
}

const blob = [
  recipe.tagline,
  recipe.fat_mimicry_tech.mechanism,
  recipe.fat_mimicry_tech.agents?.join(" "),
  recipe.culinary_physics_tips[0]?.explanation,
  recipe.steps[0]?.instruction,
  recipe.steps[0]?.tip,
  recipe.plating.composition,
  recipe.substitutions[0]?.explanation,
].join("\n");

if (grams("zucchini") === 200 && grams("chicken") === 160 && grams("yogurt") === 80) {
  // possible if already close; the trough checks above still hold
} else if (/\b160\s*g\b/i.test(blob) && grams("chicken") !== 160) {
  throw new Error(`narration still has sketch chicken:\n${blob}`);
}
if (grams("yogurt") !== 80 && blob.includes("80g yogurt")) {
  throw new Error(`yogurt narration not scaled:\n${blob}`);
}

const printed = adjustPortions(
  {
    ...base,
    servings: 1,
    ingredients: [
      { name: "Zucchini", quantity: "300", unit: "g" },
      { name: "Chicken breast", quantity: "250", unit: "g", notes: "skinless" },
      { name: "Greek yogurt", quantity: "180", unit: "g" },
      { name: "Spinach", quantity: "80", unit: "g" },
    ],
  } as ElevatedRecipe,
  { calories: 480, protein_g: 40 }
).recipe;

function printedGrams(fragment: string): number {
  const item = printed.ingredients.find((line) =>
    line.name.toLowerCase().includes(fragment)
  );
  return Number(item?.quantity);
}

if (printedGrams("zucchini") > 400) {
  throw new Error(`printed zucchini ${printedGrams("zucchini")}g`);
}
if (printedGrams("yogurt") > 200) {
  throw new Error(`printed yogurt ${printedGrams("yogurt")}g`);
}
if (printedGrams("spinach") > 150) {
  throw new Error(`printed spinach ${printedGrams("spinach")}g`);
}
if (printedGrams("chicken") < 200) {
  throw new Error(`printed chicken cut to ${printedGrams("chicken")}g`);
}

const pastaPlate = {
  ...base,
  servings: 1,
  nutritional_strategy: "post_workout_high_protein" as const,
  ingredients: [
    { name: "Pasta", quantity: "85", unit: "g", notes: "dry weight" },
    { name: "Chicken breast", quantity: "90", unit: "g", notes: "skinless" },
    { name: "Greek yogurt", quantity: "80", unit: "g" },
    { name: "Spinach", quantity: "50", unit: "g" },
  ],
} as ElevatedRecipe;

const rebalanced = rebalanceProteinForStrategy(
  pastaPlate,
  { calories: 480, protein_g: 40 },
  "post_workout_high_protein"
);
const rebalancedChicken = Number(
  rebalanced.ingredients.find((line) => line.name.toLowerCase().includes("chicken"))
    ?.quantity
);
const rebalancedYogurt = Number(
  rebalanced.ingredients.find((line) => line.name.toLowerCase().includes("yogurt"))
    ?.quantity
);
if (rebalancedChicken < 150) {
  throw new Error(
    `post-workout left chicken at ${rebalancedChicken}g after pasta fill`
  );
}
if (rebalancedYogurt !== 80) {
  throw new Error(`rebalance dumped yogurt to ${rebalancedYogurt}g`);
}

const dairyOnly = {
  ...base,
  servings: 1,
  nutritional_strategy: "post_workout_high_protein" as const,
  ingredients: [
    { name: "Pasta", quantity: "90", unit: "g", notes: "dry weight" },
    { name: "Greek yogurt", quantity: "200", unit: "g" },
    { name: "Parmesan", quantity: "15", unit: "g" },
    { name: "Garlic", quantity: "5", unit: "g" },
    { name: "Lemon juice", quantity: "10", unit: "ml" },
  ],
  steps: [
    {
      order: 1,
      instruction:
        "Boil 90g dry pasta until al dente. Reserve a splash of pasta water, then drain.",
    },
    {
      order: 2,
      instruction: "Blend the Greek yogurt with lemon juice until smooth.",
    },
    {
      order: 3,
      instruction: "Add cooked fettuccine to the pan and toss well.",
    },
    {
      order: 4,
      instruction: "Toss the drained pasta with the sauce off the heat.",
    },
  ],
} as ElevatedRecipe;

const dairyBefore = resolveFoodLines(dairyOnly.ingredients);
if (dairyBefore.macros.protein_g >= 40) {
  throw new Error(
    `dairy-only fixture already has ${dairyBefore.macros.protein_g}g protein`
  );
}
const dairyFilled = rebalanceProteinForStrategy(
  dairyOnly,
  { calories: 480, protein_g: 40 },
  "post_workout_high_protein"
);
if (!dairyFilled.ingredients.some((line) => /chicken/i.test(line.name))) {
  throw new Error("dairy-only Alfredo never received lean protein");
}
const dairyAfter = resolveFoodLines(dairyFilled.ingredients);
if (dairyAfter.macros.protein_g < 40 * 0.98) {
  throw new Error(
    `protein floor missed: ${dairyAfter.macros.protein_g.toFixed(1)}g`
  );
}
const dairyYogurt = Number(
  dairyFilled.ingredients.find((line) => /yogurt/i.test(line.name))?.quantity
);
if (dairyYogurt > 200) {
  throw new Error(`protein floor grew yogurt to ${dairyYogurt}g`);
}
const dairyTosses = dairyFilled.steps.filter(
  (step) => /toss/i.test(step.instruction) && /pasta|fettuccine/i.test(step.instruction)
);
if (dairyTosses.length !== 1) {
  throw new Error(
    `expected one pasta toss after protein inject, got ${dairyTosses.length}:\n` +
      dairyFilled.steps.map((s) => s.instruction).join("\n")
  );
}

const announced = announcePlateAdditions({
  ...pastaPlate,
  substitutions: [
    {
      technique: "Yogurt for cream",
      explanation: "Greek yogurt replaces the Alfredo cream.",
      agents: ["Greek yogurt"],
      is_fat_mimicry: true,
    },
  ],
  ingredients: [
    ...pastaPlate.ingredients,
    { name: "Red pepper flakes", quantity: "1", unit: "g" },
  ],
} as ElevatedRecipe);
const notes = (announced.substitutions ?? []).map((tip) => tip.technique).join(" ");
if (!/spinach/i.test(notes)) {
  throw new Error(`spinach missing from elevation notes: ${notes}`);
}
if (!/chili/i.test(notes)) {
  throw new Error(`chili missing from elevation notes: ${notes}`);
}
const twice = announcePlateAdditions(announced);
if ((twice.substitutions ?? []).length !== (announced.substitutions ?? []).length) {
  throw new Error("elevation notes are not idempotent");
}

const bunLine = resolveFoodLine({
  name: "Whole grain burger bun",
  quantity: "1",
  unit: "g",
});
if (bunLine.status !== "verified" || (bunLine.grams ?? 0) < 60) {
  throw new Error(`1g bun must resolve as a piece, got ${bunLine.grams}g`);
}
const leafLine = resolveFoodLine({
  name: "lettuce leaves",
  quantity: "4",
  unit: "g",
});
if (leafLine.status !== "verified" || (leafLine.grams ?? 0) < 50) {
  throw new Error(`4g lettuce leaves must resolve as 4 leaves, got ${leafLine.grams}g`);
}

const burger = {
  ...base,
  name: "Test Cheeseburger",
  original_craving: "Cheeseburger",
  ingredients: [
    { name: "Whole grain burger bun", quantity: "1", unit: "g" },
    { name: "Chicken breast", quantity: "140", unit: "g" },
    { name: "Cheddar", quantity: "20", unit: "g" },
    { name: "lettuce leaves", quantity: "4", unit: "g" },
  ],
  steps: [
    { order: 1, instruction: "Toast the bun." },
    { order: 2, instruction: "Sear the chicken." },
    { order: 3, instruction: "Melt the cheddar on the patty. Place the top bun on." },
  ],
} as ElevatedRecipe;

const { recipe: scaledBurger } = adjustPortions(burger, {
  calories: 480,
  protein_g: 40,
});
const bunGrams = Number(
  scaledBurger.ingredients.find((line) => /bun/i.test(line.name))?.quantity
);
const leafGrams = Number(
  scaledBurger.ingredients.find((line) => /lettuce|greens/i.test(line.name))?.quantity
);
if (!Number.isFinite(bunGrams) || bunGrams < 70) {
  throw new Error(`bun scaled to a crumb: ${bunGrams}g`);
}
if (bunGrams % 70 !== 0) {
  throw new Error(`bun should snap to whole pieces, got ${bunGrams}g`);
}
if (!Number.isFinite(leafGrams) || leafGrams < 50) {
  throw new Error(`lettuce scaled to ${leafGrams}g instead of leaves`);
}

const mustardNode = findIngredientNode("mustard (Dijon or whole grain)");
if (!mustardNode || mustardNode.key !== "mustard") {
  throw new Error(
    `parenthetical mustard must resolve, got ${mustardNode?.key ?? "none"}`
  );
}

const carbonaraOver = {
  ...base,
  name: "Post-Workout Protein Carbonara",
  original_craving: "carbonara",
  nutritional_strategy: "post_workout_high_protein" as const,
  ingredients: [
    { name: "spaghetti", quantity: "100", unit: "g" },
    { name: "chicken breast (lean)", quantity: "250", unit: "g" },
    { name: "Greek yogurt", quantity: "120", unit: "ml" },
    { name: "spinach", quantity: "50", unit: "g" },
    { name: "mustard (Dijon or whole grain)", quantity: "1", unit: "ml" },
    { name: "mystery finishing salt", quantity: "1", unit: "g" },
  ],
} as ElevatedRecipe;

const emulsified = ensureCarbonaraEmulsion(carbonaraOver, {
  craving: "carbonara",
  targetCalories: 480,
});
if (!emulsified.ingredients.some((line) => /egg|yolk/i.test(line.name))) {
  throw new Error("carbonara never received an emulsion egg");
}

const { recipe: capped, adjustment: capAdj } = adjustPortions(emulsified, {
  calories: 480,
  protein_g: 40,
}, { strategy: "post_workout_high_protein" });
if (!capAdj) {
  throw new Error("carbonara overshoot must scale; scaler froze");
}
const cappedKcal = resolveFoodLines(capped.ingredients).macros.calories;
if (cappedKcal > 480 * 1.05) {
  throw new Error(`calorie hard cap missed: ${cappedKcal} kcal vs 480`);
}
const cappedProtein = resolveFoodLines(capped.ingredients).macros.protein_g;
if (cappedProtein < 40 * 0.98) {
  throw new Error(`protein floor lost while capping: ${cappedProtein.toFixed(1)}g`);
}
const cappedChicken = Number(
  capped.ingredients.find((line) => /chicken/i.test(line.name))?.quantity
);
if (cappedChicken >= 250) {
  throw new Error(`surplus chicken was locked at ${cappedChicken}g`);
}

console.log(adjustment.changes.join("; "));
console.log("OK");
