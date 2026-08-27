/**
 * One-shot check that the Thai shrimp/konjac undershoot gets a flavor-aligned
 * closer, and that rest-day low-carb does not get a rice pour.
 */
import { applyGapFill, suggestGapFillers } from "../src/lib/nutrition/gapFill";
import { resolveFoodLines } from "../src/lib/nutrition/foodLines";
import type { GourmetRecipe } from "../src/types/recipe";

const lines = [
  { name: "Shrimp", quantity: "200", unit: "g" },
  { name: "Konjac noodles", quantity: "200", unit: "g" },
  { name: "Bok choy", quantity: "150", unit: "g" },
  { name: "Ginger", quantity: "10", unit: "g" },
  { name: "Soy sauce", quantity: "15", unit: "ml" },
  { name: "Sesame oil", quantity: "5", unit: "ml" },
];

const resolved = resolveFoodLines(lines);
const macros = {
  calories: Math.round(resolved.macros.calories),
  protein_g: resolved.macros.protein_g,
  carbs_g: resolved.macros.carbs_g,
  fat_g: resolved.macros.fat_g,
};

const shrimpBowl = {
  lines,
  macros,
  servings: 1,
  target: { calories: 700, protein_g: 50, carbs_g: 60, fat_g: 25 },
  pantry: [
    "shrimp",
    "konjac noodles",
    "bok choy",
    "ginger",
    "soy sauce",
    "sesame oil",
  ],
};

console.log(
  `plate ${macros.calories} kcal  P${macros.protein_g.toFixed(0)} C${macros.carbs_g.toFixed(0)} F${macros.fat_g.toFixed(0)}  unresolved=${resolved.unresolved.map((u) => u.name).join(",") || "none"}`
);

const balanced = suggestGapFillers({
  ...shrimpBowl,
  strategy: "balanced_deficit",
});
const restDay = suggestGapFillers({
  ...shrimpBowl,
  strategy: "rest_day_low_carb",
});
const scaled = suggestGapFillers({
  ...shrimpBowl,
  macros: {
    calories: 538,
    protein_g: 55,
    carbs_g: 18,
    fat_g: 16,
  },
  strategy: "balanced_deficit",
});
const restDayScaled = suggestGapFillers({
  ...shrimpBowl,
  macros: {
    calories: 538,
    protein_g: 55,
    carbs_g: 18,
    fat_g: 16,
  },
  strategy: "rest_day_low_carb",
});

function show(
  label: string,
  rows: ReturnType<typeof suggestGapFillers>
) {
  console.log(`\n${label}`);
  if (rows.length === 0) {
    console.log("  (none)");
    return;
  }
  for (const row of rows) {
    console.log(
      `  ${row.kind} ${row.grams}g ${row.ingredient}` +
        `${row.replaces ? ` (for ${row.replaces})` : ""}` +
        ` → ${row.resulting_calories} kcal` +
        `${row.closes_gap ? " [closes]" : ""}` +
        `\n    ${row.flavor_note}`
    );
  }
}

show("balanced_deficit", balanced);
show("rest_day_low_carb", restDay);
show("balanced after scaling to 538", scaled);
show("rest-day after scaling to 538", restDayScaled);

if (balanced.length === 0) {
  console.error("\nFAIL: balanced shrimp bowl got no suggestions.");
  process.exit(1);
}
if (scaled.length === 0) {
  console.error("\nFAIL: 538 kcal plate got no suggestions.");
  process.exit(1);
}
if (!scaled.some((s) => s.closes_gap)) {
  console.error("\nFAIL: 162 kcal gap produced no closer.");
  process.exit(1);
}
if (!scaled.some((s) => s.kind === "swap" && /rice|pasta/i.test(s.ingredient))) {
  console.error("\nFAIL: balanced plate should offer a noodle-for-noodle swap.");
  process.exit(1);
}
if (restDayScaled.some((s) => s.ingredient.toLowerCase().includes("rice") && s.grams > 40)) {
  console.error("\nFAIL: rest-day suggested a real rice portion, not a token amount.");
  process.exit(1);
}

