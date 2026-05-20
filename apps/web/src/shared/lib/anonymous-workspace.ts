// Manages the browser-local anonymous workspace used to isolate generated documents.
const STORAGE_KEY = "uml-platform:anonymous-document-workspace:v1";

export interface AnonymousDocumentWorkspace {
  workspaceId: string;
  workspaceSecret: string;
}

function randomToken(byteLength = 32) {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    const bytes = new Uint8Array(byteLength);
    cryptoApi.getRandomValues(bytes);
    return btoa(String.fromCharCode(...bytes))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function randomWorkspaceId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID().replace(/-/g, "");
  }
  return randomToken(18);
}

function parseWorkspace(value: string | null): AnonymousDocumentWorkspace | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<AnonymousDocumentWorkspace>;
    if (
      typeof parsed.workspaceId === "string" &&
      typeof parsed.workspaceSecret === "string" &&
      parsed.workspaceId.length >= 8 &&
      parsed.workspaceSecret.length >= 24
    ) {
      return {
        workspaceId: parsed.workspaceId,
        workspaceSecret: parsed.workspaceSecret,
      };
    }
  } catch {
    return null;
  }
  return null;
}

export function getAnonymousDocumentWorkspace(): AnonymousDocumentWorkspace {
  if (typeof window === "undefined") {
    return {
      workspaceId: "server-render-workspace",
      workspaceSecret: "server-render-workspace-secret-value",
    };
  }

  const existing = parseWorkspace(window.localStorage.getItem(STORAGE_KEY));
  if (existing) return existing;

  const workspace = {
    workspaceId: randomWorkspaceId(),
    workspaceSecret: randomToken(32),
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
  return workspace;
}

export function documentWorkspaceHeaders() {
  const workspace = getAnonymousDocumentWorkspace();
  return {
    "X-UML-Workspace-Id": workspace.workspaceId,
    "X-UML-Workspace-Secret": workspace.workspaceSecret,
  };
}
