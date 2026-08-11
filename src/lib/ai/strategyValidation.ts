/**
 * Validates a final (graph-verified) macro split against the FAT_LOSS_RULES for
 * the requested nutritional strategy.
 *
 * Injecting constraints into the prompt is not enough on its own — in testing a
 * post-workout recipe came back with no carbohydrate source at all despite the
 * rule demanding one. This closes the loop by checking the result.
 *
 * Only `enforcedBounds` are checked, not the full target ranges: a warning that
 * fires on harmless deviations (extra protein, less fat) teaches users to
 * dismiss warnings, which costs more than it catches.
 */

import { FAT_LOSS_RULES } from "@/data/knowledgeGraph";
import type {
  MacroProfile,
  NutritionalStrategy,
  StrategyValidation,
} from "@/types/nutrition";

function percentOfCalories(kcalFromMacro: number, totalCalories: number): number {
  if (totalCalories <= 0) return 0;
  return Math.round((kcalFromMacro / totalCalories) * 100);
}

/**
 * Compare a macro split against the strategy's enforced bounds. Takes macros
 * rather than a recipe because the same bounds describe a day's total just as
 * well as a single plate.
 *
 * Returns undefined when no strategy was requested.
 */
export function validateAgainstStrategy(
  macros: MacroProfile,
  strategy?: NutritionalStrategy
): StrategyValidation | undefined {
  if (!strategy) return undefined;

  const rule = FAT_LOSS_RULES[strategy];
  if (!rule) return undefined;

  const bounds = rule.enforcedBounds;

  // Carb ceilings are judged on net carbs: fibrous volume ingredients like
  // konjac and cauliflower otherwise look like a carb load they aren't.
  const netCarbs = Math.max(0, macros.carbs_g - (macros.fiber_g ?? 0));

  const proteinPercent = percentOfCalories(macros.protein_g * 4, macros.calories);
  const carbsPercent = percentOfCalories(macros.carbs_g * 4, macros.calories);
  const netCarbsPercent = percentOfCalories(netCarbs * 4, macros.calories);
  const fatPercent = percentOfCalories(macros.fat_g * 9, macros.calories);

  const violations: string[] = [];

  if (proteinPercent < bounds.proteinMinPercent) {
    violations.push(
      `Protein is only ${proteinPercent}% of calories — ${rule.label} needs at least ${bounds.proteinMinPercent}%.`
    );
  }
  if (fatPercent > bounds.fatMaxPercent) {
    violations.push(
      `Fat is ${fatPercent}% of calories, above the ${bounds.fatMaxPercent}% ceiling for ${rule.label}.`
    );
  }
  if (netCarbsPercent > bounds.carbMaxPercent) {
    violations.push(
      `Net carbs are ${netCarbsPercent}% of calories, above the ${bounds.carbMaxPercent}% ceiling for ${rule.label}.`
    );
  }
  if (
    bounds.carbMinPercent != null &&
    netCarbsPercent < bounds.carbMinPercent
  ) {
    violations.push(
      `Net carbs are only ${netCarbsPercent}% of calories — ${rule.label} needs at least ${bounds.carbMinPercent}% for glycogen resynthesis.`
    );
  }

  return {
    strategy,
    in_compliance: violations.length === 0,
    protein_percent: proteinPercent,
    carbs_percent: carbsPercent,
    net_carbs_percent: netCarbsPercent,
    fat_percent: fatPercent,
    violations,
  };
}
