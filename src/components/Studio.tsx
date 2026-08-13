"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { PlatingCard } from "@/components/PlatingCard";
import { RecipeDetails } from "@/components/RecipeDetails";
import {
  DEFAULT_LOCAL_MODEL,
  LOCAL_MODEL_OPTIONS,
  type LocalModelId,
} from "@/lib/ai/models";
import { KITCHEN_TOOL_OPTIONS } from "@/lib/kitchenTools";
import {
  DEFAULT_NUTRITIONAL_STRATEGY,
  NUTRITIONAL_STRATEGY_OPTIONS,
} from "@/lib/nutritionStrategies";
import {
  PSMF_ACKNOWLEDGEMENT,
  PSMF_EXCLUSIONS,
  PSMF_RISKS,
  PSMF_SUMMARY,
  PSMF_TITLE,
} from "@/lib/safety";
import type { RecipePayload, SavedRecipe } from "@/lib/storage/recipeStore";
import { useSavedRecipes } from "@/lib/storage/useSavedRecipes";
import type {
  ElevatedRecipe,
  GourmetRecipe,
  KitchenTool,
  NutritionalStrategy,
  RecipeApiError,
} from "@/types/recipe";

type StudioMode = "generate" | "elevate";

/** PSMF is deliberately not offered as one of four equal choices. */
const EVERYDAY_STRATEGIES = NUTRITIONAL_STRATEGY_OPTIONS.filter(
  (opt) => !opt.restricted
);
const RESTRICTED_STRATEGY = NUTRITIONAL_STRATEGY_OPTIONS.find(
  (opt) => opt.restricted
);

type StudioResult =
  | { kind: "generate"; recipe: GourmetRecipe; model?: string }
  | { kind: "elevate"; recipe: ElevatedRecipe; model?: string };

const DEFAULT_TOOLS: KitchenTool[] = ["stovetop", "oven", "blender"];

