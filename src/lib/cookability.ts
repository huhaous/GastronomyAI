/**
 * Weeknight / supermarket / batch policy, checked after generation the same way
 * strategy bounds are: the prompt states it, this reports when the model
 * ignored it.
 *
 * Macro verification and fat-mimicry stay untouched. This only asks whether
 * the plate can be bought at a normal supermarket, cooked without becoming a
 * project, and — on batch — whether it still exists on day three.
 */

import {
  findIngredientNode,
  isBatchHostile,
  isSpecialty,
} from "@/data/knowledgeGraph";
import type { CookabilityValidation, CookEffort, GourmetRecipe } from "@/types/recipe";

/** A weeknight plate that needs more than this is a project, whatever the clock says. */
export const WEEKNIGHT_MAX_STEPS = 6;

/** Cook once, eat several times — fewer than this is just dinner. */
export const BATCH_MIN_SERVINGS = 3;

const SPECIALTY_PHRASES = [
  "xanthan",
  "guar gum",
  "lecithin",
  "agar",
  "gelatin",
  "gelatine",
  "konjac",
  "shirataki",
  "erythritol",
  "allulose",
  "monk fruit",
  "nutritional yeast",
  "nooch",
  "almond flour",
];

const SAME_DAY_PHRASES = [
  "lettuce",
  "mesclun",
  "arugula",
  "rocket",
  "mixed greens",
  "salad greens",
  "avocado",
  "cucumber",
  "burger bun",
  "brioche",
  "white fish",
  "tilapia",
  "cod fillet",
  "haddock",
];

const REHEAT_PHRASES = [
  "reheat",
  "leftover",
  "fridge",
  "refrigerat",
  "meal prep",
  "meal-prep",
  "store",
  "container",
  "holds for",
];

function looksSpecialty(name: string): boolean {
  const lower = name.toLowerCase();
  return SPECIALTY_PHRASES.some((phrase) => lower.includes(phrase));
}

function looksSameDay(name: string): boolean {
  const lower = name.toLowerCase();
  return SAME_DAY_PHRASES.some((phrase) => lower.includes(phrase));
}

function pantryHas(name: string, pantry: string[]): boolean {
  const node = findIngredientNode(name);
  return pantry.some((item) => {
    const listed = findIngredientNode(item);
    if (node && listed && listed.name === node.name) return true;
    return item.toLowerCase().includes(name.toLowerCase()) ||
      name.toLowerCase().includes(item.toLowerCase());
  });
}

function hasReheatGuidance(recipe: GourmetRecipe): boolean {
  const blob = [
    ...(recipe.steps ?? []).flatMap((step) => [step.instruction, step.tip]),
    recipe.plating?.composition,
    ...(recipe.tags ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return REHEAT_PHRASES.some((phrase) => blob.includes(phrase));
}

export function validateCookability(
  recipe: GourmetRecipe,
  opts: {
    allowSpecialty?: boolean;
    effort?: CookEffort;
    pantry?: string[];
    timeLimitMinutes?: number;
  } = {}
): CookabilityValidation {
  const pantry = opts.pantry ?? [];
  const effort: CookEffort = opts.effort ?? "weeknight";
  const specialtyUsed: string[] = [];
  const batchHostileUsed: string[] = [];

  for (const line of recipe.ingredients ?? []) {
    if (!line.name) continue;
    const node = findIngredientNode(line.name);
    const specialty = node ? isSpecialty(node) : looksSpecialty(line.name);
    if (specialty) {
      if (!opts.allowSpecialty && pantryHas(line.name, pantry)) {
        // listed in pantry — allowed
      } else if (!opts.allowSpecialty) {
        specialtyUsed.push(node?.name ?? line.name);
      }
    }
    const hostile = node ? isBatchHostile(node) : looksSameDay(line.name);
    if (hostile) {
      batchHostileUsed.push(node?.name ?? line.name);
    }
  }

  const stepCount = recipe.steps?.length ?? 0;
  const violations: string[] = [];

  if (!opts.allowSpecialty && specialtyUsed.length > 0) {
    violations.push(
      `Uses ${specialtyUsed.join(", ")} — not a normal supermarket shop. The method still works; the ingredient is the trip that stops people cooking.`
    );
  }

  let weeknight = true;
  if (effort === "weeknight") {
    if (stepCount > WEEKNIGHT_MAX_STEPS) {
      weeknight = false;
      violations.push(
        `${stepCount} steps — weeknight plates stay at ${WEEKNIGHT_MAX_STEPS} or fewer.`
      );
    }
    const active = recipe.active_time_minutes;
    const cap = opts.timeLimitMinutes ?? 35;
    if (typeof active === "number" && active > cap) {
      weeknight = false;
      violations.push(
        `${active} minutes hands-on against a ${cap}-minute weeknight budget.`
      );
    }
  }

  let batch = true;
  if (effort === "batch") {
    const servings = recipe.servings ?? 1;
    if (servings < BATCH_MIN_SERVINGS) {
      batch = false;
      violations.push(
        `${servings} serving${servings === 1 ? "" : "s"} — a batch is ${BATCH_MIN_SERVINGS} or more so tomorrow is already cooked.`
      );
    }
    if (batchHostileUsed.length > 0) {
      batch = false;
      violations.push(
        `Uses ${batchHostileUsed.join(", ")} — fine tonight, dead in the fridge. Batch plates need food that reheats.`
      );
    }
    if (!hasReheatGuidance(recipe)) {
      batch = false;
      violations.push(
        "No pack-and-reheat step — a batch without a fridge instruction is just a large dinner."
      );
    }
    const active = recipe.active_time_minutes;
    const cap = opts.timeLimitMinutes;
    if (typeof cap === "number" && typeof active === "number" && active > cap) {
      batch = false;
      violations.push(
        `${active} minutes hands-on against a ${cap}-minute cook-session budget.`
      );
    }
  }

  return {
    supermarket: specialtyUsed.length === 0 || Boolean(opts.allowSpecialty),
    specialty_used: specialtyUsed,
    weeknight: effort === "weeknight" ? weeknight : true,
    batch: effort === "batch" ? batch : true,
    batch_hostile_used: batchHostileUsed,
    step_count: stepCount,
    violations,
  };
}
