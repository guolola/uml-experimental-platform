import assert from "node:assert/strict";
import test from "node:test";
import {
  createRealLlmTransport,
  parseChatCompletionSse,
  resolveChatCompletionsUrl,
} from "./llm.js";

function createResponseFromSse(blocks: string[]) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const block of blocks) {
        controller.enqueue(encoder.encode(block));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
    },
  });
}

test("parseChatCompletionSse aggregates chunks until DONE", async () => {
  const response = createResponseFromSse([
    'data: {"choices":[{"delta":{"content":"{\\"rules\\":"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"[]}"}}]}\n\n',
    "data: [DONE]\n\n",
  ]);

  const chunks: string[] = [];
  for await (const chunk of parseChatCompletionSse(response)) {
    chunks.push(chunk);
  }

  assert.deepEqual(chunks, ['{"rules":', "[]}"]);
});

test("parseChatCompletionSse throws on invalid payload", async () => {
  const response = createResponseFromSse(["data: {not-json}\n\n"]);

  await assert.rejects(async () => {
    for await (const _chunk of parseChatCompletionSse(response)) {
      // noop
    }
  });
});

test("parseChatCompletionSse includes JSON error message on non-OK responses", async () => {
  const response = new Response(
    JSON.stringify({
      error: {
        message: "invalid api key",
      },
    }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
      },
    },
  );

  await assert.rejects(
    async () => {
      for await (const _chunk of parseChatCompletionSse(response)) {
        // noop
      }
    },
    /LLM request failed with HTTP 401: invalid api key/,
  );
});

test("parseChatCompletionSse includes text error summary on non-OK responses", async () => {
  const response = new Response("model not permitted for this account", {
    status: 401,
    headers: {
      "Content-Type": "text/plain",
    },
  });

  await assert.rejects(
    async () => {
      for await (const _chunk of parseChatCompletionSse(response)) {
        // noop
      }
    },
    /LLM request failed with HTTP 401: model not permitted for this account/,
  );
});

test("resolveChatCompletionsUrl targets model provider v1 chat completions", () => {
  assert.equal(
    resolveChatCompletionsUrl("https://ai.comfly.org"),
    "https://ai.comfly.org/v1/chat/completions",
  );
  assert.equal(
    resolveChatCompletionsUrl("https://ai.comfly.org/"),
    "https://ai.comfly.org/v1/chat/completions",
  );
  assert.equal(
    resolveChatCompletionsUrl("https://ai.comfly.org/v1"),
    "https://ai.comfly.org/v1/chat/completions",
  );
});

test("createRealLlmTransport forwards json_schema response_format when provided", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody = "";
  globalThis.fetch = (async (_input, init) => {
    requestBody = String(init?.body ?? "");
    return createResponseFromSse([
      'data: {"choices":[{"delta":{"content":"{\\"models\\":[]}"}}]}\n\n',
      "data: [DONE]\n\n",
    ]);
  }) as typeof fetch;

  try {
    const transport = createRealLlmTransport();
    const chunks: string[] = [];
    for await (const chunk of transport.streamChatCompletion({
      providerSettings: {
        apiBaseUrl: "https://ai.comfly.org",
        apiKey: "sk-test",
        model: "gpt-5.5",
      },
      messages: [{ role: "user", content: "test" }],
      responseFormat: {
        type: "json_schema",
        json_schema: {
          name: "diagram_models_result",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              models: {
                type: "array",
                items: { type: "object" },
              },
            },
            required: ["models"],
          },
        },
      },
    })) {
      chunks.push(chunk);
    }

    assert.deepEqual(chunks, ['{"models":[]}']);
    const parsedBody = JSON.parse(requestBody) as {
      response_format?: { type?: string };
    };
    assert.equal(parsedBody.response_format?.type, "json_schema");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createRealLlmTransport retries unsupported json_schema requests with JSON mode", async () => {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  const requestBodies: string[] = [];
  const warnings: string[] = [];
  globalThis.fetch = (async (_input, init) => {
    requestBodies.push(String(init?.body ?? ""));
    if (requestBodies.length === 1) {
      return new Response(
        JSON.stringify({
          error: {
            message:
              "response_format json_schema is not supported by this provider",
          },
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    return createResponseFromSse([
      'data: {"choices":[{"delta":{"content":"{\\"ok\\":true}"}}]}\n\n',
      "data: [DONE]\n\n",
    ]);
  }) as typeof fetch;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map((item) => String(item)).join(" "));
  };

  try {
    const transport = createRealLlmTransport();
    const chunks: string[] = [];
    for await (const chunk of transport.streamChatCompletion({
      providerSettings: {
        apiBaseUrl: "https://ai.comfly.org",
        apiKey: "sk-test",
        model: "provider-json-only",
      },
      messages: [{ role: "user", content: "test" }],
      responseFormat: {
        type: "json_schema",
        json_schema: {
          name: "healthcheck",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: { ok: { type: "boolean" } },
            required: ["ok"],
          },
        },
      },
    })) {
      chunks.push(chunk);
    }

    assert.deepEqual(chunks, ['{"ok":true}']);
    assert.equal(requestBodies.length, 2);
    assert.equal(JSON.parse(requestBodies[0]).response_format.type, "json_schema");
    assert.equal(JSON.parse(requestBodies[1]).response_format.type, "json_object");
    assert.match(warnings.join("\n"), /\[llm-json-schema-fallback\]/);
    assert.doesNotMatch(warnings.join("\n"), /sk-test/);
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
});

test("createRealLlmTransport does not downgrade auth failures", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return new Response(
      JSON.stringify({
        error: {
          message: "invalid api key",
        },
      }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as typeof fetch;

  try {
    const transport = createRealLlmTransport();
    await assert.rejects(
      async () => {
        for await (const _chunk of transport.streamChatCompletion({
          providerSettings: {
            apiBaseUrl: "https://ai.comfly.org",
            apiKey: "sk-test",
            model: "gpt-5.5",
          },
          messages: [{ role: "user", content: "test" }],
          responseFormat: {
            type: "json_schema",
            json_schema: {
              name: "healthcheck",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                properties: { ok: { type: "boolean" } },
                required: ["ok"],
              },
            },
          },
        })) {
          // noop
        }
      },
      /LLM request failed with HTTP 401: invalid api key/,
    );
    assert.equal(fetchCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createRealLlmTransport times out a stalled streaming response", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      new ReadableStream({
        start() {
          // Keep the provider stream open without yielding chunks to simulate a stalled SSE response.
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
        },
      },
    )) as typeof fetch;

  try {
    const transport = createRealLlmTransport({
      responseTimeoutMs: 10,
    });

    await assert.rejects(
      async () => {
        for await (const _chunk of transport.streamChatCompletion({
          providerSettings: {
            apiBaseUrl: "https://ai.comfly.org",
            apiKey: "sk-test",
            model: "gpt-5.5",
          },
          messages: [{ role: "user", content: "test" }],
        })) {
          // noop
        }
      },
      /LLM request timed out after 10ms/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createRealLlmTransport rejects provider URLs outside the allowlist", async () => {
  const transport = createRealLlmTransport({
    baseUrlAllowlist: ["https://api.openai.com"],
  });

  await assert.rejects(
    async () => {
      for await (const _chunk of transport.streamChatCompletion({
        providerSettings: {
          apiBaseUrl: "http://127.0.0.1:9000",
          apiKey: "sk-test",
          model: "gpt-5.5",
        },
        messages: [{ role: "user", content: "test" }],
      })) {
        // noop
      }
    },
    /not in the provider allowlist/,
  );
});
