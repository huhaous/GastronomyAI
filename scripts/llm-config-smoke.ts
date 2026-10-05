import { getLlmConfig } from "../src/lib/ai/config";

process.env.LLM_PROVIDER = "openai";
process.env.OPENAI_API_KEY = "sk-test";
process.env.OPENAI_MODEL = "gpt-4o";

const stripped = getLlmConfig("qwen2.5:32b");
if (stripped.model !== "gpt-4o") {
  throw new Error(`OpenAI must ignore Qwen ids, got ${stripped.model}`);
}

const explicit = getLlmConfig("gpt-4.1");
if (explicit.model !== "gpt-4.1") {
  throw new Error(`OpenAI should keep a non-local override, got ${explicit.model}`);
}

process.env.LLM_PROVIDER = "local";
process.env.OLLAMA_MODEL = "qwen2.5:32b";
const local = getLlmConfig("gpt-4o");
if (local.model !== "qwen2.5:32b") {
  throw new Error(`Ollama must ignore gpt ids, got ${local.model}`);
}

console.log("llm-config-smoke ok");
