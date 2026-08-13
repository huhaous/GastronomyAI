/**
 * Food-line resolution engine: free text describing food → grams → macros.
 *
 * Deliberately knows nothing about recipes. A line is a name, an amount and a
 * unit, which is equally true of a recipe ingredient, a logged meal or an
 * estimated restaurant dish — so the recipe-specific policy (per-serving
 * division, reconciling the model's claimed macros) lives one layer up in
 * `src/lib/ai/nutritionRecalc.ts` instead of here.
 */

import {
  FALLBACK_MEASURE_GRAMS,
  findIngredientNode,
  isAromatic,
  type HouseholdMeasures,
} from "@/data/knowledgeGraph";
import type { MacroProfile } from "@/types/nutrition";

/** Anything with a name and an amount. Structurally a RecipeIngredient too. */
export interface FoodLine {
  name: string;
  quantity?: string;
  unit?: string;
}

const WEIGHT_UNIT_GRAMS: Record<string, number> = {
  g: 1,
  gr: 1,
  gram: 1,
  grams: 1,
  gramme: 1,
  grammes: 1,
  kg: 1000,
  kilogram: 1000,
  kilograms: 1000,
  oz: 28.3495,
  ounce: 28.3495,
  ounces: 28.3495,
  lb: 453.592,
  lbs: 453.592,
  pound: 453.592,
  pounds: 453.592,
  // Water-density approximation, adequate for broths, juices and vinegars.
  ml: 1,
  milliliter: 1,
  milliliters: 1,
  millilitre: 1,
  millilitres: 1,
  cc: 1,
  l: 1000,
  liter: 1000,
  liters: 1000,
};

/** Household measures needing an ingredient-specific density to resolve. */
const MEASURE_ALIASES: Record<string, keyof HouseholdMeasures> = {
  tsp: "tsp",
  teaspoon: "tsp",
  teaspoons: "tsp",
  t: "tsp",
  tbsp: "tbsp",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  tbs: "tbsp",
  cup: "cup",
  cups: "cup",
  clove: "clove",
  cloves: "clove",
  piece: "piece",
  pieces: "piece",
  whole: "piece",
  large: "piece",
  medium: "piece",
  small: "piece",
  fillet: "piece",
  fillets: "piece",
  breast: "piece",
  scoop: "piece",
  scoops: "piece",
  packet: "piece",
  sprig: "piece",
  sprigs: "piece",
  slice: "piece",
  slices: "piece",
  stalk: "piece",
  stalks: "piece",
  head: "piece",
  can: "piece",
  block: "piece",
};

const UNICODE_FRACTIONS: Record<string, number> = {
  "½": 0.5,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "¼": 0.25,
  "¾": 0.75,
  "⅛": 0.125,
};

/**
 * Parse a quantity string into a number, handling the formats models actually
 * emit: "200", "200g", "1 1/2", "½", "150-200g", "2 tbsp".
 */
export function parseAmount(raw: string | null | undefined): number | null {
  let text = (raw ?? "").trim().toLowerCase();
  if (!text) return null;

  for (const [glyph, value] of Object.entries(UNICODE_FRACTIONS)) {
    text = text.replace(glyph, ` ${value} `);
  }
  // Substitution can leave padding that would defeat the anchored patterns below.
  text = text.replace(/\s+/g, " ").trim();

  // Ranges ("150-200g") resolve to the midpoint.
  const range = text.match(/^(\d*\.?\d+)\s*(?:-|–|to)\s*(\d*\.?\d+)/);
  if (range) {
    return (parseFloat(range[1]) + parseFloat(range[2])) / 2;
  }

  // Mixed numbers ("1 1/2") and simple fractions ("3/4").
  const mixed = text.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)/);
  if (mixed) {
    return parseInt(mixed[1], 10) + parseInt(mixed[2], 10) / parseInt(mixed[3], 10);
  }
  const fraction = text.match(/^(\d+)\s*\/\s*(\d+)/);
  if (fraction) {
    return parseInt(fraction[1], 10) / parseInt(fraction[2], 10);
  }

  // "1 ½" becomes "1 0.5" after glyph substitution above.
  const mixedDecimal = text.match(/^(\d+)\s+(0?\.\d+)/);
  if (mixedDecimal) {
    return parseInt(mixedDecimal[1], 10) + parseFloat(mixedDecimal[2]);
  }

  const plain = text.match(/^(\d*\.?\d+)/);
  return plain ? parseFloat(plain[1]) : null;
}

