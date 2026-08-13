"use client";

import { useRef, useState } from "react";
import { FlavorRadar } from "@/components/FlavorRadar";
import { strategyLabel } from "@/lib/nutritionStrategies";
import {
  NUTRITION_DISCLAIMER,
  NUTRITION_DISCLAIMER_SHORT,
  PSMF_RECIPE_NOTICE,
} from "@/lib/safety";
import type {
  FatLossMetrics,
  GourmetRecipe,
  MacroValidation,
  PortionAdjustment,
  StrategyValidation,
} from "@/types/recipe";

export interface PlatingCardProps {
  recipe: GourmetRecipe;
  className?: string;
}

/** Shows how much of the macro total is backed by verified nutrition data. */
function MacroConfidenceBadge({ validation }: { validation: MacroValidation }) {
  // Tolerate payloads missing these fields (e.g. a result cached from an
  // earlier schema) rather than crashing the whole card.
  const unresolved = validation.unresolved_ingredients ?? [];
  const muted = "text-[var(--cream-dim)] border-[var(--border)]";

  const copy =
    {
      verified: {
        label: "Macros verified",
        detail: "Every ingredient priced against nutrition data",
        tone: "text-[var(--gold)] border-[var(--gold-dim)]/50",
      },
      partial: {
        label: "Macros partly verified",
        detail: `${unresolved.length} ingredient(s) estimated`,
        tone: muted,
      },
      unverified: {
        label: "Macros estimated",
        detail: unresolved.length
          ? `Unpriced: ${unresolved.join(", ")}`
          : "Not backed by nutrition data",
        tone: muted,
      },
    }[validation.confidence] ?? {
      label: "Macros estimated",
      detail: "Not backed by nutrition data",
      tone: muted,
    };

  return (
    <span
      title={copy.detail}
      className={`inline-flex items-center gap-1.5 border px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] ${copy.tone}`}
    >
      {copy.label}
    </span>
  );
}

/** Surfaced only when the verified macros fall outside the strategy's ranges. */
function StrategyComplianceNote({
  validation,
}: {
  validation: StrategyValidation;
}) {
  return (
    <div className="mt-3 border border-[var(--border)] px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">
        Off-target for {strategyLabel(validation.strategy)}
      </p>
      <p className="mt-1.5 text-xs text-[var(--cream-dim)]">
        {validation.protein_percent}% protein ·{" "}
        {validation.net_carbs_percent ?? validation.carbs_percent}% net carbs ·{" "}
        {validation.fat_percent}% fat of total energy
      </p>
      <ul className="mt-2 space-y-1 text-xs text-[var(--cream-dim)]">
        {(validation.violations ?? []).map((v) => (
          <li key={v}>— {v}</li>
        ))}
      </ul>
    </div>
  );
}

