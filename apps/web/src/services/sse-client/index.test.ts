import { afterEach, describe, expect, it, vi } from "vitest";
import { subscribeToRunEvents } from "./index";

describe("sse-client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves when a completed event is received", async () => {
    class MockEventSource {
      onmessage: ((event: MessageEvent<string>) => void) | null = null;
      onerror: (() => void) | null = null;

      close() {}

      constructor(url: string) {
        expect(url).toBe("http://127.0.0.1:4001/api/runs/run-1/events");
        queueMicrotask(() => {
          this.onmessage?.({
            data: JSON.stringify({
              type: "completed",
              snapshot: {
                runId: "run-1",
                requirementText: "",
                selectedDiagrams: [],
                rules: [],
                models: [],
                plantUml: [],
                svgArtifacts: [],
                diagramErrors: {},
                requirementTrace: [],
                currentStage: null,
                status: "completed",
                errorMessage: null,
              },
            }),
          } as MessageEvent<string>);
        });
      }
    }

    vi.stubGlobal("EventSource", MockEventSource);
    const events: string[] = [];
    const subscription = subscribeToRunEvents("/api/runs/run-1/events", {
      onEvent: (event) => events.push(event.type),
    });

    await expect(subscription.closed).resolves.toBeUndefined();
    expect(events).toEqual(["completed"]);
  });

  it("rejects with the streamed failure message", async () => {
    class MockEventSource {
      onmessage: ((event: MessageEvent<string>) => void) | null = null;
      onerror: (() => void) | null = null;

      close() {}

      constructor(url: string) {
        void url;
        queueMicrotask(() => {
          this.onmessage?.({
            data: JSON.stringify({
              type: "failed",
              message: "LLM request failed",
            }),
          } as MessageEvent<string>);
        });
      }
    }

    vi.stubGlobal("EventSource", MockEventSource);
    const subscription = subscribeToRunEvents("/api/runs/run-1/events", {
      onEvent: () => {},
    });

    await expect(subscription.closed).rejects.toThrow("LLM request failed");
  });

  it("resolves when a cancelled event is received", async () => {
    class MockEventSource {
      onmessage: ((event: MessageEvent<string>) => void) | null = null;
      onerror: (() => void) | null = null;

      close() {}

      constructor(url: string) {
        void url;
        queueMicrotask(() => {
          this.onmessage?.({
            data: JSON.stringify({
              type: "cancelled",
              message: "Run cancelled by user",
            }),
          } as MessageEvent<string>);
        });
      }
    }

    vi.stubGlobal("EventSource", MockEventSource);
    const events: string[] = [];
    const subscription = subscribeToRunEvents("/api/runs/run-1/events", {
      onEvent: (event) => events.push(event.type),
    });

    await expect(subscription.closed).resolves.toBeUndefined();
    expect(events).toEqual(["cancelled"]);
  });
});
