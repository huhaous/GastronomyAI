import OpenAI from "openai";
import { getLlmConfig } from "@/lib/ai/config";
import {
  ELEVATE_RECIPE_USER_TEMPLATE,
  ELEVATED_RECIPE_JSON_SCHEMA,
  GASTRONOMY_SYSTEM_PROMPT,
  GENERATE_RECIPE_USER_TEMPLATE,
  GOURMET_RECIPE_JSON_SCHEMA,
} from "@/lib/prompts/gastronomyPrompt";
import { NUTRITIONAL_STRATEGY_OPTIONS } from "@/lib/nutritionStrategies";
import { buildKnowledgeGraphConstraints } from "@/lib/ai/graphContext";
import { applyGraphRecalculation } from "@/lib/ai/nutritionRecalc";
import { adjustPortions, rebalanceProteinForStrategy } from "@/lib/ai/portionAdjust";
import { announcePlateAdditions } from "@/lib/ai/elevationNotes";
import { validateAgainstStrategy } from "@/lib/ai/strategyValidation";
import { suggestGapFillers, applyGapFill, cookDisplayName } from "@/lib/nutrition/gapFill";
import { repairPieceQuantities } from "@/lib/nutrition/foodLines";
import { validateCookability } from "@/lib/cookability";
import { applySignaturePlate } from "@/lib/cook/signaturePlate";
import { repairCookMethod } from "@/lib/cook/methodIntegrity";
import { recordCoverage } from "@/lib/telemetry/coverageLog";
import type {
  CookEffort,
  ElevateRecipeRequest,
  ElevatedRecipe,
  GenerateRecipeRequest,
  GourmetRecipe,
  MacroProfile,
  NutritionalStrategy,
} from "@/types/recipe";

function getClient(modelOverride?: string): {
  client: OpenAI;
  model: string;
  useStrictJsonSchema: boolean;
} {
  const config = getLlmConfig(modelOverride);
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  });
  return {
    client,
    model: config.model,
    useStrictJsonSchema: config.useStrictJsonSchema,
  };
}

/** gpt-5 / o-series only accept the default temperature. */
function sampling(model: string): { temperature?: number } {
  if (/^gpt-5/i.test(model) || /^o[0-9]/i.test(model)) return {};
  return { temperature: 0.7 };
}

function strategyGuidance(id?: string): string | undefined {
  if (!id) return undefined;
  return NUTRITIONAL_STRATEGY_OPTIONS.find((s) => s.id === id)?.guidance;
}

/** Builds the base system message plus a Knowledge Graph constraints message
 * (when the lookup found any verified facts), for a chat completion call. */
function buildSystemMessages(params: {
  ingredientNames: string[];
  toolIds: string[];
  strategy?: GenerateRecipeRequest["nutritional_strategy"];
  allowSpecialty?: boolean;
  effort?: CookEffort;
}): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: GASTRONOMY_SYSTEM_PROMPT },
  ];

  const { systemMessage } = buildKnowledgeGraphConstraints(params);
  if (systemMessage) {
    messages.push({ role: "system", content: systemMessage });
  }

  return messages;
}

/**
 * Post-processing every generated recipe goes through: macros recomputed from
 * the Knowledge Graph, portions rescaled toward the requested target when the
 * dish is fully verified, then a compliance check and a coverage log entry.
 *
 * Rescaling happens between two verification passes on purpose — the first
 * establishes what the model's quantities really produce, the second reprices
 * the rewritten quantities so the reported macros describe the served plate.
 */
