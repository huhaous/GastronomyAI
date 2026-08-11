import type { NutritionalStrategy } from "@/types/recipe";

export const NUTRITIONAL_STRATEGY_OPTIONS: {
  id: NutritionalStrategy;
  label: string;
  blurb: string;
  guidance: string;
}[] = [
  {
    id: "post_workout_high_protein",
    label: "Post-Workout High-Protein",
    blurb: "Glycogen refill + muscle repair",
    guidance:
      "Prioritize lean protein (≥40% kcal from protein when possible), include fast-digesting carbs around training, keep fats moderate. Maximize satiety without sluggishness.",
  },
  {
    id: "rest_day_low_carb",
    label: "Rest Day Low-Carb",
    blurb: "Lower insulin load, steady energy",
    guidance:
      "Keep carbs low (favor non-starchy vegetables + fiber), elevate protein and volume, use healthy fats sparingly for flavor. Emphasize Low GI / stable insulin.",
  },
  {
    id: "deep_cut_psmf",
    label: "Deep Cut / PSMF",
    blurb: "Aggressive deficit, protein-sparing",
    guidance:
      "Protein-sparing modified fast: very low fat and carbs, maximal lean protein + fibrous volume. Fat-mimicry tech is mandatory so mouthfeel still feels indulgent. Strict calorie ceiling.",
  },
  {
    id: "balanced_deficit",
    label: "Balanced Deficit",
    blurb: "Sustainable everyday cut",
    guidance:
      "Moderate deficit with balanced macros, high satiety density, and culinary reward so adherence stays effortless.",
  },
];

export const DEFAULT_NUTRITIONAL_STRATEGY: NutritionalStrategy =
  "balanced_deficit";

export function strategyLabel(id: NutritionalStrategy): string {
  return (
    NUTRITIONAL_STRATEGY_OPTIONS.find((s) => s.id === id)?.label ?? id
  );
}
