/**
 * When a verified plate cannot reach the requested target without portions that
 * stop resembling cooking, name a flavor-aligned add or swap that can.
 *
 * The scaler already did the honest thing: it pushed every role to its bound and
 * stopped. Refusing the request throws away a cookable dish; serving the miss
 * without a next step leaves the user to invent the energy. This looks through
 * the same graph for an ingredient that (a) pairs with what is already on the
 * plate, (b) closes the gap at a cook-plausible amount, and (c) still satisfies
 * the strategy's enforced bounds.
 *
 * Knows nothing about recipes as documents — a list of food lines, a macro
 * total and a target are enough — so a logged meal that undershoots a day can
 * use it later without a rewrite.
 */

import {
  FAT_LOSS_RULES,
  INGREDIENT_GRAPH,
  PANTRY_GRAPH,
  findIngredientNode,
  isAromatic,
  isBatchHostile,
  isSpecialty,
  type IngredientNode,
} from "@/data/knowledgeGraph";
import {
  resolveFoodLines,
  round1,
  type FoodLine,
} from "@/lib/nutrition/foodLines";
import { classifyGroup, type ScaleGroup } from "@/lib/nutrition/portionScaling";
import type {
  GapSuggestion,
  MacroProfile,
  NutritionalStrategy,
} from "@/types/nutrition";
import type { CookEffort, GourmetRecipe, MethodAlternate, RecipeStep } from "@/types/recipe";
import { repairCookMethod } from "@/lib/cook/methodIntegrity";
import {
  resolveMealIdentityFromText,
  shouldDropVolumeLine,
  starchCookFromText,
} from "@/lib/cook/mealIdentity";

/** Below this the miss is rounding, not a different meal. */
const GAP_TOLERANCE = 0.1;

/** A suggestion that recovers less than this of the gap is noise. */
const MIN_GAP_FRACTION = 0.3;
const MIN_KCAL_MOVED = 40;

/** Texture agents and baking inputs — they are not a plate. */
const NOT_A_PLATE = new Set([
  "Panko Breadcrumbs",
  "Almond Flour",
  "Xanthan Gum",
  "Gelatin",
  "Lecithin",
  "Cocoa Powder",
  "Erythritol",
  "Nutritional Yeast",
]);

const EMPTY: MacroProfile = {
  calories: 0,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
};

function add(a: MacroProfile, b: MacroProfile): MacroProfile {
  return {
    calories: Math.round(a.calories + b.calories),
    protein_g: round1(a.protein_g + b.protein_g),
    carbs_g: round1(a.carbs_g + b.carbs_g),
    fat_g: round1(a.fat_g + b.fat_g),
  };
}

function scale(macros: MacroProfile, factor: number): MacroProfile {
  return {
    calories: macros.calories * factor,
    protein_g: macros.protein_g * factor,
    carbs_g: macros.carbs_g * factor,
    fat_g: macros.fat_g * factor,
  };
}

