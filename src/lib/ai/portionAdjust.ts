/**
 * Rewrites a recipe's ingredient quantities so the dish actually lands on the
 * requested macro target, using the solver in `src/lib/nutrition/portionScaling`.
 *
 * A genuinely unknown food still freezes the scaler — absorbing mystery calories
 * is the failure this codebase exists to prevent. A teaspoon of unmatched
 * mustard is not that: tiny unresolved seasonings stay ballast.
 */

import {
  parseAmount,
  repairPieceQuantities,
  resolveFoodLines,
  resolveUnitToken,
  type LineAccounting,
  type UnresolvedLine,
} from "@/lib/nutrition/foodLines";
import {
  classifyGroup,
  fatCeilingFor,
  fatGramCeiling,
  isLeanMuscle,
  isSauceProtein,
  solveScaling,
  type ScaleGroup,
} from "@/lib/nutrition/portionScaling";
import { FAT_LOSS_RULES, findIngredientNode } from "@/data/knowledgeGraph";
import { applyGapFill } from "@/lib/nutrition/gapFill";
import type { GapSuggestion } from "@/types/nutrition";
import type { GourmetRecipe, MacroProfile, NutritionalStrategy, PortionAdjustment } from "@/types/recipe";

/** Below this drift the dish is close enough; rewriting would be noise. */
const CALORIE_TOLERANCE_PERCENT = 5;

/** Below this a line is an accent; rescaling it produces noise, not calories. */
const MIN_SCALABLE_KCAL = 15;

/**
 * Unmatched pinches must not freeze a 755 kcal plate. Anything larger than a
 * seasoning dose still blocks — that really is unknown energy.
 */
const TINY_UNRESOLVED_GRAMS = 8;

function isTinyUnresolved(line: UnresolvedLine): boolean {
  const amount = parseAmount(line.quantity);
  if (amount == null) return false;
  const unit = (line.unit ?? "").trim().toLowerCase();
  if (
    ["g", "gr", "gram", "grams", "ml", "milliliter", "milliliters", "millilitre", "millilitres", "cc"].includes(
      unit
    )
  ) {
    return amount <= TINY_UNRESOLVED_GRAMS;
  }
  if (["tsp", "teaspoon", "teaspoons", "t"].includes(unit)) {
    return amount <= 2;
  }
  return false;
}

function isEmulsionBallast(name: string): boolean {
  return findIngredientNode(name)?.handling?.emulsionRole === "lecithin";
}

/**
 * A plate, not a trough. Produce and yogurt-as-sauce are cheap calories by
 * weight, so a multiplier alone will bury the cook in zucchini before the
 * target moves.
 */
function gramCapPerServing(
  group: ScaleGroup,
  per100g: MacroProfile,
  name?: string
): number {
  const node = name ? findIngredientNode(name) : undefined;
  if (node?.handling?.countAsPiece && node.gramsPer?.piece) {
    return node.gramsPer.piece * 2;
  }
  if (group === "produce") return 300;
  if (group === "carb") return 90;
  if (group === "fat") return 20;
  if (per100g.calories < 80) return 150;
  return 220;
}

function isWeightUnit(unit: string): boolean {
  const u = unit.trim().toLowerCase();
  return u === "g" || u === "gram" || u === "grams" || u === "ml";
}

/** Volume measures are written in quarters ("1.25 tbsp"), weights in grams. */
const QUARTER_MEASURES = new Set(["tsp", "teaspoon", "teaspoons", "tbsp", "tablespoon", "tablespoons", "tbs", "cup", "cups"]);

const EMPTY: MacroProfile = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };

function addInto(total: MacroProfile, macros: MacroProfile): void {
  total.calories += macros.calories;
  total.protein_g += macros.protein_g;
  total.carbs_g += macros.carbs_g;
  total.fat_g += macros.fat_g;
}

/** Round to an amount a cook can actually measure. */
function roundAmount(value: number, unit: string): number {
  if (QUARTER_MEASURES.has(unit)) {
    return Math.max(0.25, Math.round(value * 4) / 4);
  }
  if (value >= 50) return Math.round(value / 5) * 5;
  if (value >= 10) return Math.round(value);
  return Math.max(0.5, Math.round(value * 2) / 2);
}

