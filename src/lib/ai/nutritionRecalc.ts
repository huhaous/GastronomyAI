/**
 * Recipe adapter over the food-line resolution engine
 * (`src/lib/nutrition/foodLines.ts`), which does the parsing and gram math.
 *
 * What lives here is the part that only makes sense for a generated recipe:
 * dividing by servings, and deciding when to override the macros the model
 * claimed. The LLM cannot be trusted to do arithmetic — in testing it simply
 * echoed the requested target macros back regardless of what the ingredients
 * actually add up to.
 *
 * Override policy (deliberately conservative, since silently UNDER-reporting
 * calories is the dangerous failure mode for a fat-loss app):
 *  - Every line resolved  → replace macros with the graph total ("verified").
 *  - Some lines unknown, but the verified floor already exceeds the claim
 *    → raise to the floor ("partial"); still a lower bound, but strictly closer.
 *  - Some lines unknown and the claim sits above the floor → keep the claim and
 *    report it as unverified. Never overwrite with a knowingly incomplete sum.
 */

import {
  atwaterCalories,
  computeTef,
  resolveFoodLines,
  round1,
  type LineAccounting,
  type UnresolvedLine,
} from "@/lib/nutrition/foodLines";
import type { GourmetRecipe, MacroProfile, MacroValidation } from "@/types/recipe";

export interface MacroRecalcResult {
  macros: MacroProfile;
  tef_kcal: number;
  validation: MacroValidation;
  lines: LineAccounting[];
  /** Full detail of what couldn't be priced, for the coverage log. */
  unresolved: UnresolvedLine[];
}

/** Drift below this is treated as agreement, so we don't churn on rounding. */
const AGREEMENT_THRESHOLD_PERCENT = 5;

/**
 * Recompute per-serving macros from graph data. Pure — returns what should be
 * applied without mutating the recipe.
 */
export function recalcMacrosFromGraph(recipe: GourmetRecipe): MacroRecalcResult {
  const servings = Math.max(1, recipe.servings || 1);
  const resolution = resolveFoodLines(recipe.ingredients);
  const { macros: total, verifiedCount, negligibleCount, unresolved } = resolution;

  const computed: MacroProfile = {
    calories: Math.round(total.calories / servings),
    protein_g: round1(total.protein_g / servings),
    carbs_g: round1(total.carbs_g / servings),
    fat_g: round1(total.fat_g / servings),
    fiber_g: recipe.macros.fiber_g,
  };

  const claimed = recipe.macros;
  const claimedCalories = claimed.calories || 0;
  const fullyResolved = unresolved.length === 0 && verifiedCount > 0;

  let macros: MacroProfile;
  let confidence: MacroValidation["confidence"];
  let adjusted: boolean;
  let atwaterCorrected = false;

  if (fullyResolved) {
    // Every line accounted for: the graph total is the truth.
    const drift =
      claimedCalories > 0
        ? (Math.abs(computed.calories - claimedCalories) / claimedCalories) * 100
        : 100;
    macros = computed;
    confidence = "verified";
    adjusted = drift > AGREEMENT_THRESHOLD_PERCENT;
  } else if (verifiedCount > 0 && computed.calories > claimedCalories) {
    // Incomplete, but the verified floor already beats the claim: raising the
    // number moves toward the truth, never below it.
    macros = computed;
    confidence = "partial";
    adjusted = true;
  } else {
    // Can't verify and can't prove the claim wrong — keep it, but at least make
    // it internally consistent with its own macro grams.
    const derived = atwaterCalories(claimed);
    const drift =
      claimedCalories > 0
        ? (Math.abs(derived - claimedCalories) / claimedCalories) * 100
        : 0;
    atwaterCorrected = drift > AGREEMENT_THRESHOLD_PERCENT;
    macros = atwaterCorrected ? { ...claimed, calories: derived } : claimed;
    confidence = "unverified";
    adjusted = false;
  }

  const deltaCaloriesPercent =
    claimedCalories > 0
      ? round1((Math.abs(macros.calories - claimedCalories) / claimedCalories) * 100)
      : 0;

  return {
    macros,
    // TEF is pure arithmetic on the final macros; never trust the model's value.
    tef_kcal: computeTef(macros),
    lines: resolution.lines,
    unresolved,
    validation: {
      source: "graph",
      confidence,
      adjusted,
      atwater_corrected: atwaterCorrected,
      verified_kcal: Math.round(total.calories / servings),
      resolved_ingredients: verifiedCount + negligibleCount,
      total_ingredients: recipe.ingredients.length,
      unresolved_ingredients: unresolved.map((line) => line.name),
      delta_calories_percent: deltaCaloriesPercent,
    },
  };
}

/**
 * Apply graph verification to a recipe: corrected macros, recomputed TEF, and a
 * `macro_validation` audit trail attached in every case. The full result is
 * returned alongside so callers can log coverage without recomputing.
 */
export function applyGraphRecalculation<T extends GourmetRecipe>(
  recipe: T
): { recipe: T; result: MacroRecalcResult } {
  const result = recalcMacrosFromGraph(recipe);

  return {
    recipe: {
      ...recipe,
      macros: result.macros,
      fat_loss_metrics: recipe.fat_loss_metrics
        ? { ...recipe.fat_loss_metrics, tef_kcal: result.tef_kcal }
        : recipe.fat_loss_metrics,
      macro_validation: result.validation,
    },
    result,
  };
}