/** Shown when quantities were rewritten to reach the requested target. */
function PortionAdjustmentNote({
  adjustment,
}: {
  adjustment: PortionAdjustment;
}) {
  const changes = adjustment.changes ?? [];

  return (
    <div className="mt-3 border border-[var(--border)] px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">
        Portions scaled to your target
      </p>
      <p className="mt-1.5 text-xs text-[var(--cream-dim)]">
        As written the dish came to {adjustment.before_calories} kcal per serving against a{" "}
        {adjustment.target_calories} kcal target, so quantities were adjusted.
        {adjustment.bounded &&
          " Some ingredients hit a sensible limit, so the target is approached rather than matched."}
      </p>
      {changes.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-[var(--cream-dim)]">
          {changes.map((change) => (
            <li key={change}>— {change}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Attached to PSMF recipes, including printed and forwarded copies. */
function PsmfNotice() {
  return (
    <div className="mt-3 border border-[var(--gold-dim)]/50 px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--gold)]">
        Supervised protocol
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-[var(--cream-dim)]">
        {PSMF_RECIPE_NOTICE}
      </p>
    </div>
  );
}

function FatLossMetricsStrip({ metrics }: { metrics: FatLossMetrics }) {
  const satietyDisplay = `${metrics.satiety_index.toFixed(1)}/10`;

  return (
    <div className="mt-4 border border-[var(--gold-dim)]/40 bg-[color-mix(in_srgb,var(--gold)_6%,transparent)] px-4 py-4">
      <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--gold)]">
        Fat-Loss Metrics
      </p>
      <dl className="mt-3 grid gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
            Satiety Index
          </dt>
          <dd className="mt-1 text-[var(--cream)]">
            {satietyDisplay}{" "}
            <span className="text-sm text-[var(--cream-dim)]">
              {metrics.satiety_label}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
            Thermic Effect (TEF)
          </dt>
          <dd className="mt-1 text-[var(--cream)]">
            ~{Math.round(metrics.tef_kcal)} kcal{" "}
            <span className="text-sm text-[var(--cream-dim)]">
              burned in digestion
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
            Glycemic Impact
          </dt>
          <dd className="mt-1 text-[var(--cream)]">
            {metrics.glycemic_note}
            <span className="mt-0.5 block text-xs uppercase tracking-wider text-[var(--muted)]">
              {metrics.glycemic_impact} GI
            </span>
          </dd>
        </div>
      </dl>
    </div>
  );
}

/**
 * Shareable plating card: dish title, macros, fat-loss metrics, flavor radar, plating tips.
 */
export function PlatingCard({ recipe, className = "" }: PlatingCardProps) {
  const cardRef = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const headline =
      recipe.plating.social_caption ??
      `${recipe.name} — ${recipe.macros.calories} kcal · ${recipe.macros.protein_g}g protein`;
    const caption = `${headline}\n\n${NUTRITION_DISCLAIMER_SHORT}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: recipe.name,
          text: caption,
        });
        return;
      }
      await navigator.clipboard.writeText(caption);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // User cancelled share — ignore.
    }
  }

  function handlePrint() {
    window.print();
  }

  const { macros, plating, fat_loss_metrics: metrics } = recipe;

  return (
    <article
      ref={cardRef}
      className={`relative border border-[var(--border)] bg-[var(--charcoal)] ${className}`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(ellipse at 20% 0%, color-mix(in srgb, var(--gold) 18%, transparent), transparent 55%), linear-gradient(160deg, #1a1a1a 0%, #121212 45%, #0e0e0e 100%)",
        }}
      />

      <div className="relative z-10 p-6 sm:p-8">
        <p className="text-[11px] uppercase tracking-[0.28em] text-[var(--gold)]">
          GastronomyAI · Plating Card
        </p>

        {recipe.nutritional_strategy && (
          <p className="mt-2 text-[11px] tracking-wide text-[var(--muted)]">
            Strategy · {strategyLabel(recipe.nutritional_strategy)}
          </p>
        )}

        <h2 className="mt-3 max-w-xl font-[family-name:var(--font-display)] text-3xl leading-tight text-[var(--cream)] sm:text-4xl">
          {recipe.name}
        </h2>
        <p className="mt-2 max-w-lg text-sm italic text-[var(--cream-dim)]">
          {recipe.tagline}
        </p>

        <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3 border-y border-[var(--border)] py-4 text-sm">
          <div>
            <dt className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
              Energy
            </dt>
            <dd className="mt-0.5 flex items-center gap-2 text-[var(--cream)]">
              {macros.calories}{" "}
              <span className="text-[var(--muted)]">kcal</span>
              {recipe.macro_validation && (
                <MacroConfidenceBadge validation={recipe.macro_validation} />
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
              Protein
            </dt>
            <dd className="mt-0.5 text-[var(--cream)]">{macros.protein_g}g</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
              Carbs
            </dt>
            <dd className="mt-0.5 text-[var(--cream)]">{macros.carbs_g}g</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
              Fat
            </dt>
            <dd className="mt-0.5 text-[var(--cream)]">{macros.fat_g}g</dd>
          </div>
        </dl>

        {metrics && <FatLossMetricsStrip metrics={metrics} />}

        {recipe.nutritional_strategy === "deep_cut_psmf" && <PsmfNotice />}

        {recipe.portion_adjustment && (
          <PortionAdjustmentNote adjustment={recipe.portion_adjustment} />
        )}

        {recipe.strategy_validation &&
          !recipe.strategy_validation.in_compliance && (
            <StrategyComplianceNote validation={recipe.strategy_validation} />
          )}

        <div className="mt-6">
          <FlavorRadar
            scores={recipe.flavor_radar}
            textureBalance={recipe.texture_balance}
            psychologicalRewardNote={recipe.psychological_reward_note}
          />
        </div>

        <section className="mt-6">
          <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--gold)]">
            Plating Tips
          </p>
          <h3 className="mt-1 font-[family-name:var(--font-display)] text-lg text-[var(--cream)]">
            Visual Presentation Guide
          </h3>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-[var(--cream-dim)]">
            <li>
              <span className="text-[var(--muted)]">Composition — </span>
              {plating.composition}
            </li>
            {plating.vessel && (
              <li>
                <span className="text-[var(--muted)]">Vessel — </span>
                {plating.vessel}
              </li>
            )}
            {plating.color_contrast && (
              <li>
                <span className="text-[var(--muted)]">Contrast — </span>
                {plating.color_contrast}
              </li>
            )}
            {plating.garnish && (
              <li>
                <span className="text-[var(--muted)]">Garnish — </span>
                {plating.garnish}
              </li>
            )}
          </ul>
        </section>

        <p className="mt-8 border-t border-[var(--border)] pt-4 text-[11px] leading-relaxed text-[var(--muted)]">
          {NUTRITION_DISCLAIMER}
        </p>

        <div className="mt-6 flex flex-wrap gap-3 print:hidden">
          <button
            type="button"
            onClick={handleShare}
            className="border border-[var(--gold)] bg-[var(--gold)] px-5 py-2.5 text-xs uppercase tracking-[0.16em] text-[var(--charcoal)] transition hover:bg-transparent hover:text-[var(--gold)]"
          >
            {copied ? "Copied" : "Share"}
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="border border-[var(--border)] px-5 py-2.5 text-xs uppercase tracking-[0.16em] text-[var(--cream)] transition hover:border-[var(--gold)] hover:text-[var(--gold)]"
          >
            Download / Print
          </button>
        </div>
      </div>
    </article>
  );
}
