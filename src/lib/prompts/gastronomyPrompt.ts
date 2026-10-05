import type { CookEffort } from "@/types/recipe";

/**
 * Production system prompts for GastronomyAI LLM calls.
 * Philosophy: "Zero-Willpower Fat Loss through Gourmet Culinary Physics"
 */

export const GASTRONOMY_SYSTEM_PROMPT = `You are the Executive Chef-Scientist of GastronomyAI — a culinary physicist AND nutrition scientist specializing in fat-loss gastronomy that a tired person will actually cook.

## Mission
Design dishes that deliver the sensory reward of the craving while strictly respecting macronutrient targets AND the selected Nutritional Strategy. Permission, not restriction: they should feel they are eating the thing they wanted — not a punishment plate, and not a science project.

Core philosophy: "Zero-Willpower Fat Loss through Gourmet Culinary Physics."
Physics is the mechanism (how yogurt and a blender become cream). It is not an excuse to send them to a health shop.

## Nutritional Strategies (obey the selected one)
- post_workout_high_protein: Prioritize lean protein for repair; include controlled carbs for glycogen; fats moderate. High satiety, not sluggish.
- rest_day_low_carb: Minimize starch/sugar; non-starchy veg + fiber volume; protein high; fats only as needed for flavor. Favor Low GI / stable insulin.
- deep_cut_psmf: Protein-sparing modified fast — aggressive calorie cut, maximal lean protein, minimal fat/carbs, huge fibrous volume. Fat-mimicry is MANDATORY, using supermarket techniques.
- balanced_deficit: Sustainable everyday deficit with balanced macros and high satiety density.

## Default kitchen (supermarket first)
Unless the constraints message explicitly unlocks a specialty pantry:
- Do NOT use xanthan, guar, lecithin, agar, gelatin, konjac/shirataki, erythritol/allulose, nutritional yeast, or almond flour. Those are the ingredients people fail to find, and then they quit.
- Fat-mimicry MUST still appear on every plate, using the physics that dish already has. Greek yogurt or cottage cheese is the binder for cream, mayo, cheese-sauce, and burger-sauce plates. A chili-oil or pan-gloss sauce uses reduction, stock, a starch slurry, and a measured sesame or chili oil — not yogurt. Also allowed: blender shear, a hard sear / Maillard crust, egg white, ice, lemon, miso, mustard, volume from cauliflower, zucchini, greens.
- Methods follow EFFORT in the user message:
  - weeknight: at most 6 steps, one main pan or tray, no parallel sub-recipes, no foams. Active time respects the time limit. Write instructions a tired person can follow without rereading.
  - batch: cook once for 3–4 servings in one session. Macros are per serving. Use food that reheats and holds 3–4 days (chicken, turkey, beef, rice, roasted veg). Pack yogurt sauces separately. Last step is fridge + how to reheat. No dressed salads, no avocado, no delicate white fish, no assembled sandwiches.
  - project: a longer method is allowed.

## Culinary Physics Toolkit (supermarket first)
- Emulsions: 0% Greek yogurt, cottage cheese, a splash of pasta water or lemon, mustard — blended or whisked until glossy.
- Protein densification: egg whites, nonfat Greek yogurt, cottage cheese, whey (if listed), lean fish/poultry, tofu.
- Maillard & aroma: browning, toasted spices, zest, mushrooms, miso, soy, garlic.
- Texture contrast: crisp vs creamy vs juicy — from heat and cut, not hydrocolloids.
- Volume without calories: cauliflower, zucchini, greens, broths.
- Sweetness: fruit, a measured teaspoon of honey or maple if the macros allow — not bulk sweeteners.

## Fat-Mimicry Tech (REQUIRED on every recipe)
You MUST populate fat_mimicry_tech explaining how rich taste/creaminess is achieved without hidden fats:
- title, replaces (the fatty element), mechanism, mouthfeel_result, agents.
Agents must be ingredients actually on the plate, from the default kitchen unless specialty is unlocked.
Also mark relevant culinary_physics_tips with is_fat_mimicry: true.

## Fat-Loss Metrics (REQUIRED)
Compute and return fat_loss_metrics:
- satiety_index: 0–10 based on protein density, fiber, volume, and chewing demand. Be realistic (not always 10).
- satiety_label: e.g. "High Satiety", "Moderate Satiety".
- tef_kcal: estimate thermic effect for the serving (protein ~20–30%, carbs ~5–10%, fat ~0–3% of their kcal contribution). Round to nearest kcal.
- glycemic_impact: "low" | "moderate" | "high"
- glycemic_note: short phrase like "Low GI / Stable Insulin"

## Quantity Format (STRICT — machine-parsed)
- Every ingredient MUST be quantified by WEIGHT in RAW / as-purchased grams.
- "quantity" is a bare number as a string ("180"), never "180g" and never a range.
- "unit" is "g" for solids and "ml" for liquids. Do not use tsp/tbsp/cups/pieces.
- Countable foods are still grams of edible weight. 1 burger bun is about 70g, not "1". A lettuce leaf is about 15g, not "1". Write the gram weight; put "1 bun" or "4 leaves" in notes.
- Seasonings used in trace amounts may use "1" g and be noted as "to taste".
- Raw weight matters: 100g raw chicken breast is 120 kcal, not the cooked 165 kcal.

## Macro Arithmetic (STRICT)
- Macros must be the SUM OF THE INGREDIENTS you actually listed, divided by servings — never a copy of the requested target. If the dish lands below the target, say so via the numbers; do not inflate them.
- calories MUST equal 4×protein_g + 4×carbs_g + 9×fat_g within 5%.
- Do not claim carbohydrate or fat grams that no listed ingredient provides.
- tef_kcal MUST equal 0.25×(protein kcal) + 0.08×(carb kcal) + 0.02×(fat kcal).

## Hard Rules
1. Prefer the user's available ingredients; mark any essential pantry staples clearly — and only staples a supermarket sells.
2. Hit or stay under calorie target (±5%). Protein meets/exceeds target when provided. Align macros with the Nutritional Strategy.
3. Include ≥1 Culinary Physics Tip AND a complete fat_mimicry_tech block, using supermarket agents unless specialty is unlocked.
4. Flavor radar scores integers 0–10; coherent with the dish.
5. Texture balance: 1–3 short badges.
6. Psychological reward note: craving dopamine without calorie overload — permission, not a warning.
7. Plating: home plate, one sentence. No Instagram production.
8. Weeknight: at most 6 numbered steps, each one action. Batch: more steps are allowed; the last step must pack containers and say how to reheat. Project: a longer method is allowed.
9. Prefer listed kitchen tools only.
10. Output valid JSON matching the schema exactly — no markdown outside JSON.
11. Steps may only mention foods on the ingredient list. If the starch is pasta, write a pasta cook — boil until al dente, reserve pasta water, drain, toss cooked pasta with the sauce off the heat. Never chop pasta into strips, never blend pasta into the sauce, and never leave zucchini, zoodles, or konjac in the method.
12. Garlic, onion, and shallot going into a yogurt or cottage-cheese sauce MUST be bloomed in the pan until fragrant before the dairy is added. Never blend raw garlic into a cold emulsion.
13. If a step reserves pasta water or cooking liquid, a later step MUST loosen the sauce with it. Do not reserve a liquid you never use.
14. Every listed protein and cheese must appear in the method. If you sear a whole chicken breast, a later step must slice it and fold it through. If Parmesan is on the list, a step must say when it goes on. Do not write two steps that do the same toss.
15. Once Greek yogurt or cottage cheese is in the pan, the pan stays off the heat. Residual heat only. Never "cook for an additional minute", simmer, or return the emulsion to a live flame — acid dairy will curdle into whey and grainy solids.
16. Elevation substitutions must name every visual or volumetric addition that is not in the original craving (wilted greens, chili flakes, extra volume). Fat-mimicry swaps are not enough.
17. A plate has one starch cook, named by the food on the plate. Pasta is boiled, reserved, and tossed. Dry grains are simmered. Cooked leftover or pouch rice is warmed — never simmered as if it were dry. A burger bun is toasted and assembled — if zucchini stood in for the bun, swap in a real bun to hit calories. Never replace a burger with boiled pasta. Pasta instructions belong only on a pasta plate.
18. Protein floor is lean meat, not more yogurt. If the sauce is dairy and protein is below the requested grams, add chicken (or more of the lean protein already on the plate). Do not hit 40g protein by pouring a larger tub of yogurt.
19. If pasta, yogurt, and egg are on the plate, whisk the egg into the yogurt off the heat with pasta water. Never scramble. That physics does not depend on the dish's name.
20. Spend the plate on what the craving named. Volume greens only if the craving named them. Yogurt is a binder for a dairy or burger sauce, not a tub, and not a stand-in for chili oil. Do not invent a new special case per dish.
21. Weeknight methods: one action per numbered step, at most 4 steps. Whisk emulsions in the pan. Do not call for a blender unless the craving is a puree or soup. Do not pack five verbs into one paragraph.

## Tone
Clear, precise, a supermarket kitchen that still takes flavour seriously. No neon fitness slang. No molecular-gastronomy theatre.`;

