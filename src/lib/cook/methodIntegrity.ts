/**
 * The method has to be a cook of the plate that is actually listed.
 *
 * Macros, scaling and gap-fill all mutate quantities or swap a starch. None of
 * that is a cook. The model (and those rewrites) leave steps that name a food
 * that is no longer on the list, bloom nothing, or reserve a liquid they never
 * use. This pass runs on every finalized recipe and is idempotent.
 */

import {
  INGREDIENT_GRAPH,
  PANTRY_GRAPH,
  findIngredientNode,
  type IngredientNode,
} from "@/data/knowledgeGraph";
import { emulsionEggOnPlate } from "@/lib/cook/carbonaraEmulsion";
import { resolveMealIdentity, starchCookFromText } from "@/lib/cook/mealIdentity";
import { classifyGroup } from "@/lib/nutrition/portionScaling";
import type { CookEffort, GourmetRecipe, RecipeStep } from "@/types/recipe";

const GENERIC_FIRST = new Set([
  "white",
  "brown",
  "greek",
  "olive",
  "soy",
  "sea",
  "black",
  "red",
  "green",
  "fresh",
  "minced",
  "dried",
  "sweet",
  "sour",
  "hot",
  "dry",
]);

const COLD_DAIRY = /yogurt|yoghurt|cottage cheese|quark|fromage blanc/i;
const BLEND = /blend|blitz|puree|purée|whisk|processor|smoothie|emulsif/i;
const BLOOMED =
  /sauté|saute|bloom|fry|sweat|toast|until fragrant|softened in the pan/i;
const PAN_HEAT = /sear|sauté|saute|brown|fry|pan\b/i;

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cookLabel(node: IngredientNode): string {
  const named =
    node.cookName ?? node.name.replace(/\s*\([^)]*dry[^)]*\)/gi, "").trim();
  return named || node.name;
}

