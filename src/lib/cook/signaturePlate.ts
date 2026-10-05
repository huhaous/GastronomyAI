/**
 * Spend the calorie budget on the craving's signature, not on "healthy extras."
 *
 * Volume greens, a mustard tang, and a garlic bloom are how Elevate becomes a
 * different dish. This pass drops those unless the craving named them, puts
 * the loud agents on the list, and caps yogurt so it binds instead of tasting
 * like a tub. Idempotent.
 */

import { findIngredientNode, type IngredientNode } from "@/data/knowledgeGraph";
import { ensureCarbonaraEmulsion } from "@/lib/cook/carbonaraEmulsion";
import {
  cravingAskedFor,
  inferMealIdentity,
  shouldDropVolumeLine,
  type MealIdentity,
} from "@/lib/cook/mealIdentity";
import { parseAmount, resolveUnitToken } from "@/lib/nutrition/foodLines";
import type { GourmetRecipe, RecipeIngredient } from "@/types/recipe";

const GUILT_COPY =
  /without the guilt|guilt[- ]free|healthier twist|lighter twist|mimics? (?:the |traditional |classic )|diet version|not a punishment/i;

const SIGNATURE_DEFAULTS: Record<string, RecipeIngredient> = {
  parmesan: { name: "Parmesan", quantity: "15", unit: "g" },
  "black pepper": {
    name: "black pepper",
    quantity: "1",
    unit: "g",
    notes: "plenty, freshly ground",
  },
  pepper: {
    name: "black pepper",
    quantity: "1",
    unit: "g",
    notes: "plenty, freshly ground",
  },
  garlic: { name: "Garlic", quantity: "5", unit: "g", notes: "minced" },
  bun: {
    name: "Whole Wheat Burger Bun",
    quantity: "70",
    unit: "g",
    notes: "1 bun",
  },
};

function cravingText<T extends GourmetRecipe>(recipe: T, craving?: string): string {
  const original =
    "original_craving" in recipe
      ? String((recipe as { original_craving?: string }).original_craving ?? "")
      : "";
  return `${craving ?? ""} ${original} ${recipe.name}`;
}

function isBlackPepperLine(name: string): boolean {
  return (
    /\bpepper\b/i.test(name) &&
    !/bell pepper|chili pepper|pepper flakes|red pepper|capsicum/i.test(name)
  );
}

function lineMatchesQuery(name: string, query: string): boolean {
  if (/pepper/i.test(query) && isBlackPepperLine(name) && !/bell/i.test(query)) {
    return true;
  }
  const node = findIngredientNode(name);
  const want = findIngredientNode(query);
  if (node && want && node.key === want.key) return true;
  return name.toLowerCase().includes(query.toLowerCase());
}

function alreadyOnPlate(recipe: GourmetRecipe, query: string): boolean {
  return recipe.ingredients.some((line) => lineMatchesQuery(line.name, query));
}

function cravingAskedForRole(asked: string, node: IngredientNode): boolean {
  if (cravingAskedFor(asked, node)) return true;
  const hay = asked.toLowerCase();
  return (node.substitutionFor ?? []).some((target) => {
    const friend = findIngredientNode(target);
    if (friend && cravingAskedFor(asked, friend)) return true;
    return target
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length >= 4)
      .some((word) => hay.includes(word));
  });
}

/**
 * One plate, one sauce physics. Starch gloss wins over a yogurt dump unless
 * the craving named a food yogurt actually substitutes for (cream, mayo).
 */
function dropLosingSauce<T extends GourmetRecipe>(
  recipe: T,
  identity: MealIdentity,
  asked: string
): T {
  if (identity.starchCook === "toast_assemble") return recipe;
  if (identity.saucePhysics === "lecithin_emulsion") return recipe;
  const gloss = recipe.ingredients.some(
    (line) => findIngredientNode(line.name)?.handling?.saucePhysics === "starch_gloss"
  );
  if (!gloss) return recipe;

  const keepDairy = recipe.ingredients.some((line) => {
    const node = findIngredientNode(line.name);
    return (
      node?.handling?.saucePhysics === "cold_dairy" && cravingAskedForRole(asked, node)
    );
  });
  if (keepDairy) return recipe;

  const ingredients = recipe.ingredients.filter((line) => {
    return findIngredientNode(line.name)?.handling?.saucePhysics !== "cold_dairy";
  });
  if (ingredients.length === recipe.ingredients.length) return recipe;
  return { ...recipe, ingredients };
}

