/**
 * Storage contract for kept recipes.
 *
 * The browser is where recipes live today, but the interesting user — a coach
 * keeping a plate for a named client — needs them on a server. So the contract
 * is written for the harder case: every method is async, ids are opaque, and
 * nothing assumes the whole collection fits in memory at write time. A Supabase
 * adapter should be a new file rather than a rewrite of the callers.
 */

import type { ElevatedRecipe, GourmetRecipe } from "@/types/recipe";

/** A recipe as it was produced, plus how it came to exist. */
export type RecipePayload =
  | { kind: "generate"; recipe: GourmetRecipe }
  | { kind: "elevate"; recipe: ElevatedRecipe };

/** What the user asked for. Kept so a plate can be regenerated or explained. */
export interface SavedRecipeMeta {
  /** Model that composed it, e.g. qwen2.5:14b. */
  model?: string;
  /** User-supplied name for the plate; defaults to the dish name. */
  title?: string;
  /** Who this plate is for — a client name, when a coach is using Studio. */
  client?: string;
  /** Free-text note — who it's for, how it went. */
  note?: string;
}

export interface SavedRecipe extends SavedRecipeMeta {
  id: string;
  /** ISO timestamp of when it was kept. */
  saved_at: string;
  payload: RecipePayload;
}

/** Everything needed to keep a recipe, minus the fields the store assigns. */
export type NewSavedRecipe = SavedRecipeMeta & { payload: RecipePayload };

export interface RecipeStore {
  /** Most recently saved first. */
  list(): Promise<SavedRecipe[]>;
  save(entry: NewSavedRecipe): Promise<SavedRecipe>;
  /** Partial edit of user-owned fields; returns undefined if the id is gone. */
  update(
    id: string,
    changes: SavedRecipeMeta
  ): Promise<SavedRecipe | undefined>;
  remove(id: string): Promise<void>;
}

export function newRecipeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
