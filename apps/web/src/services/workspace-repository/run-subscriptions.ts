// Owns run snapshot reads and SSE fallback behavior for workspace repository runs.
import type {
  CodeRunSnapshot,
  DesignRunSnapshot,
  DocumentRunSnapshot,
  RunEvent,
  RunSnapshot,
} from "@uml-platform/contracts";
import { ApiClientError, buildApiUrl, requestJson } from "../api-client";
import { subscribeToRunEvents } from "../sse-client";
import { projectHeaders, requireProjectScope } from "./project-scope";
import { snapshotErrorMessage } from "./run-payload";

type RunSubscriptionInput = {
  runId: string;
  projectId: string | null;
  onEvent: (event: RunEvent) => void;
};

export async function readRunSnapshot(
  runId: string,
  projectId: string | null = null,
) {
  return requestJson<RunSnapshot>(`/api/runs/${runId}`, {
    errorMessage: "读取运行快照失败",
    headers: projectHeaders(projectId),
  });
}

export async function readDesignRunSnapshot(
  runId: string,
  projectId: string | null = null,
) {
  return requestJson<DesignRunSnapshot>(`/api/design-runs/${runId}`, {
    errorMessage: "读取设计运行快照失败",
    headers: projectHeaders(projectId),
  });
}

export async function readCodeRunSnapshot(
  runId: string,
  projectId: string | null = null,
) {
  try {
    return await requestJson<CodeRunSnapshot>(`/api/code-runs/${runId}`, {
      errorMessage: "读取代码运行快照失败",
      headers: projectHeaders(projectId),
    });
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) {
      throw new Error(
        "代码生成任务已丢失，可能是本地 API 服务重启，请重新生成",
      );
    }
    throw error;
  }
}

export async function readDocumentRunSnapshot(
  runId: string,
  projectId: string | null = null,
) {
  return requestJson<DocumentRunSnapshot>(`/api/document-runs/${runId}`, {
    errorMessage: "读取说明书运行快照失败",
    headers: projectHeaders(projectId),
  });
}

async function streamProjectRunEvents(
  endpoint: string,
  projectId: string,
  onEvent: (event: RunEvent) => void,
) {
  const response = await fetch(buildApiUrl(endpoint), {
    credentials: "include",
    headers: projectHeaders(projectId),
  });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const payload = await response.json();
      if (payload && typeof payload === "object" && "message" in payload) {
        const payloadMessage = payload.message;
        if (typeof payloadMessage === "string" && payloadMessage.trim()) {
          message = payloadMessage;
        }
      }
    } catch {
      // Keep the status-based permission message when the SSE endpoint has no JSON body.
    }
    throw new ApiClientError(message, response.status);
  }

  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = "";
  const flushEvent = (chunk: string) => {
    const data = chunk
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");
    if (!data) return;
    const event = JSON.parse(data) as RunEvent;
    onEvent(event);
    if (event.type === "failed") {
      throw new Error(event.error.message);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const chunks = buffer.split(/\r?\n\r?\n/);
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      flushEvent(chunk);
    }
    if (done) break;
  }
  if (buffer.trim()) {
    flushEvent(buffer);
  }
}

async function waitForCodeRunSnapshot(
  runId: string,
  onEvent: (event: RunEvent) => void,
  projectId: string | null = null,
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 120_000) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const snapshot = await readCodeRunSnapshot(runId, projectId);
    if (snapshot.status === "completed") {
      onEvent({ type: "completed", snapshot });
      return;
    }
    if (snapshot.status === "failed") {
      throw new Error(snapshotErrorMessage(snapshot, "代码生成失败"));
    }
    if (snapshot.status === "cancelled") {
      onEvent({
        type: "cancelled",
        stage: snapshot.currentStage ?? "write_code_files",
        message: snapshotErrorMessage(snapshot, "任务已取消"),
      });
      return;
    }
    onEvent({
      type: "stage_progress",
      stage: snapshot.currentStage ?? "write_code_files",
      progress: snapshot.currentStage ? 70 : 10,
      message: "SSE 已断开，正在通过快照轮询等待代码生成任务",
    });
  }
  throw new Error("代码 SSE 订阅失败，轮询等待超时");
}

async function waitForDocumentRunSnapshot(
  runId: string,
  onEvent: (event: RunEvent) => void,
  projectId: string | null = null,
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 120_000) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const snapshot = await readDocumentRunSnapshot(runId, projectId);
    if (snapshot.status === "completed") {
      onEvent({ type: "completed", snapshot });
      return;
    }
    if (snapshot.status === "failed") {
      throw new Error(snapshotErrorMessage(snapshot, "说明书生成失败"));
    }
    if (snapshot.status === "cancelled") {
      onEvent({
        type: "cancelled",
        stage: snapshot.currentStage ?? "generate_document_text",
        message: snapshotErrorMessage(snapshot, "任务已取消"),
      });
      return;
    }
    onEvent({
      type: "stage_progress",
      stage: snapshot.currentStage ?? "generate_document_text",
      progress: snapshot.currentStage === "render_document_file" ? 90 : 55,
      message: "SSE 已断开，正在通过快照轮询等待说明书生成任务",
    });
  }
  throw new Error("说明书 SSE 订阅失败，轮询等待超时");
}

