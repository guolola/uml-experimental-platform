// Wraps EventSource so repositories can share completion and failure handling.
import type { RunEvent } from "@uml-platform/contracts";
import { buildApiUrl } from "../api-client";

export interface RunEventHandlers {
  onEvent: (event: RunEvent) => void;
  onError?: () => Promise<void> | void;
}

export interface RunEventSubscription {
  closed: Promise<void>;
  close: () => void;
}

export function subscribeToRunEvents(
  endpoint: string,
  handlers: RunEventHandlers,
): RunEventSubscription {
  const source = new EventSource(buildApiUrl(endpoint), { withCredentials: true });
  let settled = false;

  const closed = new Promise<void>((resolve, reject) => {
    const settleResolve = () => {
      if (settled) return;
      settled = true;
      source.close();
      resolve();
    };
    const settleReject = (error: unknown) => {
      if (settled) return;
      settled = true;
      source.close();
      reject(error);
    };

    source.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as RunEvent;
        handlers.onEvent(event);
        if (event.type === "completed") {
          settleResolve();
        }
        if (event.type === "cancelled") {
          settleResolve();
        }
        if (event.type === "failed") {
          settleReject(new Error(event.error.message));
        }
      } catch (error) {
        settleReject(error);
      }
    };

    source.onerror = () => {
      if (settled) {
        source.close();
        return;
      }
      source.close();
      void Promise.resolve(handlers.onError?.()).then(settleResolve, settleReject);
    };
  });

  return {
    closed,
    close: () => {
      if (settled) return;
      settled = true;
      source.close();
    },
  };
}
