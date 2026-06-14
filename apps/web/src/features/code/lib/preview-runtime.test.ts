// Verifies local prototype preview build helpers and user-facing error normalization.

import { describe, expect, it } from "vitest";
import { previewErrorMessage } from "./preview-runtime";

describe("previewErrorMessage", () => {
  it("asks users to refresh when a cached dynamic module chunk is missing", () => {
    expect(
      previewErrorMessage(
        new TypeError(
          "Failed to fetch dynamically imported module: http://134.175.78.226/assets/typescript--01KeRyl.js",
        ),
      ),
    ).toBe("页面资源已更新，请刷新页面后再运行预览。");
  });

  it("keeps ordinary build errors unchanged", () => {
    expect(previewErrorMessage(new Error("/src/App.tsx 无法解析导入 ./Missing"))).toBe(
      "/src/App.tsx 无法解析导入 ./Missing",
    );
  });
});
