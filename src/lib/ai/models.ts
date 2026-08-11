/** Allowed local Ollama models for GastronomyAI. */

export const LOCAL_MODEL_OPTIONS = [
  {
    id: "qwen2.5:32b",
    label: "Qwen2.5 32B",
    blurb: "Best quality · macros + cuisine",
  },
  {
    id: "qwen2.5:14b",
    label: "Qwen2.5 14B",
    blurb: "Faster · good for quick drafts",
  },
] as const;

export type LocalModelId = (typeof LOCAL_MODEL_OPTIONS)[number]["id"];

export const DEFAULT_LOCAL_MODEL: LocalModelId = "qwen2.5:32b";

export const LOCAL_MODEL_IDS = LOCAL_MODEL_OPTIONS.map((m) => m.id) as [
  LocalModelId,
  ...LocalModelId[],
];
