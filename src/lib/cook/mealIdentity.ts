/**
 * Cook identity is inferred from the plate and the graph, never from a dish
 * name. A new craving does not need a new regex: if the food is in the graph
 * with a starch cook or an emulsion role, the engine already knows what to do.
 */

import { findIngredientNode, type IngredientNode } from "@/data/knowledgeGraph";
import type { GourmetRecipe } from "@/types/recipe";

export type StarchCook = "boil_reserve_toss" | "simmer" | "toast_assemble" | "reheat";
export type SaucePhysics = "cold_dairy" | "lecithin_emulsion" | "starch_gloss" | "none";

export interface MealIdentity {
  id: string;
  /** Graph names to keep loud — derived from starch / emulsion flavorPairs. */
  signature: string[];
  starchCook?: StarchCook;
  saucePhysics: SaucePhysics;
  dropVolumeUnlessAsked: boolean;
  keepPieceGreensOnToast: boolean;
  dropMustardUnlessAsked: boolean;
  dropAlliumsUnlessAsked: boolean;
  binderCapGrams?: number;
  noBlender: boolean;
  permissionNote: string;
}

const COLD_DAIRY = /yogurt|yoghurt|cottage cheese|quark|fromage blanc/i;
const BLENDER_CRAVING = /smoothie|soup|puree|purée|hummus|shake/i;

