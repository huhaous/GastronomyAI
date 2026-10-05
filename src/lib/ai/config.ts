import { DEFAULT_LOCAL_MODEL, LOCAL_MODEL_IDS } from "@/lib/ai/models";

/**
 * LLM provider config for GastronomyAI.
 * Default: local Ollama on the RTX 5090. Cloud OpenAI remains optional.
 */

export type LlmProvider = "local" | "openai";

export interface LlmConfig {
  provider: LlmProvider;
  /** OpenAI-compatible base URL (Ollama: http://127.0.0.1:11434/v1). */
  baseUrl: string;
  apiKey: string;
  model: string;
  /**
   * When true, use OpenAI strict json_schema response_format.
   * Ollama supports json_object reliably; json_schema varies by version/model.
   */
  useStrictJsonSchema: boolean;
}

function isLocalModelId(id: string): boolean {
  return (LOCAL_MODEL_IDS as readonly string[]).includes(id);
}

/**
 * Drop a model id that belongs to the other provider. Studio used to send
 * Qwen names on every Elevate; those must not reach OpenAI, and a gpt-* name
 * must not reach Ollama.
 */
function modelForProvider(
  provider: LlmProvider,
  override?: string
): string | undefined {
  if (!override) return undefined;
  const local = isLocalModelId(override);
  if (provider === "openai" && local) return undefined;
  if (provider === "local" && !local) return undefined;
  return override;
}

export function getLlmConfig(modelOverride?: string): LlmConfig {
  const provider = (process.env.LLM_PROVIDER ?? "local").toLowerCase() as LlmProvider;
  const override = modelForProvider(provider, modelOverride);

  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'LLM_PROVIDER=openai requires OPENAI_API_KEY. Or set LLM_PROVIDER=local for Ollama.'
      );
    }
    return {
      provider: "openai",
      baseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
      apiKey,
      model: override || process.env.OPENAI_MODEL || "gpt-4o",
      useStrictJsonSchema: true,
    };
  }

  // Local Ollama (OpenAI-compatible API). API key is ignored by Ollama but
  // required by the OpenAI SDK client constructor.
  return {
    provider: "local",
    baseUrl: process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434/v1",
    apiKey: process.env.OLLAMA_API_KEY ?? "ollama",
    model: override || process.env.OLLAMA_MODEL || DEFAULT_LOCAL_MODEL,
    useStrictJsonSchema: process.env.OLLAMA_STRICT_JSON_SCHEMA === "true",
  };
}