function identityPhrases(node: IngredientNode): string[] {
  const raw = [node.name, node.cookName, ...(node.aliases ?? [])].filter(
    (value): value is string => Boolean(value)
  );
  const phrases: string[] = [];
  for (const label of raw) {
    const cleaned = label.replace(/\(.*?\)/g, " ").replace(/[\/]/g, " ").replace(/\s+/g, " ").trim();
    if (cleaned.length >= 4) phrases.push(cleaned);
  }
  const primary = (node.cookName ?? node.name)
    .replace(/\(.*?\)/g, " ")
    .replace(/[\/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = primary.split(/\s+/).filter(Boolean);
  // Only a one-word food ("onion", "pasta") may delete by its first token.
  // "Tomato Paste" must not steal "tomato" off a plate that still has tomato.
  if (
    words.length === 1 &&
    words[0].length >= 4 &&
    !GENERIC_FIRST.has(words[0].toLowerCase())
  ) {
    phrases.push(words[0]);
  }
  const seen = new Set<string>();
  return phrases
    .map((phrase) => phrase.toLowerCase())
    .filter((phrase) => {
      if (seen.has(phrase)) return false;
      seen.add(phrase);
      return true;
    })
    .sort((a, b) => b.length - a.length);
}

function onPlateNodes(recipe: GourmetRecipe): Set<string> {
  const names = new Set<string>();
  for (const line of recipe.ingredients) {
    const node = findIngredientNode(line.name);
    if (node) names.add(node.name);
  }
  return names;
}

function allFoodNodes(): IngredientNode[] {
  return [...Object.values(INGREDIENT_GRAPH), ...Object.values(PANTRY_GRAPH)];
}

function isVolumeOrStarch(node: IngredientNode): boolean {
  const group = classifyGroup({
    calories: node.macroPer100g.calories,
    protein_g: node.macroPer100g.protein_g,
    carbs_g: node.macroPer100g.carbs_g,
    fat_g: node.macroPer100g.fat_g,
  });
  return group === "produce" || group === "carb";
}

function starchReplacement(recipe: GourmetRecipe): string {
  for (const line of recipe.ingredients) {
    const node = findIngredientNode(line.name);
    if (node?.handling?.starchCook === "boil_reserve_toss") {
      return cookLabel(node).toLowerCase();
    }
  }
  return "the sauce";
}

function phraseIn(text: string, phrase: string): boolean {
  return new RegExp(
    `(?<![A-Za-z-])${escapeRe(phrase)}s?(?![A-Za-z-])`,
    "i"
  ).test(text);
}

/**
 * On-plate names are atomic. Dry rice must not delete the word "rice"
 * out of "cooked rice" just because that node is not on the list.
 */
function maskPhrases(
  text: string,
  phrases: Set<string>
): { text: string; restore: (value: string) => string } {
  const held: string[] = [];
  let next = text;
  for (const phrase of [...phrases].sort((a, b) => b.length - a.length)) {
    if (!phrase) continue;
    next = next.replace(
      new RegExp(`(?<![A-Za-z-])${escapeRe(phrase)}s?(?![A-Za-z-])`, "gi"),
      (match) => {
        held.push(match);
        return `\uE000${held.length - 1}\uE001`;
      }
    );
  }
  return {
    text: next,
    restore: (value) =>
      value.replace(/\uE000(\d+)\uE001/g, (_, idx) => held[Number(idx)] ?? ""),
  };
}

function tidyInstruction(text: string): string {
  const parts = splitSentences(text);
  const source = parts.length > 0 ? parts : [text];
  return source
    .map((sentence) => {
      let next = sentence
        .replace(/,\s*,+/g, ",")
        .replace(/\s+and\s+and\s+/gi, " and ")
        .replace(/,\s+and\s+\./gi, ".")
        .replace(/\bthe the\b/gi, "the")
        .replace(/\bthe into\b/gi, "into")
        .replace(/\s+(?:and|or|with|plus)\s*[.,]*\s*$/gi, "")
        .replace(/[,\s]+$/g, "")
        .replace(/\s{2,}/g, " ")
        .replace(/\s+([.,])/g, "$1")
        .replace(/^[,\s]+/, "")
        .trim();
      if (!next) return "";
      if (!/[.!?]$/.test(next)) next = `${next}.`;
      return next;
    })
    .filter((sentence) => sentence.length >= 3)
    .join(" ");
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Vegetable-noodle or "chop pasta into strips" — not a wheat-pasta cook. */
function isVolumeNoodleSentence(sentence: string): boolean {
  const t = sentence.toLowerCase();
  if (/spiraliz|zoodle|julienne|shirataki|konjac/i.test(t)) return true;
  if (/(?:chop|cut|slice|shave)\b.{0,80}(?:thin\s+)?strips/i.test(t)) return true;
  if (/into\s+(?:thin\s+)?(?:strips|ribbons|spirals)/i.test(t)) return true;
  if (/\bpasta\s+strips\b/i.test(t)) return true;
  // Zucchini leftover: "add the noodles and cook until tender" — boiled pasta
  // does not go back in the garlic pan for 2–3 minutes.
  if (/\bboil\b/.test(t) || /\btoss\b/.test(t)) return false;
  if (
    /(?:add|cook|sauté|saute|stir)\b.{0,60}\b(noodles?|zoodles?|ribbons?|pasta)\b.{0,80}(until tender|until softened|for \d)/i.test(
      t
    )
  ) {
    return true;
  }
  return false;
}

function mentionsOffPlate(
  sentence: string,
  offPlate: IngredientNode[],
  protectedPhrases?: Set<string>
): boolean {
  const haystack = protectedPhrases
    ? maskPhrases(sentence, protectedPhrases).text
    : sentence;
  return offPlate.some((node) =>
    identityPhrases(node).some((phrase) => phraseIn(haystack, phrase))
  );
}

/**
 * Off-plate volume foods are gone from the list. Drop the cook that named
 * them — never delete a noun and patch the leftover grammar.
 */
function platePhrases(recipe: GourmetRecipe): Set<string> {
  const phrases = new Set<string>();
  for (const line of recipe.ingredients) {
    const node = findIngredientNode(line.name);
    if (!node) continue;
    for (const phrase of identityPhrases(node)) phrases.add(phrase);
    if (node.handling?.starchFamily) phrases.add(node.handling.starchFamily);
  }
  return phrases;
}

function scrubText(
  text: string | undefined,
  offPlate: IngredientNode[],
  protectedPhrases: Set<string>
): string | undefined {
  if (!text) return text;
  const kept = splitSentences(text).flatMap((sentence) => {
    if (mentionsOffPlate(sentence, offPlate, protectedPhrases)) {
      return [];
    }
    return [/\.$/.test(sentence) ? sentence : `${sentence}.`];
  });
  if (kept.length === 0) return "";
  return kept.join(" ");
}

function offPlateVolumeFoods(recipe: GourmetRecipe): IngredientNode[] {
  const onPlate = onPlateNodes(recipe);
  const families = new Set<string>();
  for (const line of recipe.ingredients) {
    const family = findIngredientNode(line.name)?.handling?.starchFamily;
    if (family) families.add(family);
  }
  return allFoodNodes().filter((node) => {
    if (onPlate.has(node.name)) return false;
    if (node.handling?.starchFamily && families.has(node.handling.starchFamily)) {
      return false;
    }
    if (
      node.handling?.breakOnDirectHeat &&
      node.handling?.emulsionRole !== "lecithin"
    ) {
      return true;
    }
    return isVolumeOrStarch(node);
  });
}

function mapSteps(
  steps: RecipeStep[],
  rewrite: (instruction: string, tip: string | undefined) => {
    instruction: string;
    tip?: string;
  }
): RecipeStep[] {
  return steps
    .map((step) => {
      const next = rewrite(step.instruction, step.tip);
      return { ...step, instruction: next.instruction, tip: next.tip };
    })
    .filter((step) => step.instruction.trim().length >= 12)
    .map((step, i) => ({ ...step, order: i + 1 }));
}

function scrubOffPlateFoods<T extends GourmetRecipe>(recipe: T): T {
  const stray = offPlateVolumeFoods(recipe);
  if (stray.length === 0) return recipe;
  const protectedPhrases = platePhrases(recipe);
  const scrub = (text?: string) => scrubText(text, stray, protectedPhrases);

  return {
    ...recipe,
    tagline: scrub(recipe.tagline) ?? recipe.tagline,
    psychological_reward_note:
      scrub(recipe.psychological_reward_note) ?? recipe.psychological_reward_note,
    steps: mapSteps(recipe.steps, (instruction, tip) => ({
      instruction: scrub(instruction) || "",
      tip: scrub(tip) || undefined,
    })),
    plating: {
      ...recipe.plating,
      composition: scrub(recipe.plating.composition) ?? recipe.plating.composition,
      color_contrast: scrub(recipe.plating.color_contrast),
      garnish: scrub(recipe.plating.garnish),
      social_caption: scrub(recipe.plating.social_caption),
    },
    fat_mimicry_tech: recipe.fat_mimicry_tech
      ? {
          ...recipe.fat_mimicry_tech,
          mechanism: scrub(recipe.fat_mimicry_tech.mechanism) ?? recipe.fat_mimicry_tech.mechanism,
          mouthfeel_result:
            scrub(recipe.fat_mimicry_tech.mouthfeel_result) ??
            recipe.fat_mimicry_tech.mouthfeel_result,
          replaces: recipe.fat_mimicry_tech.replaces,
        }
      : recipe.fat_mimicry_tech,
    culinary_physics_tips: recipe.culinary_physics_tips.map((tip) => ({
      ...tip,
      explanation: scrub(tip.explanation) ?? tip.explanation,
    })),
  };
}

function mentionsAllium(text: string, node: IngredientNode): boolean {
  return identityPhrases(node).some((phrase) => {
    if (phrase === "garlic") {
      return new RegExp(`\\bgarlic\\b(?!\\s+powder)`, "i").test(text);
    }
    return phraseIn(text, phrase);
  });
}

function stripAlliumFromBlend(text: string, node: IngredientNode): string {
  let next = text;
  for (const phrase of identityPhrases(node)) {
    const pattern = new RegExp(
      `,?\\s*(?:and\\s+)?(?:\\d+\\s*g\\s+)?(?:minced\\s+|raw\\s+|fresh\\s+)*${escapeRe(phrase)}s?(?:\\s+cloves?)?`,
      "gi"
    );
    next = next.replace(pattern, "");
  }
  return next
    .replace(/,\s*,/g, ",")
    .replace(/,\s*(and\s*)?together/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,])/g, "$1")
    .trim();
}

function bloomAlliumsBeforeColdDairy<T extends GourmetRecipe>(recipe: T): T {
  const onPlate = recipe.ingredients
    .map((line) => findIngredientNode(line.name))
    .filter((node): node is NonNullable<typeof node> => Boolean(node))
    .filter((node) => node.handling?.bloomBeforeColdDairy);

  if (onPlate.length === 0) return recipe;

  const steps = recipe.steps.map((step) => ({ ...step }));
  const ordered = steps.slice().sort((a, b) => a.order - b.order);

  for (const node of onPlate) {
    const blendAt = ordered.findIndex(
      (step) =>
        mentionsAllium(step.instruction, node) &&
        COLD_DAIRY.test(step.instruction) &&
        BLEND.test(step.instruction) &&
        !BLOOMED.test(step.instruction)
    );
    if (blendAt < 0) continue;

    const alreadyBloomed = ordered
      .slice(0, blendAt)
      .some(
        (step) =>
          mentionsAllium(step.instruction, node) &&
          (BLOOMED.test(step.instruction) || PAN_HEAT.test(step.instruction))
      );
    if (alreadyBloomed) continue;

    const name = cookLabel(node).toLowerCase();
    const bloom =
      `In the last 30 seconds add the ${name} and cook until fragrant, then take the pan off the heat.`;
    const panAt = ordered.findIndex(
      (step, i) => i < blendAt && PAN_HEAT.test(step.instruction) && !BLEND.test(step.instruction)
    );

    if (panAt >= 0 && !mentionsAllium(ordered[panAt].instruction, node)) {
      ordered[panAt] = {
        ...ordered[panAt],
        instruction: `${ordered[panAt].instruction.replace(/\.\s*$/, "")}. ${bloom}`,
      };
    } else if (panAt < 0) {
      const insert: RecipeStep = {
        order: 0,
        instruction: `Cook the ${name} in the pan until fragrant, then take the pan off the heat.`,
      };
      ordered.splice(blendAt, 0, insert);
    }

    const blend = ordered.find(
      (step) =>
        COLD_DAIRY.test(step.instruction) &&
        BLEND.test(step.instruction)
    );
    if (blend) {
      const split = blend.instruction.match(
        /^(.*?)((?:[. ]+then\s+)?assemble\b.*)$/i
      );
      const whiskPart = split ? split[1].trim() : blend.instruction;
      const assemblePart = split ? split[2].trim() : "";
      const stripped = stripAlliumFromBlend(whiskPart, node);
      blend.instruction = assemblePart
        ? `${stripped.replace(/\.\s*$/, "")}. ${assemblePart}`
        : stripped;
      if (!/off the heat|off heat/i.test(blend.instruction)) {
        blend.instruction = `${blend.instruction.replace(/\.\s*$/, "")}. Stir it into the pan off the heat.`;
      }
    }
  }

  return {
    ...recipe,
    steps: ordered.map((step, i) => ({ ...step, order: i + 1 })),
  };
}

function stripReserveClauses(text: string, liquid: string): string {
  return text.replace(
    new RegExp(`reserv(?:e|ed|ing)[^.]*${escapeRe(liquid)}[^.]*\.?`, "gi"),
    ""
  );
}

function parseReservedLiquid(instruction: string): string | undefined {
  if (
    /\breserv(?:e|ing)\b/i.test(instruction) &&
    /\bpasta water\b/i.test(instruction)
  ) {
    return "pasta water";
  }
  const splash = instruction.match(
    /\breserv(?:e|ing)\s+a\s+splash\s+of\s+(.+?)(?:\s+and\s+drain|\s+then\s+drain|,|\.|$)/i
  );
  if (splash) return splash[1].trim();
  const some = instruction.match(
    /\breserv(?:e|ing)\s+(?:some\s+|the\s+)?(.+?)(?:\s+and\s+drain|\s+then\s+drain|,|\.|$)/i
  );
  if (!some) return undefined;
  return some[1].replace(/^(a\s+|some\s+|the\s+)/i, "").trim();
}

function isServeStep(instruction: string): boolean {
  const t = instruction.trim();
  return (
    /^(plate|serve)\b/i.test(t) ||
    /^plate and serve/i.test(t) ||
    /\bserve immediately\b/i.test(t)
  );
}

function completeReservedLiquids<T extends GourmetRecipe>(recipe: T): T {
  const steps = recipe.steps.map((step) => ({ ...step }));
  const reserved: { liquid: string; index: number }[] = [];

  for (let i = 0; i < steps.length; i += 1) {
    const liquid = parseReservedLiquid(steps[i].instruction);
    if (!liquid || liquid.length < 4) continue;
    reserved.push({ liquid, index: i });
  }

  for (const { liquid, index } of reserved) {
    const usedLater = steps.some((step, i) => {
      if (i < index) return false;
      const rest =
        i === index
          ? stripReserveClauses(step.instruction, liquid)
          : step.instruction;
      return new RegExp(`\\b${escapeRe(liquid)}\\b`, "i").test(rest);
    });
    if (usedLater) continue;

    const extra = `Loosen with the reserved ${liquid} so the sauce emulsifies and clings.`;
    const tossAt = [...steps]
      .map((step, i) => ({ step, i }))
      .reverse()
      .find(
        ({ step, i }) =>
          i >= index &&
          !isServeStep(step.instruction) &&
          /toss|sauce|emulsif|loosen|fold|stir|whisk/i.test(step.instruction)
      )?.i;

    if (tossAt != null) {
      if (/loosen with the reserved/i.test(steps[tossAt].instruction)) continue;
      steps[tossAt] = {
        ...steps[tossAt],
        instruction: `${steps[tossAt].instruction.replace(/\.\s*$/, "")}. ${extra}`,
      };
      continue;
    }

    const serveAt = steps.findIndex((step) => isServeStep(step.instruction));
    const insertAt = serveAt >= 0 ? serveAt : steps.length;
    steps.splice(insertAt, 0, { order: 0, instruction: extra });
  }

  return {
    ...recipe,
    steps: steps.map((step, i) => ({ ...step, order: i + 1 })),
  };
}

const SEAR = /sear|roast|grill|brown|poach|pan[- ]fry|bake the/i;

function mentionsNode(text: string, node: IngredientNode): boolean {
  return identityPhrases(node).some((phrase) => phraseIn(text, phrase));
}

function richerInstruction(a: string, b: string): string {
  const parts = [...splitSentences(a), ...splitSentences(b)];
  const keys: string[] = [];
  const out: string[] = [];
  for (const part of parts) {
    const key = part.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!key) continue;
    const overlap = keys.findIndex((k) => k.includes(key) || key.includes(k));
    if (overlap >= 0) {
      if (key.length > keys[overlap].length) {
        keys[overlap] = key;
        out[overlap] = part;
      }
      continue;
    }
    keys.push(key);
    out.push(part);
  }
  return out
    .map((sentence) => (/\.$/.test(sentence) ? sentence : `${sentence}.`))
    .join(" ");
}

