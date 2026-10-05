/**
 * Distinguishes "the model server isn't reachable" from a genuine failure, so
 * the UI can tell someone their local Ollama isn't running instead of showing a
 * generic 500. The OpenAI SDK reports a refused local connection as the rather
 * unhelpful "Connection error.", which is why that string is matched too.
 */
const UNAVAILABLE_SIGNALS = [
  "openai_api_key",
  "econnrefused",
  "fetch failed",
  "connection error",
  "socket hang up",
  "etimedout",
  "timed out",
  "timeout",
  "429",
  "rate limit",
];

export function isUpstreamUnavailable(message: string): boolean {
  const text = message.toLowerCase();
  return UNAVAILABLE_SIGNALS.some((signal) => text.includes(signal));
}