/** Buns and leaves snap to whole pieces; never scale a bun below one. */
function snapToPiece(
  grams: number,
  name: string,
  unit: string,
  original?: number
): number {
  if (!isWeightUnit(unit)) return grams;
  const node = findIngredientNode(name);
  if (!node?.handling?.countAsPiece) return grams;
  const piece = node.gramsPer?.piece;
  if (!piece) return grams;
  const start = original ?? grams;
  const startPieces = Math.max(1, Math.round(start / piece));
  const nextPieces = Math.max(1, Math.round(grams / piece));
  // Piece-grid lines (1 bun = 70g) stay on the grid. A 55g weigh-in is one
  // smaller bun — do not snap it up to 70g and blow the calorie cap.
  if (Math.abs(start - startPieces * piece) <= 1) {
    return nextPieces * piece;
  }
  if (nextPieces === startPieces) return start;
  return nextPieces * piece;
}

function formatAmount(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

type QuantityRewrite = { from: string; to: string; unit: string; name?: string };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Spoken/written forms of a unit so "80g", "80 g" and "80 grams" all move. */
function unitAlternates(unit: string): string[] {
  const u = unit.trim().toLowerCase();
  if (u === "g" || u === "gram" || u === "grams") return ["g", "gram", "grams"];
  if (
    u === "ml" ||
    u === "millilitre" ||
    u === "millilitres" ||
    u === "milliliter" ||
    u === "milliliters"
  ) {
    return ["ml", "millilitre", "millilitres", "milliliter", "milliliters"];
  }
  return [u];
}

function nameTokens(name?: string): string[] {
  if (!name) return [];
  return name.split(/[^A-Za-z]+/).filter((word) => word.length >= 4);
}

function amountPattern(from: string, unit: string): string {
  const alts = unitAlternates(unit).map(escapeRegExp).join("|");
  return `\\b${escapeRegExp(from)}(\\s*)(${alts})\\b`;
}

/**
 * Rewrite a number that is followed by its unit. Oven temperatures and plain
 * timings have no unit after them, so they are left alone. Prefer a mention of
 * the ingredient nearby; fall back to a unique amount so "200g ribbons" still
 * moves when the list scaled zucchini.
 *
 * Originals are swapped for placeholders first so 160g → 80g and 80g → 240g
 * cannot chain on the same sentence.
 */
export function rewriteQuantitiesInText(
  text: string,
  replacements: QuantityRewrite[]
): string {
  if (replacements.length === 0) return text;

  const ordered = [...replacements].sort((a, b) => b.from.length - a.from.length);
  const tagged = ordered.map((r, i) => ({ ...r, ph: `\u0000Q${i}\u0000` }));

  let out = text;

  for (const r of tagged) {
    const amount = amountPattern(r.from, r.unit);
    for (const token of nameTokens(r.name)) {
      const name = escapeRegExp(token);
      out = out.replace(
        new RegExp(`${amount}(\\s+(?:of\\s+)?${name})`, "gi"),
        `${r.ph}$1$2$3`
      );
      out = out.replace(
        new RegExp(`(${name}(?:(?![.]).){0,48}?)${amount}`, "gi"),
        `$1${r.ph}$2$3`
      );
    }
  }

  const unique = new Map<string, (typeof tagged)[number]>();
  const seen = new Map<string, number>();
  for (const r of tagged) {
    const key = `${r.from}|${r.unit.trim().toLowerCase()}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
    unique.set(key, r);
  }
  for (const [key, r] of unique) {
    if ((seen.get(key) ?? 0) !== 1) continue;
    const amount = amountPattern(r.from, r.unit);
    out = out.replace(new RegExp(amount, "gi"), `${r.ph}$1$2`);
  }

  for (const r of tagged) {
    out = out.split(r.ph).join(r.to);
  }

  return out;
}

function rewriteOptional(
  text: string | undefined,
  replacements: QuantityRewrite[]
): string | undefined {
  if (text == null) return text;
  return rewriteQuantitiesInText(text, replacements);
}

function rewriteTip(tip: GourmetRecipe["culinary_physics_tips"][number], replacements: QuantityRewrite[]) {
  return {
    ...tip,
    technique: rewriteQuantitiesInText(tip.technique, replacements),
    explanation: rewriteQuantitiesInText(tip.explanation, replacements),
    agents: tip.agents?.map((agent) => rewriteQuantitiesInText(agent, replacements)),
  };
}

/**
 * Keep the printed card honest: the model wrote method, physics and plating
 * against its own sketch weights. After we rescale the list, those sentences
 * still mention 200g zucchini next to a 600g line unless we walk them too.
 */
function rewriteNarration<T extends GourmetRecipe>(
  recipe: T,
  replacements: QuantityRewrite[]
): T {
  if (replacements.length === 0) return recipe;

  const w = (text: string) => rewriteQuantitiesInText(text, replacements);

  const next: GourmetRecipe = {
    ...recipe,
    tagline: w(recipe.tagline),
    psychological_reward_note: w(recipe.psychological_reward_note),
    ingredients: recipe.ingredients.map((item) => ({
      ...item,
      notes: rewriteOptional(item.notes, replacements),
    })),
    steps: recipe.steps.map((step) => ({
      ...step,
      instruction: w(step.instruction),
      tip: rewriteOptional(step.tip, replacements),
    })),
    culinary_physics_tips: recipe.culinary_physics_tips.map((tip) =>
      rewriteTip(tip, replacements)
    ),
    fat_mimicry_tech: {
      ...recipe.fat_mimicry_tech,
      title: w(recipe.fat_mimicry_tech.title),
      replaces: w(recipe.fat_mimicry_tech.replaces),
      mechanism: w(recipe.fat_mimicry_tech.mechanism),
      mouthfeel_result: w(recipe.fat_mimicry_tech.mouthfeel_result),
      agents: recipe.fat_mimicry_tech.agents?.map((agent) => w(agent)),
    },
    plating: {
      ...recipe.plating,
      composition: w(recipe.plating.composition),
      color_contrast: rewriteOptional(recipe.plating.color_contrast, replacements),
      vessel: rewriteOptional(recipe.plating.vessel, replacements),
      garnish: rewriteOptional(recipe.plating.garnish, replacements),
      social_caption: rewriteOptional(recipe.plating.social_caption, replacements),
    },
  };

  const substitutions =
    "substitutions" in recipe && Array.isArray(recipe.substitutions)
      ? recipe.substitutions.map((tip) => rewriteTip(tip, replacements))
      : undefined;

  return {
    ...next,
    ...(substitutions ? { substitutions } : {}),
  } as T;
}

export interface PortionAdjustResult<T extends GourmetRecipe> {
  recipe: T;
  adjustment?: PortionAdjustment;
}

export interface PortionAdjustOptions {
  strategy?: NutritionalStrategy;
}

const HIGH_PROTEIN_STRATEGIES: NutritionalStrategy[] = [
  "post_workout_high_protein",
  "deep_cut_psmf",
];

function isHighProteinStrategy(strategy?: NutritionalStrategy): boolean {
  return Boolean(strategy && HIGH_PROTEIN_STRATEGIES.includes(strategy));
}

/** Midpoint of the strategy's protein-calorie range — the gram floor is not enough. */
function proteinShareAim(strategy?: NutritionalStrategy): number | undefined {
  if (!strategy || !isHighProteinStrategy(strategy)) return undefined;
  const [lo, hi] = FAT_LOSS_RULES[strategy].proteinPercentRange;
  return (lo + hi) / 2;
}

function proteinSharePercent(macros: MacroProfile): number {
  if (macros.calories <= 0) return 0;
  return ((macros.protein_g * 4) / macros.calories) * 100;
}

/**
 * Scale ingredient quantities toward the requested per-serving target. Returns
 * the recipe untouched when scaling isn't safe or isn't needed.
 */
export function adjustPortions<T extends GourmetRecipe>(
  recipe: T,
  target: Partial<MacroProfile> | undefined,
  options?: PortionAdjustOptions
): PortionAdjustResult<T> {
  if (!target?.calories || target.calories <= 0) return { recipe };

  recipe = repairPieceQuantities(recipe);

  const servings = Math.max(1, recipe.servings || 1);
  const { lines, unresolved, macros: pricedMacros } = resolveFoodLines(
    recipe.ingredients
  );
  // Unknown food freezes a scale-up — we cannot invent the missing energy.
  // A verified floor already over the typed number can still be cut.
  if (
    unresolved.some((line) => !isTinyUnresolved(line)) &&
    pricedMacros.calories <= target.calories * servings
  ) {
    return { recipe };
  }

  const base: MacroProfile = { ...EMPTY };
  const groups: Partial<Record<ScaleGroup, MacroProfile>> = {};
  const groupOfLine = new Map<number, ScaleGroup>();

  lines.forEach((line: LineAccounting, index) => {
    if (line.status !== "verified" || !line.macros || !line.per100g) return;

    // Seasonings, count-based lines ("2 eggs") and trivial contributors all act
    // as fixed ballast that the scalable roles have to work around.
    if (
      line.aromatic ||
      line.unitKind === "count" ||
      line.macros.calories < MIN_SCALABLE_KCAL
    ) {
      addInto(base, line.macros);
      return;
    }

    const group = classifyGroup(line.per100g);
    // Dairy sauce and the carbonara egg are ballast. Growing yogurt to chase
    // protein is a tub; scaling the emulsion egg away un-makes the sauce.
    if (isSauceProtein(line.per100g) || isEmulsionBallast(line.name)) {
      addInto(base, line.macros);
      return;
    }

    groupOfLine.set(index, group);
    groups[group] = groups[group] ?? { ...EMPTY };
    addInto(groups[group]!, line.macros);
  });

  if (groupOfLine.size === 0) return { recipe };

  const totalTarget: Partial<MacroProfile> = {
    calories: target.calories * servings,
    protein_g: target.protein_g != null ? target.protein_g * servings : undefined,
    carbs_g: target.carbs_g != null ? target.carbs_g * servings : undefined,
    fat_g: target.fat_g != null ? target.fat_g * servings : undefined,
  };

  const before: MacroProfile = { ...base };
  for (const group of Object.keys(groups) as ScaleGroup[]) {
    addInto(before, groups[group]!);
  }

  const proteinShort =
    totalTarget.protein_g != null &&
    totalTarget.protein_g > 0 &&
    before.protein_g < totalTarget.protein_g * 0.98;
  const drift =
    (Math.abs(before.calories - totalTarget.calories!) / totalTarget.calories!) * 100;
  const overTarget = before.calories > totalTarget.calories!;
  const strategyFatCap = fatGramCeiling(
    totalTarget.calories!,
    options?.strategy
      ? FAT_LOSS_RULES[options.strategy].enforcedBounds.fatMaxPercent
      : undefined
  );
  if (totalTarget.fat_g == null && strategyFatCap != null) {
    totalTarget.fat_g = strategyFatCap;
  }
  const fatOver =
    totalTarget.fat_g != null && before.fat_g > totalTarget.fat_g;
  if (
    !overTarget &&
    !fatOver &&
    drift <= CALORIE_TOLERANCE_PERCENT &&
    !proteinShort
  ) {
    return { recipe };
  }

  const fatMax = fatCeilingFor(groups.fat?.fat_g ?? 0, totalTarget.fat_g);
  const gramsMet =
    totalTarget.protein_g != null &&
    totalTarget.protein_g > 0 &&
    before.protein_g >= totalTarget.protein_g * 0.98;
  const shareAim = proteinShareAim(options?.strategy);
  const shareMet =
    shareAim == null || proteinSharePercent(before) >= shareAim;
  const proteinMet = gramsMet && shareMet;
  const highProtein = isHighProteinStrategy(options?.strategy);
  const overshoot = overTarget;
  const proteinFloor = totalTarget.protein_g ?? 0;
  const proteinFloorRatio =
    proteinFloor > 0 && before.protein_g > 0
      ? Math.max(0.5, Math.min(1, proteinFloor / before.protein_g))
      : 0.5;
  const calorieGap = Math.max(0, before.calories - (totalTarget.calories ?? 0));
  const fatCanCloseGap =
    gramsMet && (groups.fat?.calories ?? 0) * 0.8 >= calorieGap;

  const bounds: Partial<Record<ScaleGroup, { min?: number; max?: number }>> = {
    ...(fatMax ? { fat: { max: fatMax } } : {}),
    // Surplus chicken on an over-target plate must be allowed to shrink.
    // Locking protein at 1× is how 250g breast + 100g pasta stays at 755.
    // A 4% burger overshoot is cheese, not the patty.
    ...(highProtein && !overshoot ? { protein: { min: 1 } } : {}),
    ...(overshoot && fatCanCloseGap ? { protein: { min: 1, max: 1 } } : {}),
    ...(overshoot && !fatCanCloseGap
      ? { protein: { min: proteinFloorRatio } }
      : {}),
    // Protein already on target: extra chicken/yogurt is not how you close
    // an energy hole. Leave that for a starch the cook will actually eat.
    ...(proteinMet && !overshoot
      ? { protein: { max: 1.1, ...(highProtein ? { min: 1 } : {}) } }
      : {}),
  };

  // Surplus protein is a floor (min factor), not a magnet. Chasing 40g from
  // above is how 100g spaghetti becomes 42g on a 755 kcal carbonara.
  const solverTarget: Partial<MacroProfile> = {
    ...totalTarget,
    ...(overshoot && gramsMet ? { protein_g: undefined } : {}),
  };

  const { factors, clamped } = solveScaling({
    base,
    groups,
    target: solverTarget,
    bounds,
    fatMaxPercent: options?.strategy
      ? FAT_LOSS_RULES[options.strategy].enforcedBounds.fatMaxPercent
      : undefined,
  });

  const changes: string[] = [];
  const replacements: QuantityRewrite[] = [];
  let gramCapped = false;

  const ingredients = recipe.ingredients.map((item, index) => {
    const group = groupOfLine.get(index);
    if (!group) return item;

    const factor = factors[group] ?? 1;
    const amount = parseAmount(item.quantity);
    if (amount == null) return item;

    const unit = resolveUnitToken(item);
    let scaled = snapToPiece(roundAmount(amount * factor, unit), item.name, unit, amount);
    const per100g = lines[index]?.per100g;
    if (per100g && isWeightUnit(unit) && factor > 1) {
      const cap = gramCapPerServing(group, per100g, item.name) * servings;
      if (amount >= cap) {
        scaled = amount;
      } else if (scaled > cap) {
        scaled = snapToPiece(roundAmount(cap, unit), item.name, unit, amount);
        gramCapped = true;
      }
    }
    if (scaled === amount) return item;

    const from = formatAmount(amount);
    const to = formatAmount(scaled);
    changes.push(`${item.name} ${from}${unit} → ${to}${unit}`);
    replacements.push({ from, to, unit, name: item.name });

    return { ...item, quantity: to, unit };
  });

  if (changes.length === 0) return { recipe };

  const priced = resolveFoodLines(ingredients);
  const adjustment: PortionAdjustment = {
    target_calories: Math.round(target.calories),
    before_calories: Math.round(before.calories / servings),
    after_calories: Math.round(priced.macros.calories / servings),
    factors: (Object.keys(factors) as ScaleGroup[])
      .filter((group) => Math.abs((factors[group] ?? 1) - 1) >= 0.02)
      .map((group) => ({ group, factor: Number((factors[group] ?? 1).toFixed(2)) })),
    changes,
    bounded: clamped.length > 0 || gramCapped,
  };

  const scaledList: T = { ...recipe, ingredients };
  const capped = shrinkToCalorieCap(
    {
      ...rewriteNarration(scaledList, replacements),
      portion_adjustment: adjustment,
    },
    target
  );

  return {
    recipe: capped,
    adjustment: capped.portion_adjustment ?? adjustment,
  };
}

/**
 * The calorie number the diner typed is the ceiling. Carb and fat give way
 * after lean meat is set — this is the same constraint as solveScaling, not
 * a 5% fudge after the protein-share pass.
 */
function shrinkToCalorieCap<T extends GourmetRecipe>(
  recipe: T,
  target?: Partial<MacroProfile>
): T {
  if (!target?.calories || target.calories <= 0) return recipe;
  const servings = Math.max(1, recipe.servings || 1);
  const priced = resolveFoodLines(recipe.ingredients);
  const cap = target.calories * servings;
  const over = priced.macros.calories - cap;
  if (Math.round(priced.macros.calories / servings) <= target.calories) {
    return recipe;
  }

  const shrinkAt: number[] = [];
  for (const group of ["carb", "fat"] as ScaleGroup[]) {
    priced.lines.forEach((line, index) => {
      if (line.status !== "verified" || !line.per100g || !line.macros) return;
      if (line.aromatic || line.unitKind === "count") return;
      if (isSauceProtein(line.per100g) || isEmulsionBallast(line.name)) return;
      if (findIngredientNode(line.name)?.handling?.countAsPiece) return;
      if (classifyGroup(line.per100g) !== group) return;
      if (line.macros.calories < MIN_SCALABLE_KCAL) return;
      shrinkAt.push(index);
    });
  }
  if (shrinkAt.length === 0) return recipe;

  const potKcal = shrinkAt.reduce(
    (sum, index) => sum + (priced.lines[index]?.macros?.calories ?? 0),
    0
  );
  if (potKcal <= 0) return recipe;
  const factor = Math.max(0.25, (potKcal - over) / potKcal);
  if (factor >= 0.99) return recipe;

  const changes: string[] = [];
  const replacements: QuantityRewrite[] = [];
  const ingredients = recipe.ingredients.map((item, index) => {
    if (!shrinkAt.includes(index)) return item;
    const amount = parseAmount(item.quantity);
    if (amount == null) return item;
    const unit = resolveUnitToken(item);
    if (!isWeightUnit(unit)) return item;
    const scaled = roundAmount(amount * factor, unit);
    if (scaled === amount) return item;
    changes.push(
      `${item.name} ${formatAmount(amount)}${unit} → ${formatAmount(scaled)}${unit}`
    );
    replacements.push({
      from: formatAmount(amount),
      to: formatAmount(scaled),
      unit,
      name: item.name,
    });
    return { ...item, quantity: formatAmount(scaled), unit };
  });
  if (changes.length === 0) return recipe;

  const nextPriced = resolveFoodLines(ingredients);
  const prior = recipe.portion_adjustment;
  const adjustment: PortionAdjustment = {
    target_calories: Math.round(target.calories),
    before_calories: prior?.before_calories ?? Math.round(priced.macros.calories / servings),
    after_calories: Math.round(nextPriced.macros.calories / servings),
    factors: prior?.factors ?? [],
    changes: [...(prior?.changes ?? []), ...changes],
    bounded: true,
  };
  return {
    ...rewriteNarration({ ...recipe, ingredients }, replacements),
    portion_adjustment: adjustment,
  };
}

/**
 * Gram floor and a carb-heavy plate raise lean meat. Share of calories does
 * not grow meat on a plate that already hit the gram floor. After a necessary
 * meat add, carb and fat give way so the typed calorie number stays the ceiling.
 */
export function rebalanceProteinForStrategy<T extends GourmetRecipe>(
  recipe: T,
  target: Partial<MacroProfile> | undefined,
  strategy?: NutritionalStrategy
): T {
  const aim = proteinShareAim(strategy);
  const gramFloor = target?.protein_g;
  if (aim == null && (gramFloor == null || gramFloor <= 0)) return recipe;

  const servings = Math.max(1, recipe.servings || 1);
  const priced = resolveFoodLines(recipe.ingredients);
  if (
    priced.unresolved.some((line) => !isTinyUnresolved(line)) &&
    !(target?.calories && priced.macros.calories > target.calories * servings)
  ) {
    return recipe;
  }

  const perServing: MacroProfile = {
    calories: priced.macros.calories / servings,
    protein_g: priced.macros.protein_g / servings,
    carbs_g: priced.macros.carbs_g / servings,
    fat_g: priced.macros.fat_g / servings,
  };
  const gramsOk =
    gramFloor == null || gramFloor <= 0 || perServing.protein_g >= gramFloor * 0.98;
  const carbHeavy =
    strategy === "post_workout_high_protein" &&
    perServing.protein_g < perServing.carbs_g * 0.8;
  if (gramsOk && !carbHeavy) {
    return shrinkToCalorieCap(recipe, target);
  }

  const meatAt: number[] = [];
  priced.lines.forEach((line, index) => {
    if (line.status !== "verified" || !line.per100g || !line.macros) return;
    if (line.aromatic || line.unitKind === "count") return;
    if (!isLeanMuscle(line.per100g)) return;
    meatAt.push(index);
  });
  if (meatAt.length === 0) {
    return gramsOk
      ? shrinkToCalorieCap(recipe, target)
      : injectLeanProtein(recipe, target, perServing, servings);
  }

  const sample = priced.lines[meatAt[0]]!.per100g!;
  const rp = sample.protein_g;
  const re = sample.calories;
  const extraForGrams =
    gramFloor != null && gramFloor > 0 && perServing.protein_g < gramFloor * 0.98
      ? ((gramFloor - perServing.protein_g) * 100) / rp
      : 0;
  let extraForShare = 0;
  if (aim != null && perServing.calories > 0) {
    const a = aim / 100;
    const denom = a * re - 4 * rp;
    if (Math.abs(denom) >= 0.001) {
      extraForShare = (100 * (4 * perServing.protein_g - a * perServing.calories)) / denom;
    }
  }
  const extraForCarbs = carbHeavy
    ? ((perServing.carbs_g * 0.8 - perServing.protein_g) * 100) / rp
    : 0;
  const extraPerServing = Math.max(extraForShare, extraForCarbs, extraForGrams);
  if (extraPerServing < 8) return shrinkToCalorieCap(recipe, target);

  const potMeat = meatAt.reduce((sum, i) => sum + (priced.lines[i]?.grams ?? 0), 0);
  if (potMeat <= 0) return recipe;

  const factor = (potMeat + extraPerServing * servings) / potMeat;

  const changes: string[] = [];
  const replacements: QuantityRewrite[] = [];
  const ingredients = recipe.ingredients.map((item, index) => {
    if (!meatAt.includes(index)) return item;
    const amount = parseAmount(item.quantity);
    if (amount == null) return item;
    const unit = resolveUnitToken(item);
    if (!isWeightUnit(unit)) return item;
    const per100g = priced.lines[index]?.per100g;
    let scaled = roundAmount(amount * factor, unit);
    if (per100g) {
      const cap = gramCapPerServing("protein", per100g) * servings;
      if (scaled > cap) scaled = roundAmount(cap, unit);
    }
    if (scaled === amount) return item;
    changes.push(`${item.name} ${formatAmount(amount)}${unit} → ${formatAmount(scaled)}${unit}`);
    replacements.push({
      from: formatAmount(amount),
      to: formatAmount(scaled),
      unit,
      name: item.name,
    });
    return { ...item, quantity: formatAmount(scaled), unit };
  });

  if (changes.length === 0) return recipe;

  const nextPriced = resolveFoodLines(ingredients);
  const prior = recipe.portion_adjustment;
  const adjustment: PortionAdjustment = {
    target_calories: Math.round(target?.calories ?? perServing.calories),
    before_calories: prior?.before_calories ?? Math.round(perServing.calories),
    after_calories: Math.round(nextPriced.macros.calories / servings),
    factors: [
      ...(prior?.factors ?? []).filter((row) => row.group !== "protein"),
      { group: "protein", factor: Number(factor.toFixed(2)) },
    ],
    changes: [...(prior?.changes ?? []), ...changes],
    bounded: prior?.bounded ?? false,
  };

  return shrinkToCalorieCap(
    {
      ...rewriteNarration({ ...recipe, ingredients }, replacements),
      portion_adjustment: adjustment,
    },
    target
  );
}

function injectLeanProtein<T extends GourmetRecipe>(
  recipe: T,
  target: Partial<MacroProfile> | undefined,
  perServing: MacroProfile,
  servings: number
): T {
  const node = findIngredientNode("chicken breast");
  if (!node || node.macroPer100g.protein_g <= 0) return recipe;
  const floor = target?.protein_g ?? 0;
  const need = Math.max(0, floor * 0.98 - perServing.protein_g);
  const grams = Math.max(
    50,
    Math.min(160, Math.ceil((need * 100) / node.macroPer100g.protein_g / 5) * 5)
  );
  const addedKcal = Math.round((node.macroPer100g.calories * grams) / 100);
  const suggestion: GapSuggestion = {
    kind: "add",
    ingredient: node.name,
    grams,
    calories_added: addedKcal,
    resulting_calories: Math.round(perServing.calories + addedKcal),
    flavor_note: "Lean protein the dairy sauce cannot supply.",
    closes_gap: false,
  };
  const { recipe: filled, gramsInRecipe } = applyGapFill(recipe, suggestion);
  const cookLabel = node.cookName ?? "Chicken";
  const prior = filled.portion_adjustment ?? recipe.portion_adjustment;
  return shrinkToCalorieCap(
    {
      ...filled,
      gap_fill_applied: recipe.gap_fill_applied ?? {
        ...suggestion,
        ingredient: cookLabel,
        grams_in_recipe: gramsInRecipe,
        servings,
      },
      portion_adjustment: {
        target_calories: Math.round(target?.calories ?? perServing.calories),
        before_calories: prior?.before_calories ?? Math.round(perServing.calories),
        after_calories: Math.round(
          resolveFoodLines(filled.ingredients).macros.calories / servings
        ),
        factors: prior?.factors ?? [],
        changes: [
          ...(prior?.changes ?? []),
          `This plate includes ${gramsInRecipe}g ${cookLabel} so protein meets ${floor}g`,
        ],
        bounded: prior?.bounded ?? false,
      },
    },
    target
  );
}