const DEFAULT_PASTA_PHRASES = [
  "pasta",
  "fettuccine",
  "spaghetti",
  "linguine",
  "penne",
  "noodles",
];

function pastaPhrases(recipe?: GourmetRecipe): string[] {
  const phrases = new Set(DEFAULT_PASTA_PHRASES);
  if (!recipe) return [...phrases];
  for (const line of recipe.ingredients) {
    const node = findIngredientNode(line.name);
    if (node?.handling?.starchCook !== "boil_reserve_toss") continue;
    for (const phrase of identityPhrases(node)) phrases.add(phrase);
  }
  return [...phrases].sort((a, b) => b.length - a.length);
}

function mentionsPastaStarch(text: string, phrases: string[]): boolean {
  return phrases.some((phrase) => phraseIn(text, phrase));
}

function actionKind(
  instruction: string,
  phrases: string[] = DEFAULT_PASTA_PHRASES
): string | undefined {
  const t = instruction.toLowerCase();
  if (/\bboil\b/.test(t) && mentionsPastaStarch(instruction, phrases)) {
    return "boil-pasta";
  }
  if (
    (/\btoss\b/.test(t) ||
      /(?:add|fold|return)\b.{0,80}(?:cooked|drained|boiled)/i.test(instruction)) &&
    mentionsPastaStarch(instruction, phrases)
  ) {
    return "toss-pasta";
  }
  return undefined;
}

