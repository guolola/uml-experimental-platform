export interface SseClient {
  readonly kind: "sse";
}

export const sseClientScaffold: SseClient = {
  kind: "sse",
};
