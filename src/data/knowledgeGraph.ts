/**
 * Lightweight Nutrition & Culinary-Physics Knowledge Graph.
 *
 * This is the single source of verified ground truth for:
 *  - Ingredient macros (approximate USDA FoodData Central values, always RAW /
 *    as-purchased weight), satiety scoring, substitution roles, flavor synergy.
 *  - Kitchen equipment physical/chemical cooking mechanisms.
 *  - Nutritional-strategy macro ratio rules for fat-loss periodization.
 *
 * Consumed by `src/lib/ai/graphContext.ts` (prompt injection) and
 * `src/lib/nutrition/foodLines.ts` (macro verification) so the LLM cannot
 * hallucinate nutrition or physics facts for known items.
 */

import type { NutritionalStrategy } from "@/types/nutrition";
import type { KitchenTool } from "@/types/recipe";

export interface IngredientMacro100g {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

/** Grams per household measure, for volume/count → weight conversion. */
export interface HouseholdMeasures {
  tsp?: number;
  tbsp?: number;
  cup?: number;
  clove?: number;
  piece?: number;
}

export interface IngredientNode {
  /** Canonical display name. */
  name: string;
  /** Alternate names/spellings for fuzzy matching against free-text input. */
  aliases?: string[];
  /** Verified macros per 100g, RAW / as-purchased weight. */
  macroPer100g: IngredientMacro100g;
  /** Satiety Index, 1 (low) – 10 (high), inspired by Holt et al. satiety research. */
  satietyScore: number;
  /** High-calorie/fat items this ingredient can gastronomically substitute. */
  substitutionFor: string[];
  /** Flavors/ingredients that synergize well with this ingredient. */
  flavorPairs: string[];
  /** Ingredient-specific density for tsp/tbsp/cup/clove quantities. */
  gramsPer?: HouseholdMeasures;
  /**
   * Seasonings used in doses too small to matter (<~5 kcal at typical use).
   * Counted as zero calories, and — critically — they do not block macro
   * verification the way a genuinely unknown ingredient does.
   */
  negligible?: boolean;
}

export interface EquipmentNode {
  id: KitchenTool;
  name: string;
  /** Short mechanism label, e.g. "Zero-oil Maillard reaction". */
  mechanism: string;
  /** Physical/chemical principle explaining why it works for fat-loss cooking. */
  physicalPrinciple: string;
  /** Ideal use cases. */
  bestFor: string[];
}

/**
 * Bounds that constitute a genuine failure, as opposed to the target ranges,
 * which merely guide the model. Deliberately asymmetric: for a fat-loss app,
 * too little protein or too much fat is a defect, whereas exceeding protein or
 * undershooting fat is not — flagging those only trains users to ignore
 * warnings.
 */
export interface EnforcedBounds {
  /** Below this, the dish fails its high-protein premise. */
  proteinMinPercent: number;
  /** Above this, fat defeats the strategy. */
  fatMaxPercent: number;
  /** Above this, carbs defeat the strategy. */
  carbMaxPercent: number;
  /** Set only where carbs serve a purpose, e.g. post-workout glycogen refill. */
  carbMinPercent?: number;
}

export interface FatLossRule {
  id: NutritionalStrategy;
  label: string;
  /** Target protein share of total calories, [min%, max%]. */
  proteinPercentRange: [number, number];
  /** Target carbohydrate share of total calories, [min%, max%]. */
  carbPercentRange: [number, number];
  /** Target fat share of total calories, [min%, max%]. */
  fatPercentRange: [number, number];
  /** Acceptable calorie deficit vs. maintenance, [min%, max%]. */
  calorieDeficitPercentRange: [number, number];
  /** Non-negotiable constraints injected verbatim into the system prompt. */
  hardConstraints: string[];
  /** Bounds the post-generation compliance check actually enforces. */
  enforcedBounds: EnforcedBounds;
}

/** 20 common fat-loss ingredients keyed by canonical kebab-case id. */
export const INGREDIENT_GRAPH: Record<string, IngredientNode> = {
  "chicken-breast": {
    name: "Chicken Breast",
    aliases: ["chicken", "skinless chicken breast", "chicken breasts"],
    macroPer100g: { calories: 120, protein_g: 22.5, carbs_g: 0, fat_g: 2.6 },
    satietyScore: 9,
    substitutionFor: ["red meat", "pork", "fatty deli meats"],
    flavorPairs: ["lemon", "thyme", "garlic", "smoked paprika"],
    gramsPer: { piece: 174 },
  },
  salmon: {
    name: "Salmon",
    aliases: ["atlantic salmon", "salmon fillet"],
    macroPer100g: { calories: 208, protein_g: 20, carbs_g: 0, fat_g: 13 },
    satietyScore: 8,
    substitutionFor: ["fatty red meat", "cream-based fish dishes"],
    flavorPairs: ["dill", "lemon", "capers", "miso"],
    gramsPer: { piece: 150 },
  },
  shrimp: {
    name: "Shrimp",
    aliases: ["prawns", "shrimps"],
    macroPer100g: { calories: 85, protein_g: 20, carbs_g: 0.2, fat_g: 0.5 },
    satietyScore: 8,
    substitutionFor: ["scallops", "lobster", "fatty proteins"],
    flavorPairs: ["garlic", "chili", "lime", "cilantro"],
    gramsPer: { piece: 15 },
  },
  "egg-whites": {
    name: "Egg Whites",
    aliases: ["egg white", "liquid egg whites"],
    macroPer100g: { calories: 52, protein_g: 10.9, carbs_g: 0.7, fat_g: 0.2 },
    satietyScore: 7,
    substitutionFor: ["whole eggs", "mayonnaise binder"],
    flavorPairs: ["chives", "smoked paprika", "nutritional yeast"],
    gramsPer: { piece: 33, tbsp: 15, cup: 243 },
  },
  "whole-egg": {
    name: "Whole Egg",
    aliases: ["eggs", "egg", "whole eggs"],
    macroPer100g: { calories: 143, protein_g: 12.6, carbs_g: 0.7, fat_g: 9.5 },
    satietyScore: 9,
    substitutionFor: ["cream (custard base)", "mayonnaise"],
    flavorPairs: ["black pepper", "chives", "parmesan"],
    gramsPer: { piece: 50 },
  },
  "greek-yogurt": {
    name: "Greek Yogurt (0% fat)",
    aliases: ["greek yoghurt", "nonfat greek yogurt", "0% greek yogurt", "yogurt"],
    macroPer100g: { calories: 59, protein_g: 10.2, carbs_g: 3.6, fat_g: 0.4 },
    satietyScore: 7,
    substitutionFor: ["heavy cream", "sour cream", "mayonnaise", "butter"],
    flavorPairs: ["lemon", "cucumber", "dill", "honey"],
    gramsPer: { tbsp: 15, cup: 245 },
  },
  "cottage-cheese": {
    name: "Cottage Cheese (low-fat)",
    aliases: ["cottage cheese", "1% cottage cheese"],
    macroPer100g: { calories: 72, protein_g: 12.4, carbs_g: 2.7, fat_g: 1 },
    satietyScore: 8,
    substitutionFor: ["ricotta", "cream cheese"],
    flavorPairs: ["berries", "black pepper", "chives"],
    gramsPer: { tbsp: 15, cup: 226 },
  },
  tofu: {
    name: "Tofu (firm)",
    aliases: ["firm tofu", "bean curd"],
    macroPer100g: { calories: 76, protein_g: 8.1, carbs_g: 1.9, fat_g: 4.8 },
    satietyScore: 6,
    substitutionFor: ["paneer", "ricotta", "meat (stir-fry)"],
    flavorPairs: ["ginger", "soy sauce", "sesame", "scallion"],
    gramsPer: { piece: 400 },
  },
  "whey-protein-isolate": {
    name: "Whey Protein Isolate",
    aliases: ["whey isolate", "whey protein", "protein powder"],
    macroPer100g: { calories: 375, protein_g: 90, carbs_g: 2, fat_g: 1 },
    satietyScore: 6,
    substitutionFor: ["flour (thickener)", "sugar (in shakes)"],
    flavorPairs: ["cocoa", "cinnamon", "vanilla", "berries"],
    /** `piece` = one standard 30g scoop. */
    gramsPer: { piece: 30, tbsp: 8 },
  },
  cauliflower: {
    name: "Cauliflower",
    aliases: ["cauliflower florets", "cauliflower rice"],
    macroPer100g: { calories: 25, protein_g: 1.9, carbs_g: 5, fat_g: 0.3 },
    satietyScore: 8,
    substitutionFor: ["potatoes (mash)", "rice", "heavy cream (purée)"],
    flavorPairs: ["garlic", "nutmeg", "parmesan", "curry"],
    gramsPer: { cup: 107, piece: 600 },
  },
  zucchini: {
    name: "Zucchini",
    aliases: ["courgette", "zucchinis"],
    macroPer100g: { calories: 17, protein_g: 1.2, carbs_g: 3.1, fat_g: 0.3 },
    satietyScore: 7,
    substitutionFor: ["pasta noodles", "lasagna sheets"],
    flavorPairs: ["basil", "garlic", "lemon", "parmesan"],
    gramsPer: { cup: 124, piece: 200 },
  },
  broccoli: {
    name: "Broccoli",
    aliases: ["broccoli florets"],
    macroPer100g: { calories: 34, protein_g: 2.8, carbs_g: 6.6, fat_g: 0.4 },
    satietyScore: 8,
    substitutionFor: ["starchy sides"],
    flavorPairs: ["garlic", "chili flake", "lemon", "sesame"],
    gramsPer: { cup: 91 },
  },
  spinach: {
    name: "Spinach",
    aliases: ["baby spinach", "spinach leaves"],
    macroPer100g: { calories: 23, protein_g: 2.9, carbs_g: 3.6, fat_g: 0.4 },
    satietyScore: 7,
    substitutionFor: ["pasta filling bulk", "cheese-heavy fillings"],
    flavorPairs: ["nutmeg", "garlic", "lemon", "feta"],
    gramsPer: { cup: 30 },
  },
  mushrooms: {
    name: "Mushrooms (white button)",
    aliases: ["mushroom", "button mushrooms", "cremini mushrooms"],
    macroPer100g: { calories: 22, protein_g: 3.1, carbs_g: 3.3, fat_g: 0.3 },
    satietyScore: 7,
    substitutionFor: ["ground beef (umami/meatiness)", "bacon (umami)"],
    flavorPairs: ["thyme", "garlic", "soy sauce", "miso"],
    gramsPer: { cup: 70, piece: 18 },
  },
  cucumber: {
    name: "Cucumber",
    aliases: ["cucumbers"],
    macroPer100g: { calories: 15, protein_g: 0.7, carbs_g: 3.6, fat_g: 0.1 },
    satietyScore: 6,
    substitutionFor: ["chips (crunch)", "bread (sandwich base)"],
    flavorPairs: ["dill", "mint", "yogurt", "lemon"],
    gramsPer: { cup: 133, piece: 300 },
  },
  "konjac-noodles": {
    name: "Konjac / Shirataki Noodles",
    aliases: ["shirataki noodles", "konjac noodles", "miracle noodles"],
    macroPer100g: { calories: 9, protein_g: 0.2, carbs_g: 3, fat_g: 0 },
    satietyScore: 9,
    substitutionFor: ["wheat pasta", "rice noodles"],
    flavorPairs: ["sesame oil", "soy sauce", "chili", "scallion"],
    /** `piece` = one standard 200g drained packet. */
    gramsPer: { piece: 200 },
  },
  "lemon-juice": {
    name: "Lemon Juice",
    aliases: ["lemon", "lemon zest", "fresh lemon juice"],
    macroPer100g: { calories: 22, protein_g: 0.4, carbs_g: 6.9, fat_g: 0.2 },
    satietyScore: 3,
    substitutionFor: ["salt (brightness)", "sugar (acid balance)"],
    flavorPairs: ["thyme", "garlic", "dill", "black pepper"],
    /** `piece` = juice of one lemon. */
    gramsPer: { tsp: 5, tbsp: 15, piece: 45 },
  },
  "sweet-potato": {
    name: "Sweet Potato",
    aliases: ["sweet potatoes", "kumara"],
    macroPer100g: { calories: 86, protein_g: 1.6, carbs_g: 20.1, fat_g: 0.1 },
    satietyScore: 7,
    substitutionFor: ["white potato", "sugar (natural sweetness)"],
    flavorPairs: ["cinnamon", "chili", "lime", "smoked paprika"],
    gramsPer: { cup: 133, piece: 130 },
  },
  oats: {
    name: "Oats (rolled, dry)",
    aliases: ["rolled oats", "oatmeal", "oat"],
    macroPer100g: { calories: 389, protein_g: 16.9, carbs_g: 66.3, fat_g: 6.9 },
    satietyScore: 8,
    substitutionFor: ["flour (thickener/breading)", "sugar (binding)"],
    flavorPairs: ["cinnamon", "berries", "vanilla", "cocoa"],
    gramsPer: { tbsp: 6, cup: 90 },
  },
  avocado: {
    name: "Avocado",
    aliases: ["avocados"],
    macroPer100g: { calories: 160, protein_g: 2, carbs_g: 8.5, fat_g: 14.7 },
    satietyScore: 6,
    substitutionFor: ["butter", "mayonnaise", "cheese (creaminess)"],
    flavorPairs: ["lime", "cilantro", "chili", "tomato"],
    gramsPer: { piece: 150, cup: 150 },
  },
};

/**
 * Secondary pantry/staple graph. These are not headline fat-loss ingredients,
 * but they carry real calories (oils, cheeses, starches, sweeteners) and must
 * be accounted for, otherwise macro verification silently undercounts.
 */
export const PANTRY_GRAPH: Record<string, IngredientNode> = {
  "olive-oil": {
    name: "Olive Oil",
    aliases: ["extra virgin olive oil", "evoo", "oil"],
    macroPer100g: { calories: 884, protein_g: 0, carbs_g: 0, fat_g: 100 },
    satietyScore: 2,
    substitutionFor: ["butter"],
    flavorPairs: ["garlic", "lemon", "basil"],
    gramsPer: { tsp: 4.5, tbsp: 13.5 },
  },
  "sesame-oil": {
    name: "Sesame Oil",
    aliases: ["toasted sesame oil"],
    macroPer100g: { calories: 884, protein_g: 0, carbs_g: 0, fat_g: 100 },
    satietyScore: 2,
    substitutionFor: [],
    flavorPairs: ["ginger", "soy sauce", "scallion"],
    gramsPer: { tsp: 4.5, tbsp: 13.6 },
  },
  butter: {
    name: "Butter",
    aliases: ["unsalted butter", "salted butter"],
    macroPer100g: { calories: 717, protein_g: 0.9, carbs_g: 0.1, fat_g: 81 },
    satietyScore: 2,
    substitutionFor: [],
    flavorPairs: ["thyme", "garlic", "lemon"],
    gramsPer: { tsp: 4.7, tbsp: 14.2 },
  },
  parmesan: {
    name: "Parmesan",
    aliases: ["parmigiano reggiano", "grated parmesan", "parmesan cheese"],
    macroPer100g: { calories: 431, protein_g: 38.5, carbs_g: 4.1, fat_g: 29 },
    satietyScore: 5,
    substitutionFor: [],
    flavorPairs: ["basil", "lemon", "black pepper"],
    gramsPer: { tsp: 2, tbsp: 5, cup: 100 },
  },
  feta: {
    name: "Feta",
    aliases: ["feta cheese"],
    macroPer100g: { calories: 264, protein_g: 14.2, carbs_g: 4.1, fat_g: 21.3 },
    satietyScore: 5,
    substitutionFor: [],
    flavorPairs: ["cucumber", "mint", "lemon"],
    gramsPer: { tbsp: 15, cup: 150 },
  },
  mozzarella: {
    name: "Mozzarella (part-skim)",
    aliases: ["part skim mozzarella", "mozzarella cheese"],
    macroPer100g: { calories: 254, protein_g: 24.3, carbs_g: 2.8, fat_g: 15.9 },
    satietyScore: 6,
    substitutionFor: [],
    flavorPairs: ["basil", "tomato", "oregano"],
    gramsPer: { cup: 112 },
  },
  cheddar: {
    name: "Cheddar",
    aliases: ["cheddar cheese", "shredded cheddar"],
    macroPer100g: { calories: 403, protein_g: 25, carbs_g: 1.3, fat_g: 33 },
    satietyScore: 5,
    substitutionFor: [],
    flavorPairs: ["chili", "chive", "mustard"],
    gramsPer: { tbsp: 7, cup: 113 },
  },
  "cream-cheese": {
    name: "Cream Cheese",
    aliases: ["philadelphia"],
    macroPer100g: { calories: 342, protein_g: 6, carbs_g: 4.1, fat_g: 34 },
    satietyScore: 4,
    substitutionFor: [],
    flavorPairs: ["chive", "lemon", "dill"],
    gramsPer: { tbsp: 15 },
  },
  "white-rice": {
    name: "White Rice (dry)",
    aliases: ["rice", "jasmine rice", "basmati rice"],
    macroPer100g: { calories: 365, protein_g: 7.1, carbs_g: 80, fat_g: 0.7 },
    satietyScore: 5,
    substitutionFor: [],
    flavorPairs: ["sesame", "scallion", "soy sauce"],
    gramsPer: { cup: 185 },
  },
  "brown-rice": {
    name: "Brown Rice (dry)",
    aliases: ["wholegrain rice"],
    macroPer100g: { calories: 370, protein_g: 7.9, carbs_g: 77.2, fat_g: 2.9 },
    satietyScore: 6,
    substitutionFor: ["white rice"],
    flavorPairs: ["sesame", "ginger", "mushroom"],
    gramsPer: { cup: 190 },
  },
  pasta: {
    name: "Pasta (dry)",
    aliases: ["spaghetti", "penne", "noodles", "wheat pasta"],
    macroPer100g: { calories: 371, protein_g: 13, carbs_g: 74.7, fat_g: 1.5 },
    satietyScore: 5,
    substitutionFor: [],
    flavorPairs: ["basil", "garlic", "parmesan"],
    gramsPer: { cup: 100 },
  },
  quinoa: {
    name: "Quinoa (dry)",
    aliases: [],
    macroPer100g: { calories: 368, protein_g: 14.1, carbs_g: 64.2, fat_g: 6.1 },
    satietyScore: 7,
    substitutionFor: ["white rice"],
    flavorPairs: ["lemon", "herbs", "cumin"],
    gramsPer: { cup: 170 },
  },
  panko: {
    name: "Panko Breadcrumbs",
    aliases: ["breadcrumbs", "bread crumbs"],
    macroPer100g: { calories: 395, protein_g: 13.4, carbs_g: 72, fat_g: 5.3 },
    satietyScore: 3,
    substitutionFor: [],
    flavorPairs: ["parmesan", "paprika", "garlic"],
    gramsPer: { tbsp: 6, cup: 50 },
  },
  "almond-flour": {
    name: "Almond Flour",
    aliases: ["ground almonds"],
    macroPer100g: { calories: 571, protein_g: 21.4, carbs_g: 21.4, fat_g: 50 },
    satietyScore: 5,
    substitutionFor: ["wheat flour"],
    flavorPairs: ["vanilla", "cinnamon", "cocoa"],
    gramsPer: { tbsp: 8, cup: 96 },
  },
  potato: {
    name: "Potato",
    aliases: ["potatoes", "white potato", "russet potato"],
    macroPer100g: { calories: 77, protein_g: 2, carbs_g: 17.5, fat_g: 0.1 },
    satietyScore: 8,
    substitutionFor: [],
    flavorPairs: ["rosemary", "garlic", "black pepper"],
    gramsPer: { piece: 170, cup: 150 },
  },
  tomato: {
    name: "Tomato",
    aliases: ["tomatoes", "cherry tomatoes", "cherry tomato"],
    macroPer100g: { calories: 18, protein_g: 0.9, carbs_g: 3.9, fat_g: 0.2 },
    satietyScore: 6,
    substitutionFor: [],
    flavorPairs: ["basil", "garlic", "olive oil"],
    gramsPer: { piece: 123, cup: 180 },
  },
  "bell-pepper": {
    name: "Bell Pepper",
    aliases: ["bell peppers", "red pepper", "capsicum"],
    macroPer100g: { calories: 31, protein_g: 1, carbs_g: 6, fat_g: 0.3 },
    satietyScore: 6,
    substitutionFor: [],
    flavorPairs: ["cumin", "garlic", "paprika"],
    gramsPer: { piece: 120, cup: 149 },
  },
  onion: {
    name: "Onion",
    aliases: ["onions", "red onion", "shallot"],
    macroPer100g: { calories: 40, protein_g: 1.1, carbs_g: 9.3, fat_g: 0.1 },
    satietyScore: 5,
    substitutionFor: [],
    flavorPairs: ["thyme", "garlic", "vinegar"],
    gramsPer: { piece: 110, cup: 160 },
  },
  garlic: {
    name: "Garlic",
    aliases: ["garlic cloves", "minced garlic"],
    macroPer100g: { calories: 149, protein_g: 6.4, carbs_g: 33, fat_g: 0.5 },
    satietyScore: 3,
    substitutionFor: [],
    flavorPairs: ["lemon", "thyme", "chili"],
    gramsPer: { clove: 3, tsp: 2.8, tbsp: 8.4 },
  },
  ginger: {
    name: "Ginger",
    aliases: ["fresh ginger", "grated ginger"],
    macroPer100g: { calories: 80, protein_g: 1.8, carbs_g: 17.8, fat_g: 0.8 },
    satietyScore: 3,
    substitutionFor: [],
    flavorPairs: ["soy sauce", "scallion", "sesame"],
    gramsPer: { tsp: 2, tbsp: 6, piece: 30 },
  },
  scallion: {
    name: "Scallion",
    aliases: ["spring onion", "green onion", "scallions"],
    macroPer100g: { calories: 32, protein_g: 1.8, carbs_g: 7.3, fat_g: 0.2 },
    satietyScore: 4,
    substitutionFor: [],
    flavorPairs: ["sesame", "ginger", "soy sauce"],
    gramsPer: { piece: 15, cup: 100 },
  },
  asparagus: {
    name: "Asparagus",
    aliases: ["asparagus spears"],
    macroPer100g: { calories: 20, protein_g: 2.2, carbs_g: 3.9, fat_g: 0.1 },
    satietyScore: 7,
    substitutionFor: [],
    flavorPairs: ["lemon", "parmesan", "black pepper"],
    gramsPer: { piece: 16, cup: 134 },
  },
  "green-beans": {
    name: "Green Beans",
    aliases: ["haricot verts", "string beans"],
    macroPer100g: { calories: 31, protein_g: 1.8, carbs_g: 6.9, fat_g: 0.2 },
    satietyScore: 7,
    substitutionFor: [],
    flavorPairs: ["garlic", "almond", "lemon"],
    gramsPer: { cup: 100 },
  },
  kale: {
    name: "Kale",
    aliases: ["curly kale", "cavolo nero"],
    macroPer100g: { calories: 35, protein_g: 2.9, carbs_g: 4.4, fat_g: 1.5 },
    satietyScore: 7,
    substitutionFor: [],
    flavorPairs: ["lemon", "garlic", "chili"],
    gramsPer: { cup: 21 },
  },
  carrot: {
    name: "Carrot",
    aliases: ["carrots"],
    macroPer100g: { calories: 41, protein_g: 0.9, carbs_g: 9.6, fat_g: 0.2 },
    satietyScore: 6,
    substitutionFor: [],
    flavorPairs: ["cumin", "ginger", "honey"],
    gramsPer: { piece: 61, cup: 128 },
  },
  "soy-sauce": {
    name: "Soy Sauce",
    aliases: ["tamari", "light soy sauce", "shoyu"],
    macroPer100g: { calories: 53, protein_g: 8.1, carbs_g: 4.9, fat_g: 0.6 },
    satietyScore: 2,
    substitutionFor: ["salt"],
    flavorPairs: ["ginger", "sesame", "scallion"],
    gramsPer: { tsp: 5.5, tbsp: 16 },
  },
  miso: {
    name: "Miso Paste",
    aliases: ["white miso", "red miso", "miso paste"],
    macroPer100g: { calories: 199, protein_g: 12.8, carbs_g: 25.4, fat_g: 6 },
    satietyScore: 3,
    substitutionFor: ["salt"],
    flavorPairs: ["ginger", "sesame", "mushroom"],
    gramsPer: { tsp: 5.7, tbsp: 17 },
  },
  honey: {
    name: "Honey",
    aliases: [],
    macroPer100g: { calories: 304, protein_g: 0.3, carbs_g: 82.4, fat_g: 0 },
    satietyScore: 2,
    substitutionFor: [],
    flavorPairs: ["lemon", "chili", "thyme"],
    gramsPer: { tsp: 7, tbsp: 21 },
  },
  "maple-syrup": {
    name: "Maple Syrup",
    aliases: [],
    macroPer100g: { calories: 260, protein_g: 0, carbs_g: 67, fat_g: 0.1 },
    satietyScore: 2,
    substitutionFor: [],
    flavorPairs: ["cinnamon", "pecan", "mustard"],
    gramsPer: { tsp: 6.7, tbsp: 20 },
  },
  mustard: {
    name: "Dijon Mustard",
    aliases: ["dijon", "wholegrain mustard"],
    macroPer100g: { calories: 66, protein_g: 3.7, carbs_g: 5.8, fat_g: 3.3 },
    satietyScore: 2,
    substitutionFor: [],
    flavorPairs: ["honey", "thyme", "vinegar"],
    gramsPer: { tsp: 5, tbsp: 15 },
  },
  "hot-sauce": {
    name: "Hot Sauce / Sriracha",
    aliases: ["sriracha", "chili sauce", "gochujang"],
    macroPer100g: { calories: 93, protein_g: 1.4, carbs_g: 19, fat_g: 0.9 },
    satietyScore: 2,
    substitutionFor: [],
    flavorPairs: ["lime", "garlic", "honey"],
    gramsPer: { tsp: 5, tbsp: 15 },
  },
  "balsamic-vinegar": {
    name: "Balsamic Vinegar",
    aliases: ["balsamic"],
    macroPer100g: { calories: 88, protein_g: 0.5, carbs_g: 17, fat_g: 0 },
    satietyScore: 2,
    substitutionFor: [],
    flavorPairs: ["tomato", "basil", "strawberry"],
    gramsPer: { tsp: 5, tbsp: 15 },
  },
  "rice-vinegar": {
    name: "Rice Vinegar",
    aliases: ["white vinegar", "apple cider vinegar", "vinegar"],
    macroPer100g: { calories: 18, protein_g: 0, carbs_g: 0.1, fat_g: 0 },
    satietyScore: 2,
    substitutionFor: [],
    flavorPairs: ["ginger", "cucumber", "chili"],
    gramsPer: { tsp: 5, tbsp: 15 },
  },
  "tomato-paste": {
    name: "Tomato Paste",
    aliases: ["tomato purée", "tomato puree"],
    macroPer100g: { calories: 82, protein_g: 4.3, carbs_g: 18.9, fat_g: 0.5 },
    satietyScore: 4,
    substitutionFor: [],
    flavorPairs: ["basil", "garlic", "oregano"],
    gramsPer: { tsp: 5.3, tbsp: 16 },
  },
  "nutritional-yeast": {
    name: "Nutritional Yeast",
    aliases: ["nooch"],
    macroPer100g: { calories: 385, protein_g: 50, carbs_g: 36, fat_g: 5 },
    satietyScore: 4,
    substitutionFor: ["parmesan"],
    flavorPairs: ["cauliflower", "mushroom", "black pepper"],
    gramsPer: { tsp: 2, tbsp: 5 },
  },
  "cocoa-powder": {
    name: "Cocoa Powder",
    aliases: ["unsweetened cocoa", "cacao powder"],
    macroPer100g: { calories: 228, protein_g: 19.6, carbs_g: 57.9, fat_g: 13.7 },
    satietyScore: 4,
    substitutionFor: [],
    flavorPairs: ["vanilla", "cinnamon", "chili"],
    gramsPer: { tsp: 2, tbsp: 5 },
  },
  broth: {
    name: "Broth / Stock",
    aliases: ["chicken broth", "chicken stock", "vegetable broth", "beef broth", "dashi"],
    macroPer100g: { calories: 4, protein_g: 0.5, carbs_g: 0.4, fat_g: 0.1 },
    satietyScore: 5,
    substitutionFor: ["cream (as braising liquid)"],
    flavorPairs: ["thyme", "garlic", "bay leaf"],
    gramsPer: { cup: 240, tbsp: 15 },
  },
  "sesame-seeds": {
    name: "Sesame Seeds",
    aliases: ["toasted sesame seeds"],
    macroPer100g: { calories: 573, protein_g: 17.7, carbs_g: 23.4, fat_g: 49.7 },
    satietyScore: 4,
    substitutionFor: [],
    flavorPairs: ["soy sauce", "scallion", "ginger"],
    gramsPer: { tsp: 3, tbsp: 9 },
  },
  capers: {
    name: "Capers",
    aliases: ["caper"],
    macroPer100g: { calories: 23, protein_g: 2.4, carbs_g: 4.9, fat_g: 0.9 },
    satietyScore: 3,
    substitutionFor: [],
    flavorPairs: ["lemon", "dill", "salmon"],
    gramsPer: { tsp: 3, tbsp: 9 },
  },
  erythritol: {
    name: "Erythritol",
    aliases: ["allulose", "monk fruit sweetener", "sweetener"],
    macroPer100g: { calories: 24, protein_g: 0, carbs_g: 100, fat_g: 0 },
    satietyScore: 1,
    substitutionFor: ["sugar"],
    flavorPairs: ["vanilla", "cinnamon", "cocoa"],
    gramsPer: { tsp: 4, tbsp: 12 },
  },
  "xanthan-gum": {
    name: "Xanthan Gum",
    aliases: ["guar gum"],
    macroPer100g: { calories: 333, protein_g: 0, carbs_g: 78, fat_g: 0.9 },
    satietyScore: 3,
    substitutionFor: ["heavy cream (as thickener)"],
    flavorPairs: [],
    gramsPer: { tsp: 2.5, tbsp: 7.5 },
  },
  gelatin: {
    name: "Gelatin",
    aliases: ["gelatine", "agar agar", "agar"],
    macroPer100g: { calories: 335, protein_g: 85.6, carbs_g: 0, fat_g: 0.1 },
    satietyScore: 4,
    substitutionFor: ["fat (as texture agent)"],
    flavorPairs: [],
    gramsPer: { tsp: 3, tbsp: 9 },
  },
  berries: {
    name: "Mixed Berries",
    aliases: ["strawberries", "blueberries", "raspberries", "berry"],
    macroPer100g: { calories: 32, protein_g: 0.7, carbs_g: 7.7, fat_g: 0.3 },
    satietyScore: 6,
    substitutionFor: ["sugar (as sweetness)"],
    flavorPairs: ["vanilla", "mint", "yogurt"],
    gramsPer: { cup: 150 },
  },
  "chicken-thigh": {
    name: "Chicken Thigh (skinless)",
    aliases: ["chicken thighs", "boneless skinless chicken thigh"],
    macroPer100g: { calories: 121, protein_g: 19.7, carbs_g: 0, fat_g: 4.1 },
    satietyScore: 8,
    substitutionFor: ["pork belly"],
    flavorPairs: ["paprika", "garlic", "lemon"],
    gramsPer: { piece: 90 },
  },
  "turkey-bacon": {
    name: "Turkey Bacon",
    aliases: ["lean turkey bacon", "chicken bacon"],
    macroPer100g: { calories: 226, protein_g: 15.5, carbs_g: 3.5, fat_g: 17 },
    satietyScore: 5,
    substitutionFor: ["pork bacon", "pancetta"],
    flavorPairs: ["black pepper", "maple", "chive"],
    gramsPer: { piece: 14 },
  },
  lecithin: {
    name: "Lecithin",
    aliases: ["soy lecithin", "sunflower lecithin", "lecithin granules"],
    macroPer100g: { calories: 667, protein_g: 0, carbs_g: 13, fat_g: 53 },
    satietyScore: 1,
    substitutionFor: ["egg yolk (as emulsifier)"],
    flavorPairs: [],
    gramsPer: { tsp: 2.5, tbsp: 7.5 },
  },
  "lean-beef": {
    name: "Lean Beef (93/7)",
    aliases: ["ground beef", "lean ground beef", "beef mince", "steak"],
    macroPer100g: { calories: 152, protein_g: 21, carbs_g: 0, fat_g: 7 },
    satietyScore: 8,
    substitutionFor: ["fatty ground beef"],
    flavorPairs: ["black pepper", "onion", "mushroom"],
    gramsPer: {},
  },
  "white-fish": {
    name: "White Fish (cod/tilapia)",
    aliases: ["cod", "tilapia", "haddock", "white fish"],
    macroPer100g: { calories: 82, protein_g: 17.8, carbs_g: 0, fat_g: 0.7 },
    satietyScore: 8,
    substitutionFor: ["fried fish"],
    flavorPairs: ["lemon", "dill", "capers"],
    gramsPer: { piece: 150 },
  },
  tuna: {
    name: "Tuna (canned in water)",
    aliases: ["canned tuna", "tuna steak"],
    macroPer100g: { calories: 116, protein_g: 25.5, carbs_g: 0, fat_g: 0.8 },
    satietyScore: 8,
    substitutionFor: ["mayo-heavy salads"],
    flavorPairs: ["lemon", "caper", "chili"],
    gramsPer: { piece: 140 },
  },
  "ground-turkey-breast": {
    name: "Ground Turkey Breast (99% lean)",
    aliases: ["ground turkey", "turkey mince", "minced turkey", "lean ground turkey"],
    macroPer100g: { calories: 111, protein_g: 24.6, carbs_g: 0, fat_g: 1.2 },
    satietyScore: 8,
    substitutionFor: ["ground beef", "pork mince"],
    flavorPairs: ["sage", "smoked paprika", "onion"],
    gramsPer: {},
  },
  "bok-choy": {
    name: "Bok Choy",
    aliases: ["pak choi", "baby bok choy", "chinese cabbage"],
    macroPer100g: { calories: 13, protein_g: 1.5, carbs_g: 2.2, fat_g: 0.2 },
    satietyScore: 6,
    substitutionFor: ["noodles (as bulk)", "rice (as bulk)"],
    flavorPairs: ["ginger", "garlic", "soy sauce", "sesame"],
    gramsPer: { piece: 75, cup: 70 },
  },
  "mixed-greens": {
    name: "Mixed Greens",
    aliases: ["salad greens", "mesclun", "leafy greens", "rocket", "arugula", "lettuce"],
    macroPer100g: { calories: 20, protein_g: 1.8, carbs_g: 2.5, fat_g: 0.3 },
    satietyScore: 5,
    substitutionFor: ["pasta (as a base)", "grain bowls"],
    flavorPairs: ["lemon", "balsamic vinegar", "parmesan"],
    gramsPer: { cup: 30 },
  },
  chickpeas: {
    name: "Chickpeas (cooked)",
    aliases: ["garbanzo beans", "cooked chickpeas", "canned chickpeas"],
    macroPer100g: { calories: 164, protein_g: 8.9, carbs_g: 27.4, fat_g: 2.6 },
    satietyScore: 8,
    substitutionFor: ["white rice", "pasta", "croutons"],
    flavorPairs: ["cumin", "lemon", "tahini", "parsley"],
    gramsPer: { cup: 164 },
  },
  tahini: {
    name: "Tahini",
    aliases: ["sesame paste", "tahina"],
    macroPer100g: { calories: 595, protein_g: 17, carbs_g: 21.2, fat_g: 53.8 },
    satietyScore: 5,
    substitutionFor: ["mayonnaise", "cream-based dressings"],
    flavorPairs: ["lemon", "garlic", "cumin", "chickpeas"],
    gramsPer: { tsp: 5, tbsp: 15 },
  },
  "whole-wheat-bun": {
    name: "Whole Wheat Burger Bun",
    aliases: ["burger bun", "whole wheat buns", "wholemeal bun", "hamburger bun"],
    macroPer100g: { calories: 254, protein_g: 10.2, carbs_g: 45.5, fat_g: 3.6 },
    satietyScore: 5,
    substitutionFor: ["white bread", "brioche bun"],
    flavorPairs: ["sesame seeds", "mustard"],
    gramsPer: { piece: 70 },
  },
};

/**
 * Seasonings whose typical dose contributes <~5 kcal. They resolve to zero
 * calories rather than counting as "unknown", so a recipe seasoned with salt
 * and thyme can still be fully macro-verified.
 */
export const NEGLIGIBLE_SEASONINGS: string[] = [
  "salt", "sea salt", "kosher salt", "flaky salt", "black pepper", "pepper",
  "white pepper", "chili flakes", "red pepper flakes", "chili powder",
  "cayenne", "paprika", "smoked paprika", "cumin", "coriander", "turmeric",
  "cinnamon", "nutmeg", "cardamom", "cloves", "allspice", "star anise",
  "oregano", "thyme", "rosemary", "basil", "parsley", "cilantro", "coriander leaves",
  "dill", "chives", "mint", "tarragon", "bay leaf", "sage", "marjoram",
  "vanilla extract", "almond extract", "lemon zest", "lime zest", "orange zest",
  "garlic powder", "onion powder", "curry powder", "garam masala",
  "five spice", "za'atar", "sumac", "saffron", "furikake", "kombu",
  "stevia", "monk fruit", "water", "ice", "cooking spray", "oil spray",
  "baking powder", "baking soda", "mustard powder", "espresso powder",
  "lemon wedge", "lime wedge", "microgreens", "edible flowers", "fresh herbs", "herbs",
];

/** Generic densities used only when a matched node lacks its own `gramsPer`. */
export const FALLBACK_MEASURE_GRAMS: Pick<HouseholdMeasures, "tsp" | "tbsp" | "cup"> = {
  tsp: 5,
  tbsp: 15,
  cup: 240,
};

/**
 * Flavor agents and texture modifiers: they carry calories, so they are priced
 * like anything else, but they exist to season a dish rather than to feed it.
 * Portion scaling leaves them alone — halving the garlic to hit a macro target
 * changes the cooking and barely moves the number.
 *
 * Sweeteners with real energy (honey, maple syrup) are deliberately absent:
 * they are a carbohydrate source and should scale with the rest.
 */
const AROMATIC_NAMES = new Set([
  "Garlic",
  "Ginger",
  "Scallion",
  "Lemon Juice",
  "Soy Sauce",
  "Miso Paste",
  "Dijon Mustard",
  "Hot Sauce / Sriracha",
  "Balsamic Vinegar",
  "Rice Vinegar",
  "Tomato Paste",
  "Nutritional Yeast",
  "Cocoa Powder",
  "Capers",
  "Erythritol",
  "Xanthan Gum",
  "Gelatin",
  "Lecithin",
]);

/** True for seasoning and texture agents that should never be rescaled. */
export function isAromatic(node: IngredientNode): boolean {
  return AROMATIC_NAMES.has(node.name);
}

/** 8 modern kitchen tools mapped to their physical/chemical cooking mechanism. */
export const EQUIPMENT_GRAPH: Record<string, EquipmentNode> = {
  air_fryer: {
    id: "air_fryer",
    name: "Air Fryer",
    mechanism: "Zero-oil Maillard reaction via high-velocity hot-air convection",
    physicalPrinciple:
      "Rapid circulating air at 180–200°C dehydrates the food surface and drives Maillard browning without submersion in fat, replicating deep-fried crispness at a fraction of the added oil.",
    bestFor: ["crispy proteins", "roasted vegetables", "reheating without sogginess"],
  },
  sous_vide: {
    id: "sous_vide",
    name: "Sous-Vide",
    mechanism: "Precision low-temperature water-bath cooking",
    physicalPrinciple:
      "Isothermal cooking below ~70°C prevents the moisture-expelling protein contraction that occurs at high heat, maximizing juiciness and nutrient retention without any added fat for lubrication.",
    bestFor: ["tender lean proteins", "precise doneness", "batch meal prep"],
  },
  food_processor: {
    id: "food_processor",
    name: "Food Processor",
    mechanism: "High-speed blade shearing (cell wall rupture)",
    physicalPrinciple:
      "Mechanical shearing ruptures plant cell walls, releasing starches and pectin that bind water into a cream-like texture — mimicking dairy-fat richness from vegetables alone.",
    bestFor: ["cauliflower rice", "vegetable purées", "protein-dense doughs"],
  },
  immersion_blender: {
    id: "immersion_blender",
    name: "Immersion Blender",
    mechanism: "Localized high-shear emulsification",
    physicalPrinciple:
      "Rapid blade rotation incorporates air and liquid interfaces to build stable emulsions and foams, replacing the egg-yolk or cream fat traditionally needed to stabilize sauces.",
    bestFor: ["silky sauces", "light foams", "on-the-spot smoothies"],
  },
  blender: {
    id: "blender",
    name: "Blender",
    mechanism: "Vortex shearing with frictional heat",
    physicalPrinciple:
      "Full fiber-matrix breakdown under high-speed vortex shear produces ultra-smooth textures, and blade friction can gently warm blends — enabling nut- and cream-free silky soups.",
    bestFor: ["smoothies", "purées", "dairy-free creamy soups"],
  },
  oven: {
    id: "oven",
    name: "Oven",
    mechanism: "Dry convective + radiant heat roasting",
    physicalPrinciple:
      "Ambient dry heat drives surface Maillard browning and moisture evaporation, concentrating flavor and building a crisp exterior with only a light oil mist rather than submersion frying.",
    bestFor: ["roasting", "baking proteins", "dehydrating"],
  },
  grill: {
    id: "grill",
    name: "Grill",
    mechanism: "Direct radiant + conductive high-heat searing",
    physicalPrinciple:
      "Extreme surface heat (200–300°C) physically renders and drips away intramuscular fat while forming a smoky Maillard crust, lowering the effective fat content of the finished cut.",
    bestFor: ["fat-rendering off proteins", "charred vegetables"],
  },
  stovetop: {
    id: "stovetop",
    name: "Stovetop",
    mechanism: "Conductive pan-searing",
    physicalPrinciple:
      "A thin conductive pan layer (ideally nonstick/ceramic) allows controlled Maillard searing with only spray-level oil, plus rapid sauce reduction via direct heat control.",
    bestFor: ["quick sears", "sauce reduction", "sautéing"],
  },
};

/** Macro ratio rules & hard constraints per fat-loss nutritional strategy. */
export const FAT_LOSS_RULES: Record<NutritionalStrategy, FatLossRule> = {
  post_workout_high_protein: {
    id: "post_workout_high_protein",
    label: "Post-Workout High-Protein",
    proteinPercentRange: [35, 50],
    carbPercentRange: [30, 45],
    fatPercentRange: [10, 25],
    calorieDeficitPercentRange: [0, 15],
    hardConstraints: [
      "Protein must supply at least 35% of total calories.",
      "Include at least one fast-digesting carbohydrate source to support glycogen resynthesis.",
      "Fat must not exceed 25% of total calories to avoid slowing gastric emptying post-training.",
    ],
    enforcedBounds: {
      proteinMinPercent: 30,
      fatMaxPercent: 30,
      carbMaxPercent: 55,
      // The whole point of this strategy: no carbs means no glycogen refill.
      carbMinPercent: 20,
    },
  },
  rest_day_low_carb: {
    id: "rest_day_low_carb",
    label: "Rest Day Low-Carb",
    proteinPercentRange: [35, 45],
    carbPercentRange: [10, 25],
    fatPercentRange: [30, 45],
    calorieDeficitPercentRange: [10, 25],
    hardConstraints: [
      "Carbohydrates must not exceed 25% of total calories.",
      "Prioritize non-starchy, high-fiber vegetables for volume and satiety.",
      "Glycemic impact must be classified as low or moderate — never high.",
    ],
    enforcedBounds: {
      proteinMinPercent: 30,
      // Fat is the intended fuel here, so only flag genuinely extreme levels.
      fatMaxPercent: 55,
      carbMaxPercent: 30,
    },
  },
  deep_cut_psmf: {
    id: "deep_cut_psmf",
    label: "Deep Cut / PSMF",
    proteinPercentRange: [50, 70],
    carbPercentRange: [5, 15],
    fatPercentRange: [5, 15],
    calorieDeficitPercentRange: [25, 40],
    hardConstraints: [
      "Fat must not exceed 15% of total calories (protein-sparing modified fast).",
      "Carbohydrates must not exceed 15% of total calories.",
      "Protein must remain the dominant macro by calories, prioritizing lean/very-lean sources.",
      "Fat-mimicry technique is mandatory to preserve satisfaction under extreme fat restriction.",
    ],
    enforcedBounds: {
      proteinMinPercent: 45,
      fatMaxPercent: 20,
      carbMaxPercent: 20,
    },
  },
  balanced_deficit: {
    id: "balanced_deficit",
    label: "Balanced Deficit",
    proteinPercentRange: [25, 35],
    carbPercentRange: [30, 45],
    fatPercentRange: [25, 35],
    calorieDeficitPercentRange: [15, 25],
    hardConstraints: [
      "Keep macros within standard balanced ranges unless another strategy is specified.",
      "Prioritize satiety density (protein + fiber) over strict macro extremes.",
    ],
    enforcedBounds: {
      proteinMinPercent: 20,
      fatMaxPercent: 40,
      carbMaxPercent: 50,
    },
  },
};

function normalize(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Whole-word phrase match with simple plural tolerance. Naive substring
 * matching is unsafe here: "ice" would match "rice" and zero out a 365 kcal
 * ingredient, while "chicken breast" still has to match "chicken breasts".
 */
function phraseMatch(text: string, phrase: string): boolean {
  if (!phrase) return false;
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\s)${escaped}(es|s)?($|\\s)`).test(text);
}

function looseMatch(query: string, candidate: string): boolean {
  return phraseMatch(query, candidate) || phraseMatch(candidate, query);
}

export interface MatchedIngredient extends IngredientNode {
  key: string;
  /** Which graph the match came from. */
  source: "core" | "pantry" | "seasoning";
}

function searchGraph(
  q: string,
  graph: Record<string, IngredientNode>,
  source: "core" | "pantry"
): { match?: MatchedIngredient; best?: { key: string; node: IngredientNode; score: number } } {
  let best: { key: string; node: IngredientNode; score: number } | undefined;

  for (const [key, node] of Object.entries(graph)) {
    const candidates = [key.replace(/-/g, " "), node.name, ...(node.aliases ?? [])].map(
      normalize
    );
    for (const candidate of candidates) {
      if (!candidate) continue;
      if (q === candidate) {
        return { match: { ...node, key, source } };
      }
      if (looseMatch(q, candidate)) {
        // Prefer the most specific (longest) alias that matched.
        const score = candidate.length;
        if (!best || score > best.score) {
          best = { key, node, score };
        }
      }
    }
  }

  return { best };
}

/**
 * Fuzzy-match free-text ingredient input (e.g. "Greek yogurt, 0%") against the
 * core graph, then the pantry graph, then the negligible-seasoning list.
 */
export function findIngredientNode(
  query: string | null | undefined
): MatchedIngredient | undefined {
  const q = normalize(query);
  if (!q) return undefined;

  const core = searchGraph(q, INGREDIENT_GRAPH, "core");
  if (core.match) return core.match;

  const pantry = searchGraph(q, PANTRY_GRAPH, "pantry");
  if (pantry.match) return pantry.match;

  // A real ingredient match — even a partial one — always beats the seasoning
  // list, so "dry white rice" resolves to rice rather than being written off.
  const fallback = core.best ?? pantry.best;
  if (fallback) {
    return {
      ...fallback.node,
      key: fallback.key,
      source: core.best ? "core" : "pantry",
    };
  }

  const seasoning = NEGLIGIBLE_SEASONINGS.map(normalize).find(
    (s) => s === q || looseMatch(q, s)
  );
  if (seasoning) {
    return {
      key: seasoning.replace(/\s+/g, "-"),
      source: "seasoning",
      name: q,
      macroPer100g: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
      satietyScore: 1,
      substitutionFor: [],
      flavorPairs: [],
      negligible: true,
    };
  }

  return undefined;
}

export interface MatchedEquipment extends EquipmentNode {
  key: string;
}

/** Fuzzy-match a kitchen tool id or free-text label against the equipment graph. */
export function findEquipmentNode(query: string): MatchedEquipment | undefined {
  const directKey = query.trim() as KitchenTool;
  if (EQUIPMENT_GRAPH[directKey]) {
    return { ...EQUIPMENT_GRAPH[directKey], key: directKey };
  }

  const q = normalize(query.replace(/_/g, " "));
  if (!q) return undefined;

  for (const [key, node] of Object.entries(EQUIPMENT_GRAPH)) {
    const candidates = [key.replace(/_/g, " "), node.name].map(normalize);
    if (candidates.some((c) => c === q || q.includes(c) || c.includes(q))) {
      return { ...node, key };
    }
  }

  return undefined;
}
