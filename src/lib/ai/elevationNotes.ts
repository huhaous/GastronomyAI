/**
 * Elevation notes are the permission surface: why this plate is the craving
 * and not a random healthy bowl. The model only writes fat-mimicry swaps
 * (cream → yogurt). Visual and volumetric additions — a handful of spinach,
 * a chili bloom — land on the list and in the method, then vanish from the
 * card. This pass names anything on the plate the craving did not imply.
 */

import { findIngredientNode } from "@/data/knowledgeGraph";
import type { CulinaryPhysicsTip, GourmetRecipe } from "@/types/recipe";

const AROMA_ADDITIONS: { match: RegExp; technique: string; agent: string }[] = [
  {
    match: /red pepper flakes|chili flakes|chilli flakes|crushed red pepper|pepper flakes/i,
    technique: "Aroma — chili bloom",
    agent: "red pepper flakes",
  },
];

function alreadyCovered(tips: CulinaryPhysicsTip[], query: string): boolean {
  const hay = tips
    .flatMap((tip) => [tip.technique, tip.explanation, ...(tip.agents ?? [])])
    .join(" ")
    .toLowerCase();
  return hay.includes(query.toLowerCase());
}

function volumeNote(name: string, quantity: string, unit?: string): CulinaryPhysicsTip {
  const amount = [quantity, unit].filter(Boolean).join("");
  return {
    technique: `Volume — ${name}`,
    explanation: `${amount} ${name.toLowerCase()} is not in the original craving. It wilts into the plate for bulk and color at almost no calorie cost.`,
    agents: [name],
    is_fat_mimicry: false,
  };
}

function aromaNote(technique: string, agent: string, lineName: string): CulinaryPhysicsTip {
  return {
    technique,
    explanation: `${lineName} is a heat-and-aroma lift, not a reconstruction of the sauce. It belongs on the Elevation card because the diner will see and taste it.`,
    agents: [agent],
    is_fat_mimicry: false,
  };
}

/**
 * Append Elevation notes for visual / volumetric additions the model cooked
 * but did not announce. Idempotent: skips names already in substitutions.
 */
export function announcePlateAdditions<T extends GourmetRecipe>(recipe: T): T {
  const existing = (
    "substitutions" in recipe && Array.isArray((recipe as { substitutions?: CulinaryPhysicsTip[] }).substitutions)
      ? (recipe as { substitutions: CulinaryPhysicsTip[] }).substitutions
      : undefined
  );
  if (!existing) return recipe;
  const extra: CulinaryPhysicsTip[] = [];

  for (const line of recipe.ingredients) {
    const node = findIngredientNode(line.name);
    if (node?.handling?.elevationRole === "volume") {
      const label = node.cookName ?? node.name;
      if (!alreadyCovered([...existing, ...extra], label) && !alreadyCovered([...existing, ...extra], line.name)) {
        extra.push(volumeNote(label, line.quantity, line.unit));
      }
    }

    for (const aroma of AROMA_ADDITIONS) {
      if (!aroma.match.test(line.name)) continue;
      if (alreadyCovered([...existing, ...extra], aroma.agent) || alreadyCovered([...existing, ...extra], line.name)) {
        continue;
      }
      extra.push(aromaNote(aroma.technique, aroma.agent, line.name));
    }
  }

  if (extra.length === 0) return recipe;
  return { ...recipe, substitutions: [...existing, ...extra] };
}
