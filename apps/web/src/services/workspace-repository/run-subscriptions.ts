// Owns run snapshot reads and SSE fallback behavior for workspace repository runs.
import type {
  CodeRunSnapshot,
  DesignRunSnapshot,
  DocumentRunSnapshot,
  RunEvent,
  RunError,
  RunSnapshot,
  RunStage,
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

type RestorableRunSnapshot =
  | RunSnapshot
  | DesignRunSnapshot
  | CodeRunSnapshot
  | DocumentRunSnapshot;

type SnapshotReader<TSnapshot extends RestorableRunSnapshot> = (
  runId: string,
  projectId: string | null,
) => Promise<TSnapshot>;

type SnapshotWaitInput<TSnapshot extends RestorableRunSnapshot> = {
  runId: string;
  projectId: string | null;
  onEvent: (event: RunEvent) => void;
  readSnapshot: SnapshotReader<TSnapshot>;
  fallbackFailureMessage: string;
  fallbackCancelledStage: RunStage;
  fallbackProgressStage: RunStage;
  progressMessage: string;
  progressForSnapshot: (snapshot: TSnapshot) => number;
};

const PROJECT_STREAM_IDLE_TIMEOUT_MS = 60_000;
const INITIAL_SNAPSHOT_POLL_MS = 1_500;
const MAX_SNAPSHOT_POLL_MS = 10_000;

class StreamedRunFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StreamedRunFailedError";
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isNonRetryableSnapshotReadError(error: unknown) {
  return (
    error instanceof ApiClientError &&
    (error.status === 401 || error.status === 403 || error.status === 404)
  );
}

function snapshotStage(
  snapshot: RestorableRunSnapshot,
  fallbackStage: RunStage,
) {
  return snapshot.currentStage ?? fallbackStage;
}

function fallbackRunError(message: string): RunError {
  return {
    code: "RUN_INTERNAL_ERROR",
    message,
    category: "internal",
    retryable: true,
  };
}

async function waitForTerminalSnapshot<TSnapshot extends RestorableRunSnapshot>({
  runId,
  projectId,
  onEvent,
  readSnapshot,
  fallbackFailureMessage,
  fallbackCancelledStage,
  fallbackProgressStage,
  progressMessage,
  progressForSnapshot,
}: SnapshotWaitInput<TSnapshot>) {
  let delayMs = INITIAL_SNAPSHOT_POLL_MS;

  while (true) {
    try {
      const snapshot = await readSnapshot(runId, projectId);
      if (snapshot.status === "completed") {
        onEvent({ type: "completed", snapshot });
        return;
      }
      if (snapshot.status === "failed") {
        const message = snapshotErrorMessage(snapshot, fallbackFailureMessage);
        const error = snapshot.error ?? fallbackRunError(message);
        onEvent({
          type: "failed",
          stage: snapshot.currentStage ?? undefined,
          error,
        });
        throw new Error(message);
      }
      if (snapshot.status === "cancelled") {
        onEvent({
          type: "cancelled",
          stage: snapshotStage(snapshot, fallbackCancelledStage),
          message: snapshotErrorMessage(snapshot, "任务已取消"),
        });
        return;
      }
      onEvent({
        type: "stage_progress",
        stage: snapshotStage(snapshot, fallbackProgressStage),
        progress: progressForSnapshot(snapshot),
        message: progressMessage,
      });
    } catch (error) {
      if (isNonRetryableSnapshotReadError(error)) {
        throw error;
      }
      const retryableNetworkError =
        error instanceof TypeError ||
        (error instanceof Error &&
          (error.message === "Failed to fetch" ||
            error.message === "NetworkError when attempting to fetch resource." ||
            error.message === "fetch failed"));
      if (!retryableNetworkError) {
        throw error;
      }
      onEvent({
        type: "stage_progress",
        stage: fallbackProgressStage,
        progress: 5,
        message: `${progressMessage}（网络连接恢复中）`,
      });
    }

    await sleep(delayMs);
    delayMs = Math.min(MAX_SNAPSHOT_POLL_MS, Math.floor(delayMs * 1.5));
  }
}

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
      throw new ApiClientError(
        "代码生成任务已丢失，可能是本地 API 服务重启，请重新生成",
        404,
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
  const controller = new AbortController();
  const response = await fetch(buildApiUrl(endpoint), {
    credentials: "include",
    headers: projectHeaders(projectId),
    signal: controller.signal,
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
  if (!reader) throw new Error("SSE stream unavailable");

  const decoder = new TextDecoder();
  let buffer = "";
  let terminalEventSeen = false;
  const readWithIdleTimeout = () =>
    new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("SSE stream idle timeout"));
      }, PROJECT_STREAM_IDLE_TIMEOUT_MS);
      reader.read().then(
        (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      );
    });
  const flushEvent = (chunk: string) => {
    const data = chunk
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");
    if (!data) return;
    const event = JSON.parse(data) as RunEvent;
    onEvent(event);
    if (event.type === "completed" || event.type === "cancelled") {
      terminalEventSeen = true;
    }
    if (event.type === "failed") {
      terminalEventSeen = true;
      throw new StreamedRunFailedError(event.error.message);
    }
  };

  try {
    while (true) {
      const { done, value } = await readWithIdleTimeout();
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
    if (!terminalEventSeen) {
      throw new Error("SSE stream ended before terminal event");
    }
  } catch (error) {
    controller.abort();
    await reader.cancel().catch(() => {});
    throw error;
  }
}

