import { describe, expect, it } from "vitest";
import {
  normalizeSnapshotFingerprint,
  snapshotInputFingerprint,
} from "./fingerprint";

describe("snapshotInputFingerprint", () => {
  it("ignores object key insertion order", () => {
    const left = snapshotInputFingerprint({
      requirementText: "订单需求",
      rules: [
        {
          id: "r1",
          category: "功能需求",
          text: "用户提交订单。",
          relatedDiagrams: ["usecase"],
        },
      ],
    });
    const right = snapshotInputFingerprint({
      rules: [
        {
          text: "用户提交订单。",
          relatedDiagrams: ["usecase"],
          category: "功能需求",
          id: "r1",
        },
      ],
      requirementText: "订单需求",
    });

    expect(left).toBe(right);
  });

  it("normalizes legacy JSON fingerprints before comparison", () => {
    const legacyFingerprint = JSON.stringify({
      rules: [
        {
          text: "用户提交订单。",
          relatedDiagrams: ["usecase"],
          category: "功能需求",
          id: "r1",
        },
      ],
      requirementText: "订单需求",
    });

    expect(normalizeSnapshotFingerprint(legacyFingerprint)).toBe(
      snapshotInputFingerprint({
        requirementText: "订单需求",
        rules: [
          {
            id: "r1",
            category: "功能需求",
            text: "用户提交订单。",
            relatedDiagrams: ["usecase"],
          },
        ],
      }),
    );
  });
});
