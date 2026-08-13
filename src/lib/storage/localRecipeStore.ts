/**
 * localStorage-backed RecipeStore.
 *
 * Recipes are large — a plate with steps, tips and accounting runs several
 * kilobytes — and localStorage gives us somewhere between 5 and 10 MB with no
 * warning before it refuses a write. The collection is therefore capped and the
 * oldest entries are dropped, which is the right trade for a keepsake list:
 * losing the plate you cooked in March is survivable, failing to save the one
 * in front of you is not.
 *
 * Reads never throw. A corrupt or foreign payload is treated as an empty
 * collection rather than breaking the page.
 */

import {
  newRecipeId,
  type NewSavedRecipe,
  type RecipeStore,
  type SavedRecipe,
  type SavedRecipeMeta,
} from "./recipeStore";

const STORAGE_KEY = "gastronomy.saved-recipes";
const SCHEMA_VERSION = 1;
const MAX_ENTRIES = 60;

interface Envelope {
  version: number;
  entries: SavedRecipe[];
}

function readEnvelope(): Envelope {
  if (typeof window === "undefined") return { version: SCHEMA_VERSION, entries: [] };

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: SCHEMA_VERSION, entries: [] };

    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !Array.isArray((parsed as Envelope).entries)
    ) {
      return { version: SCHEMA_VERSION, entries: [] };
    }

    const envelope = parsed as Envelope;
    // Nothing to migrate from yet; a future version bump reads the old shape here.
    if (envelope.version !== SCHEMA_VERSION) {
      return { version: SCHEMA_VERSION, entries: [] };
    }
    return envelope;
  } catch {
    return { version: SCHEMA_VERSION, entries: [] };
  }
}

/** Writes, shedding the oldest entries if the browser refuses the payload. */
function writeEnvelope(entries: SavedRecipe[]): SavedRecipe[] {
  if (typeof window === "undefined") return entries;

  let kept = entries.slice(0, MAX_ENTRIES);
  while (kept.length > 0) {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: SCHEMA_VERSION, entries: kept })
      );
      return kept;
    } catch {
      kept = kept.slice(0, Math.floor(kept.length / 2));
    }
  }

  window.localStorage.removeItem(STORAGE_KEY);
  return [];
}

export const localRecipeStore: RecipeStore = {
  async list() {
    return readEnvelope().entries;
  },

  async save(entry: NewSavedRecipe) {
    const saved: SavedRecipe = {
      ...entry,
      id: newRecipeId(),
      saved_at: new Date().toISOString(),
      title: entry.title?.trim() || entry.payload.recipe.name,
    };
    writeEnvelope([saved, ...readEnvelope().entries]);
    return saved;
  },

  async update(id: string, changes: SavedRecipeMeta) {
    const entries = readEnvelope().entries;
    const index = entries.findIndex((e) => e.id === id);
    if (index === -1) return undefined;

    const updated = { ...entries[index], ...changes };
    entries[index] = updated;
    writeEnvelope(entries);
    return updated;
  },

  async remove(id: string) {
    writeEnvelope(readEnvelope().entries.filter((e) => e.id !== id));
  },
};