const alfredoLines = [
  { name: "Zucchini", quantity: "250", unit: "g" },
  { name: "Chicken breast", quantity: "180", unit: "g" },
  { name: "Greek yogurt", quantity: "160", unit: "g" },
];
const alfredoResolved = resolveFoodLines(alfredoLines);
const alfredoMacros = {
  calories: Math.round(alfredoResolved.macros.calories),
  protein_g: alfredoResolved.macros.protein_g,
  carbs_g: alfredoResolved.macros.carbs_g,
  fat_g: alfredoResolved.macros.fat_g,
};
const alfredoSuggestions = suggestGapFillers({
  lines: alfredoLines,
  macros: alfredoMacros,
  servings: 1,
  target: { calories: 480, protein_g: 40 },
  strategy: "post_workout_high_protein",
  effort: "weeknight",
  craving: "Fettuccine Alfredo",
});
if (!alfredoSuggestions.some((s) => /pasta/i.test(s.ingredient))) {
  console.error("\nFAIL: Alfredo craving should prefer pasta, got:");
  console.error(alfredoSuggestions.map((s) => s.ingredient).join(", ") || "(none)");
  process.exit(1);
}

const chosen = alfredoSuggestions.find((s) => /pasta/i.test(s.ingredient))!;
const baseRecipe = {
  name: "Test",
  tagline: "",
  total_time_minutes: 15,
  active_time_minutes: 12,
  servings: 1,
  macros: alfredoMacros,
  fat_loss_metrics: {
    satiety_index: 8,
    satiety_label: "High",
    tef_kcal: 20,
    glycemic_impact: "low" as const,
    glycemic_note: "x",
  },
  fat_mimicry_tech: {
    title: "Yogurt",
    replaces: "cream",
    mechanism: "blend",
    mouthfeel_result: "silk",
  },
  ingredients: alfredoLines,
  steps: [
    { order: 1, instruction: "Spiralize the zucchini into noodles." },
    { order: 2, instruction: "Sear the chicken." },
    {
      order: 3,
      instruction: "Toss the zucchini ribbons with the sauce.",
    },
    { order: 4, instruction: "Plate the zucchini ribbons and serve." },
    {
      order: 5,
      instruction:
        "Slice the cooked chicken into medallions and add to the zucchini mixture.",
    },
  ],
  culinary_physics_tips: [],
  flavor_radar: { sweet: 1, sour: 2, salty: 3, umami: 4, aroma_complexity: 5 },
  texture_balance: [],
  psychological_reward_note: "",
  plating: { composition: "zucchini ribbons in a wide bowl" },
  tools_used: ["stovetop" as const],
};

