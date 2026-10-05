#!/usr/bin/env node
/**
 * Authenticated Path A deploy. Reads .env.local; never prints secret values.
 */
import { spawn } from "node:child_process";
import { readFileSync, renameSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const RUNTIME_ENV = [
  "LLM_PROVIDER",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "SITE_PASSWORD",
];
// Connecting a Blob store to the project already injects this. Pushing it from
// .env.local only matters for a store created outside the project.
const OPTIONAL_ENV = ["BLOB_READ_WRITE_TOKEN"];
const SENSITIVE = new Set([
  "OPENAI_API_KEY",
  "SITE_PASSWORD",
  "BLOB_READ_WRITE_TOKEN",
]);

function parseEnv(raw) {
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const file = parseEnv(readFileSync(resolve(ROOT, ".env.local"), "utf8"));
const missing = ["VERCEL_TOKEN", ...RUNTIME_ENV].filter((key) => !file[key]);
if (missing.length) {
  console.error(`Missing in .env.local: ${missing.join(", ")}`);
  process.exit(1);
}
if (file.LLM_PROVIDER !== "openai") {
  console.error(`LLM_PROVIDER must be openai, got "${file.LLM_PROVIDER}"`);
  process.exit(1);
}

const childEnv = { ...process.env, VERCEL_TOKEN: file.VERCEL_TOKEN };

function run(args, input) {
  return new Promise((resolveExit, reject) => {
    const child = spawn("npx", ["--yes", ...args], {
      cwd: ROOT,
      stdio: input != null ? ["pipe", "inherit", "inherit"] : "inherit",
      env: childEnv,
    });
    if (input != null) {
      child.stdin.write(input);
      child.stdin.end();
    }
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolveExit();
      else reject(new Error(`npx vercel ${args[1] ?? args[0]} failed (${code})`));
    });
  });
}

const envLocal = resolve(ROOT, ".env.local");
const envHidden = "/tmp/gastronomy-env.local.deploy-hide";

console.log("Checking Vercel auth…");
await run(["vercel", "whoami"]);

console.log("Creating project gastronomy-ai if needed…");
try {
  await run(["vercel", "project", "add", "gastronomy-ai"]);
} catch {
  console.log("Project may already exist; linking…");
}

console.log("Linking project…");
await run(["vercel", "link", "--yes", "--project", "gastronomy-ai"]);

console.log("Writing production environment (values not printed)…");
for (const key of [...RUNTIME_ENV, ...OPTIONAL_ENV.filter((k) => file[k])]) {
  const args = [
    "vercel",
    "env",
    "add",
    key,
    "production,preview",
    "--yes",
    "--force",
  ];
  if (SENSITIVE.has(key)) args.push("--sensitive");
  await run(args, file[key]);
}

console.log("Deploying production…");
try {
  try {
    renameSync(envLocal, envHidden);
  } catch {
    /* already hidden */
  }
  rmSync(resolve(ROOT, ".next"), { recursive: true, force: true });
  await run(["vercel", "deploy", "--yes", "--prod"]);
} finally {
  try {
    renameSync(envHidden, envLocal);
  } catch {
    /* restore */
  }
}