function finalizeRecipe<T extends GourmetRecipe>(
  incoming: T,
  context: {
    mode: "generate" | "elevate";
    model: string;
    strategy?: NutritionalStrategy;
    target?: Partial<MacroProfile>;
    pantry?: string[];
    allowSpecialty?: boolean;
    effort?: CookEffort;
    timeLimitMinutes?: number;
    craving?: string;
  }
): T {
  const cravingEarly =
    context.craving ??
    ("original_craving" in incoming
      ? String((incoming as { original_craving?: string }).original_craving ?? "")
      : "");
  const raw = applySignaturePlate(repairPieceQuantities(incoming), {
    craving: cravingEarly || undefined,
    targetCalories: context.target?.calories,
  });
  const firstPass = applyGraphRecalculation(raw);
  const { recipe: scaled, adjustment } = adjustPortions(
    firstPass.recipe,
    context.target,
    { strategy: context.strategy ?? firstPass.recipe.nutritional_strategy }
  );

  const { recipe: verified, result } = adjustment
    ? applyGraphRecalculation(scaled)
    : firstPass;
  const effectiveStrategy = context.strategy ?? verified.nutritional_strategy;
  const craving =
    context.craving ??
    ("original_craving" in verified
      ? String((verified as { original_craving?: string }).original_craving ?? "")
      : "");

  let working = verified;
  let coverageResult = result;

  const takeSuggestions = () =>
    coverageResult.validation.confidence === "verified" && context.target
      ? suggestGapFillers({
          lines: working.ingredients,
          macros: working.macros,
          servings: working.servings,
          target: context.target,
          strategy: effectiveStrategy,
          pantry: context.pantry,
          allowSpecialty: context.allowSpecialty,
          effort: context.effort,
          craving: craving || undefined,
          dish: working.name,
        })
      : [];

  let gapSuggestions = takeSuggestions();
  const chosen = gapSuggestions[0];
  const targetKcal = context.target?.calories;
  const miss =
    targetKcal && targetKcal > 0
      ? Math.abs(working.macros.calories - targetKcal) / targetKcal
      : 0;

  if (chosen && miss > 0.1) {
    const { recipe: filled, gramsInRecipe } = applyGapFill(working, chosen);
    const again = applyGraphRecalculation(filled);
    working = again.recipe;
    coverageResult = again.result;
    const servings = Math.max(1, working.servings || 1);
    const cookLabel = cookDisplayName(chosen.ingredient);
    const verb =
      chosen.kind === "swap"
        ? `This plate uses ${gramsInRecipe}g ${cookLabel} instead of ${chosen.replaces}`
        : `This plate includes ${gramsInRecipe}g ${cookLabel}`;
    const replacedKey = chosen.replaces
      ? chosen.replaces.split(/[^A-Za-z]+/)[0]?.toLowerCase()
      : undefined;
    const priorChanges = (working.portion_adjustment?.changes ?? []).filter(
      (change) =>
        !replacedKey || !change.toLowerCase().includes(replacedKey)
    );
    working = {
      ...working,
      gap_fill_applied: {
        ...chosen,
        ingredient: cookLabel,
        grams_in_recipe: gramsInRecipe,
        servings,
      },
      portion_adjustment: working.portion_adjustment
        ? {
            ...working.portion_adjustment,
            after_calories: working.macros.calories,
            changes: [...priorChanges, verb],
          }
        : working.portion_adjustment,
    };
    gapSuggestions = takeSuggestions().filter(
      (row) =>
        row.ingredient !== chosen.ingredient || row.kind !== chosen.kind
    );
  }

  const rebalanced = rebalanceProteinForStrategy(
    working,
    context.target,
    effectiveStrategy
  );
  if (rebalanced !== working) {
    const priced = applyGraphRecalculation(rebalanced);
    working = priced.recipe;
    coverageResult = priced.result;
  }

  working = repairCookMethod(working, { effort: context.effort });
  working = announcePlateAdditions(working);

  const cookability = validateCookability(working, {
    allowSpecialty: context.allowSpecialty,
    effort: context.effort,
    pantry: context.pantry,
    timeLimitMinutes: context.timeLimitMinutes,
  });

  recordCoverage({
    ts: new Date().toISOString(),
    mode: context.mode,
    model: context.model,
    strategy: effectiveStrategy,
    dish: working.name,
    confidence: coverageResult.validation.confidence,
    resolved_ingredients: coverageResult.validation.resolved_ingredients,
    total_ingredients: coverageResult.validation.total_ingredients,
    verified_kcal: coverageResult.validation.verified_kcal,
    reported_kcal: working.macros.calories,
    unresolved: coverageResult.unresolved,
  });

  const finalized = {
    ...working,
    nutritional_strategy: effectiveStrategy,
    strategy_validation: validateAgainstStrategy(working.macros, effectiveStrategy),
    gap_suggestions: gapSuggestions.length > 0 ? gapSuggestions : undefined,
    cookability: cookability.violations.length > 0 ? cookability : undefined,
  };
  if (process.env.NODE_ENV !== "production") {
    void import("@/lib/ai/recipeDump").then((mod) =>
      mod.dumpLastRecipe(finalized, {
        mode: context.mode,
        craving: craving || undefined,
      })
    );
  }
  return finalized;
}

/**
 * Recompute calories_saved from the two numbers it's defined by. The model gets
 * this wrong the same way it gets macros wrong (it claimed 200 saved on a
 * 750 → 421 kcal reconstruction), and now that the elevated side is
 * graph-verified, the subtraction should just be done here.
 */
function reconcileCaloriesSaved(recipe: ElevatedRecipe): ElevatedRecipe {
  const original = recipe.original_macros_estimate?.calories;
  if (original == null || original <= 0) return recipe;

  return {
    ...recipe,
    calories_saved: Math.max(0, Math.round(original - recipe.macros.calories)),
  };
}

