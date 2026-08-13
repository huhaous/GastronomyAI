/**
 * Rewrites a recipe's ingredient quantities so the dish actually lands on the
 * requested macro target, using the solver in `src/lib/nutrition/portionScaling`.
 *
 * Gated on full verification. If even one line is unpriced, scaling the known
 * lines toward a target would silently absorb the unknown calories and push the
 * real total below what we report — the exact failure this codebase exists to
 * prevent.
 */

import {
  parseAmount,
  resolveFoodLines,
  resolveUnitToken,
  type LineAccounting,
} from "@/lib/nutrition/foodLines";
import {
  classifyGroup,
  fatCeilingFor,
  solveScaling,
  type ScaleGroup,
} from "@/lib/nutrition/portionScaling";
import type { GourmetRecipe, MacroProfile, PortionAdjustment } from "@/types/recipe";

/** Below this drift the dish is close enough; rewriting would be noise. */
const CALORIE_TOLERANCE_PERCENT = 5;

/** Below this a line is an accent; rescaling it produces noise, not calories. */
const MIN_SCALABLE_KCAL = 15;

/** Volume measures are written in quarters ("1.25 tbsp"), weights in grams. */
const QUARTER_MEASURES = new Set(["tsp", "teaspoon", "teaspoons", "tbsp", "tablespoon", "tablespoons", "tbs", "cup", "cups"]);

const EMPTY: MacroProfile = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };

function addInto(total: MacroProfile, macros: MacroProfile): void {
  total.calories += macros.calories;
  total.protein_g += macros.protein_g;
  total.carbs_g += macros.carbs_g;
  total.fat_g += macros.fat_g;
}

/** Round to an amount a cook can actually measure. */
function roundAmount(value: number, unit: string): number {
  if (QUARTER_MEASURES.has(unit)) {
    return Math.max(0.25, Math.round(value * 4) / 4);
  }
  if (value >= 50) return Math.round(value / 5) * 5;
  if (value >= 10) return Math.round(value);
  return Math.max(0.5, Math.round(value * 2) / 2);
}

function formatAmount(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

/**
 * Update quantities embedded in step text ("sear the 200g chicken"). Only
 * rewrites a number when it is followed by the same unit, so oven temperatures
 * and timings are never touched.
 */
function rewriteInSteps(
  steps: GourmetRecipe["steps"],
  replacements: { from: string; to: string; unit: string }[]
): GourmetRecipe["steps"] {
  if (replacements.length === 0) return steps;

  return steps.map((step) => {
    let instruction = step.instruction;
    for (const { from, to, unit } of replacements) {
      const pattern = new RegExp(
        `\\b${from.replace(".", "\\.")}(\\s*)(${unit})\\b`,
        "gi"
      );
      instruction = instruction.replace(pattern, `${to}$1$2`);
    }
    return instruction === step.instruction ? step : { ...step, instruction };
  });
}

export interface PortionAdjustResult<T extends GourmetRecipe> {
  recipe: T;
  adjustment?: PortionAdjustment;
}

/**
 * Scale ingredient quantities toward the requested per-serving target. Returns
 * the recipe untouched when scaling isn't safe or isn't needed.
 */
export function adjustPortions<T extends GourmetRecipe>(
  recipe: T,
  target: Partial<MacroProfile> | undefined
): PortionAdjustResult<T> {
  if (!target?.calories || target.calories <= 0) return { recipe };

  const servings = Math.max(1, recipe.servings || 1);
  const { lines, unresolved } = resolveFoodLines(recipe.ingredients);
  if (unresolved.length > 0) return { recipe };

  const base: MacroProfile = { ...EMPTY };
  const groups: Partial<Record<ScaleGroup, MacroProfile>> = {};
  const groupOfLine = new Map<number, ScaleGroup>();

  lines.forEach((line: LineAccounting, index) => {
    if (line.status !== "verified" || !line.macros || !line.per100g) return;

    // Seasonings, count-based lines ("2 eggs") and trivial contributors all act
    // as fixed ballast that the scalable roles have to work around.
    if (
      line.aromatic ||
      line.unitKind === "count" ||
      line.macros.calories < MIN_SCALABLE_KCAL
    ) {
      addInto(base, line.macros);
      return;
    }

    const group = classifyGroup(line.per100g);
    groupOfLine.set(index, group);
    groups[group] = groups[group] ?? { ...EMPTY };
    addInto(groups[group]!, line.macros);
  });

  if (groupOfLine.size === 0) return { recipe };

  const totalTarget: Partial<MacroProfile> = {
    calories: target.calories * servings,
    protein_g: target.protein_g != null ? target.protein_g * servings : undefined,
    carbs_g: target.carbs_g != null ? target.carbs_g * servings : undefined,
    fat_g: target.fat_g != null ? target.fat_g * servings : undefined,
  };

  const before: MacroProfile = { ...base };
  for (const group of Object.keys(groups) as ScaleGroup[]) {
    addInto(before, groups[group]!);
  }

  const drift =
    (Math.abs(before.calories - totalTarget.calories!) / totalTarget.calories!) * 100;
  if (drift <= CALORIE_TOLERANCE_PERCENT) return { recipe };

  const fatMax = fatCeilingFor(groups.fat?.fat_g ?? 0, totalTarget.fat_g);

  const { factors, predicted, clamped } = solveScaling({
    base,
    groups,
    target: totalTarget,
    bounds: fatMax ? { fat: { max: fatMax } } : undefined,
  });

  const changes: string[] = [];
  const replacements: { from: string; to: string; unit: string }[] = [];

  const ingredients = recipe.ingredients.map((item, index) => {
    const group = groupOfLine.get(index);
    if (!group) return item;

    const factor = factors[group] ?? 1;
    const amount = parseAmount(item.quantity);
    if (amount == null) return item;

    const unit = resolveUnitToken(item);
    const scaled = roundAmount(amount * factor, unit);
    if (scaled === amount) return item;

    const from = formatAmount(amount);
    const to = formatAmount(scaled);
    changes.push(`${item.name} ${from}${unit} → ${to}${unit}`);
    replacements.push({ from, to, unit });

    return { ...item, quantity: to, unit };
  });

  if (changes.length === 0) return { recipe };

  const adjustment: PortionAdjustment = {
    target_calories: Math.round(target.calories),
    before_calories: Math.round(before.calories / servings),
    after_calories: Math.round(predicted.calories / servings),
    factors: (Object.keys(factors) as ScaleGroup[])
      .filter((group) => Math.abs((factors[group] ?? 1) - 1) >= 0.02)
      .map((group) => ({ group, factor: Number((factors[group] ?? 1).toFixed(2)) })),
    changes,
    bounded: clamped.length > 0,
  };

  return {
    recipe: {
      ...recipe,
      ingredients,
      steps: rewriteInSteps(recipe.steps, replacements),
      portion_adjustment: adjustment,
    },
    adjustment,
  };
}