function collapseDuplicateActions<T extends GourmetRecipe>(recipe: T): T {
  const phrases = pastaPhrases(recipe);
  const ordered = recipe.steps.slice().sort((a, b) => a.order - b.order);
  const kept: RecipeStep[] = [];
  for (const step of ordered) {
    const kind = actionKind(step.instruction, phrases);
    const normalized = step.instruction.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const sameText = kept.findIndex(
      (row) =>
        row.instruction.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() ===
        normalized
    );
    if (sameText >= 0) continue;
    if (!kind) {
      kept.push(step);
      continue;
    }
    const existing = kept.findIndex(
      (row) => actionKind(row.instruction, phrases) === kind
    );
    if (existing < 0) {
      kept.push(step);
      continue;
    }
    kept[existing] = {
      ...kept[existing],
      instruction: richerInstruction(
        kept[existing].instruction,
        step.instruction
      ),
    };
  }
  return {
    ...recipe,
    steps: kept.map((step, i) => ({ ...step, order: i + 1 })),
  };
}

function insertBeforeServe(steps: RecipeStep[], instruction: string): RecipeStep[] {
  if (steps.some((step) => step.instruction === instruction)) return steps;
  const serveAt = steps.findIndex(
    (step) =>
      /^(plate|serve)\b/i.test(step.instruction.trim()) ||
      /^plate and serve/i.test(step.instruction.trim())
  );
  const next = { order: 0, instruction };
  const withNew =
    serveAt >= 0
      ? [...steps.slice(0, serveAt), next, ...steps.slice(serveAt)]
      : [...steps, next];
  return withNew.map((step, i) => ({ ...step, order: i + 1 }));
}

