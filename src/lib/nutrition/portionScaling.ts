/**
 * Solves how much of each ingredient a dish needs to land on a macro target.
 *
 * The model picks quantities that look plausible and then reports whatever
 * macros were asked for, so a 600 kcal request routinely arrives as a 354 kcal
 * plate. Once the graph has priced every line, hitting the target is arithmetic:
 * find a multiplier per ingredient role such that the totals land where the user
 * asked.
 *
 * Roles rather than individual lines, because scaling ingredients independently
 * destroys the dish — doubling the chicken and halving the sauce is a different
 * recipe. Scaling the protein group as a unit preserves the chef's proportions
 * inside each role while letting the macro split move.
 *
 * Like the rest of this directory, it knows nothing about recipes.
 */

import type { MacroProfile } from "@/types/nutrition";

export type ScaleGroup = "protein" | "carb" | "fat" | "produce";

export const SCALE_GROUPS: ScaleGroup[] = ["protein", "carb", "fat", "produce"];

/**
 * Bounds per role, chosen so the result stays a plausible plate. They are
 * deliberately asymmetric: fat can be cut hard because that is the cheapest way
 * to lose calories without losing food, while produce can never be reduced —
 * trimming vegetables sheds satiety and volume in exchange for almost no
 * energy, which is the opposite of what this product is for.
 */
const GROUP_BOUNDS: Record<ScaleGroup, { min: number; max: number }> = {
  protein: { min: 0.5, max: 2.5 },
  carb: { min: 0.25, max: 2.5 },
  fat: { min: 0.2, max: 2.5 },
  produce: { min: 1, max: 3 },
};

/** Energy density below which an ingredient is bulk/volume rather than a macro source. */
const PRODUCE_KCAL_PER_100G = 65;

/** Assign an ingredient to a role from its per-100g composition. */
export function classifyGroup(per100g: MacroProfile): ScaleGroup {
  if (per100g.calories > 0 && per100g.calories < PRODUCE_KCAL_PER_100G) {
    return "produce";
  }

  const proteinKcal = per100g.protein_g * 4;
  const carbKcal = per100g.carbs_g * 4;
  const fatKcal = per100g.fat_g * 9;
  const max = Math.max(proteinKcal, carbKcal, fatKcal);

  if (max <= 0) return "produce";
  if (max === proteinKcal) return "protein";
  if (max === fatKcal) return "fat";
  return "carb";
}

export interface ScalingProblem {
  /** Macros that cannot be scaled (count-based lines, fixed components). */
  base: MacroProfile;
  /** Scalable macro totals by role. Absent roles simply cannot be adjusted. */
  groups: Partial<Record<ScaleGroup, MacroProfile>>;
  target: Partial<MacroProfile>;
  /** Per-problem overrides, e.g. a fat ceiling derived from the target itself. */
  bounds?: Partial<Record<ScaleGroup, { min?: number; max?: number }>>;
}

/**
 * Ceiling for the fat role derived from the requested fat, so a recipe written
 * with two millilitres of oil can still reach a 20 g fat target — while never
 * exceeding what was asked for, and never more than quadrupling the cook's own
 * measure.
 */
export function fatCeilingFor(
  fatGroupFatGrams: number,
  targetFatGrams: number | undefined
): number | undefined {
  if (!targetFatGrams || fatGroupFatGrams <= 0) return undefined;
  return Math.min(4, Math.max(1, targetFatGrams / fatGroupFatGrams));
}

export interface ScalingSolution {
  factors: Partial<Record<ScaleGroup, number>>;
  predicted: MacroProfile;
  /** Roles that ran into their bound, i.e. the target may be unreachable. */
  clamped: ScaleGroup[];
}

function weightFor(target: number | undefined, emphasis: number): number {
  if (!target || target <= 0) return 0;
  // Normalize by target magnitude so grams and kcal are comparable, then weight
  // by how much the dimension matters for a fat-loss plate.
  return emphasis / (target * target);
}

function combine(
  base: MacroProfile,
  groups: Partial<Record<ScaleGroup, MacroProfile>>,
  factors: Partial<Record<ScaleGroup, number>>
): MacroProfile {
  const total: MacroProfile = { ...base };
  for (const group of SCALE_GROUPS) {
    const macros = groups[group];
    if (!macros) continue;
    const factor = factors[group] ?? 1;
    total.calories += macros.calories * factor;
    total.protein_g += macros.protein_g * factor;
    total.carbs_g += macros.carbs_g * factor;
    total.fat_g += macros.fat_g * factor;
  }
  return total;
}

/**
 * Coordinate descent with a closed-form step per role. The objective is convex
 * and there are at most four variables, so this converges in a handful of
 * passes and needs no matrix code.
 */
export function solveScaling({
  base,
  groups,
  target,
  bounds: overrides,
}: ScalingProblem): ScalingSolution {
  const boundsFor = (group: ScaleGroup) => ({
    ...GROUP_BOUNDS[group],
    ...overrides?.[group],
  });

  type Dimension = { key: keyof MacroProfile; weight: number; target: number };

  const allDims: Dimension[] = [
    { key: "calories", weight: weightFor(target.calories, 3), target: target.calories ?? 0 },
    { key: "protein_g", weight: weightFor(target.protein_g, 2), target: target.protein_g ?? 0 },
    { key: "carbs_g", weight: weightFor(target.carbs_g, 1), target: target.carbs_g ?? 0 },
    { key: "fat_g", weight: weightFor(target.fat_g, 1), target: target.fat_g ?? 0 },
  ];
  const dims = allDims.filter((dim) => dim.weight > 0);

  const active = SCALE_GROUPS.filter((group) => groups[group] != null);
  const factors: Partial<Record<ScaleGroup, number>> = {};
  for (const group of active) factors[group] = 1;

  if (dims.length === 0 || active.length === 0) {
    return { factors, predicted: combine(base, groups, factors), clamped: [] };
  }

  for (let pass = 0; pass < 40; pass += 1) {
    let moved = 0;

    for (const group of active) {
      const own = groups[group]!;
      // Everything except this role, at its current factor.
      const others = combine(base, groups, { ...factors, [group]: 0 });

      let numerator = 0;
      let denominator = 0;
      for (const dim of dims) {
        const coefficient = own[dim.key] ?? 0;
        if (coefficient === 0) continue;
        const residual = dim.target - (others[dim.key] ?? 0);
        numerator += dim.weight * coefficient * residual;
        denominator += dim.weight * coefficient * coefficient;
      }
      if (denominator === 0) continue;

      const bounds = boundsFor(group);
      const next = Math.min(bounds.max, Math.max(bounds.min, numerator / denominator));
      moved = Math.max(moved, Math.abs(next - (factors[group] ?? 1)));
      factors[group] = next;
    }

    if (moved < 0.001) break;
  }

  const clamped = active.filter((group) => {
    const factor = factors[group] ?? 1;
    const bounds = boundsFor(group);
    return (
      Math.abs(factor - bounds.min) < 0.001 || Math.abs(factor - bounds.max) < 0.001
    );
  });

  return { factors, predicted: combine(base, groups, factors), clamped };
}
