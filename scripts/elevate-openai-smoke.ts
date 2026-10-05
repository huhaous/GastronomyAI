/**
 * One Elevate against the configured cloud model (live test plate).
 * Loads nothing itself — run with: node --env-file=.env.local ...
 */

import { elevateCravingRecipe } from "../src/lib/ai/openai";
import { getLlmConfig } from "../src/lib/ai/config";

async function main() {
  const config = getLlmConfig();
  if (config.provider !== "openai") {
    throw new Error(
      `Expected LLM_PROVIDER=openai, got "${config.provider}". Check .env.local (a trailing #comment on the same line is part of the value).`
    );
  }
  console.log(`provider=${config.provider} model=${config.model}`);

  const { recipe, model } = await elevateCravingRecipe({
    craving_meal: "Fettuccine Alfredo",
    target_macros: { calories: 480, protein_g: 40 },
    kitchen_tools: ["stovetop", "oven"],
    time_limit_minutes: 15,
    nutritional_strategy: "balanced_deficit",
    allow_specialty: false,
    effort: "weeknight",
  });

  const names = recipe.ingredients.map((line) => line.name).join(", ");
  const steps = recipe.steps.map((step) => step.instruction);
  const joined = `${recipe.name} ${names} ${steps.join(" ")}`.toLowerCase();

  const checks = [
    ["pasta on the plate", /pasta|fettuccine|spaghetti|linguini|linguine/.test(joined)],
    ["not a bun swap", !/bun|burger/.test(names.toLowerCase())],
    ["weeknight step count ≤ 4", recipe.steps.length <= 4],
    ["calories ≤ 504 (480+5%)", recipe.macros.calories <= 504],
    ["protein ≥ 40", recipe.macros.protein_g >= 40],
  ] as const;

  console.log(`composed with ${model}`);
  console.log(`name: ${recipe.name}`);
  console.log(
    `macros: ${Math.round(recipe.macros.calories)} kcal · ${recipe.macros.protein_g}P / ${recipe.macros.carbs_g}C / ${recipe.macros.fat_g}F`
  );
  console.log(`ingredients: ${names}`);
  console.log(`steps (${recipe.steps.length}):`);
  for (const step of recipe.steps) {
    console.log(`  ${step.order}. ${step.instruction}`);
  }
  console.log("checks:");
  let failed = false;
  for (const [label, ok] of checks) {
    console.log(`  ${ok ? "ok" : "MISS"}  ${label}`);
    if (!ok) failed = true;
  }
  if (failed) process.exitCode = 2;
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exit(1);
});