function joinLabels(names: string[]): string {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and the ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and the ${names[names.length - 1]}`;
}

function appendToMatchingStep(
  steps: RecipeStep[],
  extra: string,
  test: (instruction: string) => boolean
): RecipeStep[] {
  const idx = [...steps.keys()].reverse().find((i) => test(steps[i].instruction));
  if (idx == null) return insertBeforeServe(steps, extra);
  if (steps[idx].instruction.includes(extra.replace(/\.$/, ""))) return steps;
  const copy = steps.map((step) => ({ ...step }));
  copy[idx] = {
    ...copy[idx],
    instruction: `${copy[idx].instruction.replace(/\.\s*$/, "")}. ${extra}`,
  };
  return copy;
}

function missingRoleLines(
  recipe: GourmetRecipe,
  method: string,
  role: NonNullable<IngredientNode["handling"]>["methodRole"]
): { node: IngredientNode; label: string }[] {
  const seen = new Set<string>();
  const missing: { node: IngredientNode; label: string }[] = [];
  for (const line of recipe.ingredients) {
    const node = findIngredientNode(line.name);
    if (!node || node.handling?.methodRole !== role) continue;
    if (mentionsNode(method, node)) continue;
    const label = cookLabel(node).toLowerCase();
    if (seen.has(label)) continue;
    seen.add(label);
    missing.push({ node, label });
  }
  return missing;
}

function applyMethodRoles<T extends GourmetRecipe>(recipe: T): T {
  let steps = recipe.steps.slice().sort((a, b) => a.order - b.order);
  const method = () => steps.map((step) => step.instruction).join(" ");
  const starch = starchReplacement(recipe);
  const phrases = pastaPhrases(recipe);

  if (!SEAR.test(method())) {
    const sear = shortSearInstruction(recipe);
    if (sear) {
      steps = [{ order: 1, instruction: sear }, ...steps];
    }
  }

  for (const line of recipe.ingredients) {
    const node = findIngredientNode(line.name);
    if (!node?.handling?.methodRole) continue;
    const name = cookLabel(node).toLowerCase();

    if (node.handling.methodRole === "combine_after_sear") {
      const cookAt = steps.findIndex(
        (step) => mentionsNode(step.instruction, node) && SEAR.test(step.instruction)
      );
      if (cookAt < 0) continue;
      const foldedLater = steps.some(
        (step, i) =>
          i > cookAt &&
          mentionsNode(step.instruction, node) &&
          /slice|fold|toss|add|combine|return/i.test(step.instruction)
      );
      if (foldedLater) continue;
      // Fold-through-starch is a pasta toss. A burger stacks the patty; a
      // squash roast is not boiled wheat. Do not invent that sentence here.
      if (pastaGrams(recipe) == null) continue;
      const extra = `Slice the ${name} and fold it through the ${starch} and sauce.`;
      const tossAt = steps.findIndex(
        (step) => actionKind(step.instruction, phrases) === "toss-pasta"
      );
      if (tossAt >= 0) {
        steps[tossAt] = {
          ...steps[tossAt],
          instruction: `${steps[tossAt].instruction.replace(/\.\s*$/, "")}. ${extra}`,
        };
      } else {
        steps = insertBeforeServe(steps, extra);
      }
    }

    if (node.handling.methodRole === "finish") {
      if (mentionsNode(method(), node)) continue;
      const cheese = /parmesan|cheddar|feta|mozzarella|cheese/i.test(name);
      const extra = cheese
        ? `Finish with the ${name} off the heat.`
        : `Finish with the ${name}.`;
      const tossAt = [...steps]
        .map((step, i) => ({ step, i }))
        .reverse()
        .find(({ step }) => /toss|sauce|fold|fragrant|stir/i.test(step.instruction))?.i;
      if (tossAt != null) {
        if (mentionsNode(steps[tossAt].instruction, node)) continue;
        steps[tossAt] = {
          ...steps[tossAt],
          instruction: `${steps[tossAt].instruction.replace(/\.\s*$/, "")}. ${extra}`,
        };
      } else {
        steps = insertBeforeServe(steps, extra);
      }
    }
  }

  const folds = missingRoleLines(recipe, method(), "fold_into_sauce");
  if (folds.length > 0) {
    steps = appendToMatchingStep(
      steps,
      `Fold the ${joinLabels(folds.map((item) => item.label))} through the sauce.`,
      (instruction) =>
        /fragrant|sauce|stir|brown|sear/i.test(instruction) &&
        !/\b(assemble|warm the)\b/i.test(instruction)
    );
  }

  const slurries = missingRoleLines(recipe, method(), "slurry");
  if (slurries.length > 0) {
    const stock = recipe.ingredients.find((line) => {
      const node = findIngredientNode(line.name);
      return node?.name === "Broth / Stock" && !mentionsNode(method(), node);
    });
    const stockNode = stock ? findIngredientNode(stock.name) : undefined;
    const stockLabel = stockNode ? cookLabel(stockNode).toLowerCase() : undefined;
    const gel = joinLabels(slurries.map((item) => item.label));
    const extra = stockLabel
      ? `Stir the ${stockLabel} and ${gel} through until glossy.`
      : `Stir the ${gel} through until glossy.`;
    steps = appendToMatchingStep(
      steps,
      extra,
      (instruction) =>
        /fold|fragrant|stir|sauce|glossy/i.test(instruction) &&
        !/\b(assemble|warm the)\b/i.test(instruction)
    );
  }

  const mixed = missingRoleLines(recipe, method(), "mix_in");
  if (mixed.length > 0) {
    steps = appendToMatchingStep(
      steps,
      `Mix the ${joinLabels(mixed.map((item) => item.label))} into the meat.`,
      (instruction) => /\b(mix|patty|form)\b/i.test(instruction)
    );
  }

  const sauces = missingRoleLines(recipe, method(), "sauce_join");
  if (sauces.length > 0) {
    steps = appendToMatchingStep(
      steps,
      `Stir in the ${joinLabels(sauces.map((item) => item.label))}.`,
      (instruction) =>
        /whisk|stir|sauce|fragrant|bloom/i.test(instruction) &&
        !/\bassemble\b/i.test(instruction)
    );
  }

  const stacked = missingRoleLines(recipe, method(), "assemble");
  if (stacked.length > 0) {
    steps = appendToMatchingStep(
      steps,
      `Add the ${joinLabels(stacked.map((item) => item.label))}.`,
      (instruction) => /\b(assemble|bun|stack|topping)\b/i.test(instruction)
    );
  }

  return { ...recipe, steps: steps.map((step, i) => ({ ...step, order: i + 1 })) };
}

const OFF_HEAT_GUARD =
  /off the heat|off heat|residual heat|do not return|never return|will curdle/i;

/**
 * Clocked or returning heat after an acidic dairy emulsion is in the pan.
 * "Cook until fragrant" (a bloom) and "cook until just coated" are doneness
 * cues, not a live-flame minute, so they are left alone.
 */
const POST_EMULSION_HEAT =
  /(?:[,;:]?\s*)(?:(?:then|and)\s+)?(?:cook(?:ing)?(?: for)?(?: an)? additional [^.]+|cook(?:ing)? for \d+(?:\s*[-–]\s*\d+)?(?: more)? minutes?|simmer(?:ing)?(?: (?:for|over) [^.]+)?|heat(?:ing)? through(?: for [^.]+)?|return(?:ing)? (?:it |the (?:pan|sauce|mixture) )?to (?:the )?(?:heat|flame|burner)[^.]*|(?:keep(?:ing)?|continue) (?:to )?cook(?:ing)?[^.]*|(?:over|on) (?:medium|low|high)(?:[\s-]*(?:low|high))? heat for [^.]+)\.?/gi;

function plateHasHeatFragileDairy(recipe: GourmetRecipe): boolean {
  return recipe.ingredients.some((line) => {
    const node = findIngredientNode(line.name);
    return Boolean(node?.handling?.breakOnDirectHeat) || COLD_DAIRY.test(line.name);
  });
}

function dairyJoinsThePan(instruction: string): boolean {
  if (!COLD_DAIRY.test(instruction)) return false;
  return /stir|whisk|fold|toss|mix|pour|combine|loosen|add|off the heat|off heat/i.test(
    instruction
  );
}

function isPlatingStep(instruction: string): boolean {
  return /^(serve|plate|divide|garnish|finish with)\b/i.test(instruction.trim());
}

function stripPostEmulsionHeat(instruction: string): { text: string; changed: boolean } {
  POST_EMULSION_HEAT.lastIndex = 0;
  if (!POST_EMULSION_HEAT.test(instruction)) {
    return { text: instruction, changed: false };
  }
  POST_EMULSION_HEAT.lastIndex = 0;
  let next = instruction
    .replace(POST_EMULSION_HEAT, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,])/g, "$1")
    .replace(/,\s*\./g, ".")
    .replace(/\.\s*\./g, ".")
    .trim();
  if (!next || /^[.]+$/.test(next)) {
    next =
      "Toss off the heat until just coated. Do not return the yogurt sauce to a live flame — it will curdle.";
  } else if (!OFF_HEAT_GUARD.test(next)) {
    next = `${next.replace(/\.\s*$/, "")}. Keep the pan off the heat so the yogurt does not curdle.`;
  }
  return { text: next, changed: true };
}

/**
 * Greek yogurt and cottage cheese split into whey and grainy solids if they
 * sit on a live flame after the emulsion is built. Off-heat addition is not
 * enough — a later "cook for an additional minute" is the same bug.
 */
function protectColdEmulsion<T extends GourmetRecipe>(recipe: T): T {
  if (!plateHasHeatFragileDairy(recipe)) return recipe;

  const ordered = recipe.steps.slice().sort((a, b) => a.order - b.order);
  const joinsAt = ordered.findIndex((step) => dairyJoinsThePan(step.instruction));
  if (joinsAt < 0) return recipe;

  let changed = false;
  const steps = ordered.map((step, i) => {
    if (i < joinsAt || isPlatingStep(step.instruction)) return step;
    const stripped = stripPostEmulsionHeat(step.instruction);
    if (!stripped.changed) {
      if (i === joinsAt && !OFF_HEAT_GUARD.test(step.instruction)) {
        changed = true;
        return {
          ...step,
          instruction: `${step.instruction.replace(/\.\s*$/, "")}. Stir it in off the heat so the yogurt does not curdle.`,
        };
      }
      return step;
    }
    changed = true;
    const next = { ...step, instruction: stripped.text };
    if (step.duration_minutes != null && step.duration_minutes <= 2) {
      delete next.duration_minutes;
    }
    return next;
  });

  if (!changed) return recipe;
  return { ...recipe, steps: steps.map((step, i) => ({ ...step, order: i + 1 })) };
}

function pastaGrams(recipe: GourmetRecipe): number | undefined {
  if (plateHasStarchCook(recipe, "toast_assemble")) return undefined;
  if (recipeWantsToast(recipe)) return undefined;
  for (const line of recipe.ingredients) {
    const node = findIngredientNode(line.name);
    if (node?.handling?.starchCook !== "boil_reserve_toss") continue;
    if (node.handling.volumeNoodle) continue;
    const grams = Number.parseFloat(line.quantity);
    if (Number.isFinite(grams) && grams > 0) return Math.round(grams);
  }
  return undefined;
}

function plateHasStarchCook(
  recipe: GourmetRecipe,
  cook: NonNullable<IngredientNode["handling"]>["starchCook"]
): boolean {
  return recipe.ingredients.some((line) => {
    const handling = findIngredientNode(line.name)?.handling;
    return handling?.starchCook === cook && !handling?.volumeNoodle;
  });
}

function recipeWantsToast(recipe: GourmetRecipe): boolean {
  const craving =
    "original_craving" in recipe
      ? String((recipe as { original_craving?: string }).original_craving ?? "")
      : "";
  return starchCookFromText(`${recipe.name} ${craving}`) === "toast_assemble";
}

function starchGrams(
  recipe: GourmetRecipe,
  cook: NonNullable<IngredientNode["handling"]>["starchCook"]
): number | undefined {
  for (const line of recipe.ingredients) {
    const node = findIngredientNode(line.name);
    if (!node) continue;
    if (node.handling?.starchCook !== cook) continue;
    if (node.handling?.volumeNoodle) continue;
    const grams = Number.parseFloat(line.quantity);
    if (Number.isFinite(grams) && grams > 0) return Math.round(grams);
  }
  return undefined;
}

/**
 * One plate, one starch cook. A bun is toasted and assembled; leftover pasta
 * or quinoa from a previous craving is not a second carb vehicle.
 */
const STARCH_PRIORITY = [
  "toast_assemble",
  "boil_reserve_toss",
  "reheat",
  "simmer",
] as const;

function resolveStarchIdentity<T extends GourmetRecipe>(recipe: T): T {
  let winner: (typeof STARCH_PRIORITY)[number] | undefined;
  for (const cook of STARCH_PRIORITY) {
    if (cook === "toast_assemble" && recipeWantsToast(recipe)) {
      winner = "toast_assemble";
      break;
    }
    if (plateHasStarchCook(recipe, cook)) {
      winner = cook;
      break;
    }
  }
  if (!winner && recipeWantsToast(recipe)) winner = "toast_assemble";
  if (!winner) return recipe;

  const drop = new Set<string>();
  for (const line of recipe.ingredients) {
    const node = findIngredientNode(line.name);
    const cook = node?.handling?.starchCook;
    if (!node || !cook || node.handling?.volumeNoodle) continue;
    if (cook !== winner) drop.add(node.name);
  }
  if (drop.size === 0) return recipe;

  return {
    ...recipe,
    ingredients: recipe.ingredients.filter((line) => {
      const node = findIngredientNode(line.name);
      return !node || !drop.has(node.name);
    }),
  };
}

function stripPastaFromBlend(instruction: string): string {
  const next = tidyInstruction(
    instruction.replace(
      /,?\s*(?:and\s+)?(?:the\s+)?(?:\d+\s*g\s+)?(?:dry\s+)?pasta(?:\s+strips|\s+ribbons|\s+noodles)?/gi,
      ""
    )
  );
  return next;
}

function isBoilPastaSentence(sentence: string, phrases: string[]): boolean {
  return /\bboil\b/i.test(sentence) && mentionsPastaStarch(sentence, phrases);
}

function isTossPastaSentence(sentence: string, phrases: string[]): boolean {
  if (!mentionsPastaStarch(sentence, phrases)) return false;
  if (/\btoss\b/i.test(sentence)) return true;
  return /(?:add|fold|return)\b.{0,80}(?:cooked|drained|boiled)/i.test(sentence);
}

/** Boil / reserve / drain / toss / loosen — the wheat-pasta template owns these. */
function isPastaTemplateSentence(sentence: string, phrases: string[]): boolean {
  if (isBoilPastaSentence(sentence, phrases) || isTossPastaSentence(sentence, phrases)) {
    return true;
  }
  if (/\bpasta water\b/i.test(sentence) && /reserv|loosen|drain/i.test(sentence)) {
    return true;
  }
  if (/^(?:then\s+)?drain\.?$/i.test(sentence)) return true;
  return false;
}

function isFinishStep(instruction: string): boolean {
  return (
    /slice the .+ and fold it through/i.test(instruction) ||
    /finish with the .+ off the heat/i.test(instruction)
  );
}

function isBrokenFragment(sentence: string): boolean {
  const t = sentence.trim();
  if (t.length < 12) return true;
  if (/\s+(?:and|or|with|plus)\s*[.,]?\s*$/i.test(t)) return true;
  if (/^(add|stir|mix|fold)\b.{0,40}\band\s*[.]?$/i.test(t)) return true;
  if (/\bthe cooked\b/i.test(t) && !/\bcooked [a-z]/i.test(t)) return true;
  if (/\bthe closed\b/i.test(t)) return true;
  if (/\band remaining\.?$/i.test(t)) return true;
  if (/\b\d+(?:\.\d+)?\s*g,\s/i.test(t)) return true;
  if (/\beat a,\s/i.test(t)) return true;
  return false;
}

function isSauceSentence(sentence: string): boolean {
  if (COLD_DAIRY.test(sentence)) return true;
  return (
    /off the heat|off heat/i.test(sentence) &&
    /stir|whisk|mix|blend/i.test(sentence)
  );
}

function isSearSentence(sentence: string): boolean {
  if (isSauceSentence(sentence) || isVolumeNoodleSentence(sentence)) return false;
  return (
    SEAR.test(sentence) ||
    (BLOOMED.test(sentence) && /garlic|onion|shallot/i.test(sentence))
  );
}

function isGreensSentence(sentence: string): boolean {
  return (
    /\b(spinach|kale|greens|chard)\b/i.test(sentence) &&
    /wilt|sauté|saute|add|cook/i.test(sentence)
  );
}

function isRedundantAssemble(sentence: string): boolean {
  if (isSauceSentence(sentence) || isSearSentence(sentence)) return false;
  return /\b(combine|in a bowl|to the mixture|to a bowl)\b/i.test(sentence);
}

function dairySauceInstruction(recipe: GourmetRecipe): string {
  const dairy = recipe.ingredients.find((line) => COLD_DAIRY.test(line.name))
    ?? recipe.ingredients.find((line) => {
      const node = findIngredientNode(line.name);
      return (
        Boolean(node?.handling?.breakOnDirectHeat) &&
        node?.handling?.emulsionRole !== "lecithin"
      );
    });
  const node = dairy ? findIngredientNode(dairy.name) : undefined;
  const raw = node ? cookLabel(node) : "Greek yogurt";
  const egg = emulsionEggOnPlate(recipe);
  if (egg) {
    const eggNode = findIngredientNode(egg.name);
    const eggLabel = (eggNode ? cookLabel(eggNode) : egg.name).toLowerCase();
    const mustard = recipe.ingredients.some((line) => /mustard/i.test(line.name));
    return `Take the pan off the heat. Whisk the ${raw.toLowerCase()} with the ${eggLabel}${mustard ? ", mustard," : ""} and a splash of reserved pasta water until the emulsion is glossy. Residual heat only — never scramble.`;
  }
  return `Take the pan off the heat. Stir in the ${raw.toLowerCase()} until the sauce is smooth. Do not return it to a live flame.`;
}

function pastaTossInstruction(recipe: GourmetRecipe, slicedInSear: boolean): string {
  const starch = starchReplacement(recipe);
  const parts = [
    "Toss the drained pasta with the sauce off the heat. Loosen with reserved pasta water so it clings.",
  ];
  for (const line of recipe.ingredients) {
    const node = findIngredientNode(line.name);
    if (node?.handling?.methodRole !== "combine_after_sear") continue;
    const meat = cookLabel(node).toLowerCase();
    parts.push(
      slicedInSear
        ? `Fold the ${meat} through the ${starch} and sauce.`
        : `Slice the ${meat} and fold it through the ${starch} and sauce.`
    );
  }
  for (const line of recipe.ingredients) {
    const node = findIngredientNode(line.name);
    if (node?.handling?.methodRole !== "finish") continue;
    parts.push(`Finish with the ${cookLabel(node).toLowerCase()} off the heat.`);
  }
  if (recipe.ingredients.some((line) => /pepper/i.test(line.name))) {
    const toss = parts.join(" ");
    if (!/pepper/i.test(toss)) {
      parts.push("Finish with plenty of black pepper.");
    }
  }
  parts.push("Serve immediately.");
  return parts.join(" ");
}

function shortSearInstruction(recipe: GourmetRecipe): string | undefined {
  const meats: string[] = [];
  let garlic: string | undefined;
  for (const line of recipe.ingredients) {
    const node = findIngredientNode(line.name);
    if (!node) continue;
    if (node.handling?.methodRole === "combine_after_sear") {
      meats.push(cookLabel(node).toLowerCase());
    }
    if (node.handling?.bloomBeforeColdDairy) {
      garlic = cookLabel(node).toLowerCase();
    }
  }
  const wiltNames: string[] = [];
  for (const line of recipe.ingredients) {
    const node = findIngredientNode(line.name);
    if (!node) continue;
    if (node.handling?.methodRole === "combine_after_sear") {
      meats.push(cookLabel(node).toLowerCase());
    }
    if (node.handling?.bloomBeforeColdDairy) {
      garlic = cookLabel(node).toLowerCase();
    }
    if (node.handling?.elevationRole === "volume") {
      if (node.handling.countAsPiece && plateHasStarchCook(recipe, "toast_assemble")) {
        continue;
      }
      wiltNames.push(cookLabel(node).toLowerCase());
    }
  }
  if (meats.length === 0 && !garlic && wiltNames.length === 0) return undefined;
  const pepper = recipe.ingredients.some((line) => /pepper/i.test(line.name));
  const meat = meats[0];
  const seasoned = meat
    ? pepper
      ? `Season the ${meat} with plenty of black pepper and sear until cooked through.`
      : `Sear the ${meat} until cooked through.`
    : undefined;
  const bloom = garlic
    ? `In the last 30 seconds add the ${garlic} and cook until fragrant.`
    : undefined;
  const wilt = wiltNames.length
    ? `Wilt the ${wiltNames.join(" and ")} in the same pan.`
    : undefined;
  return [seasoned, bloom, wilt].filter(Boolean).join(" ");
}

function weeknightPastaFinish(recipe: GourmetRecipe): string {
  const dairy = recipe.ingredients.find((line) => COLD_DAIRY.test(line.name));
  const dairyNode = dairy ? findIngredientNode(dairy.name) : undefined;
  const dairyLabel = dairyNode ? cookLabel(dairyNode).toLowerCase() : "greek yogurt";
  const egg = emulsionEggOnPlate(recipe);
  const eggLabel = egg
    ? (findIngredientNode(egg.name)
        ? cookLabel(findIngredientNode(egg.name)!).toLowerCase()
        : egg.name.toLowerCase())
    : undefined;
  const cheese = recipe.ingredients.find((line) => {
    const node = findIngredientNode(line.name);
    return node?.handling?.methodRole === "finish";
  });
  const cheeseLabel = cheese
    ? cookLabel(findIngredientNode(cheese.name)!).toLowerCase()
    : undefined;
  const meat = recipe.ingredients.find((line) => {
    const node = findIngredientNode(line.name);
    return node?.handling?.methodRole === "combine_after_sear";
  });
  const meatLabel = meat
    ? cookLabel(findIngredientNode(meat.name)!).toLowerCase()
    : undefined;
  const whisk = eggLabel
    ? `Whisk the ${dairyLabel} with the ${eggLabel} and a splash of reserved pasta water until glossy.`
    : `Stir in the ${dairyLabel} and a splash of reserved pasta water until smooth.`;
  const fold = meatLabel ? ` Fold through the ${meatLabel}.` : "";
  const finish = cheeseLabel
    ? ` Finish with the ${cheeseLabel} and plenty of black pepper.`
    : " Finish with plenty of black pepper.";
  const heat = eggLabel
    ? " Residual heat only — never scramble."
    : " Do not return it to a live flame.";
  return `Take the pan off the heat. ${whisk} Toss in the pasta.${fold}${finish}${heat} Serve immediately.`;
}

function dropBlenderIfUnused<T extends GourmetRecipe>(recipe: T): T {
  const method = recipe.steps.map((step) => step.instruction).join(" ");
  const usesMachine = /blend|blitz|puree|purée|processor|smoothie/i.test(method);
  if (usesMachine) return recipe;
  const tools = (recipe.tools_used ?? []).filter(
    (tool) => tool !== "blender" && tool !== "immersion_blender"
  );
  if (tools.length === (recipe.tools_used ?? []).length) return recipe;
  return { ...recipe, tools_used: tools };
}

function joinSlot(sentences: string[]): string | undefined {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const sentence of sentences) {
    const cleaned = tidyInstruction(sentence);
    if (!cleaned || isBrokenFragment(cleaned)) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(/[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`);
  }
  if (unique.length === 0) return undefined;
  return unique.join(" ");
}

