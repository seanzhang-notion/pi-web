export const PROVIDER_USAGE_IDS = [
  "antigravity",
  "google",
  "openai-codex",
  "xai",
  "anthropic",
  "deepseek",
  "openrouter",
  "moonshotai",
  "moonshotai-cn",
  "minimax",
  "minimax-cn",
  "vercel-ai-gateway",
  "opencode-go",
  "kimi-coding",
] as const;

export type ProviderUsageId = (typeof PROVIDER_USAGE_IDS)[number];

export function normalizeProviderId(id: string): ProviderUsageId | string {
  if (id === "codex") return "openai-codex";
  if (id === "claude") return "anthropic";
  if (id === "gemini") return "antigravity";
  return id;
}

export function isProviderUsageId(value: string): value is ProviderUsageId {
  const normalized = normalizeProviderId(value);
  return (PROVIDER_USAGE_IDS as readonly string[]).includes(normalized);
}
