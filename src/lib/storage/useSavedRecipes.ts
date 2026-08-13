"use client";

/**
 * React binding over a RecipeStore.
 *
 * State is held here and written through to the store, so the list stays
 * responsive even if the store later becomes a network call. The store is a
 * parameter rather than an import so swapping in a server-backed one is a
 * single change at the call site.
 */

import { useCallback, useEffect, useState } from "react";
import { localRecipeStore } from "./localRecipeStore";
import type {
  RecipePayload,
  RecipeStore,
  SavedRecipe,
  SavedRecipeMeta,
} from "./recipeStore";

export function useSavedRecipes(store: RecipeStore = localRecipeStore) {
  const [entries, setEntries] = useState<SavedRecipe[]>([]);
  /** False until the first read lands, so the UI can avoid flashing "empty". */
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    store.list().then((loaded) => {
      if (!active) return;
      setEntries(loaded);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, [store]);

  const save = useCallback(
    async (payload: RecipePayload, meta: SavedRecipeMeta = {}) => {
      const saved = await store.save({ payload, ...meta });
      setEntries(await store.list());
      return saved;
    },
    [store]
  );

  const update = useCallback(
    async (id: string, changes: SavedRecipeMeta) => {
      await store.update(id, changes);
      setEntries(await store.list());
    },
    [store]
  );

  const remove = useCallback(
    async (id: string) => {
      await store.remove(id);
      setEntries(await store.list());
    },
    [store]
  );

  return { entries, ready, save, update, remove };
}