/**
 * Pasta is not zucchini with a different noun. When the plate's starch cooks
 * as boil → reserve → toss, the method is compiled from those slots plus
 * sear / sauce / greens the list still needs. Vegetable-noodle actions,
 * bowl-combines, and extra finish numbers are not kept and patched.
 */
function rebuildPastaMethod<T extends GourmetRecipe>(
  recipe: T,
  effort?: CookEffort
): T {
  const grams = pastaGrams(recipe);
  if (grams == null) return recipe;
  const phrases = pastaPhrases(recipe);
  const tight = effort !== "project" && effort !== "batch";
  const identity = resolveMealIdentity(recipe);

  const sears: string[] = [];
  const sauces: string[] = [];
  const greens: string[] = [];

  for (const step of recipe.steps.slice().sort((a, b) => a.order - b.order)) {
    for (const sentence of splitSentences(step.instruction)) {
      if (isPastaTemplateSentence(sentence, phrases)) continue;
      if (isVolumeNoodleSentence(sentence) && !BLEND.test(sentence)) continue;
      if (isFinishStep(sentence) || isServeStep(sentence)) continue;
      if (isRedundantAssemble(sentence)) continue;
      if (isBrokenFragment(sentence)) continue;

      let text = sentence;
      if (BLEND.test(text) && /\bpasta\b/i.test(text)) {
        text = stripPastaFromBlend(text);
      }
      text = tidyInstruction(text);
      if (!text || isBrokenFragment(text) || text.length < 12) continue;

      if (isSauceSentence(text)) {
        sauces.push(text);
        continue;
      }
      if (isGreensSentence(text)) {
        greens.push(text);
        continue;
      }
      if (isSearSentence(text)) {
        sears.push(text);
      }
    }
  }

  const boilText = `Boil ${grams}g dry pasta until al dente. Reserve a splash of pasta water, then drain.`;
  const compiledSear = tight
    ? shortSearInstruction(recipe)
    : joinSlot(identity?.dropVolumeUnlessAsked ? sears : [...sears, ...greens]);
  const searText = compiledSear ?? joinSlot(sears);
  const egg = emulsionEggOnPlate(recipe);
  const compiledSauce = joinSlot(sauces);
  const sauceText =
    egg && (!compiledSauce || !/egg|yolk/i.test(compiledSauce))
      ? dairySauceInstruction(recipe)
      : compiledSauce ?? dairySauceInstruction(recipe);
  const slicedInSear = Boolean(
    searText && /slice|strip/i.test(searText)
  );

  const steps: RecipeStep[] = [{ order: 1, instruction: boilText }];
  if (searText) steps.push({ order: 0, instruction: searText });
  if (tight) {
    steps.push({ order: 0, instruction: weeknightPastaFinish(recipe) });
  } else {
    steps.push({ order: 0, instruction: sauceText });
    steps.push({
      order: 0,
      instruction: pastaTossInstruction(recipe, slicedInSear),
    });
  }

  const composition = recipe.plating.composition ?? "";
  const plating =
    /ribbon|zoodle|spiral|noodle/i.test(composition) || composition.trim().length < 8
      ? {
          ...recipe.plating,
          composition: `Twirl the pasta in a wide bowl so the sauce clings.`,
        }
      : recipe.plating;

  return {
    ...recipe,
    steps: steps.map((step, i) => ({ ...step, order: i + 1 })),
    plating,
  };
}