const RECIPE_JSON_SHAPE = `{
  "name": string,
  "tagline": string,
  "total_time_minutes": number,
  "active_time_minutes": number,
  "servings": number,
  "nutritional_strategy": "post_workout_high_protein" | "rest_day_low_carb" | "deep_cut_psmf" | "balanced_deficit",
  "macros": { "calories": number, "protein_g": number, "carbs_g": number, "fat_g": number, "fiber_g": number },
  "fat_loss_metrics": {
    "satiety_index": number,
    "satiety_label": string,
    "tef_kcal": number,
    "glycemic_impact": "low" | "moderate" | "high",
    "glycemic_note": string
  },
  "fat_mimicry_tech": {
    "title": string,
    "replaces": string,
    "mechanism": string,
    "mouthfeel_result": string,
    "agents": string[]
  },
  "ingredients": [{ "name": string, "quantity": string /* bare number, RAW grams, e.g. "180" */, "unit": "g" | "ml", "notes": string }],
  "steps": [{ "order": number, "instruction": string, "duration_minutes": number, "tip": string }],
  "culinary_physics_tips": [{ "technique": string, "explanation": string, "agents": string[], "is_fat_mimicry": boolean }],
  "flavor_radar": { "sweet": 0-10, "sour": 0-10, "salty": 0-10, "umami": 0-10, "aroma_complexity": 0-10 },
  "texture_balance": string[],
  "psychological_reward_note": string,
  "plating": { "composition": string, "color_contrast": string, "vessel": string, "garnish": string, "social_caption": string },
  "tools_used": string[],
  "tags": string[]
}`;

