import { z } from "zod";
import { LOCAL_MODEL_IDS } from "@/lib/ai/models";

/** Runtime validation for FlavorRadar scores (0–10). */
const score = z.number().min(0).max(10);

const LocalModelSchema = z.enum(LOCAL_MODEL_IDS);

export const NutritionalStrategySchema = z.enum([
  "post_workout_high_protein",
  "rest_day_low_carb",
  "deep_cut_psmf",
  "balanced_deficit",
]);

export const MacroProfileSchema = z.object({
  calories: z.number().nonnegative(),
  protein_g: z.number().nonnegative(),
  carbs_g: z.number().nonnegative(),
  fat_g: z.number().nonnegative(),
  fiber_g: z.number().nonnegative().optional(),
});

export const FlavorRadarSchema = z.object({
  sweet: score,
  sour: score,
  salty: score,
  umami: score,
  aroma_complexity: score,
});

export const CulinaryPhysicsTipSchema = z.object({
  technique: z.string().min(1),
  explanation: z.string().min(1),
  agents: z.array(z.string()).optional(),
  is_fat_mimicry: z.boolean().optional(),
});

export const GenerateRecipeRequestSchema = z.object({
  target_macros: MacroProfileSchema,
  available_ingredients: z.array(z.string()).default([]),
  kitchen_tools: z.array(z.string()).default(["stovetop", "oven"]),
  time_limit_minutes: z.number().positive().max(240),
  nutritional_strategy: NutritionalStrategySchema.optional(),
  cuisine_style: z.string().optional(),
  dietary_restrictions: z.array(z.string()).optional(),
  model: LocalModelSchema.optional(),
});

export const ElevateRecipeRequestSchema = z.object({
  craving_meal: z.string().min(1),
  image_url: z.string().url().optional(),
  target_macros: MacroProfileSchema.partial().optional(),
  kitchen_tools: z.array(z.string()).optional(),
  time_limit_minutes: z.number().positive().max(240).optional(),
  nutritional_strategy: NutritionalStrategySchema.optional(),
  dietary_restrictions: z.array(z.string()).optional(),
  model: LocalModelSchema.optional(),
});
