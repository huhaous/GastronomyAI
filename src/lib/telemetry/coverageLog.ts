/**
 * Append-only coverage log: one JSONL record per generation, recording how much
 * of the recipe the Knowledge Graph could actually price.
 *
 * The unresolved lines are the point. They are a precise, self-updating map of
 * where the graph is thin, and unlike code they cannot be reconstructed after
 * the fact — a generation that isn't logged is gone. `npm run coverage` turns
 * the file into a prioritized backlog.
 *
 * Logging is strictly best-effort: it never blocks a response, and it disables
 * itself after the first write failure so a read-only filesystem doesn't cause
 * a warning on every request.
 */

import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { UnresolvedLine } from "@/lib/nutrition/foodLines";
import type { MacroConfidence, NutritionalStrategy } from "@/types/nutrition";

const LOG_PATH =
  process.env.COVERAGE_LOG_PATH ?? path.join(process.cwd(), "var", "coverage.jsonl");

export interface CoverageRecord {
  ts: string;
  mode: "generate" | "elevate";
  model: string;
  strategy?: NutritionalStrategy;
  dish: string;
  confidence: MacroConfidence;
  resolved_ingredients: number;
  total_ingredients: number;
  /** Per-serving kcal the graph could vouch for. */
  verified_kcal: number;
  /** Per-serving kcal finally reported to the user. */
  reported_kcal: number;
  unresolved: UnresolvedLine[];
}

let enabled = process.env.COVERAGE_LOG !== "off";

async function append(record: CoverageRecord): Promise<void> {
  try {
    await mkdir(path.dirname(LOG_PATH), { recursive: true });
    await appendFile(LOG_PATH, `${JSON.stringify(record)}\n`, "utf8");
  } catch (err) {
    enabled = false;
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`[coverage] logging disabled after write failure: ${reason}`);
  }
}

/** Fire-and-forget: the caller is a request path and must not wait on disk. */
export function recordCoverage(record: CoverageRecord): void {
  if (!enabled) return;
  void append(record);
}