function dropOffIdentity<T extends GourmetRecipe>(
  recipe: T,
  identity: MealIdentity,
  asked: string
): T {
  const ingredients = recipe.ingredients.filter((line) => {
    const node = findIngredientNode(line.name);
    if (!node) return true;
    if (shouldDropVolumeLine(node, asked, identity)) {
      return false;
    }
    if (
      identity.dropMustardUnlessAsked &&
      node.key === "mustard" &&
      !cravingAskedFor(asked, node)
    ) {
      return false;
    }
    if (
      identity.dropAlliumsUnlessAsked &&
      node.handling?.bloomBeforeColdDairy &&
      !cravingAskedFor(asked, node)
    ) {
      return false;
    }
    return true;
  });
  if (ingredients.length === recipe.ingredients.length) return recipe;
  return { ...recipe, ingredients };
}

function ensureSignatureAgents<T extends GourmetRecipe>(
  recipe: T,
  identity: MealIdentity
): T {
  const extra: RecipeIngredient[] = [];
  const queries = [...identity.signature];
  if (identity.starchCook === "toast_assemble") queries.push("bun");
  for (const query of queries) {
    if (alreadyOnPlate(recipe, query)) continue;
    const fallback = SIGNATURE_DEFAULTS[query.toLowerCase()];
    if (!fallback) continue;
    extra.push({ ...fallback });
  }
  if (extra.length === 0) return recipe;
  return { ...recipe, ingredients: [...recipe.ingredients, ...extra] };
}

function capBinderDairy<T extends GourmetRecipe>(
  recipe: T,
  identity: MealIdentity
): T {
  const cap = identity.binderCapGrams;
  if (!cap || cap <= 0) return recipe;
  const servings = Math.max(1, recipe.servings || 1);
  const potCap = cap * servings;
  let changed = false;
  const ingredients = recipe.ingredients.map((line) => {
    if (!/yogurt|yoghurt|cottage cheese/i.test(line.name)) return line;
    const amount = parseAmount(line.quantity);
    if (amount == null || amount <= potCap) return line;
    const unit = resolveUnitToken(line);
    changed = true;
    return { ...line, quantity: String(potCap), unit };
  });
  return changed ? { ...recipe, ingredients } : recipe;
}

function permissionCopy<T extends GourmetRecipe>(
  recipe: T,
  identity: MealIdentity
): T {
  const note = recipe.psychological_reward_note ?? "";
  const tagline = recipe.tagline ?? "";
  const noteNeeds = !note.trim() || GUILT_COPY.test(note);
  const tagNeeds = GUILT_COPY.test(tagline);
  if (!noteNeeds && !tagNeeds) return recipe;
  return {
    ...recipe,
    psychological_reward_note: noteNeeds ? identity.permissionNote : note,
    tagline: tagNeeds ? identity.permissionNote : tagline,
  };
}

export interface SignaturePlateOptions {
  craving?: string;
  targetCalories?: number;
}

/**
 * Run before portion scaling so the cap prices cheese and a smaller yogurt,
 * not spinach the diner did not ask for.
 */
export function applySignaturePlate<T extends GourmetRecipe>(
  recipe: T,
  options?: SignaturePlateOptions
): T {
  const identity = inferMealIdentity(recipe, options?.craving);
  const asked = cravingText(recipe, options?.craving);
  let next = dropOffIdentity(recipe, identity, asked);
  next = dropLosingSauce(next, inferMealIdentity(next, options?.craving), asked);
  next = ensureSignatureAgents(next, inferMealIdentity(next, options?.craving));
  next = capBinderDairy(next, inferMealIdentity(next, options?.craving));
  if (inferMealIdentity(next, options?.craving).saucePhysics === "lecithin_emulsion") {
    next = ensureCarbonaraEmulsion(next, {
      craving: options?.craving,
      targetCalories: options?.targetCalories,
    });
  }
  return permissionCopy(next, inferMealIdentity(next, options?.craving));
}