const { recipe: applied } = applyGapFill(baseRecipe as GourmetRecipe, chosen);
if (!applied.ingredients.some((line) => /pasta/i.test(line.name))) {
  console.error("\nFAIL: pasta never landed on the ingredient list.");
  process.exit(1);
}
if (applied.ingredients.some((line) => /zucchini/i.test(line.name))) {
  console.error("\nFAIL: zucchini still on the list after a pasta swap.");
  process.exit(1);
}
if (!applied.steps.some((step) => /boil/i.test(step.instruction))) {
  console.error("\nFAIL: boil step missing:\n", applied.steps.map((s) => s.instruction).join("\n"));
  process.exit(1);
}
if (applied.steps.some((step) => /zucchini/i.test(step.instruction))) {
  console.error(
    "\nFAIL: canonical steps still mention zucchini:\n",
    applied.steps.map((s) => s.instruction).join("\n")
  );
  process.exit(1);
}
const pastaTosses = applied.steps.filter(
  (step) => /toss/i.test(step.instruction) && /pasta/i.test(step.instruction)
);
if (pastaTosses.length > 1) {
  console.error(
    "\nFAIL: duplicate pasta toss:\n",
    applied.steps.map((s) => s.instruction).join("\n")
  );
  process.exit(1);
}
if (
  !applied.steps.some(
    (step) =>
      /chicken/i.test(step.instruction) &&
      /slice|fold|add/i.test(step.instruction)
  )
) {
  console.error(
    "\nFAIL: chicken never returns to the pasta:\n",
    applied.steps.map((s) => s.instruction).join("\n")
  );
  process.exit(1);
}
if (/zucchini/i.test(applied.plating.composition)) {
  console.error("\nFAIL: plating still mentions zucchini:", applied.plating.composition);
  process.exit(1);
}
const appliedText = applied.steps.map((s) => s.instruction).join("\n");
if (/chop.{0,40}pasta|pasta strips/i.test(appliedText)) {
  console.error("\nFAIL: pasta inherited zucchini-noodle verbs:\n", appliedText);
  process.exit(1);
}
const appliedBoil = applied.steps.findIndex((step) => /\bboil\b/i.test(step.instruction));
const appliedToss = applied.steps.findIndex(
  (step) => /\btoss\b/i.test(step.instruction) && /pasta/i.test(step.instruction)
);
const appliedServe = applied.steps.findIndex((step) =>
  /^(plate|serve)\b|\bserve immediately\b/i.test(step.instruction.trim())
);
if (appliedBoil !== 0) {
  console.error(`\nFAIL: pasta boil must lead the method, was ${appliedBoil}:\n`, appliedText);
  process.exit(1);
}
if (appliedToss >= 0 && appliedServe >= 0 && appliedToss > appliedServe) {
  console.error("\nFAIL: pasta tossed after plating:\n", appliedText);
  process.exit(1);
}

const twoServings = applyGapFill(
  { ...baseRecipe, servings: 2 } as GourmetRecipe,
  chosen
);
const pastaLine = twoServings.recipe.ingredients.find((line) =>
  /pasta/i.test(line.name)
);
const expectedPot = twoServings.gramsInRecipe;
if (!pastaLine || Number(pastaLine.quantity) !== expectedPot) {
  console.error(
    `\nFAIL: 2-serving list should be ${expectedPot}g pasta, got ${pastaLine?.quantity}`
  );
  process.exit(1);
}
if (expectedPot === chosen.grams) {
  console.error("\nFAIL: pot grams were not scaled by servings.");
  process.exit(1);
}
if (/\(dry\)/i.test(pastaLine.name)) {
  console.error("\nFAIL: list should not keep the graph dry qualifier:", pastaLine.name);
  process.exit(1);
}
if (!pastaLine.notes?.toLowerCase().includes("dry weight")) {
  console.error("\nFAIL: list should mark dry weight in notes:", pastaLine.notes);
  process.exit(1);
}
if (twoServings.recipe.steps.some((step) => /\(dry\)/i.test(step.instruction))) {
  console.error(
    "\nFAIL: steps still say (dry):\n",
    twoServings.recipe.steps.map((s) => s.instruction).join("\n")
  );
  process.exit(1);
}
if (twoServings.recipe.steps.some((step) => /zucchini/i.test(step.instruction))) {
  console.error(
    "\nFAIL: canonical steps still mention zucchini:\n",
    twoServings.recipe.steps.map((s) => s.instruction).join("\n")
  );
  process.exit(1);
}
const boilSteps = twoServings.recipe.steps.filter((step) =>
  /boil\s+\d+\s*g/i.test(step.instruction)
);
if (boilSteps.length !== 1) {
  console.error(
    "\nFAIL: expected one boil step, got:\n",
    twoServings.recipe.steps.map((s) => s.instruction).join("\n")
  );
  process.exit(1);
}
if (!boilSteps[0].instruction.includes(`${expectedPot}g`)) {
  console.error("\nFAIL: boil step grams mismatch:", boilSteps[0].instruction);
  process.exit(1);
}
if (!/dry pasta/i.test(boilSteps[0].instruction)) {
  console.error("\nFAIL: boil should weigh dry pasta:", boilSteps[0].instruction);
  process.exit(1);
}
const alt = twoServings.recipe.method_alternate;
if (!alt) {
  console.error("\nFAIL: swap should keep the pre-swap plate as method_alternate.");
  process.exit(1);
}
if (!alt.ingredients.some((line) => /zucchini/i.test(line.name))) {
  console.error("\nFAIL: alternate list lost zucchini.");
  process.exit(1);
}
if (alt.ingredients.some((line) => /pasta/i.test(line.name))) {
  console.error("\nFAIL: alternate list should not already be the pasta plate.");
  process.exit(1);
}
if (!alt.steps.some((step) => /spiraliz/i.test(step.instruction))) {
  console.error(
    "\nFAIL: alternate should keep the original zucchini method:\n",
    alt.steps.map((s) => s.instruction).join("\n")
  );
  process.exit(1);
}

