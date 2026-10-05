/**
 * The hosted app is the only place the coverage log matters and the only place
 * it cannot be checked by hand, so pin the two things that silently lose a
 * seed user's generation: picking the wrong sink, and dropping the fields that
 * say who asked for what.
 */

import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { readAnonId, isAnonId, newAnonId, ANON_COOKIE } from "../src/lib/telemetry/anonId";
import { fileSink, selectSink } from "../src/lib/telemetry/coverageSink";
import type { CoverageRecord } from "../src/lib/telemetry/coverageLog";

function assert(ok: boolean, message: string): void {
  if (!ok) throw new Error(message);
}

const ENV_KEYS = [
  "COVERAGE_LOG",
  "COVERAGE_LOG_PATH",
  "BLOB_READ_WRITE_TOKEN",
  "BLOB_STORE_ID",
  "NODE_ENV",
] as const;

// NODE_ENV is typed read-only; the whole point here is to stand where a
// production deploy stands, so go through the bag rather than the property.
const env = process.env as Record<string, string | undefined>;

function withEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string>>, run: () => void) {
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, env[k]]));
  for (const key of ENV_KEYS) delete env[key];
  for (const [key, value] of Object.entries(values)) env[key] = value;
  try {
    run();
  } finally {
    for (const key of ENV_KEYS) {
      const prior = saved[key];
      if (prior === undefined) delete env[key];
      else env[key] = prior;
    }
  }
}

// --- sink selection -------------------------------------------------------

withEnv({ COVERAGE_LOG: "off", BLOB_READ_WRITE_TOKEN: "tok" }, () => {
  assert(selectSink() === undefined, "COVERAGE_LOG=off must beat a configured store");
});

withEnv({ COVERAGE_LOG_PATH: "/tmp/explicit.jsonl", BLOB_READ_WRITE_TOKEN: "tok" }, () => {
  assert(
    selectSink()?.name === "file(/tmp/explicit.jsonl)",
    "an explicit path must beat a configured store"
  );
});

withEnv({ NODE_ENV: "production", BLOB_READ_WRITE_TOKEN: "tok" }, () => {
  assert(selectSink()?.name === "vercel-blob", "a configured store wins in production");
});

withEnv({ NODE_ENV: "production", BLOB_STORE_ID: "store_x" }, () => {
  assert(selectSink()?.name === "vercel-blob", "OIDC stores set BLOB_STORE_ID, not a token");
});

// The regression that motivated all of this: production used to pick the file
// sink, fail its first append on a read-only disk, and go quiet forever.
withEnv({ NODE_ENV: "production" }, () => {
  const picked = selectSink();
  assert(
    picked?.name === "console",
    `production without a store must not pick a file sink, got ${picked?.name}`
  );
});

withEnv({ NODE_ENV: "development" }, () => {
  assert(
    selectSink()?.name.startsWith("file(") === true,
    "a laptop still logs to the file npm run coverage reads"
  );
});

// --- anonymous id ---------------------------------------------------------

const id = newAnonId();
assert(isAnonId(id), `generated id must satisfy its own shape check, got ${id}`);
assert(
  readAnonId(new Headers({ cookie: `${ANON_COOKIE}=${id}` })) === id,
  "a well-formed cookie must round-trip"
);
assert(
  readAnonId(new Headers({ cookie: `other=1; ${ANON_COOKIE}=${id}; third=3` })) === id,
  "the id must survive neighbouring cookies"
);
assert(
  readAnonId(new Headers({ cookie: `${ANON_COOKIE}=../../etc/passwd` })) === undefined,
  "a hand-set cookie must not reach the log"
);
assert(readAnonId(new Headers()) === undefined, "no cookie header is not an error");
assert(
  newAnonId() !== newAnonId(),
  "two browsers must not collide into one stream"
);

// --- record round-trip ----------------------------------------------------

const dir = mkdtempSync(path.join(tmpdir(), "coverage-smoke-"));
const logPath = path.join(dir, "coverage.jsonl");

const record: CoverageRecord = {
  ts: "2026-10-05T19:30:00.000Z",
  mode: "elevate",
  model: "gpt-5.5",
  strategy: "post_workout_high_protein",
  craving: "tacos",
  dish: "Spiced Beef Plate",
  anon_id: id,
  confidence: "partial",
  resolved_ingredients: 7,
  total_ingredients: 9,
  verified_kcal: 430,
  reported_kcal: 480,
  unresolved: [{ name: "corn tortilla", quantity: "2", unit: "piece", reason: "no_match" }],
};

async function main(): Promise<void> {
  await fileSink(logPath).write(record);
  const written = JSON.parse(readFileSync(logPath, "utf8").trim());

  assert(written.craving === "tacos", "the craving is the field that names an engine gap");
  assert(written.anon_id === id, "without anon_id two seed users are one stream");
  assert(
    written.unresolved[0].name === "corn tortilla",
    "the unresolved line is the backlog and must survive the sink"
  );

  console.log("coverage-log-smoke ok");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
