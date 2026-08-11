import type { GourmetRecipe } from "@/types/recipe";

/** Demo payload for UI scaffolding — replace with live API responses. */
export const DEMO_RECIPE: GourmetRecipe = {
  name: "Sous-Vide Lemon Herb Chicken with Roasted Cauliflower Purée",
  tagline:
    "Bright citrus lift over silk-smooth brassica, finished with a whisper of browned butter aroma — without the butter.",
  total_time_minutes: 55,
  active_time_minutes: 25,
  servings: 1,
  macros: {
    calories: 448,
    protein_g: 46,
    carbs_g: 18,
    fat_g: 14,
    fiber_g: 6,
  },
  ingredients: [
    {
      name: "Chicken breast",
      quantity: "180",
      unit: "g",
      notes: "skinless",
    },
    {
      name: "Cauliflower",
      quantity: "200",
      unit: "g",
    },
    {
      name: "0% Greek yogurt",
      quantity: "40",
      unit: "g",
    },
    {
      name: "Xanthan gum",
      quantity: "0.2",
      unit: "g",
    },
    {
      name: "Lemon zest",
      quantity: "1",
      unit: "tsp",
    },
    {
      name: "Fresh thyme",
      quantity: "3",
      unit: "sprigs",
    },
  ],
  steps: [
    {
      order: 1,
      instruction:
        "Season chicken with salt, lemon zest, and thyme. Vacuum-seal and sous-vide at 62°C for 45 minutes.",
      duration_minutes: 45,
      tip: "62°C yields juicy fibers without excess rendered fat.",
    },
    {
      order: 2,
      instruction:
        "Roast cauliflower florets at 220°C until deeply golden. Blend with Greek yogurt and xanthan until glossy.",
      duration_minutes: 20,
      tip: "Xanthan at 0.1% stabilizes the emulsion so yogurt mimics cream.",
    },
    {
      order: 3,
      instruction:
        "Quick-sear the chicken 30 seconds per side for Maillard aroma, then plate over the purée.",
      duration_minutes: 2,
    },
  ],
  culinary_physics_tips: [
    {
      technique: "Low-fat cream emulsion",
      explanation:
        "Uses 0.2g xanthan gum + low-fat Greek yogurt to emulsify and replicate heavy cream texture without added fat.",
      agents: ["xanthan gum", "Greek yogurt"],
      is_fat_mimicry: true,
    },
  ],
  fat_loss_metrics: {
    satiety_index: 9.4,
    satiety_label: "High Satiety",
    tef_kcal: 45,
    glycemic_impact: "low",
    glycemic_note: "Low GI / Stable Insulin",
  },
  fat_mimicry_tech: {
    title: "Yogurt–Xanthan Cream Emulsion",
    replaces: "Heavy cream / butter finish",
    mechanism:
      "0.2g xanthan gum + low-fat Greek yogurt forms a stable hydrocolloid emulsion that coats the palate like dairy fat, without the caloric density of cream.",
    mouthfeel_result: "Silky, clingy creaminess with clean citrus finish",
    agents: ["xanthan gum", "0% Greek yogurt"],
  },
  nutritional_strategy: "post_workout_high_protein",
  flavor_radar: {
    sweet: 2,
    sour: 5,
    salty: 5,
    umami: 7,
    aroma_complexity: 8,
  },
  texture_balance: ["Silky & Juicy", "Charred Edge"],
  psychological_reward_note:
    "Lemon brightness and Maillard crust signal indulgence to the brain, while the yogurt-xanthan silk delivers cream-like mouthfeel at a fraction of the calories — dopamine without the deficit hangover.",
  plating: {
    composition:
      "Offset swoosh of purée, sliced chicken fanned at 45°, thyme leaf and lemon zest micro-confetti.",
    color_contrast: "Ivory purée against pale gold seared protein; green thyme accents.",
    vessel: "Matte charcoal shallow bowl",
    garnish: "Lemon zest + single thyme tip",
    social_caption:
      "Michelin physics, fat-loss macros. Zero willpower required. #GastronomyAI",
  },
  tools_used: ["sous_vide", "blender", "oven"],
  tags: ["high-protein", "gourmet-fat-loss"],
};
