"use client";

import type { CulinaryPhysicsTip, GourmetRecipe } from "@/types/recipe";

interface RecipeDetailsProps {
  recipe: GourmetRecipe;
  substitutions?: CulinaryPhysicsTip[];
  originalCraving?: string;
  caloriesSaved?: number;
}

export function RecipeDetails({
  recipe,
  substitutions,
  originalCraving,
  caloriesSaved,
}: RecipeDetailsProps) {
  const fatMimicry = recipe.fat_mimicry_tech;
  const otherTips = recipe.culinary_physics_tips.filter((t) => !t.is_fat_mimicry);
  const mimicryTips = recipe.culinary_physics_tips.filter((t) => t.is_fat_mimicry);

  return (
    <div className="space-y-10 border-t border-[var(--border)] pt-10">
      {(originalCraving || substitutions?.length) && (
        <section>
          <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--gold)]">
            Elevation
          </p>
          <h3 className="mt-1 font-[family-name:var(--font-display)] text-2xl text-[var(--cream)]">
            Molecular Reconstruction
          </h3>
          {originalCraving && (
            <p className="mt-2 text-sm text-[var(--cream-dim)]">
              From craving:{" "}
              <span className="text-[var(--cream)]">{originalCraving}</span>
              {caloriesSaved != null && (
                <> · ~{caloriesSaved} kcal saved</>
              )}
            </p>
          )}
          {substitutions && substitutions.length > 0 && (
            <ul className="mt-4 space-y-3">
              {substitutions.map((tip) => (
                <li key={tip.technique} className="text-sm leading-relaxed">
                  <span className="text-[var(--gold)]">{tip.technique}</span>
                  <span className="text-[var(--muted)]"> — </span>
                  <span className="text-[var(--cream-dim)]">{tip.explanation}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section>
        <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--gold)]">
          Culinary Physics
        </p>
        <h3 className="mt-1 font-[family-name:var(--font-display)] text-2xl text-[var(--cream)]">
          Technique Notes
        </h3>

        {fatMimicry && (
          <div className="mt-5 border border-[var(--gold)]/50 bg-[color-mix(in_srgb,var(--gold)_8%,transparent)] p-5">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--gold)]">
              Fat-Mimicry Tech
            </p>
            <h4 className="mt-2 font-[family-name:var(--font-display)] text-xl text-[var(--cream)]">
              {fatMimicry.title}
            </h4>
            <p className="mt-2 text-sm text-[var(--cream-dim)]">
              <span className="text-[var(--muted)]">Replaces — </span>
              {fatMimicry.replaces}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-[var(--cream)]">
              {fatMimicry.mechanism}
            </p>
            <p className="mt-3 text-sm italic text-[var(--cream-dim)]">
              Mouthfeel: {fatMimicry.mouthfeel_result}
            </p>
            {fatMimicry.agents && fatMimicry.agents.length > 0 && (
              <p className="mt-3 text-xs tracking-wide text-[var(--muted)]">
                Agents: {fatMimicry.agents.join(" · ")}
              </p>
            )}
          </div>
        )}

        {(mimicryTips.length > 0 || otherTips.length > 0) && (
          <ul className="mt-6 space-y-4">
            {[...mimicryTips, ...otherTips].map((tip) => (
              <li key={tip.technique}>
                <p className="text-sm text-[var(--cream)]">
                  {tip.is_fat_mimicry && (
                    <span className="mr-2 text-[10px] uppercase tracking-[0.14em] text-[var(--gold)]">
                      Fat-Mimicry
                    </span>
                  )}
                  {tip.technique}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-[var(--cream-dim)]">
                  {tip.explanation}
                </p>
                {tip.agents && tip.agents.length > 0 && (
                  <p className="mt-2 text-xs tracking-wide text-[var(--muted)]">
                    Agents: {tip.agents.join(" · ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-10 sm:grid-cols-2">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--gold)]">
            Mise en Place
          </p>
          <h3 className="mt-1 font-[family-name:var(--font-display)] text-2xl text-[var(--cream)]">
            Ingredients
          </h3>
          <ul className="mt-4 space-y-2.5">
            {recipe.ingredients.map((item) => (
              <li
                key={`${item.name}-${item.quantity}`}
                className="flex justify-between gap-4 border-b border-[var(--border)] pb-2 text-sm"
              >
                <span className="text-[var(--cream)]">
                  {item.name}
                  {item.notes ? (
                    <span className="text-[var(--muted)]"> ({item.notes})</span>
                  ) : null}
                </span>
                <span className="shrink-0 text-[var(--cream-dim)]">
                  {item.quantity}
                  {item.unit ? ` ${item.unit}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--gold)]">
            Method
          </p>
          <h3 className="mt-1 font-[family-name:var(--font-display)] text-2xl text-[var(--cream)]">
            Steps
          </h3>
          <ol className="mt-4 space-y-4">
            {recipe.steps
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((step) => (
                <li key={step.order} className="text-sm leading-relaxed">
                  <p className="text-[var(--cream)]">
                    <span className="mr-2 text-[var(--gold)]">{step.order}.</span>
                    {step.instruction}
                  </p>
                  {step.tip && (
                    <p className="mt-1 pl-5 text-xs italic text-[var(--muted)]">
                      {step.tip}
                    </p>
                  )}
                </li>
              ))}
          </ol>
        </div>
      </section>
    </div>
  );
}