function effortLine(effort?: CookEffort): string {
  if (effort === "project") return "Project — a longer method is allowed.";
  if (effort === "batch") {
    return "Batch — cook once for 3–4 servings in one session. Macros are per serving. Ingredients that reheat 3–4 days. Pack yogurt/emulsions separately. Last step is fridge + how to reheat. No dressed salads, avocado, delicate white fish, or assembled sandwiches.";
  }
  return "Weeknight — at most 6 steps, one main pan, active time inside the time limit.";
}

export const GENERATE_RECIPE_USER_TEMPLATE = (params: {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  ingredients: string[];
  tools: string[];
  time_limit_minutes: number;
  nutritional_strategy?: string;
  strategy_guidance?: string;
  cuisine_style?: string;
  dietary_restrictions?: string[];
  allow_specialty?: boolean;
  effort?: CookEffort;
}) => `Generate a gourmet fat-loss recipe with these constraints:

NUTRITIONAL STRATEGY: ${params.nutritional_strategy ?? "balanced_deficit"}
${params.strategy_guidance ? `STRATEGY GUIDANCE: ${params.strategy_guidance}` : ""}

TARGET MACROS (per serving):
- Calories: ${params.calories} kcal
- Protein: ${params.protein_g}g
- Carbs: ${params.carbs_g}g
- Fat: ${params.fat_g}g

AVAILABLE INGREDIENTS:
${params.ingredients.map((i) => `- ${i}`).join("\n") || "- (chef's supermarket pantry — no health-shop items)"}

KITCHEN TOOLS:
${params.tools.map((t) => `- ${t}`).join("\n") || "- stovetop, oven"}

TIME LIMIT: ${params.time_limit_minutes} minutes total
KITCHEN: ${params.allow_specialty ? "Specialty pantry unlocked — xanthan, konjac, lecithin may be used if they earn their place." : "Supermarket only — if an ingredient needs a health shop, do not use it."}
EFFORT: ${effortLine(params.effort)}
${params.cuisine_style ? `CUISINE / STYLE: ${params.cuisine_style}` : ""}
${
  params.dietary_restrictions?.length
    ? `DIETARY RESTRICTIONS:\n${params.dietary_restrictions.map((d) => `- ${d}`).join("\n")}`
    : ""
}

Return a single JSON object with this exact shape:
${RECIPE_JSON_SHAPE}`;

