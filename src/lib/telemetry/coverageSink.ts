/**
 * Where a coverage record goes once the request is done with it.
 *
 * On a laptop the record appends to a file and `npm run coverage` reads it
 * back. The hosted app has no writable disk, so that same append throws on the
 * first generation, the logger switches itself off, and every plate a seed
 * user makes after that is gone with no warning on the card. Handing someone a
 * URL is therefore gated on having a sink that outlives the invocation.
 *
 * Each sink is best-effort and must never throw into the request path; the
 * caller treats a rejected write as "stop logging" rather than "fail the
 * generation", because a lost record is cheaper than a lost dinner.
 */

import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { CoverageRecord } from "@/lib/telemetry/coverageLog";

export interface CoverageSink {
  /** Shown once at startup so it is obvious which sink is live. */
  readonly name: string;
  write(record: CoverageRecord): Promise<void>;
}

export function defaultLogPath(): string {
  return (
    process.env.COVERAGE_LOG_PATH ?? path.join(process.cwd(), "var", "coverage.jsonl")
  );
}

/** JSONL on local disk. The format `npm run coverage` parses. */
export function fileSink(logPath = defaultLogPath()): CoverageSink {
  return {
    name: `file(${logPath})`,
    async write(record) {
      await mkdir(path.dirname(logPath), { recursive: true });
      await appendFile(logPath, `${JSON.stringify(record)}\n`, "utf8");
    },
  };
}

/**
 * One private blob per generation.
 *
 * Blob has no append, so a record is an object rather than a line. At seed-user
 * volume that trade is free, and the date prefix keeps `coverage-pull` from
 * walking the whole store to fetch a single day.
 *
 * The store must be private: these records carry the craving the diner typed.
 */
export function blobSink(token?: string): CoverageSink {
  return {
    name: "vercel-blob",
    async write(record) {
      const { put } = await import("@vercel/blob");
      const day = record.ts.slice(0, 10);
      const stamp = record.ts.replace(/[:.]/g, "-");
      await put(`coverage/${day}/${stamp}.json`, JSON.stringify(record), {
        access: "private",
        addRandomSuffix: true,
        contentType: "application/json",
        ...(token ? { token } : {}),
      });
    },
  };
}

/**
 * Last resort for a hosted app with no store configured. Vercel's log
 * retention is short and this is not queryable, but being able to grep a
 * deployment's logs beats the silence of a failed file write.
 */
export function consoleSink(): CoverageSink {
  return {
    name: "console",
    async write(record) {
      console.log(`[coverage] ${JSON.stringify(record)}`);
    },
  };
}

function blobIsConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

/**
 * Precedence, most explicit first:
 *
 *   COVERAGE_LOG=off      nothing is recorded
 *   COVERAGE_LOG_PATH     a file, wherever it points, on any host
 *   blob credentials      the durable store
 *   production            console, so a misconfigured deploy is still visible
 *   otherwise             the local file
 */
export function selectSink(): CoverageSink | undefined {
  if (process.env.COVERAGE_LOG === "off") return undefined;
  if (process.env.COVERAGE_LOG_PATH) return fileSink(process.env.COVERAGE_LOG_PATH);
  if (blobIsConfigured()) return blobSink(process.env.BLOB_READ_WRITE_TOKEN);
  if (process.env.NODE_ENV === "production") return consoleSink();
  return fileSink();
}