function rebuildToastMethod<T extends GourmetRecipe>(
  recipe: T,
  effort?: CookEffort
): T {
  if (!plateHasStarchCook(recipe, "toast_assemble")) return recipe;
  if (effort === "project" || effort === "batch") return recipe;
  const method = recipe.steps.map((step) => step.instruction).join(" ");
  const volumeNoodle = recipe.steps.some((step) =>
    isVolumeNoodleSentence(step.instruction)
  );
  if (/\bbuns?\b/i.test(method) && !volumeNoodle) {
    return recipe;
  }
  if (!volumeNoodle) {
    const bunLine = recipe.ingredients.find((line) => {
      const node = findIngredientNode(line.name);
      return node?.handling?.starchCook === "toast_assemble";
    });
    const bun = bunLine
      ? cookLabel(findIngredientNode(bunLine.name)!).toLowerCase()
      : "bun";
    if (/\bbuns?\b/i.test(method)) return recipe;
    const toast = `Toast the ${bun} until crisp.`;
    if (recipe.steps.some((step) => step.instruction === toast)) return recipe;
    return {
      ...recipe,
      steps: [{ order: 1, instruction: toast }, ...recipe.steps].map(
        (step, i) => ({ ...step, order: i + 1 })
      ),
    };
  }
  const sear = shortSearInstruction(recipe);
  const meat = recipe.ingredients.find((line) => {
    const node = findIngredientNode(line.name);
    return node?.handling?.methodRole === "combine_after_sear";
  });
  const leaf = recipe.ingredients.find((line) => {
    const node = findIngredientNode(line.name);
    return node?.handling?.countAsPiece && node.handling.elevationRole === "volume";
  });
  const dairy = recipe.ingredients.find((line) =>
    /yogurt|yoghurt|cottage cheese/i.test(line.name)
  );
  const meatLabel = meat
    ? cookLabel(findIngredientNode(meat.name)!).toLowerCase()
    : undefined;
  const leafLabel = leaf
    ? cookLabel(findIngredientNode(leaf.name)!).toLowerCase()
    : undefined;
  const assemble = [
    "Assemble on the bun.",
    meatLabel ? `Add the ${meatLabel}.` : "",
    leafLabel ? `Add the ${leafLabel}.` : "",
    dairy ? "Spoon the sauce on." : "",
    "Place the top bun on.",
  ]
    .filter(Boolean)
    .join(" ");

  const steps: RecipeStep[] = [
    { order: 1, instruction: "Toast the bun until crisp." },
  ];
  if (sear) steps.push({ order: 0, instruction: sear });
  steps.push({ order: 0, instruction: assemble });

  return {
    ...recipe,
    steps: steps.map((step, i) => ({ ...step, order: i + 1 })),
  };
}

