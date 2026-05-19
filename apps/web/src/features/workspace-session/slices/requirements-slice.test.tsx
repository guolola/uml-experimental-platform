// Covers requirement slice behavior independently from WorkspaceSessionProvider.
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceRepository } from "../../../services/workspace-repository";
import { useRequirementsSlice } from "./requirements-slice";

function createRepository(): WorkspaceRepository {
  return {
    loadWorkspace: vi.fn(),
    updateRequirementText: vi.fn(),
    updateRequirementRules: vi.fn(),
    startRun: vi.fn(),
    subscribeToRun: vi.fn(),
    getRunSnapshot: vi.fn(),
    renderPlantUml: vi.fn(),
    testProviderSettings: vi.fn(),
    saveRunHistory: vi.fn(),
    listRunHistory: vi.fn(),
    restoreRunHistory: vi.fn(),
    deleteRunHistory: vi.fn(),
    clearRunHistory: vi.fn(),
  };
}

describe("useRequirementsSlice", () => {
  it("tracks text version and persists text edits", () => {
    const repository = createRepository();
    const { result } = renderHook(() => useRequirementsSlice(repository));

    act(() => result.current.setRequirementText("新的需求"));

    expect(result.current.requirementText).toBe("新的需求");
    expect(result.current.textVersion).toBe(1);
    expect(repository.updateRequirementText).toHaveBeenCalledWith("新的需求");
  });

  it("creates and updates requirement rules with stable ids", () => {
    const repository = createRepository();
    const { result } = renderHook(() => useRequirementsSlice(repository));

    act(() => {
      result.current.createRequirementRule({
        category: "功能需求",
        text: "登录",
        relatedDiagrams: [],
      });
    });

    expect(result.current.rules).toMatchObject([
      { id: "r1", text: "登录", relatedDiagrams: ["usecase"] },
    ]);

    act(() => {
      result.current.updateRequirementRule("r1", {
        relatedDiagrams: ["activity"],
      });
    });

    expect(result.current.rulesForDiagram("activity")).toHaveLength(1);
    expect(repository.updateRequirementRules).toHaveBeenCalled();
  });
});