function parseJsonContent<T>(raw: string | null | undefined): T {
  if (!raw) {
    throw new Error("Empty response from model.");
  }
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return JSON.parse(cleaned) as T;
}

function responseFormat(
  useStrictJsonSchema: boolean,
  schema: typeof GOURMET_RECIPE_JSON_SCHEMA | typeof ELEVATED_RECIPE_JSON_SCHEMA
): OpenAI.Chat.Completions.ChatCompletionCreateParams["response_format"] {
  if (useStrictJsonSchema) {
    return {
      type: "json_schema",
      json_schema: schema,
    };
  }
  return { type: "json_object" };
}

export async function generateGourmetRecipe(
  request: GenerateRecipeRequest
): Promise<{ recipe: GourmetRecipe; model: string }> {
  const { client, model, useStrictJsonSchema } = getClient(request.model);
  const userPrompt = GENERATE_RECIPE_USER_TEMPLATE({
    calories: request.target_macros.calories,
    protein_g: request.target_macros.protein_g,
    carbs_g: request.target_macros.carbs_g,
    fat_g: request.target_macros.fat_g,
    ingredients: request.available_ingredients,
    tools: request.kitchen_tools,
    time_limit_minutes: request.time_limit_minutes,
    nutritional_strategy: request.nutritional_strategy,
    strategy_guidance: strategyGuidance(request.nutritional_strategy),
    cuisine_style: request.cuisine_style,
    dietary_restrictions: request.dietary_restrictions,
    allow_specialty: request.allow_specialty,
    effort: request.effort,
  });

  const systemMessages = buildSystemMessages({
    ingredientNames: request.available_ingredients,
    toolIds: request.kitchen_tools,
    strategy: request.nutritional_strategy,
    allowSpecialty: request.allow_specialty,
    effort: request.effort,
  });

  const completion = await client.chat.completions.create({
    model,
    ...sampling(model),
    response_format: responseFormat(useStrictJsonSchema, GOURMET_RECIPE_JSON_SCHEMA),
    messages: [...systemMessages, { role: "user", content: userPrompt }],
  });

  const rawRecipe = parseJsonContent<GourmetRecipe>(
    completion.choices[0]?.message?.content
  );
  const recipe = finalizeRecipe(rawRecipe, {
    mode: "generate",
    model,
    strategy: request.nutritional_strategy,
    target: request.target_macros,
    pantry: request.available_ingredients,
    allowSpecialty: request.allow_specialty,
    effort: request.effort,
    timeLimitMinutes: request.time_limit_minutes,
  });

  return { recipe, model };
}

export async function elevateCravingRecipe(
  request: ElevateRecipeRequest
): Promise<{ recipe: ElevatedRecipe; model: string }> {
  const { client, model, useStrictJsonSchema } = getClient(request.model);
  const userPrompt = ELEVATE_RECIPE_USER_TEMPLATE({
    craving_meal: request.craving_meal,
    calories: request.target_macros?.calories,
    protein_g: request.target_macros?.protein_g,
    carbs_g: request.target_macros?.carbs_g,
    fat_g: request.target_macros?.fat_g,
    tools: request.kitchen_tools,
    time_limit_minutes: request.time_limit_minutes,
    nutritional_strategy: request.nutritional_strategy,
    strategy_guidance: strategyGuidance(request.nutritional_strategy),
    dietary_restrictions: request.dietary_restrictions,
    allow_specialty: request.allow_specialty,
    effort: request.effort,
  });

  const systemMessages = buildSystemMessages({
    ingredientNames: [],
    toolIds: request.kitchen_tools ?? [],
    strategy: request.nutritional_strategy,
    allowSpecialty: request.allow_specialty,
    effort: request.effort,
  });

  const completion = await client.chat.completions.create({
    model,
    ...sampling(model),
    response_format: responseFormat(useStrictJsonSchema, ELEVATED_RECIPE_JSON_SCHEMA),
    messages: [...systemMessages, { role: "user", content: userPrompt }],
  });

  const rawRecipe = parseJsonContent<ElevatedRecipe>(
    completion.choices[0]?.message?.content
  );
  const recipe = reconcileCaloriesSaved(
    finalizeRecipe(rawRecipe, {
      mode: "elevate",
      model,
      strategy: request.nutritional_strategy,
      target: request.target_macros,
      allowSpecialty: request.allow_specialty,
      effort: request.effort,
      timeLimitMinutes: request.time_limit_minutes,
      craving: request.craving_meal,
    })
  );

  return { recipe, model };
}