const burgerLines = [
  { name: "Whole Wheat Burger Bun", quantity: "70", unit: "g", notes: "1 bun" },
  { name: "Chicken breast", quantity: "140", unit: "g" },
  { name: "Cheddar", quantity: "15", unit: "g" },
  { name: "Mixed Greens", quantity: "60", unit: "g", notes: "4 leaves" },
];
const burgerResolved = resolveFoodLines(burgerLines);
const burgerMacros = {
  calories: Math.round(burgerResolved.macros.calories),
  protein_g: burgerResolved.macros.protein_g,
  carbs_g: burgerResolved.macros.carbs_g,
  fat_g: burgerResolved.macros.fat_g,
};
const burgerFill = {
  lines: burgerLines,
  macros: burgerMacros,
  servings: 1,
  target: { calories: 480, protein_g: 40 },
  strategy: "post_workout_high_protein" as const,
  effort: "weeknight" as const,
};
const burgerSuggestions = suggestGapFillers(burgerFill);
const leftoverAlfredo = suggestGapFillers({
  ...burgerFill,
  craving: "Fettuccine Alfredo",
});
const burgerCraving = suggestGapFillers({
  ...burgerFill,
  craving: "Cheeseburger",
});

function hasForeignStarch(
  rows: ReturnType<typeof suggestGapFillers>
): string | undefined {
  return rows.find((row) => /pasta|quinoa|rice/i.test(row.ingredient))?.ingredient;
}

if (hasForeignStarch(burgerSuggestions)) {
  console.error(
    `\nFAIL: bun plate added ${hasForeignStarch(burgerSuggestions)} instead of more bun.`
  );
  process.exit(1);
}
if (hasForeignStarch(leftoverAlfredo)) {
  console.error(
    `\nFAIL: leftover Alfredo craving injected ${hasForeignStarch(leftoverAlfredo)} onto a burger.`
  );
  process.exit(1);
}
if (hasForeignStarch(burgerCraving)) {
  console.error(
    `\nFAIL: cheeseburger craving added ${hasForeignStarch(burgerCraving)}.`
  );
  process.exit(1);
}

const zucchiniBurgerLines = [
  { name: "Zucchini", quantity: "200", unit: "g" },
  { name: "Chicken breast", quantity: "180", unit: "g" },
  { name: "Greek yogurt", quantity: "120", unit: "g" },
];
const zucchiniBurgerResolved = resolveFoodLines(zucchiniBurgerLines);
const zucchiniBurgerMacros = {
  calories: Math.round(zucchiniBurgerResolved.macros.calories),
  protein_g: zucchiniBurgerResolved.macros.protein_g,
  carbs_g: zucchiniBurgerResolved.macros.carbs_g,
  fat_g: zucchiniBurgerResolved.macros.fat_g,
};
const zucchiniBurgerSuggestions = suggestGapFillers({
  lines: zucchiniBurgerLines,
  macros: zucchiniBurgerMacros,
  servings: 1,
  target: { calories: 480, protein_g: 40 },
  strategy: "balanced_deficit",
  effort: "weeknight",
  craving: "cheese burger",
  dish: "Zucchini Chicken Burger",
});
if (hasForeignStarch(zucchiniBurgerSuggestions)) {
  console.error(
    `\nFAIL: zucchini-as-bun burger swapped in ${hasForeignStarch(zucchiniBurgerSuggestions)}.`
  );
  process.exit(1);
}
if (
  !zucchiniBurgerSuggestions.some(
    (row) => /bun/i.test(row.ingredient) && row.kind === "swap"
  )
) {
  console.error(
    "\nFAIL: burger calorie gap should swap zucchini for a bun, got:",
    zucchiniBurgerSuggestions.map((s) => `${s.kind} ${s.ingredient}`).join(", ") ||
      "(none)"
  );
  process.exit(1);
}