function fromGrams(node: IngredientNode, grams: number): MacroProfile {
  const macros = scale(
    {
      calories: node.macroPer100g.calories,
      protein_g: node.macroPer100g.protein_g,
      carbs_g: node.macroPer100g.carbs_g,
      fat_g: node.macroPer100g.fat_g,
    },
    grams / 100
  );
  return {
    calories: Math.round(macros.calories),
    protein_g: round1(macros.protein_g),
    carbs_g: round1(macros.carbs_g),
    fat_g: round1(macros.fat_g),
  };
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-word mention, with a simple plural. "ice" must not hit "rice". */
function mentions(haystack: string, needle: string): boolean {
  const h = normalize(haystack);
  const n = normalize(needle);
  if (!h || !n || n.length < 3) return false;
  if (h === n) return true;
  return new RegExp(`(^|\\s)${escapeRe(n)}(es|s)?($|\\s)`).test(h);
}

function nodeMentions(node: IngredientNode, phrase: string): boolean {
  if (mentions(node.name, phrase) || mentions(phrase, node.name)) return true;
  return (node.aliases ?? []).some(
    (alias) => mentions(alias, phrase) || mentions(phrase, alias)
  );
}

const WEAK_PAIRS = new Set([
  "garlic",
  "salt",
  "pepper",
  "oil",
  "onion",
  "butter",
  "lemon",
  "chili",
]);

function flavorLink(a: IngredientNode, b: IngredientNode): string | undefined {
  for (const pair of a.flavorPairs) {
    if (nodeMentions(b, pair)) return pair;
  }
  for (const pair of b.flavorPairs) {
    if (nodeMentions(a, pair)) return pair;
  }
  // Shared pairing only counts when both lists name the same thing
  // ("lime" × "lime"). Substring matches turn "sesame" on bok choy into a
  // burger bun because the bun lists sesame seeds.
  for (const ap of a.flavorPairs) {
    const token = normalize(ap);
    if (!token || WEAK_PAIRS.has(token)) continue;
    for (const bp of b.flavorPairs) {
      if (token === normalize(bp)) return ap;
    }
  }
  return undefined;
}

function substitutionLink(
  from: IngredientNode,
  to: IngredientNode
): string | undefined {
  if (from.substitutionFor.some((role) => roleMatchesNode(to, role))) {
    return from.name;
  }
  if (to.substitutionFor.some((role) => roleMatchesNode(from, role))) {
    return from.name;
  }
  return undefined;
}

/** "pasta noodles" should match a node named Pasta (dry). */
function roleMatchesNode(node: IngredientNode, role: string): boolean {
  if (nodeMentions(node, role) || mentions(role, node.name)) return true;
  const roleN = normalize(role);
  for (const alias of node.aliases ?? []) {
    const a = normalize(alias);
    if (a.length >= 4 && roleN.includes(a)) return true;
  }
  const first = normalize(node.name).split(" ")[0];
  return first.length >= 4 && roleN.includes(first);
}

function isCarbVehicle(node: IngredientNode): boolean {
  return Boolean(node.handling?.starchCook) && !node.handling?.volumeNoodle;
}

function plateCarbVehicle(plateNodes: IngredientNode[]): IngredientNode | undefined {
  return plateNodes.find(isCarbVehicle);
}

type StarchCook = NonNullable<NonNullable<IngredientNode["handling"]>["starchCook"]>;

/**
 * The craving names the starch cook via graph foods, not a dish-name list.
 * Zucchini→pasta is an Alfredo repair only when the craving is actually pasta.
 */
export function mealStarchCook(
  craving?: string,
  dishName?: string
): StarchCook | undefined {
  return starchCookFromText(`${craving ?? ""} ${dishName ?? ""}`);
}

function offIdentityVolume(
  node: IngredientNode,
  craving?: string,
  dish?: string
): boolean {
  const asked = `${craving ?? ""} ${dish ?? ""}`;
  const identity = resolveMealIdentityFromText(asked);
  return shouldDropVolumeLine(node, asked, identity);
}

function starchCookAllowed(
  node: IngredientNode,
  craving: string | undefined,
  dishName: string | undefined,
  plateNodes: IngredientNode[]
): boolean {
  if (!isCarbVehicle(node)) return true;
  const cook = node.handling?.starchCook;
  if (!cook) return true;
  const vehicle = plateCarbVehicle(plateNodes);
  if (vehicle?.handling?.starchCook && vehicle.handling.starchCook !== cook) {
    return false;
  }
  const wanted = mealStarchCook(craving, dishName);
  if (wanted && wanted !== cook) return false;
  return true;
}

function cravingBoost(
  node: IngredientNode,
  craving: string | undefined,
  plateNodes: IngredientNode[]
): number {
  if (!craving) return 0;
  const c = normalize(craving);
  if (!c) return 0;
  const vehicle = plateCarbVehicle(plateNodes);
  // The plate's starch identity wins leftover craving from a previous dish.
  if (
    vehicle?.handling?.starchCook === "toast_assemble" &&
    node.handling?.starchCook === "boil_reserve_toss" &&
    vehicle.name !== node.name
  ) {
    return -20;
  }
  const wanted = mealStarchCook(craving);
  const name = normalize(node.name);
  const aliases = (node.aliases ?? []).map(normalize);
  if (
    wanted &&
    node.handling?.starchCook === wanted &&
    isCarbVehicle(node) &&
    vehicle?.handling?.starchCook !== "toast_assemble"
  ) {
    return 10;
  }
  if (
    wanted === "toast_assemble" &&
    (name.includes("bun") || aliases.some((a) => a.includes("bun")))
  ) {
    return 10;
  }
  if (c.includes("pizza") && name.includes("mozzarella")) return 6;
  return 0;
}

function roundGrams(value: number): number {
  if (value >= 50) return Math.round(value / 5) * 5;
  if (value >= 10) return Math.round(value);
  return Math.max(4, Math.round(value * 2) / 2);
}

/**
 * Cook-plausible window for a newly introduced amount. Oils stay at a
 * tablespoon; a half-avocado is allowed to be itself rather than treated as oil.
 */
function plausibleGrams(
  node: IngredientNode,
  group: ScaleGroup,
  onPlate = false
): {
  min: number;
  max: number;
} {
  const piece = node.gramsPer?.piece;
  if (onPlate && node.handling?.countAsPiece && piece && piece >= 40 && piece <= 220) {
    return { min: Math.round(piece * 0.4), max: piece };
  }
  // A 400g tofu block is a package, not a portion. Piece weights above a
  // reasonable serving would otherwise recommend half a kilo of it.
  if (piece && piece >= 40 && piece <= 220) {
    return { min: Math.round(piece * 0.4), max: Math.round(piece * 1.25) };
  }
  // Seeds, oils and other tablespoon foods: two tablespoons is cooking,
  // 65g of sesame seeds is a different dish.
  const tbsp = node.gramsPer?.tbsp;
  if (tbsp && tbsp <= 15 && node.macroPer100g.calories >= 400) {
    return { min: node.gramsPer?.tsp ?? Math.min(4.5, tbsp), max: tbsp * 2 };
  }
  if (group === "fat" && node.macroPer100g.calories >= 600) {
    return { min: node.gramsPer?.tsp ?? 4.5, max: tbsp ?? 13.5 };
  }
  if (group === "fat") return { min: 20, max: 80 };
  if (group === "carb") return { min: 25, max: 80 };
  if (group === "protein") return { min: 50, max: 160 };
  return { min: 50, max: 200 };
}

function usefulMove(
  moved: number,
  resultingKcal: number,
  gap: number,
  targetKcal: number
): boolean {
  if (moved < MIN_KCAL_MOVED) return false;
  if (moved >= gap * MIN_GAP_FRACTION) return true;
  return resultingKcal >= targetKcal * (1 - GAP_TOLERANCE);
}

/**
 * Pick a cook-plausible amount, shrinking it until the strategy still holds.
 * The calorie-ideal portion is the starting point; blowing a carb ceiling is
 * not a reason to hide rice, it is a reason to suggest less of it.
 */
function fitPortion(
  node: IngredientNode,
  group: ScaleGroup,
  energyToAdd: number,
  base: MacroProfile,
  removed: MacroProfile | undefined,
  strategy: NutritionalStrategy | undefined,
  gap: number,
  targetKcal: number,
  onPlate = false
): { grams: number; resulting: MacroProfile; moved: number } | undefined {
  if (node.macroPer100g.calories <= 0) return undefined;
  const bounds = plausibleGrams(node, group, onPlate);
  let grams = roundGrams(
    Math.min(
      bounds.max,
      Math.max(bounds.min, (energyToAdd / node.macroPer100g.calories) * 100)
    )
  );

  for (let step = 0; step < 10; step += 1) {
    const added = fromGrams(node, grams);
    const without = removed ? add(base, scale(removed, -1)) : base;
    const resulting = add(without, added);
    const moved = resulting.calories - base.calories;
    if (
      usefulMove(moved, resulting.calories, gap, targetKcal) &&
      withinStrategy(base, resulting, strategy)
    ) {
      return { grams, resulting, moved };
    }
    const next = roundGrams(grams - Math.max(5, grams * 0.15));
    if (next < bounds.min || next >= grams) break;
    grams = next;
  }
  return undefined;
}

function withinStrategy(
  _before: MacroProfile,
  after: MacroProfile,
  strategy?: NutritionalStrategy
): boolean {
  if (!strategy) return true;
  const rule = FAT_LOSS_RULES[strategy];
  if (!rule || after.calories <= 0) return true;

  // Suggestions use the target ceilings, not the looser enforced bounds.
  // A rest-day plate that skates to 29% carbs would not be flagged as a
  // failure, but recommending rice as the fix would miss the point of the day.
  const carbPct = (after.carbs_g * 4) / after.calories * 100;
  const fatPct = (after.fat_g * 9) / after.calories * 100;
  const proteinPct = (after.protein_g * 4) / after.calories * 100;

  if (carbPct > rule.carbPercentRange[1] + 1) return false;
  if (fatPct > rule.fatPercentRange[1] + 1) return false;
  if (proteinPct < rule.enforcedBounds.proteinMinPercent) return false;
  if (
    rule.enforcedBounds.carbMinPercent != null &&
    carbPct < rule.enforcedBounds.carbMinPercent
  ) {
    return false;
  }
  return true;
}

function alreadyOnPlate(node: IngredientNode, names: string[]): boolean {
  return names.some((name) => {
    const matched = findIngredientNode(name);
    if (matched) return matched.name === node.name;
    return nodeMentions(node, name);
  });
}

function inPantry(node: IngredientNode, pantry: string[]): boolean {
  return pantry.some((item) => {
    const matched = findIngredientNode(item);
    return matched?.name === node.name || nodeMentions(node, item);
  });
}

function candidates(allowSpecialty: boolean, effort?: CookEffort): IngredientNode[] {
  return [...Object.values(INGREDIENT_GRAPH), ...Object.values(PANTRY_GRAPH)].filter(
    (node) =>
      !node.negligible &&
      !isAromatic(node) &&
      !NOT_A_PLATE.has(node.name) &&
      node.macroPer100g.calories >= 20 &&
      (allowSpecialty || !isSpecialty(node)) &&
      (effort !== "batch" || !isBatchHostile(node))
  );
}

function flavorNote(link: string, pantryHit: boolean, swapOf?: string): string {
  if (swapOf) {
    return pantryHit
      ? `A denser stand-in for ${swapOf}, and you already listed it.`
      : `A denser stand-in for ${swapOf} that keeps the same seasoning.`;
  }
  if (pantryHit) {
    return `You already listed it, and it pairs with the ${link} on the plate.`;
  }
  return `Keeps the ${link} already on the plate.`;
}

interface Ranked extends GapSuggestion {
  group: ScaleGroup;
  score: number;
}

function scoreOf(
  s: Ranked,
  pantryHit: boolean,
  satiety: number,
  craving: number
): number {
  return (
    (s.closes_gap ? 8 : 0) +
    (s.kind === "swap" ? 2 : 0) +
    (pantryHit ? 3 : 0) +
    satiety * 0.15 +
    Math.min(4, (Math.abs(s.calories_added) / 80) * 2) +
    craving
  );
}

export interface GapFillInput {
  lines: FoodLine[];
  /** Per-serving macros of the plate as it stands. */
  macros: MacroProfile;
  servings: number;
  /** Per-serving target. */
  target: Partial<MacroProfile>;
  strategy?: NutritionalStrategy;
  pantry?: string[];
  allowSpecialty?: boolean;
  effort?: CookEffort;
  /** Elevate craving — used to prefer pasta for Alfredo, rice for fried rice, etc. */
  craving?: string;
  /** Recipe name, so "Zucchini Chicken Burger" is a burger even if craving is thin. */
  dish?: string;
}

/**
 * Returns at most three suggestions, one per ingredient role, or an empty list
 * when the plate is close enough or nothing in the graph can close the gap
 * without breaking the strategy.
 */
export function suggestGapFillers(input: GapFillInput): GapSuggestion[] {
  const targetKcal = input.target.calories;
  if (!targetKcal || targetKcal <= 0) return [];

  const gap = targetKcal - input.macros.calories;
  if (Math.abs(gap) / targetKcal <= GAP_TOLERANCE) return [];

  const servings = Math.max(1, input.servings || 1);
  const { lines } = resolveFoodLines(input.lines);
  const plateNames = input.lines.map((line) => line.name).filter(Boolean);
  const plateNodes = plateNames
    .map((name) => findIngredientNode(name))
    .filter((node): node is NonNullable<typeof node> => Boolean(node));

  const pantry = input.pantry ?? [];
  const ranked: Ranked[] = [];

  if (gap > 0) {
    // Volume-for-energy swaps first: konjac, cauliflower rice and the like are
    // why a 700 kcal request arrives as a 500 kcal bowl.
    for (const line of lines) {
      if (line.status !== "verified" || !line.per100g || !line.grams) continue;
      if (line.per100g.calories >= 65) continue;
      if (line.grams / servings < 80) continue;

      const fromNode = findIngredientNode(line.name);
      if (!fromNode) continue;
      const removed = scale(line.macros ?? EMPTY, 1 / servings);

      for (const node of candidates(input.allowSpecialty === true, input.effort)) {
        if (node.name === fromNode.name) continue;
        if (alreadyOnPlate(node, plateNames)) continue;
        if (offIdentityVolume(node, input.craving, input.dish)) continue;

        const group = classifyGroup({
          calories: node.macroPer100g.calories,
          protein_g: node.macroPer100g.protein_g,
          carbs_g: node.macroPer100g.carbs_g,
          fat_g: node.macroPer100g.fat_g,
        });
        if (group === "produce") continue;
        if (!starchCookAllowed(node, input.craving, input.dish, plateNodes)) {
          continue;
        }

        const sub = substitutionLink(fromNode, node);
        // A swap has to be a stand-in for the line being replaced. Pairing with
        // some other ingredient on the plate is an add, not a swap — otherwise
        // konjac noodles get "replaced" by a chicken breast because shrimp
        // likes garlic.
        if (!sub) continue;

        const fit = fitPortion(
          node,
          group,
          gap + removed.calories,
          input.macros,
          removed,
          input.strategy,
          gap,
          targetKcal
        );
        if (!fit) continue;

        const pantryHit = inPantry(node, pantry);
        const suggestion: Ranked = {
          kind: "swap",
          ingredient: node.name,
          grams: fit.grams,
          replaces: fromNode.name,
          calories_added: Math.round(fit.moved),
          resulting_calories: fit.resulting.calories,
          flavor_note: flavorNote("seasoning", pantryHit, fromNode.name),
          closes_gap:
            Math.abs(fit.resulting.calories - targetKcal) / targetKcal <= GAP_TOLERANCE,
          group,
          score: 0,
        };
        suggestion.score = scoreOf(
          suggestion,
          pantryHit,
          node.satietyScore,
          cravingBoost(node, input.craving, plateNodes)
        );
        ranked.push(suggestion);
      }
    }

    for (const node of candidates(input.allowSpecialty === true, input.effort)) {
      const onPlate = alreadyOnPlate(node, plateNames);
      const group = classifyGroup({
        calories: node.macroPer100g.calories,
        protein_g: node.macroPer100g.protein_g,
        carbs_g: node.macroPer100g.carbs_g,
        fat_g: node.macroPer100g.fat_g,
      });
      if (group === "produce") continue;
      if (offIdentityVolume(node, input.craving, input.dish)) continue;
      // More oil of what's already in the pan is the bound we just refused to
      // cross. More of the protein or starch is a different plate, not a greasy
      // version of the same one.
      if (onPlate && group === "fat") continue;
      if (!onPlate && !starchCookAllowed(node, input.craving, input.dish, plateNodes)) {
        continue;
      }

      const pair = plateNodes.map((p) => flavorLink(p, node)).find(Boolean);
      const pantryHit = inPantry(node, pantry);
      if (!onPlate && !pair && !pantryHit) continue;

      const fit = fitPortion(
        node,
        group,
        gap,
        input.macros,
        undefined,
        input.strategy,
        gap,
        targetKcal,
        onPlate && isCarbVehicle(node)
      );
      if (!fit) continue;

      const suggestion: Ranked = {
        kind: "add",
        ingredient: node.name,
        grams: fit.grams,
        calories_added: Math.round(fit.moved),
        resulting_calories: fit.resulting.calories,
        flavor_note: onPlate
          ? `More of the ${node.name.toLowerCase()} already in the dish.`
          : pair
            ? flavorNote(pair, pantryHit)
            : "Already in the pantry you listed.",
        closes_gap:
          Math.abs(fit.resulting.calories - targetKcal) / targetKcal <= GAP_TOLERANCE,
        group,
        score: 0,
      };
      suggestion.score = scoreOf(
        suggestion,
        pantryHit,
        node.satietyScore,
        cravingBoost(node, input.craving, plateNodes)
      );
      if (onPlate && isCarbVehicle(node)) {
        suggestion.score += 4;
      } else if (onPlate) {
        suggestion.score -= 2;
      }
      if (
        input.effort === "weeknight" &&
        group === "carb" &&
        (node.gramsPer?.piece ?? 0) >= 150
      ) {
        suggestion.score -= 5;
      }
      ranked.push(suggestion);
    }
  }

  ranked.sort((a, b) => b.score - a.score);

  const picked: GapSuggestion[] = [];
  const usedGroups = new Set<ScaleGroup>();
  const usedNames = new Set<string>();
  for (const item of ranked) {
    if (usedGroups.has(item.group) || usedNames.has(item.ingredient)) continue;
    usedGroups.add(item.group);
    usedNames.add(item.ingredient);
    picked.push({
      kind: item.kind,
      ingredient: item.ingredient,
      grams: item.grams,
      replaces: item.replaces,
      calories_added: item.calories_added,
      resulting_calories: item.resulting_calories,
      flavor_note: item.flavor_note,
      closes_gap: item.closes_gap,
    });
    if (picked.length >= 3) break;
  }

  return picked;
}

/** Name a cook reads. Graph `name` is a nutrition identity ("Pasta (dry)"). */
export function cookDisplayName(graphName: string): string {
  const node = findIngredientNode(graphName);
  if (node?.cookName) return node.cookName;
  const stripped = graphName.replace(/\s*\([^)]*dry[^)]*\)/gi, "").trim();
  return stripped || graphName;
}

