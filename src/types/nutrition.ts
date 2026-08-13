/**
 * Nutrition-domain types, deliberately kept free of recipe concepts.
 *
 * Macros, strategies and verification apply to anything edible — a plate, a
 * logged meal, a day's total — so the resolution engine and the rules engine
 * depend on this file rather than on `types/recipe.ts`. Recipe types re-export
 * these, so importing either path works.
 */

/** Target or measured macronutrient profile. */
export interface MacroProfile {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g?: number;
}

/** Fat-loss nutritional periodization strategy. */
export type NutritionalStrategy =
  | "post_workout_high_protein"
  | "rest_day_low_carb"
  | "deep_cut_psmf"
  | "balanced_deficit";

export type GlycemicImpact = "low" | "moderate" | "high";

/**
 * How much of a macro total is backed by verified graph data.
 * - verified:   every ingredient line was resolved; macros are computed truth.
 * - partial:    some lines unknown, but the verified floor exceeded the model's
 *               claim, so macros were raised toward the truth.
 * - unverified: some lines unknown and the claim couldn't be disproven.
 */
export type MacroConfidence = "verified" | "partial" | "unverified";

/**
 * Audit trail from the Knowledge Graph post-calculation fallback
 * (`src/lib/ai/nutritionRecalc.ts`), attached after LLM generation.
 */
export interface MacroValidation {
  source: "graph";
  confidence: MacroConfidence;
  /** True when graph-verified macros replaced the model's reported macros. */
  adjusted: boolean;
  /** True when calories were reconciled to 4P+4C+9F for internal consistency. */
  atwater_corrected: boolean;
  /** Per-serving kcal actually accounted for by verified graph data. */
  verified_kcal: number;
  resolved_ingredients: number;
  total_ingredients: number;
  /** Ingredient names the graph could not price, i.e. the remaining risk. */
  unresolved_ingredients: string[];
  delta_calories_percent: number;
}

/**
 * Record of portions being rescaled to reach the requested target, attached
 * when the graph verified every line and the dish was off target.
 */
export interface PortionAdjustment {
  /** Requested per-serving energy. */
  target_calories: number;
  /** Per-serving energy the model's own quantities actually produced. */
  before_calories: number;
  /** Per-serving energy after rescaling. */
  after_calories: number;
  /** Multiplier applied to each ingredient role. */
  factors: { group: string; factor: number }[];
  /** One entry per rewritten line, e.g. "Chicken breast 200g → 280g". */
  changes: string[];
  /** True when a role hit its limit, so the target may not be fully reached. */
  bounded: boolean;
}

/** Compliance report against FAT_LOSS_RULES for the requested strategy. */
export interface StrategyValidation {
  strategy: NutritionalStrategy;
  in_compliance: boolean;
  protein_percent: number;
  carbs_percent: number;
  /** Carbs minus fiber — what carb ceilings are actually judged on. */
  net_carbs_percent: number;
  fat_percent: number;
  /** Only genuine failures; harmless deviations are intentionally not listed. */
  violations: string[];
}