function plateText(recipe: GourmetRecipe, craving?: string): string {
  const original =
    "original_craving" in recipe
      ? String((recipe as { original_craving?: string }).original_craving ?? "")
      : "";
  return `${craving ?? ""} ${original} ${recipe.name}`;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Longest graph match wins, so "cauliflower rice" is cauliflower (no starch)
 * and does not fall through to the word "rice".
 */
export function starchCookFromText(text: string): StarchCook | undefined {
  const words = normalize(text).split(" ").filter(Boolean);
  if (words.length === 0) return undefined;
  const claimed = new Array(words.length).fill(false);
  const maxLen = Math.min(4, words.length);

  for (let len = maxLen; len >= 1; len -= 1) {
    for (let i = 0; i + len <= words.length; i += 1) {
      let taken = false;
      for (let k = 0; k < len; k += 1) {
        if (claimed[i + k]) taken = true;
      }
      if (taken) continue;
      const phrase = words.slice(i, i + len).join(" ");
      const node = findIngredientNode(phrase);
      if (!node) continue;
      for (let k = 0; k < len; k += 1) claimed[i + k] = true;
      const cook = node.handling?.starchCook;
      if (cook && !node.handling?.volumeNoodle) return cook;
    }
  }
  return undefined;
}

function plateStarchCook(recipe: GourmetRecipe): StarchCook | undefined {
  for (const cook of [
    "toast_assemble",
    "boil_reserve_toss",
    "reheat",
    "simmer",
  ] as StarchCook[]) {
    if (
      recipe.ingredients.some((line) => {
        const handling = findIngredientNode(line.name)?.handling;
        return handling?.starchCook === cook && !handling.volumeNoodle;
      })
    ) {
      return cook;
    }
  }
  return undefined;
}

function plateHasColdDairy(recipe: GourmetRecipe): boolean {
  return recipe.ingredients.some((line) => COLD_DAIRY.test(line.name));
}

function plateHasLecithinEgg(recipe: GourmetRecipe): boolean {
  return recipe.ingredients.some(
    (line) => findIngredientNode(line.name)?.handling?.emulsionRole === "lecithin"
  );
}

function plateHasSaucePhysics(
  recipe: GourmetRecipe,
  physics: NonNullable<IngredientNode["handling"]>["saucePhysics"]
): boolean {
  return recipe.ingredients.some(
    (line) => findIngredientNode(line.name)?.handling?.saucePhysics === physics
  );
}

function isPepperPair(pair: string): boolean {
  return (
    /\bpepper\b/i.test(pair) &&
    !/bell pepper|chili pepper|pepper flakes|red pepper/i.test(pair)
  );
}

/**
 * Loud agents come from the graph: finish cheeses the starch already pairs
 * with, and pepper/cheese the lecithin egg already pairs with. No dish list.
 */
export function signatureFromPlate(recipe: GourmetRecipe): string[] {
  const queries: string[] = [];
  const seen = new Set<string>();
  const add = (query: string) => {
    const key = query.toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    queries.push(query);
  };

  for (const line of recipe.ingredients) {
    const node = findIngredientNode(line.name);
    if (!node) continue;
    if (node.handling?.starchCook === "toast_assemble") add("bun");
    if (node.handling?.emulsionRole === "lecithin") {
      for (const pair of node.flavorPairs) {
        if (isPepperPair(pair)) add("pepper");
        const friend = findIngredientNode(pair);
        if (friend?.handling?.methodRole === "finish") add(friend.name);
      }
    }
    if (
      node.handling?.starchCook === "boil_reserve_toss" &&
      plateHasColdDairy(recipe)
    ) {
      for (const pair of node.flavorPairs) {
        const friend = findIngredientNode(pair);
        if (friend?.handling?.methodRole === "finish") add(friend.name);
      }
    }
  }
  return queries;
}

function noteFor(sauce: SaucePhysics, starch: StarchCook | undefined): string {
  if (sauce === "lecithin_emulsion") {
    return "Hot pepper, cheese, and pasta-water silk — the craving, not a yogurt bowl.";
  }
  if (sauce === "cold_dairy") {
    return "Silk that coats. The dairy is a binder, not the dish.";
  }
  if (starch === "toast_assemble") {
    return "A bun, a sear, and salt. Eat it as a burger.";
  }
  if (starch === "reheat") {
    return "Warm the cooked starch. It is already cooked — do not simmer it as dry grain.";
  }
  return "The thing you asked for, with the calories sitting in the flavour.";
}

export function inferMealIdentity(
  recipe: GourmetRecipe,
  craving?: string
): MealIdentity {
  const text = plateText(recipe, craving);
  const starchCook = plateStarchCook(recipe) ?? starchCookFromText(text);
  const dairy = plateHasColdDairy(recipe);
  const pasta = starchCook === "boil_reserve_toss";
  const egg = plateHasLecithinEgg(recipe);
  const gloss = plateHasSaucePhysics(recipe, "starch_gloss");
  const saucePhysics: SaucePhysics =
    pasta && dairy && egg
      ? "lecithin_emulsion"
      : gloss && !dairy
        ? "starch_gloss"
        : dairy
          ? "cold_dairy"
          : gloss
            ? "starch_gloss"
            : "none";

  return {
    id:
      saucePhysics === "lecithin_emulsion"
        ? "lecithin_pasta"
        : saucePhysics === "cold_dairy" && pasta
          ? "dairy_pasta"
          : starchCook === "toast_assemble"
            ? "toast"
            : starchCook === "reheat"
              ? "reheat"
              : starchCook === "simmer"
                ? "simmer"
                : "plate",
    signature: signatureFromPlate(recipe),
    starchCook,
    saucePhysics,
    dropVolumeUnlessAsked: true,
    keepPieceGreensOnToast: starchCook === "toast_assemble",
    dropMustardUnlessAsked: saucePhysics === "lecithin_emulsion",
    dropAlliumsUnlessAsked: saucePhysics === "lecithin_emulsion",
    binderCapGrams: dairy ? (saucePhysics === "lecithin_emulsion" ? 80 : 100) : undefined,
    noBlender: !BLENDER_CRAVING.test(text),
    permissionNote: noteFor(saucePhysics, starchCook),
  };
}

export function resolveMealIdentity(
  recipe: GourmetRecipe,
  craving?: string
): MealIdentity {
  return inferMealIdentity(recipe, craving);
}

export function resolveMealIdentityFromText(text: string): MealIdentity {
  const stub = {
    name: text,
    ingredients: [] as GourmetRecipe["ingredients"],
    steps: [],
    tagline: "",
    total_time_minutes: 0,
    active_time_minutes: 0,
    servings: 1,
    macros: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
    fat_loss_metrics: {
      satiety_index: 0,
      satiety_label: "",
      tef_kcal: 0,
      glycemic_impact: "low" as const,
      glycemic_note: "",
    },
    fat_mimicry_tech: {
      title: "",
      replaces: "",
      mechanism: "",
      mouthfeel_result: "",
    },
    culinary_physics_tips: [],
    flavor_radar: { sweet: 0, sour: 0, salty: 0, umami: 0, aroma_complexity: 0 },
    texture_balance: [],
    psychological_reward_note: "",
    plating: { composition: "" },
    tools_used: [],
  } as GourmetRecipe;
  return inferMealIdentity(stub, text);
}

export function cravingAskedFor(text: string, node: IngredientNode): boolean {
  const hay = text.toLowerCase();
  const phrases = [node.name, node.cookName, ...(node.aliases ?? [])]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase().replace(/\(.*?\)/g, " ").trim());
  return phrases.some((phrase) => {
    const token = phrase.split(/\s+/).filter((w) => w.length >= 4).join(" ");
    const needle = token || phrase;
    if (needle.length < 4) return hay.includes(needle);
    return hay.includes(needle);
  });
}

export function lineIsVolumeExtra(name: string): boolean {
  const node = findIngredientNode(name);
  return node?.handling?.elevationRole === "volume";
}

export function shouldDropVolumeLine(
  node: IngredientNode,
  asked: string,
  identity: MealIdentity
): boolean {
  if (!identity.dropVolumeUnlessAsked) return false;
  if (node.handling?.elevationRole !== "volume") return false;
  if (cravingAskedFor(asked, node)) return false;
  if (identity.keepPieceGreensOnToast && node.handling.countAsPiece) return false;
  return true;
}