function titleCookName(graphName: string): string {
  const cook = cookDisplayName(graphName);
  return cook.charAt(0).toUpperCase() + cook.slice(1);
}

function plateHasPasta(ingredients: GourmetRecipe["ingredients"]): boolean {
  return ingredients.some((line) => {
    const node = findIngredientNode(line.name);
    return node?.handling?.starchCook === "boil_reserve_toss";
  });
}

function rewritePastaWater(
  ingredients: GourmetRecipe["ingredients"],
  steps: RecipeStep[]
): RecipeStep[] {
  if (plateHasPasta(ingredients)) return steps;
  return steps.map((step) => ({
    ...step,
    instruction: step.instruction.replace(/\bpasta water\b/gi, "cooking water"),
    tip: step.tip?.replace(/\bpasta water\b/gi, "cooking water"),
  }));
}

function cookInstruction(
  suggestion: GapSuggestion,
  gramsInRecipe: number
): string {
  const cookName = cookDisplayName(suggestion.ingredient).toLowerCase();
  if (normalize(suggestion.ingredient).includes("pasta")) {
    return `Boil ${gramsInRecipe}g dry ${cookName} until al dente. Reserve a splash of pasta water and drain.`;
  }
  const node = findIngredientNode(suggestion.ingredient);
  if (node?.handling?.starchCook === "simmer") {
    return `Simmer ${gramsInRecipe}g dry ${cookName} until tender, then drain.`;
  }
  if (node?.handling?.starchCook === "reheat") {
    return `Warm the ${cookName}.`;
  }
  if (node?.handling?.starchCook === "toast_assemble") {
    return `Toast the ${cookName}.`;
  }
  const group = node
    ? classifyGroup({
        calories: node.macroPer100g.calories,
        protein_g: node.macroPer100g.protein_g,
        carbs_g: node.macroPer100g.carbs_g,
        fat_g: node.macroPer100g.fat_g,
      })
    : "carb";
  if (group === "carb") {
    return `Cook ${gramsInRecipe}g dry ${cookName} until tender and fold through so the plate has the starch the macros need.`;
  }
  if (group === "protein") {
    if (node?.handling?.methodRole === "combine_after_sear") {
      return `Sear the ${cookName} until cooked through.`;
    }
    return `Cook ${gramsInRecipe}g ${cookName} with the rest of the protein.`;
  }
  return `Add ${gramsInRecipe}g ${cookName} and fold through before serving.`;
}

