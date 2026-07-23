// Converts language-neutral API failures into current-locale user messages.
import { i18n } from "./i18n";

type LocalizableError = {
  code: string;
  params?: Record<string, string | number | boolean | null>;
};

function localizableError(value: unknown): LocalizableError | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.code !== "string" || !/^[A-Z][A-Z0-9_]+$/u.test(candidate.code)) {
    return null;
  }
  const params = candidate.params && typeof candidate.params === "object"
    ? Object.fromEntries(Object.entries(candidate.params as Record<string, unknown>).filter(
        ([, item]) => item === null || ["string", "number", "boolean"].includes(typeof item),
      )) as Record<string, string | number | boolean | null>
    : undefined;
  return { code: candidate.code, params };
}

function httpFallbackKey(status: number) {
  if (status === 400) return "errors.http.badRequest";
  if (status === 401) return "errors.http.unauthorized";
  if (status === 403) return "errors.http.forbidden";
  if (status === 404) return "errors.http.notFound";
  if (status === 409 || status === 422) return "errors.http.conflict";
  if (status === 429) return "errors.http.rateLimited";
  if (status >= 500) return "errors.http.server";
  return "errors.http.unknown";
}

export function localizeApiFailure(payload: unknown, status: number) {
  const nested = payload && typeof payload === "object" && "error" in payload
    ? (payload as { error?: unknown }).error
    : payload;
  const error = localizableError(nested);
  const fallback = i18n.t(httpFallbackKey(status));
  if (!error) return fallback;
  return i18n.t(`errors.codes.${error.code}`, {
    ...error.params,
    defaultValue: fallback,
  });
}