export async function subscribeToRequirementRunEvents({
  runId,
  projectId,
  onEvent,
}: RunSubscriptionInput) {
  const scopedProjectId = requireProjectScope(projectId);
  if (projectId) {
    try {
      await streamProjectRunEvents(
        `/api/runs/${runId}/events`,
        scopedProjectId,
        onEvent,
      );
      return;
    } catch (error) {
      if (
        error instanceof ApiClientError &&
        (error.status === 401 || error.status === 403)
      ) {
        throw error;
      }
      const snapshot = await readRunSnapshot(runId, scopedProjectId);
      if (snapshot.status === "failed") {
        throw new Error(snapshotErrorMessage(snapshot, "生成失败"));
      }
      if (snapshot.status === "cancelled") {
        onEvent({
          type: "cancelled",
          stage: snapshot.currentStage ?? undefined,
          message: snapshotErrorMessage(snapshot, "任务已取消"),
        });
        return;
      }
      if (snapshot.status !== "completed") {
        throw error;
      }
      return;
    }
  }
  const subscription = subscribeToRunEvents(`/api/runs/${runId}/events`, {
    onEvent,
    onError: async () => {
      const snapshot = await readRunSnapshot(runId, projectId);
      if (snapshot.status === "failed") {
        throw new Error(snapshotErrorMessage(snapshot, "生成失败"));
      }
      if (snapshot.status === "cancelled") {
        onEvent({
          type: "cancelled",
          stage: snapshot.currentStage ?? undefined,
          message: snapshotErrorMessage(snapshot, "任务已取消"),
        });
        return;
      }
      if (snapshot.status !== "completed") {
        throw new Error("SSE 订阅失败");
      }
    },
  });
  await subscription.closed;
}

export async function subscribeToDesignRunEvents({
  runId,
  projectId,
  onEvent,
}: RunSubscriptionInput) {
  const scopedProjectId = requireProjectScope(projectId);
  if (projectId) {
    try {
      await streamProjectRunEvents(
        `/api/design-runs/${runId}/events`,
        scopedProjectId,
        onEvent,
      );
      return;
    } catch (error) {
      if (
        error instanceof ApiClientError &&
        (error.status === 401 || error.status === 403)
      ) {
        throw error;
      }
      const snapshot = await readDesignRunSnapshot(runId, scopedProjectId);
      if (snapshot.status === "failed") {
        throw new Error(snapshotErrorMessage(snapshot, "设计生成失败"));
      }
      if (snapshot.status === "cancelled") {
        onEvent({
          type: "cancelled",
          stage: snapshot.currentStage ?? undefined,
          message: snapshotErrorMessage(snapshot, "任务已取消"),
        });
        return;
      }
      if (snapshot.status !== "completed") {
        throw error;
      }
      return;
    }
  }
  const subscription = subscribeToRunEvents(`/api/design-runs/${runId}/events`, {
    onEvent,
    onError: async () => {
      const snapshot = await readDesignRunSnapshot(runId, projectId);
      if (snapshot.status === "failed") {
        throw new Error(snapshotErrorMessage(snapshot, "设计生成失败"));
      }
      if (snapshot.status === "cancelled") {
        onEvent({
          type: "cancelled",
          stage: snapshot.currentStage ?? undefined,
          message: snapshotErrorMessage(snapshot, "任务已取消"),
        });
        return;
      }
      if (snapshot.status !== "completed") {
        throw new Error("设计 SSE 订阅失败");
      }
    },
  });
  await subscription.closed;
}

export async function subscribeToCodeRunEvents({
  runId,
  projectId,
  onEvent,
}: RunSubscriptionInput) {
  const scopedProjectId = requireProjectScope(projectId);
  if (projectId) {
    try {
      await streamProjectRunEvents(
        `/api/code-runs/${runId}/events`,
        scopedProjectId,
        onEvent,
      );
      return;
    } catch (error) {
      if (
        error instanceof ApiClientError &&
        (error.status === 401 || error.status === 403)
      ) {
        throw error;
      }
      await waitForCodeRunSnapshot(runId, onEvent, scopedProjectId);
      return;
    }
  }
  const subscription = subscribeToRunEvents(`/api/code-runs/${runId}/events`, {
    onEvent,
    onError: () => waitForCodeRunSnapshot(runId, onEvent, projectId),
  });
  await subscription.closed;
}

export async function subscribeToDocumentRunEvents({
  runId,
  projectId,
  onEvent,
}: RunSubscriptionInput) {
  const scopedProjectId = requireProjectScope(projectId);
  if (projectId) {
    try {
      await streamProjectRunEvents(
        `/api/document-runs/${runId}/events`,
        scopedProjectId,
        onEvent,
      );
      return;
    } catch (error) {
      if (
        error instanceof ApiClientError &&
        (error.status === 401 || error.status === 403)
      ) {
        throw error;
      }
      await waitForDocumentRunSnapshot(runId, onEvent, scopedProjectId);
      return;
    }
  }
  const subscription = subscribeToRunEvents(
    `/api/document-runs/${runId}/events`,
    {
      onEvent,
      onError: () => waitForDocumentRunSnapshot(runId, onEvent, projectId),
    },
  );
  await subscription.closed;
}