function rebuildReheatMethod<T extends GourmetRecipe>(recipe: T): T {
  if (!plateHasStarchCook(recipe, "reheat")) return recipe;
  const method = recipe.steps.map((step) => step.instruction).join(" ");
  const line = recipe.ingredients.find((item) => {
    const node = findIngredientNode(item.name);
    return node?.handling?.starchCook === "reheat";
  });
  const node = line ? findIngredientNode(line.name) : undefined;
  if (node && mentionsNode(method, node)) return recipe;
  const starchName = node ? cookLabel(node).toLowerCase() : "cooked rice";
  if (recipe.steps.some((step) => /warm the /i.test(step.instruction))) {
    return recipe;
  }
  const warm = `Warm the ${starchName}.`;
  return {
    ...recipe,
    steps: [{ order: 1, instruction: warm }, ...recipe.steps].map((step, i) => ({
      ...step,
      order: i + 1,
    })),
  };
}

function rebuildSimmerMethod<T extends GourmetRecipe>(
  recipe: T,
  effort?: CookEffort
): T {
  if (pastaGrams(recipe) != null) return recipe;
  if (plateHasStarchCook(recipe, "toast_assemble")) return recipe;
  if (plateHasStarchCook(recipe, "reheat")) return recipe;
  const grams = starchGrams(recipe, "simmer");
  if (grams == null) return recipe;
  if (effort === "project" || effort === "batch") return recipe;
  let starchName = "rice";
  let starchNode: IngredientNode | undefined;
  for (const line of recipe.ingredients) {
    const node = findIngredientNode(line.name);
    if (node?.handling?.starchCook === "simmer") {
      starchName = cookLabel(node).toLowerCase();
      starchNode = node;
      break;
    }
  }
  const method = recipe.steps.map((step) => step.instruction).join(" ");
  if (starchNode && mentionsNode(method, starchNode)) return recipe;
  if (/\b(rice|quinoa)\b/i.test(method)) return recipe;
  const simmer = `Simmer ${grams}g ${starchName} until tender.`;
  return {
    ...recipe,
    steps: [{ order: 1, instruction: simmer }, ...recipe.steps].map((step, i) => ({
      ...step,
      order: i + 1,
    })),
  };
}

/**
 * Weeknight overflow: drop extra volume actions. Do not glue two verbs into
 * one paragraph — that is how "simple" becomes unreadable.
 */
function packWeeknightSteps<T extends GourmetRecipe>(
  recipe: T,
  effort?: CookEffort
): T {
  if (effort === "project" || effort === "batch") return recipe;
  if (pastaGrams(recipe) != null) return recipe;
  const steps = recipe.steps.slice().sort((a, b) => a.order - b.order);
  const max = 4;
  if (steps.length <= max) return recipe;

  const droppable = (instruction: string) =>
    isGreensSentence(instruction) || isRedundantAssemble(instruction);

  while (steps.length > max) {
    const idx = [...steps.keys()].reverse().find((i) => droppable(steps[i].instruction));
    if (idx == null) break;
    steps.splice(idx, 1);
  }

  return {
    ...recipe,
    steps: steps.map((step, i) => ({ ...step, order: i + 1 })),
  };
}

/** Idempotent. Safe to run on every plate, including ones that never swapped. */
export function repairCookMethod<T extends GourmetRecipe>(
  recipe: T,
  opts?: { effort?: CookEffort }
): T {
  let next = resolveStarchIdentity(recipe);
  next = scrubOffPlateFoods(next);
  next = bloomAlliumsBeforeColdDairy(next);
  next = rebuildPastaMethod(next, opts?.effort);
  next = rebuildToastMethod(next, opts?.effort);
  next = rebuildReheatMethod(next);
  next = rebuildSimmerMethod(next, opts?.effort);
  next = completeReservedLiquids(next);
  next = collapseDuplicateActions(next);
  next = applyMethodRoles(next);
  next = collapseDuplicateActions(next);
  next = protectColdEmulsion(next);
  next = packWeeknightSteps(next, opts?.effort);
  return dropBlenderIfUnused(next);
}
