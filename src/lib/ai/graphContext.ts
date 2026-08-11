/**
 * Builds a "STRICT CONSTRAINTS" prompt block from the Knowledge Graph
 * (`src/data/knowledgeGraph.ts`), based on the user's selected ingredients
 * and kitchen tools. Injected as an additional system message so the LLM
 * cannot hallucinate nutrition or physics facts for known items.
 */

import {
  FAT_LOSS_RULES,
  findEquipmentNode,
  findIngredientNode,
  type MatchedEquipment,
  type MatchedIngredient,
} from "@/data/knowledgeGraph";
import type { NutritionalStrategy } from "@/types/recipe";

export interface GraphLookupResult {
  matchedIngredients: MatchedIngredient[];
  unmatchedIngredients: string[];
  matchedEquipment: MatchedEquipment[];
}

export interface GraphConstraintsResult {
  /** Empty string when nothing matched — safe to append unconditionally. */
  systemMessage: string;
  lookup: GraphLookupResult;
}

function formatIngredientFact(node: MatchedIngredient): string {
  const m = node.macroPer100g;
  const parts = [
    `- ${node.name} — ${m.calories} kcal · ${m.protein_g}g protein · ${m.carbs_g}g carbs · ${m.fat_g}g fat (per 100g raw)`,
    `Satiety ${node.satietyScore}/10`,
  ];
  if (node.substitutionFor.length > 0) {
    parts.push(`Substitutes for: ${node.substitutionFor.join(", ")}`);
  }
  if (node.flavorPairs.length > 0) {
    parts.push(`Pairs with: ${node.flavorPairs.join(", ")}`);
  }
  return parts.join(" | ");
}

function formatEquipmentFact(node: MatchedEquipment): string {
  return `- ${node.name} — ${node.mechanism}. ${node.physicalPrinciple} | Best for: ${node.bestFor.join(", ")}`;
}

/**
 * Perform a graph lookup for the given ingredients/tools and build a strict
 * constraints block to append to the system prompt. Returns an empty
 * systemMessage when nothing in the graph matched (safe no-op).
 */
export function buildKnowledgeGraphConstraints(params: {
  ingredientNames: string[];
  toolIds: string[];
  strategy?: NutritionalStrategy;
}): GraphConstraintsResult {
  const matchedIngredients: MatchedIngredient[] = [];
  const unmatchedIngredients: string[] = [];
  const seenIngredientKeys = new Set<string>();

  for (const name of params.ingredientNames) {
    const match = findIngredientNode(name);
    if (match && !seenIngredientKeys.has(match.key)) {
      seenIngredientKeys.add(match.key);
      matchedIngredients.push(match);
    } else if (!match) {
      unmatchedIngredients.push(name);
    }
  }

  const matchedEquipment: MatchedEquipment[] = [];
  const seenEquipmentKeys = new Set<string>();

  for (const tool of params.toolIds) {
    const match = findEquipmentNode(tool);
    if (match && !seenEquipmentKeys.has(match.key)) {
      seenEquipmentKeys.add(match.key);
      matchedEquipment.push(match);
    }
  }

  const rule = params.strategy ? FAT_LOSS_RULES[params.strategy] : undefined;

  const sections: string[] = [];

  if (matchedIngredients.length > 0) {
    sections.push(
      `### Verified Ingredient Facts (per 100g RAW weight — ground truth, do not alter)\n${matchedIngredients
        .map(formatIngredientFact)
        .join(
          "\n"
        )}\n\nAll quantities you write MUST be raw grams so these values apply directly, and your macro totals MUST be the sum of these figures across the weights you choose.`
    );
  }

  if (matchedEquipment.length > 0) {
    sections.push(
      `### Verified Equipment Physics (use these exact mechanisms)\n${matchedEquipment
        .map(formatEquipmentFact)
        .join("\n")}`
    );
  }

  if (rule) {
    sections.push(
      `### Nutritional Strategy Hard Constraints — ${rule.label}\n` +
        `- Protein: ${rule.proteinPercentRange[0]}–${rule.proteinPercentRange[1]}% of total calories\n` +
        `- Carbs: ${rule.carbPercentRange[0]}–${rule.carbPercentRange[1]}% of total calories\n` +
        `- Fat: ${rule.fatPercentRange[0]}–${rule.fatPercentRange[1]}% of total calories\n` +
        `- Calorie deficit vs. maintenance: ${rule.calorieDeficitPercentRange[0]}–${rule.calorieDeficitPercentRange[1]}%\n` +
        rule.hardConstraints.map((c) => `- ${c}`).join("\n")
    );
  }

  const lookup: GraphLookupResult = {
    matchedIngredients,
    unmatchedIngredients,
    matchedEquipment,
  };

  if (sections.length === 0) {
    return { systemMessage: "", lookup };
  }

  const systemMessage = `## STRICT KNOWLEDGE GRAPH CONSTRAINTS
You MUST treat everything below as verified ground truth. Do NOT invent different macro values, substitution claims, or physical mechanisms for the items listed. If you use one of these ingredients or tools, use these exact facts. Unlisted ingredients may use your best nutrition-science estimate, but these override any conflicting general knowledge.

${sections.join("\n\n")}`;

  return { systemMessage, lookup };
}
