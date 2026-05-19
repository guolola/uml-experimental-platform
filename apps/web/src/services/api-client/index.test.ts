import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiClientError,
  buildApiUrl,
  downloadBlob,
  postJson,
} from "./index";

describe("api-client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds api urls without duplicating the /api prefix", () => {
    expect(buildApiUrl("/api/runs", "https://example.com/api/")).toBe(
      "https://example.com/api/runs",
    );
  });

  it("preserves server error messages for JSON requests", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ message: "Provider rejected API key" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(postJson("/api/runs", {})).rejects.toMatchObject({
      name: "ApiClientError",
      status: 401,
      message: "Provider rejected API key",
    } satisfies Partial<ApiClientError>);
  });

  it("downloads blobs and reads utf-8 filenames", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("doc", {
          status: 200,
          headers: {
            "Content-Disposition": "attachment; filename*=UTF-8''%E8%AF%B4%E6%98%8E%E4%B9%A6.docx",
          },
        }),
      ),
    );

    const result = await downloadBlob("/api/document-runs/run/download");
    expect(result.fileName).toBe("说明书.docx");
    expect(await result.blob.text()).toBe("doc");
  });
});