function isAssemblyOrServe(instruction: string): boolean {
  const t = instruction.trim();
  return (
    /^(plate|serve)\b/i.test(t) ||
    /^plate and serve/i.test(t) ||
    /\bserve immediately\b/i.test(t) ||
    /\bassemble\b/i.test(t) ||
    /place the (?:top )?bun/i.test(t) ||
    /top bun on/i.test(t) ||
    /build the (?:burger|sandwich)/i.test(t)
  );
}

function needsEarlyCook(suggestion: GapSuggestion): boolean {
  const node = findIngredientNode(suggestion.ingredient);
  const cook = node?.handling?.starchCook;
  return cook === "boil_reserve_toss" || cook === "simmer" || cook === "reheat";
}

function injectCookStep(
  steps: RecipeStep[],
  suggestion: GapSuggestion,
  gramsInRecipe: number
): RecipeStep[] {
  const extra = cookInstruction(suggestion, gramsInRecipe);
  if (steps.some((step) => step.instruction.includes(extra.slice(0, 24)))) {
    return steps;
  }
  const ordered = steps.slice().sort((a, b) => a.order - b.order);
  const next = { order: 0, instruction: extra };

  if (needsEarlyCook(suggestion)) {
    const already =
      ordered.some(
        (step) =>
          /\b(boil|simmer|warm|toast)\b/i.test(step.instruction) &&
          new RegExp(escapeRe(cookDisplayName(suggestion.ingredient)), "i").test(
            step.instruction
          )
      ) ||
      (normalize(suggestion.ingredient).includes("pasta") &&
        ordered.some(
          (step) => /\bboil\b/i.test(step.instruction) && /pasta/i.test(step.instruction)
        ));
    if (already) return ordered;
    return [next, ...ordered].map((step, i) => ({ ...step, order: i + 1 }));
  }

  const assembleAt = ordered.findIndex((step) => isAssemblyOrServe(step.instruction));
  const withNew =
    assembleAt >= 0
      ? [...ordered.slice(0, assembleAt), next, ...ordered.slice(assembleAt)]
      : [...ordered, next];
  return withNew.map((step, i) => ({ ...step, order: i + 1 }));
}

