import { describe, expect, it } from "vitest";
import {
  feasibilityInputsSchema,
  snapshotInputFingerprint,
} from "@uml-platform/contracts";
import type { WorkspaceRecord } from "../../../entities/workspace/model";
import {
  createRequirementBaseline,
  createRule,
  createWorkspaceRecord,
} from "../../../test/workspace-test-utils";
import { feasibilityArtifactState } from "./feasibility-freshness";

function readyWorkspace() {
  const rules = [createRule()];
  const requirementBaseline = createRequirementBaseline();
  const feasibilityInputs = feasibilityInputsSchema.parse({});
  const feasibilityContextModel = {
    diagramKind: "context",
    modelId: "context",
  } as unknown as NonNullable<WorkspaceRecord["feasibilityContextModel"]>;
  const feasibilityImplementationPlan = {
    candidates: [
      {
        id: "candidate-1",
        implementation: {},
      },
    ],
    recommendedCandidateId: "candidate-1",
  } as unknown as NonNullable<
    WorkspaceRecord["feasibilityImplementationPlan"]
  >;

  return createWorkspaceRecord({
    rules,
    requirementBaseline,
    feasibilityInputs,
    feasibilityContextModel,
    feasibilityContextPlantUml: "@startuml\n@enduml",
    feasibilityContextSvg: "<svg />",
    feasibilityContextFingerprint: snapshotInputFingerprint({
      rules,
      requirementBaseline,
    }),
    feasibilityImplementationPlan,
    feasibilityImplementationFingerprint: snapshotInputFingerprint({
      rules,
      contextModel: feasibilityContextModel,
      inputs: feasibilityInputs,
    }),
  });
}

describe("feasibilityArtifactState", () => {
  it("marks a complete current analysis ready for reporting", () => {
    const state = feasibilityArtifactState(readyWorkspace());

    expect(state.contextStatus).toBe("ready");
    expect(state.implementationStatus).toBe("ready");
    expect(state.reportReady).toBe(true);
    expect(state.requiredArtifacts).toEqual([]);
  });

  it("requires both artifacts when context is missing", () => {
    const state = feasibilityArtifactState(
      createWorkspaceRecord({ rules: [createRule()] }),
    );

    expect(state.contextStatus).toBe("missing");
    expect(state.implementationStatus).toBe("missing");
    expect(state.reportReady).toBe(false);
    expect(state.requiredArtifacts).toEqual(["context", "implementation"]);
  });

  it("requires both artifacts when context is stale", () => {
    const workspace = readyWorkspace();
    workspace.feasibilityContextFingerprint = "fp:v2:stale";

    const state = feasibilityArtifactState(workspace);

    expect(state.contextStatus).toBe("stale");
    expect(state.requiredArtifacts).toEqual(["context", "implementation"]);
  });

  it("requires only implementation when current context has a stale plan", () => {
    const workspace = readyWorkspace();
    workspace.feasibilityImplementationFingerprint = "fp:v2:stale";

    const state = feasibilityArtifactState(workspace);

    expect(state.contextStatus).toBe("ready");
    expect(state.implementationStatus).toBe("stale");
    expect(state.requiredArtifacts).toEqual(["implementation"]);
  });
});
