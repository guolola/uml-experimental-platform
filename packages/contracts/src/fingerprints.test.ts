// Verifies design fingerprints ignore non-contract metadata while retaining semantic model changes.
import assert from "node:assert/strict";
import test from "node:test";
import { designInputFingerprint } from "./fingerprints.js";

function activityModel() {
  return {
    diagramKind: "activity" as const,
    title: "登录流程",
    summary: "验证码登录流程",
    notes: [],
    swimlanes: [],
    nodes: [
      { id: "start", type: "start" as const, name: "开始" },
      {
        id: "send",
        type: "activity" as const,
        name: "发送验证码",
        input: [],
        output: [],
      },
      { id: "end", type: "end" as const, name: "结束" },
    ],
    relationships: [
      {
        id: "flow",
        type: "control_flow" as const,
        sourceId: "start",
        targetId: "send",
        condition: "继续",
      },
    ],
  };
}

test("design fingerprint ignores unknown activity relationship labels", () => {
  const model = activityModel();
  const withEditorOnlyLabel = structuredClone(model) as Record<string, unknown> & {
    relationships: Array<Record<string, unknown>>;
  };
  withEditorOnlyLabel.relationships[0]!.label = "新关系";

  assert.equal(
    designInputFingerprint([withEditorOnlyLabel], []),
    designInputFingerprint([model], []),
  );
});

test("design fingerprint changes when an activity relationship endpoint changes", () => {
  const model = activityModel();
  const changed = structuredClone(model);
  changed.relationships[0]!.targetId = "end";

  assert.notEqual(
    designInputFingerprint([changed], []),
    designInputFingerprint([model], []),
  );
});