function mentionsVolumeBase(instruction: string, oldName: string): boolean {
  return (
    mentions(instruction, oldName) ||
    /spiraliz|julienne|zoodle|ribbon|shirataki|konjac|(?:chop|cut|slice).{0,50}strips/i.test(
      instruction
    )
  );
}

function isPrimarilyVolumePrep(instruction: string): boolean {
  const volume =
    /spiraliz|julienne|zoodle|ribbon|shirataki|konjac|(?:chop|cut|slice|shave)\b.{0,80}(?:thin\s+)?strips|into\s+(?:thin\s+)?(?:strips|ribbons)/i.test(
      instruction
    );
  if (!volume) return false;
  return !/\b(sear|chicken|shrimp|salmon|tofu|beef|pork|fish|cheese|parmesan|fold|blend)\b/i.test(
    instruction
  );
}

function stripNameFromInstruction(instruction: string, oldName: string): string {
  const node = findIngredientNode(oldName);
  const phrases = [oldName, ...(node?.aliases ?? []), node?.cookName]
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => b.length - a.length);
  let next = instruction;
  for (const phrase of phrases) {
    next = next.replace(new RegExp(`\\b${escapeRe(phrase)}s?\\b`, "gi"), "");
  }
  next = next
    .replace(/,\s*,+/g, ",")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,])/g, "$1")
    .trim();
  return next;
}

