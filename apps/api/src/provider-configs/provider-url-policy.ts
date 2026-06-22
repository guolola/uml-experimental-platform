// Normalizes and classifies managed OpenAI-compatible provider endpoints.
import { isIP } from "node:net";

export class ProviderConfigPolicyError extends Error {}

function assertPublicHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[(.*)\]$/u, "$1");
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "0.0.0.0"
  ) {
    throw new ProviderConfigPolicyError("Provider Base URL must use a public HTTPS host");
  }

  const ipVersion = isIP(normalized);
  if (ipVersion === 4) {
    const parts = normalized.split(".").map((part) => Number(part));
    const [first, second] = parts;
    if (
      first === 10 ||
      first === 127 ||
      first === 0 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168)
    ) {
      throw new ProviderConfigPolicyError("Provider Base URL must use a public HTTPS host");
    }
  }

  if (ipVersion === 6) {
    if (
      normalized === "::1" ||
      normalized === "::" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:")
    ) {
      throw new ProviderConfigPolicyError("Provider Base URL must use a public HTTPS host");
    }
  }
}

export function normalizeManagedProviderBaseUrl(baseUrl: string) {
  let url: URL;
  try {
    url = new URL(baseUrl.trim());
  } catch {
    throw new ProviderConfigPolicyError("Provider Base URL must be a valid URL");
  }

  if (url.protocol !== "https:") {
    throw new ProviderConfigPolicyError("Provider Base URL must use HTTPS");
  }
  if (url.username || url.password) {
    throw new ProviderConfigPolicyError("Provider Base URL must not contain credentials");
  }
  assertPublicHostname(url.hostname);
  return url.origin;
}

export function inferOpenAiCompatibleProvider(baseUrl: string, provider?: string) {
  const explicitProvider = provider?.trim();
  if (explicitProvider) return explicitProvider;

  const hostname = new URL(normalizeManagedProviderBaseUrl(baseUrl)).hostname.toLowerCase();
  if (hostname === "api.siliconflow.cn") return "siliconflow";
  if (hostname === "api.nonelinear.com") return "nonelinear";
  if (hostname === "api.openai.com") return "openai";
  return "openai-compatible";
}
