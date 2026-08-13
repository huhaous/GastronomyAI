/**
 * Safety and disclaimer copy.
 *
 * Kept in one module because this text appears on screen, in print, and in
 * whatever a coach forwards to a client — and because wording that carries a
 * medical implication should not drift between three components.
 */

/** Shown wherever a recipe or its numbers are displayed. */
export const NUTRITION_DISCLAIMER =
  "Nutrition figures are estimates from reference data, not a measurement of the food you actually cook. GastronomyAI does not provide medical, dietetic or clinical advice. If you are pregnant or breastfeeding, under 18, managing a condition such as diabetes or kidney disease, or have a history of disordered eating, talk to a doctor or registered dietitian before changing how you eat.";

/** Compact form for tight spaces and shared captions. */
export const NUTRITION_DISCLAIMER_SHORT =
  "Estimates from reference data. Not medical or dietetic advice.";

export const PSMF_TITLE = "Deep Cut / PSMF is a clinical protocol";

export const PSMF_SUMMARY =
  "A protein-sparing modified fast is a very low calorie intervention designed for short, supervised phases. It is not a way of eating, and it is the one mode here that can do harm if used casually.";

export const PSMF_RISKS = [
  "Intended for limited periods under medical supervision, not as an ongoing diet.",
  "Rapid weight loss raises the risk of gallstones, and very low intake can disturb electrolytes.",
  "Requires deliberate micronutrient supplementation; these recipes do not provide it.",
  "Expect fatigue, poor training quality and lost muscle if it runs long.",
];

export const PSMF_EXCLUSIONS =
  "Not appropriate if you are pregnant or breastfeeding, under 18, have diabetes, kidney, liver or heart conditions, take medication affecting blood sugar or blood pressure, or have any history of disordered eating.";

export const PSMF_ACKNOWLEDGEMENT =
  "I understand this is an aggressive, medically supervised protocol and I take responsibility for how I use it.";

/** Attached to any recipe generated under the PSMF strategy. */
export const PSMF_RECIPE_NOTICE =
  "Generated under a protein-sparing modified fast. Intended for a short, supervised phase with separate micronutrient supplementation — not for ongoing use.";

/** Rejection message when the API is asked for PSMF without acknowledgement. */
export const PSMF_GATE_MESSAGE =
  "Deep Cut / PSMF requires an explicit safety acknowledgement before a recipe can be generated.";
