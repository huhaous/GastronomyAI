#!/usr/bin/env node
/**
 * Pull production coverage records out of the Blob store into one local JSONL
 * file, which is the shape `npm run coverage` already knows how to read.
 *
 * Blob has no append, so the hosted app writes one object per generation and
 * this is where they get stitched back into a log. Reads are authenticated:
 * the store is private because the records carry the craving the diner typed.
 *
 * Usage:
 *   npm run coverage:pull                 all records
 *   npm run coverage:pull -- 2026-10      records whose day-prefix matches
 *
 * Then: npm run coverage -- var/coverage-prod.jsonl
 */

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { get, list } from "@vercel/blob";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = resolve(ROOT, "var", "coverage-prod.jsonl");

function tokenFromEnvLocal() {
  try {
    const raw = readFileSync(resolve(ROOT, ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      if (trimmed.slice(0, eq).trim() !== "BLOB_READ_WRITE_TOKEN") continue;
      return trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* no .env.local is fine if the var is already exported */
  }
  return undefined;
}

const token = process.env.BLOB_READ_WRITE_TOKEN || tokenFromEnvLocal();
if (!token) {
  console.error(
    "No BLOB_READ_WRITE_TOKEN. Add it to .env.local (Vercel → Storage → your Blob store → tokens)."
  );
  process.exit(1);
}

const since = process.argv[2];
const prefix = since ? `coverage/${since}` : "coverage/";

/** get() hands back a stream; normalize the shapes it can arrive in. */
async function readBlob(pathname) {
  const found = await get(pathname, { access: "private", token });
  if (!found) return undefined;
  if (typeof found.text === "function") return found.text();
  const body = found.stream ?? found.body ?? found;
  return new Response(body).text();
}

const pathnames = [];
let cursor;
do {
  const page = await list({ token, prefix, cursor, limit: 1000 });
  for (const blob of page.blobs) pathnames.push(blob.pathname);
  cursor = page.hasMore ? page.cursor : undefined;
} while (cursor);

if (pathnames.length === 0) {
  console.error(`No coverage records under "${prefix}".`);
  process.exit(1);
}

process.stdout.write(`Fetching ${pathnames.length} record(s)…`);

const records = [];
let unreadable = 0;
// Bounded concurrency: one object per generation means this is N round trips,
// and the store rate-limits well before the laptop runs out of sockets.
const queue = [...pathnames];
await Promise.all(
  Array.from({ length: 12 }, async () => {
    while (queue.length > 0) {
      const pathname = queue.pop();
      try {
        const text = await readBlob(pathname);
        if (text) records.push(JSON.parse(text));
      } catch {
        unreadable += 1;
      }
    }
  })
);
process.stdout.write(" done\n");

records.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, records.map((r) => `${JSON.stringify(r)}\n`).join(""), "utf8");

const people = new Set(records.map((r) => r.anon_id).filter(Boolean));
console.log(`\n${records.length} record(s) → ${OUT}`);
if (unreadable > 0) console.log(`  ${unreadable} unreadable, skipped`);
if (people.size > 0) console.log(`  ${people.size} distinct browser(s)`);
if (records.length > 0) {
  console.log(`  ${records[0].ts} → ${records[records.length - 1].ts}`);
}
console.log(`\nNext: npm run coverage -- ${OUT}\n`);
