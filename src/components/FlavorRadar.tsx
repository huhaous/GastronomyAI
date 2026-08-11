"use client";

import type { FlavorRadarScores } from "@/types/recipe";

const AXES: { key: keyof FlavorRadarScores; label: string }[] = [
  { key: "sweet", label: "Sweet" },
  { key: "sour", label: "Sour" },
  { key: "salty", label: "Salty" },
  { key: "umami", label: "Umami" },
  { key: "aroma_complexity", label: "Aroma" },
];

/** Outer canvas — padded so labels & vertices never clip. */
const VIEW = 320;
const CENTER = VIEW / 2;
/** Radar polygon radius (leaves ~48px for labels on all sides). */
const RADIUS = 96;
const LABEL_RADIUS = RADIUS + 36;

function polar(angleRad: number, radius: number) {
  return {
    x: CENTER + radius * Math.cos(angleRad - Math.PI / 2),
    y: CENTER + radius * Math.sin(angleRad - Math.PI / 2),
  };
}

function axisAngle(index: number) {
  return (Math.PI * 2 * index) / AXES.length;
}

function polygonPoints(scores: number[], max = 10): string {
  return scores
    .map((score, i) => {
      const { x, y } = polar(axisAngle(i), (clampScore(score) / max) * RADIUS);
      return `${x},${y}`;
    })
    .join(" ");
}

function clampScore(score: number) {
  return Math.max(0, Math.min(10, score));
}

function gridRing(level: number, max = 10): string {
  const r = (level / max) * RADIUS;
  return AXES.map((_, i) => {
    const { x, y } = polar(axisAngle(i), r);
    return `${x},${y}`;
  }).join(" ");
}

/** Prefer edge-aware text anchors so labels stay inside the viewBox. */
function labelAnchor(index: number): {
  textAnchor: "start" | "middle" | "end";
  dy: number;
} {
  const angle = axisAngle(index);
  // Unit vector from center (0 = top, clockwise-ish via our polar offset)
  const ux = Math.cos(angle - Math.PI / 2);
  const uy = Math.sin(angle - Math.PI / 2);

  let textAnchor: "start" | "middle" | "end" = "middle";
  if (ux > 0.35) textAnchor = "start";
  else if (ux < -0.35) textAnchor = "end";

  // Nudge vertical labels slightly away from the polygon tips
  let dy = 0;
  if (uy > 0.55) dy = 4;
  else if (uy < -0.55) dy = -2;

  return { textAnchor, dy };
}

export interface FlavorRadarProps {
  scores: FlavorRadarScores;
  textureBalance?: string[];
  psychologicalRewardNote?: string;
  className?: string;
}

/**
 * Five-dimension sensory radar: Sweet, Sour, Salty, Umami, Aroma.
 * Michelin Dark — amber glow fill + bright gold wireframe.
 */
export function FlavorRadar({
  scores,
  textureBalance = [],
  psychologicalRewardNote,
  className = "",
}: FlavorRadarProps) {
  const values = AXES.map(({ key }) => scores[key]);
  const uid = "flavor-radar";

  return (
    <section
      className={`border border-[var(--border)] bg-[var(--surface)] p-6 ${className}`}
      aria-label="Flavor profile radar"
    >
      <header className="mb-5 text-center sm:text-left">
        <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--gold)]">
          Sensory Profile
        </p>
        <h3 className="mt-1 font-[family-name:var(--font-display)] text-xl text-[var(--cream)]">
          Flavor Radar
        </h3>
      </header>

      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
        <div className="flex w-full max-w-[320px] shrink-0 justify-center sm:w-auto">
          <svg
            width="100%"
            height="auto"
            viewBox={`0 0 ${VIEW} ${VIEW}`}
            className="aspect-square max-w-[320px] overflow-visible"
            role="img"
            aria-label={`Sweet ${scores.sweet}, Sour ${scores.sour}, Salty ${scores.salty}, Umami ${scores.umami}, Aroma ${scores.aroma_complexity}`}
          >
            <defs>
              <radialGradient id={`${uid}-fill`} cx="50%" cy="50%" r="65%">
                <stop offset="0%" stopColor="#c4a574" stopOpacity="0.42" />
                <stop offset="55%" stopColor="#a8894f" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#c4a574" stopOpacity="0.04" />
              </radialGradient>
              <filter
                id={`${uid}-glow`}
                x="-40%"
                y="-40%"
                width="180%"
                height="180%"
              >
                <feGaussianBlur stdDeviation="3.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Soft concentric rings — faint gold wireframe, not gray blocks */}
            {[2, 4, 6, 8, 10].map((level) => (
              <polygon
                key={level}
                points={gridRing(level)}
                fill="none"
                stroke="rgba(196, 165, 116, 0.18)"
                strokeWidth={level === 10 ? 1.25 : 0.9}
              />
            ))}

            {/* Axis spokes */}
            {AXES.map((_, i) => {
              const { x, y } = polar(axisAngle(i), RADIUS);
              return (
                <line
                  key={`spoke-${i}`}
                  x1={CENTER}
                  y1={CENTER}
                  x2={x}
                  y2={y}
                  stroke="rgba(196, 165, 116, 0.28)"
                  strokeWidth={1}
                />
              );
            })}

            {/* Data polygon — amber glow + bright gold border */}
            <polygon
              points={polygonPoints(values)}
              fill={`url(#${uid}-fill)`}
              stroke="#e0c48a"
              strokeWidth={1.75}
              strokeLinejoin="round"
              filter={`url(#${uid}-glow)`}
            />

            {/* Vertex dots */}
            {values.map((score, i) => {
              const { x, y } = polar(
                axisAngle(i),
                (clampScore(score) / 10) * RADIUS
              );
              return (
                <circle
                  key={`dot-${i}`}
                  cx={x}
                  cy={y}
                  r={2.75}
                  fill="#f5f5f0"
                  stroke="#c4a574"
                  strokeWidth={1}
                />
              );
            })}

            {/* Axis labels — monochrome cream, edge-aware anchors */}
            {AXES.map(({ label }, i) => {
              const { x, y } = polar(axisAngle(i), LABEL_RADIUS);
              const { textAnchor, dy } = labelAnchor(i);
              return (
                <text
                  key={label}
                  x={x}
                  y={y + dy}
                  textAnchor={textAnchor}
                  dominantBaseline="middle"
                  fill="#c8c8be"
                  fontSize="12"
                  letterSpacing="0.12em"
                  style={{ textTransform: "uppercase" }}
                >
                  {label}
                </text>
              );
            })}
          </svg>
        </div>

        <div className="w-full flex-1 space-y-4 sm:max-w-none">
          {textureBalance.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
                Texture Balance
              </p>
              <div className="flex flex-wrap gap-2">
                {textureBalance.map((badge) => (
                  <span
                    key={badge}
                    className="border border-[var(--gold-dim)] px-3 py-1 text-xs tracking-wide text-[var(--cream)]"
                  >
                    {badge}
                  </span>
                ))}
              </div>
            </div>
          )}

          {psychologicalRewardNote && (
            <div>
              <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
                Psychological Reward
              </p>
              <p className="text-sm leading-relaxed text-[var(--cream-dim)]">
                {psychologicalRewardNote}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
