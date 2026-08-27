/**
 * Carbonara is an emulsion, not yogurt thinned with mustard.
 *
 * The fat-loss plate still uses Greek yogurt as the bulk, but a small egg
 * (liquid whites, or one yolk when the fat budget allows) supplies the lecithin
 * and protein set that makes pasta water cling. Residual heat only — a live
 * flame scrambles it.
 */

import { findIngredientNode } from "@/data/knowledgeGraph";
import { resolveFoodLines } from "@/lib/nutrition/foodLines";
import type { GourmetRecipe, RecipeIngredient } from "@/types/recipe";

const CARBONARA = /carbonara/i;
const COLD_DAIRY = /yogurt|yoghurt|cottage cheese|quark|fromage blanc/i;

const WHITE_GRAMS = 35;
const YOLK_GRAMS = 17;
/** Room for a 17g yolk (~4.5g fat) without crossing a 25% fat share. */
const YOLK_FAT_BUDGET_PERCENT = 18;

export interface CarbonaraEmulsionOptions {
  craving?: string;
  targetCalories?: number;
}

function plateText<T extends GourmetRecipe>(recipe: T, craving?: string): string {
  const original =
    "original_craving" in recipe
      ? String((recipe as { original_craving?: string }).original_craving ?? "")
      : "";
  return `${craving ?? ""} ${original} ${recipe.name}`;
}

function hasPasta<T extends GourmetRecipe>(recipe: T): boolean {
  return recipe.ingredients.some((line) => {
    const node = findIngredientNode(line.name);
    return (
      node?.handling?.starchCook === "boil_reserve_toss" && !node.handling.volumeNoodle
    );
  });
}

function hasYogurtSauce<T extends GourmetRecipe>(recipe: T): boolean {
  return recipe.ingredients.some((line) => COLD_DAIRY.test(line.name));
}

export function emulsionEggOnPlate<T extends GourmetRecipe>(
  recipe: T
): RecipeIngredient | undefined {
  return recipe.ingredients.find((line) => {
    const node = findIngredientNode(line.name);
    return node?.handling?.emulsionRole === "lecithin";
  });
}

function wantsCarbonara<T extends GourmetRecipe>(
  recipe: T,
  craving?: string
): boolean {
  return CARBONARA.test(plateText(recipe, craving));
}

function chooseEmulsionEgg<T extends GourmetRecipe>(
  recipe: T,
  targetCalories?: number
): RecipeIngredient {
  const servings = Math.max(1, recipe.servings || 1);
  const priced = resolveFoodLines(recipe.ingredients);
  const fatG = priced.macros.fat_g / servings;
  const cap = targetCalories && targetCalories > 0 ? targetCalories : 480;
  const fatPercent = cap > 0 ? ((fatG * 9) / cap) * 100 : 100;

  if (fatPercent <= YOLK_FAT_BUDGET_PERCENT) {
    return {
      name: "Egg yolk",
      quantity: String(YOLK_GRAMS),
      unit: "g",
      notes: "1 yolk",
    };
  }

  return {
    name: "Egg Whites",
    quantity: String(WHITE_GRAMS),
    unit: "g",
    notes: "liquid, carbonara set",
  };
}

function uniqueAgents(agents: string[] | undefined, extra: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const agent of [...(agents ?? []), ...extra]) {
    const key = agent.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(agent);
  }
  return out;
}

function stampMimicry<T extends GourmetRecipe>(recipe: T, eggName: string): T {
  const yolk = /yolk/i.test(eggName);
  return {
    ...recipe,
    fat_mimicry_tech: {
      ...recipe.fat_mimicry_tech,
      title: "Yogurt–egg carbonara emulsion",
      replaces: recipe.fat_mimicry_tech?.replaces || "Egg-and-guanciale carbonara",
      mechanism: yolk
        ? "Lecithin from one egg yolk and shear from Greek yogurt bind reserved pasta water into a glossy, yellow coating. Residual heat sets the emulsion; a live flame scrambles it."
        : "Liquid egg whites and Greek yogurt bind reserved pasta water into a carbonara set without a fat spike. Residual heat only — never scramble.",
      mouthfeel_result: yolk
        ? "Silk that clings like classic carbonara, pale gold from the yolk, without a cream or pancetta fat spike."
        : "A clingy carbonara set from egg white and pasta water, richness from yogurt instead of pork fat.",
      agents: uniqueAgents(recipe.fat_mimicry_tech?.agents, [
        "Greek yogurt",
        eggName,
        "pasta water",
      ]),
    },
  };
}

/**
 * If the craving is carbonara and the plate already has pasta + yogurt, put the
 * emulsion egg on the list so the scaler prices it and the method can compile
 * an off-heat blend. Idempotent once an egg is present.
 */
export function ensureCarbonaraEmulsion<T extends GourmetRecipe>(
  recipe: T,
  options?: CarbonaraEmulsionOptions
): T {
  if (!wantsCarbonara(recipe, options?.craving)) return recipe;
  if (!hasPasta(recipe) || !hasYogurtSauce(recipe)) return recipe;

  const existing = emulsionEggOnPlate(recipe);
  if (existing) {
    return stampMimicry(recipe, existing.name);
  }

  const egg = chooseEmulsionEgg(recipe, options?.targetCalories);
  return stampMimicry(
    { ...recipe, ingredients: [...recipe.ingredients, egg] },
    egg.name
  );
}