async function waitForRequirementRunSnapshot(
  runId: string,
  onEvent: (event: RunEvent) => void,
  projectId: string | null = null,
) {
  await waitForTerminalSnapshot({
    runId,
    projectId,
    onEvent,
    readSnapshot: readRunSnapshot,
    fallbackFailureMessage: "生成失败",
    fallbackCancelledStage: "generate_models",
    fallbackProgressStage: "generate_models",
    progressMessage: "SSE 已断开，正在通过快照轮询等待需求生成任务",
    progressForSnapshot: (snapshot) =>
      snapshot.currentStage === "render_svg"
        ? 90
        : snapshot.currentStage === "generate_plantuml"
          ? 75
          : snapshot.currentStage === "generate_models"
            ? 55
            : 20,
  });
}

async function waitForDesignRunSnapshot(
  runId: string,
  onEvent: (event: RunEvent) => void,
  projectId: string | null = null,
) {
  await waitForTerminalSnapshot({
    runId,
    projectId,
    onEvent,
    readSnapshot: readDesignRunSnapshot,
    fallbackFailureMessage: "设计生成失败",
    fallbackCancelledStage: "generate_design_models",
    fallbackProgressStage: "generate_design_models",
    progressMessage: "SSE 已断开，正在通过快照轮询等待设计生成任务",
    progressForSnapshot: (snapshot) =>
      snapshot.currentStage === "render_svg"
        ? 90
        : snapshot.currentStage === "generate_plantuml"
          ? 75
          : snapshot.currentStage === "generate_design_sequence"
            ? 40
            : snapshot.currentStage === "generate_design_models"
              ? 60
              : 20,
  });
}

async function waitForCodeRunSnapshot(
  runId: string,
  onEvent: (event: RunEvent) => void,
  projectId: string | null = null,
) {
  await waitForTerminalSnapshot({
    runId,
    projectId,
    onEvent,
    readSnapshot: readCodeRunSnapshot,
    fallbackFailureMessage: "代码生成失败",
    fallbackCancelledStage: "write_code_files",
    fallbackProgressStage: "write_code_files",
    progressMessage: "SSE 已断开，正在通过快照轮询等待代码生成任务",
    progressForSnapshot: (snapshot) => (snapshot.currentStage ? 70 : 10),
  });
}

async function waitForDocumentRunSnapshot(
  runId: string,
  onEvent: (event: RunEvent) => void,
  projectId: string | null = null,
) {
  await waitForTerminalSnapshot({
    runId,
    projectId,
    onEvent,
    readSnapshot: readDocumentRunSnapshot,
    fallbackFailureMessage: "说明书生成失败",
    fallbackCancelledStage: "generate_document_text",
    fallbackProgressStage: "generate_document_text",
    progressMessage: "SSE 已断开，正在通过快照轮询等待说明书生成任务",
    progressForSnapshot: (snapshot) =>
      snapshot.currentStage === "render_document_file" ? 90 : 55,
  });
}

export async function subscribeToRequirementRunEvents({
  runId,
  projectId,
  onEvent,
}: RunSubscriptionInput) {
  if (projectId) {
    const scopedProjectId = requireProjectScope(projectId);
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
      if (error instanceof StreamedRunFailedError) {
        throw error;
      }
      await waitForRequirementRunSnapshot(runId, onEvent, scopedProjectId);
      return;
    }
  }
  const subscription = subscribeToRunEvents(`/api/runs/${runId}/events`, {
    onEvent,
    onError: () => waitForRequirementRunSnapshot(runId, onEvent, projectId),
  });
  await subscription.closed;
}

export async function subscribeToDesignRunEvents({
  runId,
  projectId,
  onEvent,
}: RunSubscriptionInput) {
  if (projectId) {
    const scopedProjectId = requireProjectScope(projectId);
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
      if (error instanceof StreamedRunFailedError) {
        throw error;
      }
      await waitForDesignRunSnapshot(runId, onEvent, scopedProjectId);
      return;
    }
  }
  const subscription = subscribeToRunEvents(`/api/design-runs/${runId}/events`, {
    onEvent,
    onError: () => waitForDesignRunSnapshot(runId, onEvent, projectId),
  });
  await subscription.closed;
}

export async function subscribeToCodeRunEvents({
  runId,
  projectId,
  onEvent,
}: RunSubscriptionInput) {
  if (projectId) {
    const scopedProjectId = requireProjectScope(projectId);
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
      if (error instanceof StreamedRunFailedError) {
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
  if (projectId) {
    const scopedProjectId = requireProjectScope(projectId);
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
      if (error instanceof StreamedRunFailedError) {
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