function parseList(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function ToolChips({
  selected,
  onToggle,
}: {
  selected: KitchenTool[];
  onToggle: (tool: KitchenTool) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {KITCHEN_TOOL_OPTIONS.map(({ id, label }) => {
        const active = selected.includes(id);
        return (
          <button
            key={id}
            type="button"
            onClick={() => onToggle(id)}
            className={`border px-3 py-1.5 text-xs tracking-wide transition ${
              active
                ? "border-[var(--gold)] text-[var(--gold)]"
                : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--gold-dim)] hover:text-[var(--cream-dim)]"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <label className="mb-2 block text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
      {children}
    </label>
  );
}

const inputClass =
  "w-full border border-[var(--border)] bg-transparent px-3 py-2.5 text-sm text-[var(--cream)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--gold-dim)]";

const dateFormat = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
});

/** Recipes kept in this browser. Empty until the first save, so it hides itself. */
function KeptPlates({
  entries,
  activeId,
  onOpen,
  onRemove,
}: {
  entries: SavedRecipe[];
  activeId: string | null;
  onOpen: (entry: SavedRecipe) => void;
  onRemove: (id: string) => void;
}) {
  if (entries.length === 0) return null;

  return (
    <section className="border border-[var(--border)] px-4 py-4">
      <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
        Kept plates · {entries.length}
      </p>
      <ul className="mt-3 divide-y divide-[var(--border)]">
        {entries.map((entry) => {
          const active = entry.id === activeId;
          return (
            <li
              key={entry.id}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2"
            >
              <button
                type="button"
                onClick={() => onOpen(entry)}
                className={`text-left text-sm transition ${
                  active
                    ? "text-[var(--gold)]"
                    : "text-[var(--cream-dim)] hover:text-[var(--gold)]"
                }`}
              >
                {entry.title ?? entry.payload.recipe.name}
              </button>
              <span className="flex items-center gap-4 text-[11px] text-[var(--muted)]">
                <span>
                  {Math.round(entry.payload.recipe.macros.calories)} kcal ·{" "}
                  {dateFormat.format(new Date(entry.saved_at))}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(entry.id)}
                  aria-label={`Remove ${entry.title ?? entry.payload.recipe.name}`}
                  className="uppercase tracking-[0.14em] transition hover:text-red-300"
                >
                  Remove
                </button>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function Studio() {
  const [mode, setMode] = useState<StudioMode>("generate");
  const [modelId, setModelId] = useState<LocalModelId>(DEFAULT_LOCAL_MODEL);
  const [strategy, setStrategy] = useState<NutritionalStrategy>(
    DEFAULT_NUTRITIONAL_STRATEGY
  );
  const [psmfAcknowledged, setPsmfAcknowledged] = useState(false);
  const [psmfPanelOpen, setPsmfPanelOpen] = useState(false);
  const [result, setResult] = useState<StudioResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const { entries: keptPlates, save, remove } = useSavedRecipes();
  /** Set once the plate on screen exists in the store, so it isn't kept twice. */
  const [keptId, setKeptId] = useState<string | null>(null);

  const [calories, setCalories] = useState("450");
  const [protein, setProtein] = useState("35");
  const [carbs, setCarbs] = useState("25");
  const [fat, setFat] = useState("12");
  const [ingredients, setIngredients] = useState(
    "chicken breast, cauliflower, lemon, greek yogurt, thyme"
  );
  const [cuisine, setCuisine] = useState("");
  const [timeLimit, setTimeLimit] = useState("60");
  const [tools, setTools] = useState<KitchenTool[]>(DEFAULT_TOOLS);

  const [craving, setCraving] = useState("Fettuccine Alfredo");
  const [elevateCalories, setElevateCalories] = useState("480");
  const [elevateProtein, setElevateProtein] = useState("40");
  const [elevateTime, setElevateTime] = useState("45");
  const [elevateTools, setElevateTools] = useState<KitchenTool[]>(DEFAULT_TOOLS);

  function toggleTool(
    list: KitchenTool[],
    setter: (next: KitchenTool[]) => void,
    tool: KitchenTool
  ) {
    setter(
      list.includes(tool) ? list.filter((t) => t !== tool) : [...list, tool]
    );
  }

  async function runGenerate() {
    setError(null);
    const res = await fetch("/api/generate-recipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target_macros: {
          calories: Number(calories),
          protein_g: Number(protein),
          carbs_g: Number(carbs),
          fat_g: Number(fat),
        },
        available_ingredients: parseList(ingredients),
        kitchen_tools: tools,
        time_limit_minutes: Number(timeLimit),
        cuisine_style: cuisine.trim() || undefined,
        nutritional_strategy: strategy,
        psmf_acknowledged: psmfAcknowledged,
        model: modelId,
      }),
    });

    const data = (await res.json()) as StudioResult | RecipeApiError;
    if (!res.ok || "error" in data) {
      const err = data as RecipeApiError;
      throw new Error(err.details ?? err.error ?? "Generation failed");
    }
    setKeptId(null);
    setResult(data as StudioResult);
  }

  async function runElevate() {
    setError(null);
    const res = await fetch("/api/elevate-recipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        craving_meal: craving.trim(),
        target_macros: {
          calories: Number(elevateCalories) || undefined,
          protein_g: Number(elevateProtein) || undefined,
        },
        kitchen_tools: elevateTools,
        time_limit_minutes: Number(elevateTime) || undefined,
        nutritional_strategy: strategy,
        psmf_acknowledged: psmfAcknowledged,
        model: modelId,
      }),
    });

    const data = (await res.json()) as StudioResult | RecipeApiError;
    if (!res.ok || "error" in data) {
      const err = data as RecipeApiError;
      throw new Error(err.details ?? err.error ?? "Elevation failed");
    }
    setKeptId(null);
    setResult(data as StudioResult);
  }

  async function keepCurrent() {
    if (!result || keptId) return;
    const payload: RecipePayload =
      result.kind === "generate"
        ? { kind: "generate", recipe: result.recipe }
        : { kind: "elevate", recipe: result.recipe };
    const saved = await save(payload, { model: result.model });
    setKeptId(saved.id);
  }

  function openKept(entry: SavedRecipe) {
    setError(null);
    setResult({ ...entry.payload, model: entry.model });
    setKeptId(entry.id);
  }

  async function removeKept(id: string) {
    await remove(id);
    if (keptId === id) setKeptId(null);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        if (mode === "generate") {
          await runGenerate();
        } else {
          await runElevate();
        }
      } catch (err) {
        setResult(null);
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  const recipe = result?.recipe;
  const selectedModel = LOCAL_MODEL_OPTIONS.find((m) => m.id === modelId);

  return (
    <div className="space-y-12">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--border)] pb-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--gold)]">
            Atelier
          </p>
          <h2 className="mt-1 font-[family-name:var(--font-display)] text-3xl text-[var(--cream)]">
            Recipe Studio
          </h2>
        </div>
        <div className="flex gap-2" role="tablist" aria-label="Studio mode">
          {(
            [
              { id: "generate", label: "Generate" },
              { id: "elevate", label: "Elevate" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={mode === tab.id}
              onClick={() => setMode(tab.id)}
              className={`px-4 py-2 text-xs uppercase tracking-[0.16em] transition ${
                mode === tab.id
                  ? "border-b border-[var(--gold)] text-[var(--gold)]"
                  : "text-[var(--muted)] hover:text-[var(--cream-dim)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-8">
        <div>
          <FieldLabel>Nutritional Strategy</FieldLabel>
          <div
            className="grid gap-2 sm:grid-cols-3"
            role="radiogroup"
            aria-label="Nutritional strategy"
          >
            {EVERYDAY_STRATEGIES.map((opt) => {
              const active = strategy === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setStrategy(opt.id)}
                  className={`border px-4 py-3 text-left transition ${
                    active
                      ? "border-[var(--gold)] bg-[color-mix(in_srgb,var(--gold)_10%,transparent)]"
                      : "border-[var(--border)] hover:border-[var(--gold-dim)]"
                  }`}
                >
                  <span
                    className={`block text-xs uppercase tracking-[0.14em] ${
                      active ? "text-[var(--gold)]" : "text-[var(--cream)]"
                    }`}
                  >
                    {opt.label}
                  </span>
                  <span className="mt-1 block text-[11px] text-[var(--muted)]">
                    {opt.blurb}
                  </span>
                </button>
              );
            })}
          </div>

          {RESTRICTED_STRATEGY && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => {
                  if (psmfAcknowledged) {
                    setStrategy(RESTRICTED_STRATEGY.id);
                    return;
                  }
                  setPsmfPanelOpen((open) => !open);
                }}
                aria-expanded={psmfAcknowledged ? undefined : psmfPanelOpen}
                className={`flex w-full items-center justify-between border px-4 py-3 text-left transition ${
                  strategy === RESTRICTED_STRATEGY.id
                    ? "border-[var(--gold)] bg-[color-mix(in_srgb,var(--gold)_10%,transparent)]"
                    : "border-dashed border-[var(--border)] hover:border-[var(--gold-dim)]"
                }`}
              >
                <span>
                  <span
                    className={`block text-xs uppercase tracking-[0.14em] ${
                      strategy === RESTRICTED_STRATEGY.id
                        ? "text-[var(--gold)]"
                        : "text-[var(--cream-dim)]"
                    }`}
                  >
                    {RESTRICTED_STRATEGY.label}
                  </span>
                  <span className="mt-1 block text-[11px] text-[var(--muted)]">
                    {psmfAcknowledged
                      ? RESTRICTED_STRATEGY.blurb
                      : "Read the safety notes before using this mode"}
                  </span>
                </span>
                <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
                  {psmfAcknowledged ? "Unlocked" : "Restricted"}
                </span>
              </button>

              {!psmfAcknowledged && psmfPanelOpen && (
                <div className="mt-2 border border-[var(--border)] px-4 py-4">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--gold)]">
                    {PSMF_TITLE}
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-[var(--cream-dim)]">
                    {PSMF_SUMMARY}
                  </p>
                  <ul className="mt-3 space-y-1 text-xs text-[var(--cream-dim)]">
                    {PSMF_RISKS.map((risk) => (
                      <li key={risk}>— {risk}</li>
                    ))}
                  </ul>
                  <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
                    {PSMF_EXCLUSIONS}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setPsmfAcknowledged(true);
                        setPsmfPanelOpen(false);
                        setStrategy(RESTRICTED_STRATEGY.id);
                      }}
                      className="border border-[var(--gold)] px-4 py-2 text-[11px] uppercase tracking-[0.14em] text-[var(--gold)] transition hover:bg-[var(--gold)] hover:text-[var(--charcoal)]"
                    >
                      {PSMF_ACKNOWLEDGEMENT}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPsmfPanelOpen(false)}
                      className="border border-[var(--border)] px-4 py-2 text-[11px] uppercase tracking-[0.14em] text-[var(--cream-dim)] transition hover:border-[var(--gold-dim)]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div>
          <FieldLabel>Local model</FieldLabel>
          <div
            className="flex flex-wrap gap-2"
            role="radiogroup"
            aria-label="Local LLM model"
          >
            {LOCAL_MODEL_OPTIONS.map((opt) => {
              const active = modelId === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setModelId(opt.id)}
                  className={`min-w-[148px] border px-4 py-3 text-left transition ${
                    active
                      ? "border-[var(--gold)] bg-[color-mix(in_srgb,var(--gold)_10%,transparent)]"
                      : "border-[var(--border)] hover:border-[var(--gold-dim)]"
                  }`}
                >
                  <span
                    className={`block text-xs uppercase tracking-[0.14em] ${
                      active ? "text-[var(--gold)]" : "text-[var(--cream)]"
                    }`}
                  >
                    {opt.label}
                  </span>
                  <span className="mt-1 block text-[11px] text-[var(--muted)]">
                    {opt.blurb}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {mode === "generate" ? (
          <div className="space-y-6">
            <p className="max-w-xl text-sm text-[var(--cream-dim)]">
              Set macros, pantry, and tools — the chef-scientist composes a
              gourmet fat-loss plate within your constraints.
            </p>

            <div className="grid gap-4 sm:grid-cols-4">
              <div>
                <FieldLabel>Calories</FieldLabel>
                <input
                  className={inputClass}
                  type="number"
                  min={100}
                  max={1200}
                  value={calories}
                  onChange={(e) => setCalories(e.target.value)}
                  required
                />
              </div>
              <div>
                <FieldLabel>Protein (g)</FieldLabel>
                <input
                  className={inputClass}
                  type="number"
                  min={0}
                  value={protein}
                  onChange={(e) => setProtein(e.target.value)}
                  required
                />
              </div>
              <div>
                <FieldLabel>Carbs (g)</FieldLabel>
                <input
                  className={inputClass}
                  type="number"
                  min={0}
                  value={carbs}
                  onChange={(e) => setCarbs(e.target.value)}
                  required
                />
              </div>
              <div>
                <FieldLabel>Fat (g)</FieldLabel>
                <input
                  className={inputClass}
                  type="number"
                  min={0}
                  value={fat}
                  onChange={(e) => setFat(e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <FieldLabel>Available ingredients</FieldLabel>
              <textarea
                className={`${inputClass} min-h-[96px] resize-y`}
                value={ingredients}
                onChange={(e) => setIngredients(e.target.value)}
                placeholder="Comma or newline separated"
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel>Time limit (minutes)</FieldLabel>
                <input
                  className={inputClass}
                  type="number"
                  min={10}
                  max={240}
                  value={timeLimit}
                  onChange={(e) => setTimeLimit(e.target.value)}
                  required
                />
              </div>
              <div>
                <FieldLabel>Cuisine / style (optional)</FieldLabel>
                <input
                  className={inputClass}
                  type="text"
                  value={cuisine}
                  onChange={(e) => setCuisine(e.target.value)}
                  placeholder="e.g. Nordic, Japanese, Mediterranean"
                />
              </div>
            </div>

            <div>
              <FieldLabel>Kitchen tools</FieldLabel>
              <ToolChips
                selected={tools}
                onToggle={(t) => toggleTool(tools, setTools, t)}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <p className="max-w-xl text-sm text-[var(--cream-dim)]">
              Name a high-calorie craving. We reconstruct it with molecular
              substitution — same emotional reward, leaner physics.
            </p>

            <div>
              <FieldLabel>Craving meal</FieldLabel>
              <input
                className={inputClass}
                type="text"
                value={craving}
                onChange={(e) => setCraving(e.target.value)}
                placeholder="Cheeseburger, Fettuccine Alfredo…"
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <FieldLabel>Target calories</FieldLabel>
                <input
                  className={inputClass}
                  type="number"
                  min={100}
                  value={elevateCalories}
                  onChange={(e) => setElevateCalories(e.target.value)}
                />
              </div>
              <div>
                <FieldLabel>Min protein (g)</FieldLabel>
                <input
                  className={inputClass}
                  type="number"
                  min={0}
                  value={elevateProtein}
                  onChange={(e) => setElevateProtein(e.target.value)}
                />
              </div>
              <div>
                <FieldLabel>Time limit (minutes)</FieldLabel>
                <input
                  className={inputClass}
                  type="number"
                  min={10}
                  max={240}
                  value={elevateTime}
                  onChange={(e) => setElevateTime(e.target.value)}
                />
              </div>
            </div>

            <div>
              <FieldLabel>Kitchen tools</FieldLabel>
              <ToolChips
                selected={elevateTools}
                onToggle={(t) => toggleTool(elevateTools, setElevateTools, t)}
              />
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-4">
          <button
            type="submit"
            disabled={isPending}
            className="border border-[var(--gold)] bg-[var(--gold)] px-6 py-3 text-xs uppercase tracking-[0.18em] text-[var(--charcoal)] transition hover:bg-transparent hover:text-[var(--gold)] disabled:cursor-wait disabled:opacity-60"
          >
            {isPending
              ? "Composing…"
              : mode === "generate"
                ? "Generate Recipe"
                : "Elevate Craving"}
          </button>
          {isPending && (
            <p className="text-sm text-[var(--muted)]">
              {selectedModel?.label ?? modelId} is plating — first load of 32B
              may take 1–2 minutes.
            </p>
          )}
        </div>
      </form>

      {error && (
        <div
          role="alert"
          className="border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-200"
        >
          {error}
          {(error.includes("ECONNREFUSED") ||
            error.includes("fetch failed") ||
            error.toLowerCase().includes("ollama")) && (
            <p className="mt-2 text-xs text-red-300/80">
              Is Ollama running? Try{" "}
              <code className="text-red-100">ollama serve</code> in another
              terminal.
            </p>
          )}
        </div>
      )}

      <KeptPlates
        entries={keptPlates}
        activeId={keptId}
        onOpen={openKept}
        onRemove={removeKept}
      />

      {recipe && (
        <div className="space-y-8 animate-[fadeRise_0.6s_ease-out]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
              {result?.model ? `Composed with ${result.model}` : "Composed"}
            </p>
            <button
              type="button"
              onClick={keepCurrent}
              disabled={Boolean(keptId)}
              className="border border-[var(--border)] px-4 py-2 text-[11px] uppercase tracking-[0.14em] text-[var(--cream-dim)] transition hover:border-[var(--gold-dim)] hover:text-[var(--gold)] disabled:border-[var(--border)] disabled:text-[var(--muted)]"
            >
              {keptId ? "Kept" : "Keep this plate"}
            </button>
          </div>
          <PlatingCard recipe={recipe} />
          <RecipeDetails
            recipe={recipe}
            originalCraving={
              result?.kind === "elevate"
                ? result.recipe.original_craving
                : undefined
            }
            substitutions={
              result?.kind === "elevate"
                ? result.recipe.substitutions
                : undefined
            }
            caloriesSaved={
              result?.kind === "elevate"
                ? result.recipe.calories_saved
                : undefined
            }
          />
        </div>
      )}
    </div>
  );
}