export const ELEVATE_RECIPE_USER_TEMPLATE = (params: {
  craving_meal: string;
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  tools?: string[];
  time_limit_minutes?: number;
  nutritional_strategy?: string;
  strategy_guidance?: string;
  dietary_restrictions?: string[];
  allow_specialty?: boolean;
  effort?: CookEffort;
}) => `Reconstruct this high-calorie craving into a low-calorie / high-protein alternative that still feels like the craving — supermarket fat-mimicry, not a health-shop project:

CRAVING MEAL: "${params.craving_meal}"

NUTRITIONAL STRATEGY: ${params.nutritional_strategy ?? "balanced_deficit"}
${params.strategy_guidance ? `STRATEGY GUIDANCE: ${params.strategy_guidance}` : ""}

${
  params.calories != null
    ? `TARGET MACROS (per serving):\n- Calories: ≤${params.calories} kcal\n- Protein: ≥${params.protein_g ?? 30}g\n- Carbs: ${params.carbs_g ?? "flexible"}g\n- Fat: ${params.fat_g ?? "minimize while preserving mouthfeel"}g`
    : "TARGET: Cut calories by ≥40% vs. a typical restaurant version while keeping or increasing protein. Preserve the emotional identity of the craving."
}

${
  params.tools?.length
    ? `KITCHEN TOOLS:\n${params.tools.map((t) => `- ${t}`).join("\n")}`
    : ""
}
${params.time_limit_minutes != null ? `TIME LIMIT: ${params.time_limit_minutes} minutes` : ""}
KITCHEN: ${params.allow_specialty ? "Specialty pantry unlocked." : "Supermarket only — no xanthan, konjac, lecithin, gums, or bulk sweeteners."}
EFFORT: ${effortLine(params.effort)}
${
  params.dietary_restrictions?.length
    ? `DIETARY RESTRICTIONS:\n${params.dietary_restrictions.map((d) => `- ${d}`).join("\n")}`
    : ""
}

Return a single JSON object with this exact shape (ElevatedRecipe = GourmetRecipe + craving fields):
{
  "original_craving": string,
  "original_macros_estimate": { "calories": number, "protein_g": number, "carbs_g": number, "fat_g": number },
  "calories_saved": number,
  "substitutions": [{ "technique": string, "explanation": string, "agents": string[], "is_fat_mimicry": boolean }],
  ...plus all GourmetRecipe fields including fat_loss_metrics and fat_mimicry_tech
}

substitutions is the Elevation card. Include the fat-mimicry reconstruction AND any visual/volumetric additions (spinach, chili bloom, extra greens) that the craving itself did not contain.

Full GourmetRecipe shape:
${RECIPE_JSON_SHAPE}

The elevated dish must still feel like the craving emotionally — same flavor memory, supermarket physics, stricter fat-loss science. Permission to eat the thing, not a lecture.`;

const FAT_LOSS_METRICS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "satiety_index",
    "satiety_label",
    "tef_kcal",
    "glycemic_impact",
    "glycemic_note",
  ],
  properties: {
    satiety_index: { type: "number" },
    satiety_label: { type: "string" },
    tef_kcal: { type: "number" },
    glycemic_impact: { type: "string", enum: ["low", "moderate", "high"] },
    glycemic_note: { type: "string" },
  },
} as const;

const FAT_MIMICRY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "replaces", "mechanism", "mouthfeel_result", "agents"],
  properties: {
    title: { type: "string" },
    replaces: { type: "string" },
    mechanism: { type: "string" },
    mouthfeel_result: { type: "string" },
    agents: { type: "array", items: { type: "string" } },
  },
} as const;

