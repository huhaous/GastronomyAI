/**
 * Core domain types for GastronomyAI LLM structured outputs.
 * Used by /api/generate-recipe and /api/elevate-recipe.
 *
 * Nutrition-domain types live in `types/nutrition.ts` and are re-exported here.
 */

import type {
  GlycemicImpact,
  MacroProfile,
  MacroValidation,
  NutritionalStrategy,
  StrategyValidation,
} from "./nutrition";

export type {
  GlycemicImpact,
  MacroConfidence,
  MacroProfile,
  MacroValidation,
  NutritionalStrategy,
  StrategyValidation,
} from "./nutrition";

/**
 * Five-dimension sensory radar (0–10 scale).
 * Maps directly to the FlavorRadar component.
 */
export interface FlavorRadarScores {
  sweet: number;
  sour: number;
  salty: number;
  umami: number;
  aroma_complexity: number;
}

/** Texture pairing badges, e.g. "Crispy & Creamy". */
export type TextureBalance = string;

/**
 * Nutrition-science metrics shown beside Energy & Macros on the plating card.
 */
export interface FatLossMetrics {
  /** Satiety index 0–10 (protein + fiber + volume weighted). */
  satiety_index: number;
  /** Human label, e.g. "High Satiety". */
  satiety_label: string;
  /** Estimated thermic effect of food in kcal for this serving. */
  tef_kcal: number;
  glycemic_impact: GlycemicImpact;
  /** Short note, e.g. "Low GI / Stable Insulin". */
  glycemic_note: string;
}

/**
 * How culinary physics replicates richness/creaminess without hidden fats.
 * Highlighted in the Physics section as Fat-Mimicry Tech.
 */
export interface FatMimicryTech {
  /** Short title, e.g. "Yogurt–Xanthan Cream Emulsion". */
  title: string;
  /** What high-fat element is being replaced. */
  replaces: string;
  /** Molecular / technique mechanism. */
  mechanism: string;
  /** Resulting mouthfeel the diner perceives. */
  mouthfeel_result: string;
  agents?: string[];
}

/** A single culinary-physics or molecular technique note. */
export interface CulinaryPhysicsTip {
  /** Short technique label, e.g. "Emulsion via xanthan + yogurt". */
  technique: string;
  /** Science-backed explanation of how it cuts fat / boosts satiety. */
  explanation: string;
  /** Optional molecular agents involved (e.g. xanthan gum, lecithin). */
  agents?: string[];
  /** When true, this tip is a primary fat-mimicry technique. */
  is_fat_mimicry?: boolean;
}

/** Ingredient line with optional weight for macro accuracy. */
export interface RecipeIngredient {
  name: string;
  quantity: string;
  unit?: string;
  notes?: string;
}

/** Ordered cooking step. */
export interface RecipeStep {
  order: number;
  instruction: string;
  /** Approximate minutes for this step, if relevant. */
  duration_minutes?: number;
  tip?: string;
}

/** Visual plating / presentation guidance for the PlatingCard. */
export interface PlatingGuide {
  /** Primary plating composition description. */
  composition: string;
  /** Color / contrast cues. */
  color_contrast?: string;
  /** Vessel or surface recommendation. */
  vessel?: string;
  /** Garnish finishing notes. */
  garnish?: string;
  /** Shareable one-liner for social currency. */
  social_caption?: string;
}

/** Kitchen equipment the recipe may require. */
export type KitchenTool =
  | "sous_vide"
  | "air_fryer"
  | "blender"
  | "immersion_blender"
  | "oven"
  | "stovetop"
  | "microwave"
  | "grill"
  | "food_processor"
  | "none";

/** Full gourmet recipe payload returned by the LLM. */
export interface GourmetRecipe {
  /** Michelin-style dish title. */
  name: string;
  /** One-sentence sensory / philosophy teaser. */
  tagline: string;
  /** Estimated total active + passive cook time. */
  total_time_minutes: number;
  /** Active hands-on minutes. */
  active_time_minutes: number;
  servings: number;
  macros: MacroProfile;
  /** Fat-loss nutrition-science metrics. */
  fat_loss_metrics: FatLossMetrics;
  /** Primary fat-mimicry technique for rich taste without hidden fats. */
  fat_mimicry_tech: FatMimicryTech;
  /** Strategy this recipe was optimized for. */
  nutritional_strategy?: NutritionalStrategy;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  culinary_physics_tips: CulinaryPhysicsTip[];
  flavor_radar: FlavorRadarScores;
  texture_balance: TextureBalance[];
  /**
   * How this meal delivers dopamine / reward without calorie overload.
   * Shown under the FlavorRadar.
   */
  psychological_reward_note: string;
  plating: PlatingGuide;
  tools_used: KitchenTool[];
  /** Optional dietary tags: high-protein, gluten-free, etc. */
  tags?: string[];
  /** Attached post-generation by the Knowledge Graph recalculation fallback. */
  macro_validation?: MacroValidation;
  /** Attached post-generation by the FAT_LOSS_RULES compliance check. */
  strategy_validation?: StrategyValidation;
}

/** Request body for POST /api/generate-recipe. */
export interface GenerateRecipeRequest {
  target_macros: MacroProfile;
  available_ingredients: string[];
  kitchen_tools: KitchenTool[];
  /** Hard time budget in minutes. */
  time_limit_minutes: number;
  /** Fat-loss periodization strategy. */
  nutritional_strategy?: NutritionalStrategy;
  /** Optional cuisine preference or style notes. */
  cuisine_style?: string;
  dietary_restrictions?: string[];
  /** Optional Ollama/OpenAI model override (e.g. qwen2.5:32b). */
  model?: string;
}

/** Request body for POST /api/elevate-recipe. */
export interface ElevateRecipeRequest {
  /** High-calorie craving meal name or free-text description. */
  craving_meal: string;
  /** Optional photo URL or base64 (future: vision). */
  image_url?: string;
  target_macros?: Partial<MacroProfile>;
  kitchen_tools?: KitchenTool[];
  time_limit_minutes?: number;
  nutritional_strategy?: NutritionalStrategy;
  dietary_restrictions?: string[];
  /** Optional Ollama/OpenAI model override (e.g. qwen2.5:32b). */
  model?: string;
}

/**
 * Elevate response: reconstructed recipe plus substitution rationale.
 * Extends GourmetRecipe with craving-context metadata.
 */
export interface ElevatedRecipe extends GourmetRecipe {
  original_craving: string;
  /** Estimated macros of the original craving (approximate). */
  original_macros_estimate?: MacroProfile;
  /** Key molecular / culinary substitutions applied. */
  substitutions: CulinaryPhysicsTip[];
  /** Calories saved vs. the original estimate, when available. */
  calories_saved?: number;
}

/** Discriminated union of successful API payloads. */
export type RecipeApiSuccess =
  | { kind: "generate"; recipe: GourmetRecipe }
  | { kind: "elevate"; recipe: ElevatedRecipe };

export interface RecipeApiError {
  error: string;
  details?: string;
}
