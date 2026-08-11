import { DEFAULT_LOCAL_MODEL } from "@/lib/ai/models";

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

export function getLlmConfig(modelOverride?: string): LlmConfig {
  const provider = (process.env.LLM_PROVIDER ?? "local").toLowerCase() as LlmProvider;

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
      model: modelOverride || process.env.OPENAI_MODEL || "gpt-4o",
      useStrictJsonSchema: true,
    };
  }

  // Local Ollama (OpenAI-compatible API). API key is ignored by Ollama but
  // required by the OpenAI SDK client constructor.
  return {
    provider: "local",
    baseUrl: process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434/v1",
    apiKey: process.env.OLLAMA_API_KEY ?? "ollama",
    model: modelOverride || process.env.OLLAMA_MODEL || DEFAULT_LOCAL_MODEL,
    useStrictJsonSchema: process.env.OLLAMA_STRICT_JSON_SCHEMA === "true",
  };
}
