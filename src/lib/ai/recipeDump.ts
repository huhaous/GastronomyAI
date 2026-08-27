/**
 * Last generated plate as JSON + Markdown at the repo root so an agent can
 * read the card without OCR on a PDF screenshot.
 */

import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { GourmetRecipe } from "@/types/recipe";

function cravingOf(recipe: GourmetRecipe): string | undefined {
  if ("original_craving" in recipe) {
    const value = (recipe as { original_craving?: string }).original_craving;
    if (value?.trim()) return value.trim();
  }
  return undefined;
}

function toMarkdown(recipe: GourmetRecipe, context: { mode: string; craving?: string }): string {
  const craving = context.craving || cravingOf(recipe);
  const lines: string[] = [];
  lines.push(`# ${recipe.name}`);
  if (recipe.tagline) lines.push(`_${recipe.tagline}_`);
  lines.push("");
  lines.push(`- Mode: ${context.mode}`);
  if (craving) lines.push(`- Craving: ${craving}`);
  lines.push(`- Servings: ${recipe.servings}`);
  lines.push(
    `- Time: ${recipe.total_time_minutes} min (${recipe.active_time_minutes} active)`
  );
  lines.push(
    `- Macros: ${recipe.macros.calories} kcal · P${recipe.macros.protein_g} C${recipe.macros.carbs_g} F${recipe.macros.fat_g}`
  );
  if (recipe.portion_adjustment) {
    const adj = recipe.portion_adjustment;
    lines.push(
      `- Portion adjust: ${adj.before_calories} → ${adj.after_calories} kcal (target ${adj.target_calories})`
    );
    for (const change of adj.changes) {
      lines.push(`  - ${change}`);
    }
  }
  if (recipe.gap_fill_applied) {
    const fill = recipe.gap_fill_applied;
    lines.push(
      `- Gap fill: ${fill.kind} ${fill.grams_in_recipe}g ${fill.ingredient}` +
        (fill.replaces ? ` (for ${fill.replaces})` : "")
    );
  }
  lines.push("");
  lines.push("## Ingredients");
  for (const item of recipe.ingredients) {
    const notes = item.notes ? ` — ${item.notes}` : "";
    lines.push(`- ${item.quantity}${item.unit} ${item.name}${notes}`);
  }
  lines.push("");
  lines.push("## Method");
  const steps = recipe.steps.slice().sort((a, b) => a.order - b.order);
  for (const step of steps) {
    lines.push(`${step.order}. ${step.instruction}`);
  }
  if (recipe.method_alternate) {
    lines.push("");
    lines.push(`## Alternate: ${recipe.method_alternate.title}`);
    if (recipe.method_alternate.note) lines.push(recipe.method_alternate.note);
    for (const item of recipe.method_alternate.ingredients) {
      lines.push(`- ${item.quantity}${item.unit} ${item.name}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

/** Keep last-recipe3 ← last-recipe2 ← last-recipe1 ← last-recipe. */
function rotateRecipeDump(dir: string, stem: string): void {
  for (const ext of [".md", ".json"] as const) {
    const current = join(dir, `${stem}${ext}`);
    const first = join(dir, `${stem}1${ext}`);
    const second = join(dir, `${stem}2${ext}`);
    const third = join(dir, `${stem}3${ext}`);
    if (existsSync(second)) copyFileSync(second, third);
    if (existsSync(first)) copyFileSync(first, second);
    if (existsSync(current)) copyFileSync(current, first);
  }
}

export function dumpLastRecipe(
  recipe: GourmetRecipe,
  context: { mode: string; craving?: string }
): void {
  if (typeof window !== "undefined") return;
  if (process.env.SKIP_RECIPE_DUMP === "1") return;

  const payload = {
    dumped_at: new Date().toISOString(),
    mode: context.mode,
    craving: context.craving || cravingOf(recipe) || null,
    recipe,
  };
  const json = `${JSON.stringify(payload, null, 2)}\n`;
  const markdown = toMarkdown(recipe, context);
  const root = process.cwd();

  try {
    rotateRecipeDump(root, "last-recipe");
    writeFileSync(join(root, "last-recipe.json"), json, "utf8");
    writeFileSync(join(root, "last-recipe.md"), markdown, "utf8");
    mkdirSync(join(root, "var"), { recursive: true });
    rotateRecipeDump(join(root, "var"), "last-recipe");
    writeFileSync(join(root, "var", "last-recipe.json"), json, "utf8");
    writeFileSync(join(root, "var", "last-recipe.md"), markdown, "utf8");
  } catch (err) {
    console.warn("recipe dump failed", err);
  }
}