function rewriteStepsForSwap(
  steps: RecipeStep[],
  suggestion: GapSuggestion,
  gramsInRecipe: number,
  oldName: string
): RecipeStep[] {
  const node = findIngredientNode(suggestion.ingredient);
  const cook = node?.handling?.starchCook;
  if (cook === "boil_reserve_toss" || cook === "toast_assemble" || cook === "reheat") {
    const cleaned = steps
      .filter((step) => !isPrimarilyVolumePrep(step.instruction))
      .map((step) => {
        if (!mentionsVolumeBase(step.instruction, oldName)) return step;
        const instruction = stripNameFromInstruction(step.instruction, oldName);
        if (instruction.length < 12) return { ...step, instruction: "" };
        return { ...step, instruction };
      })
      .filter((step) => step.instruction.length >= 12);
    return injectCookStep(cleaned, suggestion, gramsInRecipe);
  }

  const extra = cookInstruction(suggestion, gramsInRecipe);
  let replaced = false;
  const next = steps.map((step) => {
    if (!mentionsVolumeBase(step.instruction, oldName)) return step;
    if (!replaced && isPrimarilyVolumePrep(step.instruction)) {
      replaced = true;
      return { ...step, instruction: extra, tip: undefined };
    }
    return step;
  });
  if (!replaced) return injectCookStep(next, suggestion, gramsInRecipe);
  return collapseDuplicateFillSteps(next);
}

