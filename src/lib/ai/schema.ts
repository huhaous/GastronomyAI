import { z } from "zod";
import { LOCAL_MODEL_IDS } from "@/lib/ai/models";
import { PSMF_GATE_MESSAGE } from "@/lib/safety";

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

/**
 * The PSMF gate is enforced here rather than in the UI: a client-side toggle is
 * a convention, and this protocol is the one place in the product where an
 * unacknowledged request should simply be refused.
 */
function requirePsmfAcknowledgement(
  data: {
    nutritional_strategy?: z.infer<typeof NutritionalStrategySchema>;
    psmf_acknowledged?: boolean;
  },
  ctx: z.RefinementCtx
): void {
  if (data.nutritional_strategy === "deep_cut_psmf" && !data.psmf_acknowledged) {
    ctx.addIssue({
      code: "custom",
      path: ["psmf_acknowledged"],
      message: PSMF_GATE_MESSAGE,
    });
  }
}

export const GenerateRecipeRequestSchema = z
  .object({
    target_macros: MacroProfileSchema,
    available_ingredients: z.array(z.string()).default([]),
    kitchen_tools: z.array(z.string()).default(["stovetop", "oven"]),
    time_limit_minutes: z.number().positive().max(240),
    nutritional_strategy: NutritionalStrategySchema.optional(),
    psmf_acknowledged: z.boolean().optional(),
    allow_specialty: z.boolean().optional(),
    effort: z.enum(["weeknight", "batch", "project"]).optional(),
    cuisine_style: z.string().optional(),
    dietary_restrictions: z.array(z.string()).optional(),
    model: LocalModelSchema.optional(),
  })
  .superRefine(requirePsmfAcknowledgement);

export const ElevateRecipeRequestSchema = z
  .object({
    craving_meal: z.string().min(1),
    image_url: z.string().url().optional(),
    target_macros: MacroProfileSchema.partial().optional(),
    kitchen_tools: z.array(z.string()).optional(),
    time_limit_minutes: z.number().positive().max(240).optional(),
    nutritional_strategy: NutritionalStrategySchema.optional(),
    psmf_acknowledged: z.boolean().optional(),
    allow_specialty: z.boolean().optional(),
    effort: z.enum(["weeknight", "batch", "project"]).optional(),
    dietary_restrictions: z.array(z.string()).optional(),
    model: LocalModelSchema.optional(),
  })
  .superRefine(requirePsmfAcknowledgement);