/**
 * Determine the unit for a line. Models frequently leave `unit` as an empty
 * string and inline the unit in `quantity` ("200g", "2 tbsp"), so the quantity
 * string is parsed as a fallback.
 */
export function resolveUnitToken(line: FoodLine): string {
  const explicit = (line.unit ?? "").trim().toLowerCase();
  if (explicit && explicit !== "-") return explicit;

  const inline = (line.quantity ?? "")
    .trim()
    .toLowerCase()
    .match(/^[\d\s./–-]*\s*([a-zµ]+)/);
  if (inline?.[1]) return inline[1];

  // A bare number with no unit anywhere is grams by our prompt contract.
  return "g";
}

export type LineStatus = "verified" | "negligible" | "unresolved";

/**
 * Why a line could not be priced. Distinguishing these is what makes the
 * coverage log actionable: missing nodes are graph work, the other two are
 * parser or prompt work.
 */
export type UnresolvedReason =
  | "no_match"
  | "unparsed_quantity"
  | "unknown_unit"
  | "unnamed";

/**
 * How the amount was expressed. Count-based lines ("2 eggs", "1 clove") resist
 * rescaling — 1.4 eggs is not an instruction — so portion scaling leaves them
 * alone and adjusts the weighable lines around them.
 */
export type UnitKind = "weight" | "volume" | "count";

export interface LineAccounting {
  name: string;
  status: LineStatus;
  reason?: UnresolvedReason;
  grams?: number;
  calories: number;
  /** Present for verified lines only. */
  macros?: MacroProfile;
  unitKind?: UnitKind;
  /** Per-100g reference for the matched node, for classification upstream. */
  per100g?: MacroProfile;
  /** Seasoning or texture agent rather than a macro source. */
  aromatic?: boolean;
}

/** An unpriced line, kept whole so the failure can be reproduced later. */
export interface UnresolvedLine {
  name: string;
  quantity?: string;
  unit?: string;
  reason: UnresolvedReason;
}

const EMPTY_MACROS: MacroProfile = {
  calories: 0,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
};

export interface ResolvedLine {
  status: LineStatus;
  reason?: UnresolvedReason;
  grams: number;
  macros: MacroProfile;
  unitKind?: UnitKind;
  per100g?: MacroProfile;
  aromatic?: boolean;
}

/** Household measures that describe a countable item rather than a volume. */
const COUNT_MEASURES = new Set(["clove", "piece"]);

