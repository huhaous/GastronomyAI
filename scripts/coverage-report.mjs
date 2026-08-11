#!/usr/bin/env node
/**
 * Summarize var/coverage.jsonl into a graph-coverage backlog.
 *
 * Usage: npm run coverage [-- path/to/coverage.jsonl]
 */

import { createReadStream, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";

const logPath =
  process.argv[2] ??
  process.env.COVERAGE_LOG_PATH ??
  path.join(process.cwd(), "var", "coverage.jsonl");

if (!existsSync(logPath)) {
  console.error(`No coverage log at ${logPath}. Generate a recipe first.`);
  process.exit(1);
}

const REASON_LABEL = {
  no_match: "not in graph",
  unparsed_quantity: "bad quantity",
  unknown_unit: "unknown unit",
};

const misses = new Map();
const confidence = { verified: 0, partial: 0, unverified: 0 };
let generations = 0;
let malformed = 0;
let unresolvedLines = 0;
let totalLines = 0;

const reader = createInterface({
  input: createReadStream(logPath),
  crlfDelay: Infinity,
});

for await (const line of reader) {
  if (!line.trim()) continue;

  let record;
  try {
    record = JSON.parse(line);
  } catch {
    malformed += 1;
    continue;
  }

  generations += 1;
  confidence[record.confidence] = (confidence[record.confidence] ?? 0) + 1;
  totalLines += record.total_ingredients ?? 0;
  unresolvedLines += record.unresolved?.length ?? 0;

  for (const item of record.unresolved ?? []) {
    const key = `${item.name.trim().toLowerCase()}\u0000${item.reason}`;
    const entry = misses.get(key) ?? {
      name: item.name.trim(),
      reason: item.reason,
      count: 0,
      samples: new Set(),
    };
    entry.count += 1;
    if (entry.samples.size < 3) {
      entry.samples.add([item.quantity, item.unit].filter(Boolean).join(" ").trim());
    }
    misses.set(key, entry);
  }
}

if (generations === 0) {
  console.error(`${logPath} has no usable records.`);
  process.exit(1);
}

const pct = (n, d) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "—");

console.log(`\nCoverage over ${generations} generation(s) — ${logPath}\n`);
console.log(`  fully verified   ${confidence.verified} (${pct(confidence.verified, generations)})`);
console.log(`  partial          ${confidence.partial} (${pct(confidence.partial, generations)})`);
console.log(`  unverified       ${confidence.unverified} (${pct(confidence.unverified, generations)})`);
console.log(
  `  ingredient lines ${totalLines - unresolvedLines}/${totalLines} priced (${pct(
    totalLines - unresolvedLines,
    totalLines
  )})`
);
if (malformed > 0) console.log(`  skipped ${malformed} malformed line(s)`);

if (misses.size === 0) {
  console.log("\nNothing unresolved. The graph covered every ingredient.\n");
  process.exit(0);
}

const ranked = [...misses.values()].sort((a, b) => b.count - a.count);
const nameWidth = Math.min(34, Math.max(...ranked.map((m) => m.name.length)));

console.log(`\nBacklog — ${ranked.length} distinct misses, most frequent first:\n`);
for (const miss of ranked.slice(0, 40)) {
  const name = miss.name.padEnd(nameWidth).slice(0, nameWidth);
  const hits = String(miss.count).padStart(3);
  const label = (REASON_LABEL[miss.reason] ?? miss.reason).padEnd(13);
  const samples = [...miss.samples].filter(Boolean).join(", ");
  console.log(`  ${hits}x  ${name}  ${label}${samples ? `e.g. ${samples}` : ""}`);
}
if (ranked.length > 40) console.log(`  … and ${ranked.length - 40} more`);
console.log("");