const burgerRecipe = {
  ...baseRecipe,
  name: "Test Burger",
  ingredients: burgerLines,
  steps: [
    { order: 1, instruction: "Toast the bun cut-side down." },
    { order: 2, instruction: "Sear the chicken until browned." },
    { order: 3, instruction: "Melt the cheddar on the patty." },
    { order: 4, instruction: "Pile the greens on the bottom bun." },
    { order: 5, instruction: "Add the patty." },
    { order: 6, instruction: "Place the top bun on." },
  ],
  plating: { composition: "stacked burger" },
} as GourmetRecipe;

const quinoaForced = applyGapFill(burgerRecipe, {
  kind: "add",
  ingredient: "Quinoa (dry)",
  grams: 25,
  calories_added: 92,
  resulting_calories: burgerMacros.calories + 92,
  flavor_note: "test",
  closes_gap: false,
});
if (quinoaForced.recipe.ingredients.some((line) => /quinoa/i.test(line.name))) {
  console.error("\nFAIL: quinoa stayed on a bun plate after applyGapFill.");
  process.exit(1);
}
if (quinoaForced.recipe.steps.some((step) => /quinoa/i.test(step.instruction))) {
  console.error(
    "\nFAIL: quinoa cook survived on a burger:\n",
    quinoaForced.recipe.steps.map((s) => s.instruction).join("\n")
  );
  process.exit(1);
}

const bowlRecipe = {
  ...baseRecipe,
  name: "Test Bowl",
  ingredients: [
    { name: "Chicken breast", quantity: "160", unit: "g" },
    { name: "Bok choy", quantity: "150", unit: "g" },
    { name: "Soy sauce", quantity: "15", unit: "ml" },
  ],
  steps: [
    { order: 1, instruction: "Sear the chicken until browned." },
    { order: 2, instruction: "Wilt the bok choy in the pan." },
    { order: 3, instruction: "Add the soy sauce and toss." },
    { order: 4, instruction: "Slice the chicken." },
    { order: 5, instruction: "Fold the chicken through the greens." },
    { order: 6, instruction: "Place the top bun on." },
  ],
  plating: { composition: "bowl" },
} as GourmetRecipe;

const quinoaBowl = applyGapFill(bowlRecipe, {
  kind: "add",
  ingredient: "Quinoa (dry)",
  grams: 25,
  calories_added: 92,
  resulting_calories: 400,
  flavor_note: "test",
  closes_gap: false,
});
const bowlMethod = quinoaBowl.recipe.steps.map((step) => step.instruction);
const quinoaCookAt = bowlMethod.findIndex((text) => /quinoa/i.test(text));
const assembleAt = bowlMethod.findIndex((text) => /place the top bun/i.test(text));
if (quinoaCookAt < 0) {
  console.error("\nFAIL: quinoa cook step missing on a grainless plate:\n", bowlMethod.join("\n"));
  process.exit(1);
}
if (assembleAt >= 0 && quinoaCookAt > assembleAt) {
  console.error(
    "\nFAIL: quinoa cooked after assembly:\n",
    bowlMethod.join("\n")
  );
  process.exit(1);
}
if (assembleAt >= 0 && /quinoa/i.test(bowlMethod[assembleAt] ?? "")) {
  console.error(
    "\nFAIL: quinoa concatenated onto assembly:\n",
    bowlMethod[assembleAt]
  );
  process.exit(1);
}

console.log("\nOK");
