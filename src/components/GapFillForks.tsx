"use client";

import type { GourmetRecipe } from "@/types/recipe";

export function potQuantitiesNote(servings: number): string | null {
  if (servings <= 1) return null;
  return `Every quantity in the list and method is for the whole pot (${servings} servings). Macros on the card are per serving.`;
}

/** The pre-swap plate, as it was actually written — not reconstructed copy. */
export function GapFillForks({
  recipe,
  className = "mt-6 border border-[var(--border)] px-4 py-3",
}: {
  recipe: GourmetRecipe;
  className?: string;
}) {
  const alternate = recipe.method_alternate;
  if (!alternate) return null;

  return (
    <div className={className}>
      <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">
        Alternate plate
      </p>
      <p className="mt-1 text-sm text-[var(--cream)]">{alternate.title}</p>
      <p className="mt-1 text-xs text-[var(--muted)]">{alternate.note}</p>
      <ul className="mt-3 space-y-1.5 text-xs text-[var(--cream-dim)]">
        {alternate.ingredients.map((item) => (
          <li
            key={`${item.name}-${item.quantity}`}
            className="flex justify-between gap-4"
          >
            <span>{item.name}</span>
            <span className="shrink-0">
              {item.quantity}
              {item.unit ? ` ${item.unit}` : ""}
            </span>
          </li>
        ))}
      </ul>
      <ol className="mt-4 space-y-2 text-xs leading-relaxed text-[var(--cream-dim)]">
        {alternate.steps
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((step) => (
            <li key={step.order}>
              <span className="mr-1.5 text-[var(--gold)]">{step.order}.</span>
              {step.instruction}
            </li>
          ))}
      </ol>
    </div>
  );
}