/** Resolve one food line to grams + macros, or mark it unresolved. */
export function resolveFoodLine(line: FoodLine): ResolvedLine {
  // Models occasionally emit a line with no name at all. It cannot be priced or
  // cooked, but it must not take the whole request down with it.
  if (!line.name?.trim()) {
    return { status: "unresolved", reason: "unnamed", grams: 0, macros: EMPTY_MACROS };
  }

  const node = findIngredientNode(line.name);
  if (!node) {
    return { status: "unresolved", reason: "no_match", grams: 0, macros: EMPTY_MACROS };
  }

  const amount = parseAmount(line.quantity);
  if (amount == null) {
    // A seasoning with an unparseable amount ("to taste") is still ~0 kcal.
    return node.negligible
      ? { status: "negligible", grams: 0, macros: EMPTY_MACROS }
      : {
          status: "unresolved",
          reason: "unparsed_quantity",
          grams: 0,
          macros: EMPTY_MACROS,
        };
  }

  const unit = resolveUnitToken(line);
  let grams: number | null = null;
  let unitKind: UnitKind = "weight";

  if (WEIGHT_UNIT_GRAMS[unit] != null) {
    grams = amount * WEIGHT_UNIT_GRAMS[unit];
  } else {
    const measure = MEASURE_ALIASES[unit];
    if (measure) {
      const specific = node.gramsPer?.[measure];
      const generic =
        measure === "tsp" || measure === "tbsp" || measure === "cup"
          ? FALLBACK_MEASURE_GRAMS[measure]
          : undefined;
      const perUnit = specific ?? generic;
      if (perUnit != null) {
        grams = amount * perUnit;
        unitKind = COUNT_MEASURES.has(measure) ? "count" : "volume";
      }
    }
  }

  if (grams == null) {
    return node.negligible
      ? { status: "negligible", grams: 0, macros: EMPTY_MACROS }
      : { status: "unresolved", reason: "unknown_unit", grams: 0, macros: EMPTY_MACROS };
  }

  if (node.negligible) {
    return { status: "negligible", grams, macros: EMPTY_MACROS, unitKind };
  }

  const factor = grams / 100;
  return {
    status: "verified",
    grams,
    unitKind,
    per100g: node.macroPer100g,
    aromatic: isAromatic(node),
    macros: {
      calories: node.macroPer100g.calories * factor,
      protein_g: node.macroPer100g.protein_g * factor,
      carbs_g: node.macroPer100g.carbs_g * factor,
      fat_g: node.macroPer100g.fat_g * factor,
    },
  };
}

export interface FoodLinesResolution {
  /** Sum over verified lines only — a floor, not necessarily the whole truth. */
  macros: MacroProfile;
  lines: LineAccounting[];
  verifiedCount: number;
  negligibleCount: number;
  unresolved: UnresolvedLine[];
}

/** Resolve a list of food lines and total the macros the graph can vouch for. */
export function resolveFoodLines(lines: FoodLine[]): FoodLinesResolution {
  const accounting: LineAccounting[] = [];
  const unresolved: UnresolvedLine[] = [];
  const macros: MacroProfile = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  let verifiedCount = 0;
  let negligibleCount = 0;

  for (const line of lines) {
    const resolved = resolveFoodLine(line);
    // Malformed model output reaches this far; keep it printable downstream.
    const name = line.name ?? "";

    if (resolved.status === "verified") {
      verifiedCount += 1;
      macros.calories += resolved.macros.calories;
      macros.protein_g += resolved.macros.protein_g;
      macros.carbs_g += resolved.macros.carbs_g;
      macros.fat_g += resolved.macros.fat_g;
    } else if (resolved.status === "negligible") {
      negligibleCount += 1;
    } else {
      unresolved.push({
        name,
        quantity: line.quantity,
        unit: line.unit,
        reason: resolved.reason ?? "no_match",
      });
    }

    accounting.push({
      name,
      status: resolved.status,
      reason: resolved.reason,
      grams: resolved.status === "unresolved" ? undefined : round1(resolved.grams),
      calories: Math.round(resolved.macros.calories),
      macros: resolved.status === "verified" ? resolved.macros : undefined,
      unitKind: resolved.unitKind,
      per100g: resolved.per100g,
      aromatic: resolved.aromatic,
    });
  }

  return { macros, lines: accounting, verifiedCount, negligibleCount, unresolved };
}

/** Thermic effect of food: protein ~25%, carbs ~8%, fat ~2% of their kcal. */
export function computeTef(macros: MacroProfile): number {
  return Math.round(
    macros.protein_g * 4 * 0.25 + macros.carbs_g * 4 * 0.08 + macros.fat_g * 9 * 0.02
  );
}

/** Atwater energy from macro grams. */
export function atwaterCalories(macros: MacroProfile): number {
  return Math.round(macros.protein_g * 4 + macros.carbs_g * 4 + macros.fat_g * 9);
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
