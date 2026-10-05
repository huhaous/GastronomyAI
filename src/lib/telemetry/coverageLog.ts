/**
 * Append-only coverage log: one record per generation, recording how much of
 * the recipe the Knowledge Graph could actually price.
 *
 * The unresolved lines are the point. They are a precise, self-updating map of
 * where the graph is thin, and unlike code they cannot be reconstructed after
 * the fact — a generation that isn't logged is gone. `npm run coverage` turns
 * the records into a prioritized backlog.
 *
 * Logging is strictly best-effort: it never blocks a response, and it disables
 * itself after the first write failure so a broken sink doesn't warn on every
 * request.
 */

import { after } from "next/server";
import { selectSink, type CoverageSink } from "@/lib/telemetry/coverageSink";
import type { UnresolvedLine } from "@/lib/nutrition/foodLines";
import type { MacroConfidence, NutritionalStrategy } from "@/types/nutrition";

export interface CoverageRecord {
  ts: string;
  mode: "generate" | "elevate";
  model: string;
  strategy?: NutritionalStrategy;
  /**
   * What the diner actually typed. `dish` is what the model named the result,
   * so only this says whether someone asked for tacos and got a miss.
   */
  craving?: string;
  dish: string;
  /** Random per-browser id. Groups one person's run; identifies no one. */
  anon_id?: string;
  confidence: MacroConfidence;
  resolved_ingredients: number;
  total_ingredients: number;
  /** Per-serving kcal the graph could vouch for. */
  verified_kcal: number;
  /** Per-serving kcal finally reported to the user. */
  reported_kcal: number;
  unresolved: UnresolvedLine[];
}

let sink: CoverageSink | undefined;
let resolved = false;

function activeSink(): CoverageSink | undefined {
  if (!resolved) {
    sink = selectSink();
    resolved = true;
    if (sink) console.log(`[coverage] logging to ${sink.name}`);
  }
  return sink;
}

async function write(record: CoverageRecord): Promise<void> {
  const target = activeSink();
  if (!target) return;
  try {
    await target.write(record);
  } catch (err) {
    sink = undefined;
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(
      `[coverage] logging disabled after ${target.name} write failure: ${reason}`
    );
  }
}

/**
 * A serverless function is frozen the moment it sends its response, so a bare
 * floating promise is not slow — it is lost. The first hosted generation
 * selected the blob sink, wrote nothing, and reported no failure, because the
 * upload was still in flight when the invocation ended.
 *
 * after() holds the invocation open until the write lands. Outside a request
 * there is nothing to freeze and nothing to hold, so fall back to the floating
 * promise: a laptop's file append finishes on its own.
 */
function schedule(work: Promise<void>): void {
  try {
    after(work);
  } catch {
    void work;
  }
}

/** Fire-and-forget: the caller is a request path and must not wait on a sink. */
export function recordCoverage(record: CoverageRecord): void {
  schedule(write(record));
}

/** Tests only: forget the memoized sink so env changes take effect. */
export function resetCoverageSink(): void {
  sink = undefined;
  resolved = false;
}
