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
import { classifyGroup } from "@/lib/nutrition/portionScaling";
import type { CookEffort, GourmetRecipe, RecipeStep } from "@/types/recipe";
import { WEEKNIGHT_MAX_STEPS } from "@/lib/cookability";

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

const ROLE_SUFFIX =
  "(?:\\s+(?:noodles?|ribbons?|mixture|spirals?|zoodles?|pasta|rice))?";

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
  const first = primary.split(/\s+/)[0] ?? "";
  if (first.length >= 4 && !GENERIC_FIRST.has(first.toLowerCase())) {
    phrases.push(first);
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
  return new RegExp(`\\b${escapeRe(phrase)}s?\\b`, "i").test(text);
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

function mentionsOffPlate(sentence: string, offPlate: IngredientNode[]): boolean {
  return offPlate.some((node) =>
    identityPhrases(node).some((phrase) => phraseIn(sentence, phrase))
  );
}

function deleteOffPlatePhrases(text: string, offPlate: IngredientNode[]): string {
  let next = text;
  for (const node of offPlate) {
    for (const phrase of identityPhrases(node)) {
      next = next.replace(
        new RegExp(`\\b${escapeRe(phrase)}s?${ROLE_SUFFIX}\\b`, "gi"),
        ""
      );
    }
  }
  return tidyInstruction(next);
}

function offPlateNoodleFoods(offPlate: IngredientNode[]): IngredientNode[] {
  return offPlate.filter(
    (node) =>
      node.handling?.volumeNoodle ||
      /zucchini|konjac|shirataki|courgette/i.test(node.name)
  );
}

/**
 * Off-plate volume foods are gone from the list. Delete them from the method.
 * Never substitute the remaining starch name into a vegetable-noodle sentence
 * ("chop the zucchini" must not become "chop the pasta").
 */
function scrubText(
  text: string | undefined,
  offPlate: IngredientNode[]
): string | undefined {
  if (!text) return text;
  const strayNoodles = offPlateNoodleFoods(offPlate);
  const starchGone = offPlate.filter((node) => Boolean(node.handling?.starchCook));
  const kept = splitSentences(text).flatMap((sentence) => {
    if (isStarchMethodSentence(sentence, starchGone)) {
      return [];
    }
    if (
      mentionsOffPlate(sentence, strayNoodles) &&
      isVolumeNoodleSentence(sentence)
    ) {
      return [];
    }
    const next = deleteOffPlatePhrases(sentence, offPlate);
    if (next.length < 12) return [];
    if (/^(chop|toss|add to|blend) the[.]*$/i.test(next)) return [];
    return [/\.$/.test(next) ? next : `${next}.`];
  });
  if (kept.length === 0) return "";
  return kept.join(" ");
}

function offPlateVolumeFoods(recipe: GourmetRecipe): IngredientNode[] {
  const onPlate = onPlateNodes(recipe);
  return allFoodNodes().filter(
    (node) => !onPlate.has(node.name) && isVolumeOrStarch(node)
  );
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
  const scrub = (text?: string) => scrubText(text, stray);

  return {
    ...recipe,
    tagline: scrub(recipe.tagline) || recipe.tagline,
    psychological_reward_note:
      scrub(recipe.psychological_reward_note) || recipe.psychological_reward_note,
    steps: mapSteps(recipe.steps, (instruction, tip) => ({
      instruction: scrub(instruction) || "",
      tip: scrub(tip) || undefined,
    })),
    plating: {
      ...recipe.plating,
      composition: scrub(recipe.plating.composition) || recipe.plating.composition,
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

  let steps = recipe.steps.map((step) => ({ ...step }));
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
      blend.instruction = stripAlliumFromBlend(blend.instruction, node);
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

function applyMethodRoles<T extends GourmetRecipe>(recipe: T): T {
  let steps = recipe.steps.slice().sort((a, b) => a.order - b.order);
  const method = () => steps.map((step) => step.instruction).join(" ");
  const starch = starchReplacement(recipe);
  const phrases = pastaPhrases(recipe);

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
      const tossAt = [...steps]
        .map((step, i) => ({ step, i }))
        .reverse()
        .find(({ step }) => /toss|sauce|fold/i.test(step.instruction))?.i;
      const extra = `Finish with the ${name} off the heat.`;
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
  const text = `${recipe.name} ${craving}`.toLowerCase();
  return (
    /burger|cheeseburger|hamburger|slider/.test(text) || /\bsandwich\b/.test(text)
  );
}

/**
 * One plate, one starch cook. A bun is toasted and assembled; leftover pasta
 * or quinoa from a previous craving is not a second carb vehicle.
 */
function resolveStarchIdentity<T extends GourmetRecipe>(recipe: T): T {
  let hasToast = false;
  const foreign: string[] = [];
  for (const line of recipe.ingredients) {
    const node = findIngredientNode(line.name);
    const cook = node?.handling?.starchCook;
    if (!node || !cook || node.handling?.volumeNoodle) continue;
    if (cook === "toast_assemble") hasToast = true;
    else foreign.push(node.name);
  }
  const dropForeign = hasToast || recipeWantsToast(recipe);
  if (!dropForeign || foreign.length === 0) return recipe;

  const drop = new Set(foreign);
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

function isStarchMethodSentence(sentence: string, nodes: IngredientNode[]): boolean {
  if (!mentionsOffPlate(sentence, nodes)) return false;
  if (isPastaTemplateSentence(sentence, DEFAULT_PASTA_PHRASES)) return true;
  if (
    /\b(boil|simmer|cook until tender)\b/i.test(sentence) &&
    /quinoa|rice|pasta|couscous/i.test(sentence)
  ) {
    return true;
  }
  if (/fold through so the plate has the starch/i.test(sentence)) return true;
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
    return `Take the pan off the heat. Blend the ${raw.toLowerCase()} with the ${eggLabel}${mustard ? ", mustard," : ""} and a splash of reserved pasta water until the carbonara emulsion is glossy. Residual heat only — never scramble.`;
  }
  return `Take the pan off the heat. Stir in the ${raw.toLowerCase()} until the sauce is smooth. Do not return it to a live flame.`;
}

function pastaTossInstruction(recipe: GourmetRecipe): string {
  const starch = starchReplacement(recipe);
  const parts = [
    "Toss the drained pasta with the sauce off the heat. Loosen with reserved pasta water so it clings.",
  ];
  for (const line of recipe.ingredients) {
    const node = findIngredientNode(line.name);
    if (node?.handling?.methodRole !== "combine_after_sear") continue;
    parts.push(
      `Slice the ${cookLabel(node).toLowerCase()} and fold it through the ${starch} and sauce.`
    );
  }
  for (const line of recipe.ingredients) {
    const node = findIngredientNode(line.name);
    if (node?.handling?.methodRole !== "finish") continue;
    parts.push(`Finish with the ${cookLabel(node).toLowerCase()} off the heat.`);
  }
  parts.push("Serve immediately.");
  return parts.join(" ");
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
function rebuildPastaMethod<T extends GourmetRecipe>(recipe: T): T {
  const grams = pastaGrams(recipe);
  if (grams == null) return recipe;
  const phrases = pastaPhrases(recipe);

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
  const searText = joinSlot([...sears, ...greens]);
  const egg = emulsionEggOnPlate(recipe);
  const compiledSauce = joinSlot(sauces);
  const sauceText =
    egg && (!compiledSauce || !/egg|yolk/i.test(compiledSauce))
      ? dairySauceInstruction(recipe)
      : compiledSauce ?? dairySauceInstruction(recipe);
  const tossText = pastaTossInstruction(recipe);

  const steps: RecipeStep[] = [{ order: 1, instruction: boilText }];
  if (searText) steps.push({ order: 0, instruction: searText });
  steps.push({ order: 0, instruction: sauceText });
  steps.push({ order: 0, instruction: tossText });

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

/**
 * Non-pasta weeknight overflow only. Pasta methods are compiled to the slot
 * count above — they must not be squeezed after the fact.
 */
function packWeeknightSteps<T extends GourmetRecipe>(
  recipe: T,
  effort?: CookEffort
): T {
  if (effort === "project" || effort === "batch") return recipe;
  if (pastaGrams(recipe) != null) return recipe;
  let steps = recipe.steps.slice().sort((a, b) => a.order - b.order);
  if (steps.length <= WEEKNIGHT_MAX_STEPS) return recipe;

  while (steps.length > WEEKNIGHT_MAX_STEPS) {
    const idx = [...steps.keys()]
      .reverse()
      .find(
        (i) =>
          i > 0 &&
          actionKind(steps[i].instruction) !== "boil-pasta" &&
          actionKind(steps[i - 1].instruction) !== "boil-pasta"
      );
    if (idx == null) break;
    steps[idx - 1] = {
      ...steps[idx - 1],
      instruction: richerInstruction(
        steps[idx - 1].instruction,
        steps[idx].instruction
      ),
    };
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
  next = rebuildPastaMethod(next);
  next = completeReservedLiquids(next);
  next = collapseDuplicateActions(next);
  next = applyMethodRoles(next);
  next = collapseDuplicateActions(next);
  next = protectColdEmulsion(next);
  next = packWeeknightSteps(next, opts?.effort);
  return next;
}
