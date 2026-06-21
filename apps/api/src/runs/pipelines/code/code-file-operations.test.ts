// Verifies code file operation generation releases LLM work on cancellation.
import assert from "node:assert/strict";
import test from "node:test";
import type { ProviderSettings } from "@uml-platform/contracts";
import type { LlmTransport } from "../../../llm.js";
import { createEmptyCodeSnapshot } from "../../records/snapshots.js";
import type { RunRecord } from "../../records/run-record-store.js";
import { RunCancelledError } from "../../records/run-cancellation.js";
import { generateCodeFileOperationsWithRepair } from "./code-file-operations.js";

const providerSettings: ProviderSettings = {
  apiBaseUrl: "https://llm.test",
  apiKey: "test-key",
  model: "test-model",
};

async function withTemporaryEnv<T>(
  key: string,
  value: string,
  callback: () => Promise<T>,
) {
  const previous = process.env[key];
  process.env[key] = value;
  try {
    return await callback();
  } finally {
    if (previous === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = previous;
    }
  }
}

test("code file operation generation aborts the LLM stream when the run is cancelled", async () => {
  const snapshot = createEmptyCodeSnapshot("run-code-cancel", {
    requirementText: "用户可以浏览商品并提交订单。",
    rules: [],
    designModels: [],
  });
  snapshot.status = "running";
  const record: RunRecord = {
    snapshot,
    events: [],
    listeners: new Set(),
    terminal: false,
  };
  let receivedAbortSignal = false;
  let signalAborted = false;

  const llmTransport: LlmTransport = {
    async *streamChatCompletion(input) {
      receivedAbortSignal = Boolean(input.abortSignal);
      setTimeout(() => {
        snapshot.status = "cancelled";
      }, 5);
      await new Promise<never>((_, reject) => {
        input.abortSignal?.addEventListener(
          "abort",
          () => {
            signalAborted = true;
            reject(new Error("aborted"));
          },
          { once: true },
        );
      });
    },
  };

  await withTemporaryEnv("UML_CODE_MODEL_TASK_TIMEOUT_MS", "50", async () =>
    withTemporaryEnv("UML_CODE_MODEL_TASK_MAX_RUNTIME_MS", "1000", async () =>
      assert.rejects(
        () =>
          generateCodeFileOperationsWithRepair(
            record,
            providerSettings,
            llmTransport,
            {},
            {},
          ),
        RunCancelledError,
      ),
    ),
  );

  assert.equal(receivedAbortSignal, true);
  assert.equal(signalAborted, true);
});
