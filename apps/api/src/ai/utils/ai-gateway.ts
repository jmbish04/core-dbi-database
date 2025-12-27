export type AIGatewayProvider = "google-ai-studio" | "openai";

interface GatewayOptions {
  provider: AIGatewayProvider;
  /**
   * Optional: If provided, appends the standard path for this provider's chat/generation endpoint.
   * - OpenAI: adds "/chat/completions"
   * - Google: adds "/{apiVersion}/models/{modelName}:generateContent"
   */
  modelName?: string;
  /**
   * Optional: API Version for the provider.
   * - Google Defaults: "v1" (can be set to "v1beta")
   * - OpenAI Defaults: N/A (usually handled by SDK or implied in path)
   */
  apiVersion?: string;
}

/**
 * Constructs the URL for Cloudflare AI Gateway.
 * * Usage:
 * 1. Base URL (for SDKs): getAIGatewayUrl(env, { provider: 'openai' })
 * 2. Full URL (for fetch): getAIGatewayUrl(env, { provider: 'google-ai-studio', modelName: 'gemini-1.5-pro', apiVersion: 'v1beta' })
 */
export function getAIGatewayUrl(env: Env, options: GatewayOptions): string {
  if (!env.CLOUDFLARE_ACCOUNT_ID) {
    throw new Error("Missing CLOUDFLARE_ACCOUNT_ID in environment variables");
  }

  const gatewayName = env.AI_GATEWAY_NAME || "core-dbi-database";
  const baseUrl = `https://gateway.ai.cloudflare.com/v1/${env.CLOUDFLARE_ACCOUNT_ID}/${gatewayName}/${options.provider}`;

  // If no specific model/endpoint is requested, return the base SDK url
  if (!options.modelName) {
    return baseUrl;
  }

  // Append provider-specific suffixes for direct REST usage
  switch (options.provider) {
    case "openai":
      return `${baseUrl}/chat/completions`;

    case "google-ai-studio":
      // Defaults to 'v1beta' if not provided
      const version = options.apiVersion || "v1beta";
      // Google REST API format: .../{version}/models/{model}:generateContent
      return `${baseUrl}/${version}/models/${options.modelName}:generateContent`;

    default:
      return baseUrl;
  }
}