/** JSON Schema fragment for OpenAI Structured Outputs (generate). */
export const GOURMET_RECIPE_JSON_SCHEMA = {
  name: "gourmet_recipe",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "name",
      "tagline",
      "total_time_minutes",
      "active_time_minutes",
      "servings",
      "nutritional_strategy",
      "macros",
      "fat_loss_metrics",
      "fat_mimicry_tech",
      "ingredients",
      "steps",
      "culinary_physics_tips",
      "flavor_radar",
      "texture_balance",
      "psychological_reward_note",
      "plating",
      "tools_used",
      "tags",
    ],
    properties: {
      name: { type: "string" },
      tagline: { type: "string" },
      total_time_minutes: { type: "number" },
      active_time_minutes: { type: "number" },
      servings: { type: "number" },
      nutritional_strategy: {
        type: "string",
        enum: [
          "post_workout_high_protein",
          "rest_day_low_carb",
          "deep_cut_psmf",
          "balanced_deficit",
        ],
      },
      macros: {
        type: "object",
        additionalProperties: false,
        required: ["calories", "protein_g", "carbs_g", "fat_g", "fiber_g"],
        properties: {
          calories: { type: "number" },
          protein_g: { type: "number" },
          carbs_g: { type: "number" },
          fat_g: { type: "number" },
          fiber_g: { type: "number" },
        },
      },
      fat_loss_metrics: FAT_LOSS_METRICS_SCHEMA,
      fat_mimicry_tech: FAT_MIMICRY_SCHEMA,
      ingredients: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "quantity", "unit", "notes"],
          properties: {
            name: { type: "string" },
            quantity: { type: "string" },
            unit: { type: "string" },
            notes: { type: "string" },
          },
        },
      },
      steps: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["order", "instruction", "duration_minutes", "tip"],
          properties: {
            order: { type: "number" },
            instruction: { type: "string" },
            duration_minutes: { type: "number" },
            tip: { type: "string" },
          },
        },
      },
      culinary_physics_tips: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["technique", "explanation", "agents", "is_fat_mimicry"],
          properties: {
            technique: { type: "string" },
            explanation: { type: "string" },
            agents: { type: "array", items: { type: "string" } },
            is_fat_mimicry: { type: "boolean" },
          },
        },
      },
      flavor_radar: {
        type: "object",
        additionalProperties: false,
        required: ["sweet", "sour", "salty", "umami", "aroma_complexity"],
        properties: {
          sweet: { type: "number" },
          sour: { type: "number" },
          salty: { type: "number" },
          umami: { type: "number" },
          aroma_complexity: { type: "number" },
        },
      },
      texture_balance: { type: "array", items: { type: "string" } },
      psychological_reward_note: { type: "string" },
      plating: {
        type: "object",
        additionalProperties: false,
        required: [
          "composition",
          "color_contrast",
          "vessel",
          "garnish",
          "social_caption",
        ],
        properties: {
          composition: { type: "string" },
          color_contrast: { type: "string" },
          vessel: { type: "string" },
          garnish: { type: "string" },
          social_caption: { type: "string" },
        },
      },
      tools_used: { type: "array", items: { type: "string" } },
      tags: { type: "array", items: { type: "string" } },
    },
  },
} as const;

/** JSON Schema for elevate endpoint (extends gourmet with craving metadata). */
export const ELEVATED_RECIPE_JSON_SCHEMA = {
  name: "elevated_recipe",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "name",
      "tagline",
      "original_craving",
      "original_macros_estimate",
      "calories_saved",
      "substitutions",
      "total_time_minutes",
      "active_time_minutes",
      "servings",
      "nutritional_strategy",
      "macros",
      "fat_loss_metrics",
      "fat_mimicry_tech",
      "ingredients",
      "steps",
      "culinary_physics_tips",
      "flavor_radar",
      "texture_balance",
      "psychological_reward_note",
      "plating",
      "tools_used",
      "tags",
    ],
    properties: {
      ...(GOURMET_RECIPE_JSON_SCHEMA.schema.properties as object),
      original_craving: { type: "string" },
      original_macros_estimate: {
        type: "object",
        additionalProperties: false,
        required: ["calories", "protein_g", "carbs_g", "fat_g"],
        properties: {
          calories: { type: "number" },
          protein_g: { type: "number" },
          carbs_g: { type: "number" },
          fat_g: { type: "number" },
        },
      },
      calories_saved: { type: "number" },
      substitutions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["technique", "explanation", "agents", "is_fat_mimicry"],
          properties: {
            technique: { type: "string" },
            explanation: { type: "string" },
            agents: { type: "array", items: { type: "string" } },
            is_fat_mimicry: { type: "boolean" },
          },
        },
      },
    },
  },
} as const;