function platingMentionsVolume(text: string | undefined, oldName: string): boolean {
  if (!text) return false;
  return mentions(text, oldName) || /ribbon|zoodle|spiraliz/i.test(text);
}

function platingForSwap(
  plating: GourmetRecipe["plating"],
  cookName: string,
  oldName: string
): GourmetRecipe["plating"] {
  const dish = cookName.toLowerCase();
  const bun = /bun/.test(dish);
  const composition = bun
    ? "Stack the toasted bun with the patty and sauce."
    : `Twirl the ${dish} in a wide bowl so the sauce clings.`;
  return {
    ...plating,
    composition: platingMentionsVolume(plating.composition, oldName)
      ? composition
      : plating.composition,
    color_contrast: platingMentionsVolume(plating.color_contrast, oldName)
      ? undefined
      : plating.color_contrast,
    garnish: platingMentionsVolume(plating.garnish, oldName)
      ? undefined
      : plating.garnish,
    social_caption: platingMentionsVolume(plating.social_caption, oldName)
      ? undefined
      : plating.social_caption,
  };
}

function collapseDuplicateFillSteps(steps: RecipeStep[]): RecipeStep[] {
  const seen = new Set<string>();
  return steps
    .filter((step) => {
      const boil = step.instruction.match(/boil\s+\d+\s*g\s+[^.]+al dente[^.]*\.?/i);
      if (!boil) return true;
      const key = boil[0].toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((step, i) => ({ ...step, order: i + 1 }));
}

function lineMatches(name: string, target: string): boolean {
  const node = findIngredientNode(name);
  const wanted = findIngredientNode(target);
  if (node && wanted && node.name === wanted.name) return true;
  const a = normalize(name);
  const b = normalize(target);
  return a.includes(b) || b.includes(a);
}

function snapshotAlternate(
  recipe: GourmetRecipe,
  oldName: string,
  cookName: string
): MethodAlternate {
  return {
    title: `${oldName}, no ${cookName.toLowerCase()}`,
    note: "The plate as scaled, before the starch swap. Below the calorie target.",
    ingredients: recipe.ingredients.map((item) => ({ ...item })),
    steps: recipe.steps.map((step) => ({ ...step })),
  };
}

export interface GapFillApplyResult<T extends GourmetRecipe> {
  recipe: T;
  gramsInRecipe: number;
}

/**
 * Rewrite the cook-facing document into the chosen plate. The pre-swap recipe
 * is kept as `method_alternate` — a real list and method, not reconstructed
 * copy. Graph names never land in the steps.
 */
export function applyGapFill<T extends GourmetRecipe>(
  recipe: T,
  suggestion: GapSuggestion
): GapFillApplyResult<T> {
  const servings = Math.max(1, recipe.servings || 1);
  const gramsInRecipe = suggestion.grams * servings;
  const quantity = String(gramsInRecipe);
  const cookName = titleCookName(suggestion.ingredient);
  const pricedDry = /dry/i.test(suggestion.ingredient);

  let ingredients = recipe.ingredients.map((item) => ({ ...item }));
  let steps = recipe.steps.map((step) => ({ ...step }));
  let plating = recipe.plating;
  let alternate: MethodAlternate | undefined;

  if (suggestion.kind === "swap" && suggestion.replaces) {
    const idx = ingredients.findIndex((line) =>
      lineMatches(line.name, suggestion.replaces!)
    );
    if (idx >= 0) {
      const oldName = ingredients[idx].name;
      alternate = snapshotAlternate(recipe, oldName, cookName);
      ingredients[idx] = {
        ...ingredients[idx],
        name: cookName,
        quantity,
        unit: "g",
        notes: pricedDry ? "dry weight" : undefined,
      };
      steps = rewriteStepsForSwap(steps, suggestion, gramsInRecipe, oldName);
      plating = platingForSwap(plating, cookName, oldName);
    } else {
      ingredients.push({
        name: cookName,
        quantity,
        unit: "g",
        notes: pricedDry ? "dry weight" : undefined,
      });
      steps = injectCookStep(steps, suggestion, gramsInRecipe);
    }
  } else {
    const idx = ingredients.findIndex((line) =>
      lineMatches(line.name, suggestion.ingredient)
    );
    if (idx >= 0) {
      const current = Number.parseFloat(ingredients[idx].quantity) || 0;
      ingredients[idx] = {
        ...ingredients[idx],
        quantity: String(roundGrams(current + gramsInRecipe)),
        unit: ingredients[idx].unit ?? "g",
      };
      steps = injectCookStep(steps, suggestion, gramsInRecipe);
    } else {
      ingredients.push({
        name: cookName,
        quantity,
        unit: "g",
        notes: pricedDry ? "dry weight" : undefined,
      });
      steps = injectCookStep(steps, suggestion, gramsInRecipe);
    }
  }

  steps = rewritePastaWater(ingredients, steps);
  steps = collapseDuplicateFillSteps(steps);

  return {
    recipe: repairCookMethod({
      ...recipe,
      ingredients,
      steps,
      plating,
      method_alternate: alternate,
    }),
    gramsInRecipe,
  };
}
