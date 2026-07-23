// Centralizes HTTP URL resolution, JSON requests, downloads, and error parsing.
import { runErrorSchema, type RunError } from "@uml-platform/contracts";
import { localizeApiFailure } from "../../shared/i18n/api-errors";

const APP_API_BASE_URL =
  import.meta.env.VITE_APP_API_BASE_URL ?? "";
const API_PATH_PREFIX = "/api";

export class ApiClientError extends Error {
  readonly status: number;
  readonly payload: unknown;
  readonly error: RunError | null;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.payload = payload;
    this.error = parseRunErrorFromPayload(payload);
  }
}

export function buildApiUrl(path: string, baseUrl = APP_API_BASE_URL) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");

  if (!normalizedBaseUrl) {
    return normalizedPath;
  }

  if (
    normalizedBaseUrl.endsWith(API_PATH_PREFIX) &&
    (normalizedPath === API_PATH_PREFIX ||
      normalizedPath.startsWith(`${API_PATH_PREFIX}/`))
  ) {
    const pathWithoutApiPrefix = normalizedPath.slice(API_PATH_PREFIX.length);
    return `${normalizedBaseUrl}${pathWithoutApiPrefix || "/"}`;
  }

  return `${normalizedBaseUrl}${normalizedPath}`;
}

async function parseErrorPayload(response: Response) {
  const contentType = response.headers.get("Content-Type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  try {
    const text = await response.text();
    return text.trim() ? { message: text.trim() } : null;
  } catch {
    return null;
  }
}

function parseRunErrorFromPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const maybeError = "error" in payload ? payload.error : payload;
  const parsed = runErrorSchema.safeParse(maybeError);
  return parsed.success ? parsed.data : null;
}

export async function requestJson<T>(
  path: string,
  options: RequestInit & { errorMessage?: string } = {},
): Promise<T> {
  const { errorMessage: _errorMessage, ...requestOptions } = options;
  const response = await fetch(buildApiUrl(path), {
    credentials: "include",
    ...requestOptions,
  });
  if (!response.ok) {
    const payload = await parseErrorPayload(response);
    throw new ApiClientError(
      localizeApiFailure(payload, response.status),
      response.status,
      payload,
    );
  }

  return (await response.json()) as T;
}

export function postJson<T>(
  path: string,
  body: unknown,
  options: RequestInit & { errorMessage?: string } = {},
) {
  return requestJson<T>(path, {
    ...options,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    body: JSON.stringify(body),
  });
}

export async function downloadBlob(
  path: string,
  options: RequestInit & { errorMessage?: string; defaultFileName?: string } = {},
) {
  const { errorMessage: _errorMessage, defaultFileName = "download", ...requestOptions } = options;
  const response = await fetch(buildApiUrl(path), {
    credentials: "include",
    ...requestOptions,
  });
  if (!response.ok) {
    const payload = await parseErrorPayload(response);
    throw new ApiClientError(
      localizeApiFailure(payload, response.status),
      response.status,
      payload,
    );
  }

  const disposition = response.headers.get("Content-Disposition") ?? "";
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/);
  const quotedMatch = disposition.match(/filename="?([^";]+)"?/);
  const fileName = utf8Match
    ? decodeURIComponent(utf8Match[1])
    : quotedMatch?.[1] ?? defaultFileName;

  return {
    blob: await response.blob(),
    fileName,
  };
}
