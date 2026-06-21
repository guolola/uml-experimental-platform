// Covers requirement slice behavior independently from WorkspaceSessionProvider.
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceRepository } from "../../../services/workspace-repository";
import { requirementInputFingerprintFor } from "../lib/workspace-context";
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

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

describe("useRequirementsSlice", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("tracks text version and persists text edits", () => {
    vi.useFakeTimers();
    const repository = createRepository();
    const { result } = renderHook(() => useRequirementsSlice(repository));

    act(() => result.current.setRequirementText("新的需求"));

    expect(result.current.requirementText).toBe("新的需求");
    expect(result.current.textVersion).toBe(1);
    expect(repository.updateRequirementText).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(repository.updateRequirementText).toHaveBeenCalledWith("新的需求");
  });

  it("coalesces rapid text edits into the latest persisted value", () => {
    vi.useFakeTimers();
    const repository = createRepository();
    const { result } = renderHook(() => useRequirementsSlice(repository));

    act(() => {
      result.current.setRequirementText("此");
      result.current.setRequirementText("此日历");
      result.current.setRequirementText("此日历仅供公众使用");
      vi.advanceTimersByTime(500);
    });

    expect(repository.updateRequirementText).toHaveBeenCalledTimes(1);
    expect(repository.updateRequirementText).toHaveBeenCalledWith(
      "此日历仅供公众使用",
    );
  });

  it("flushes pending requirement text saves before the debounce timer fires", async () => {
    vi.useFakeTimers();
    const save = deferred<void>();
    const repository = createRepository();
    vi.mocked(repository.updateRequirementText).mockReturnValueOnce(
      save.promise,
    );
    const { result } = renderHook(() => useRequirementsSlice(repository));

    act(() => result.current.setRequirementText("立即生成前的新需求"));

    let flushPromise!: Promise<void>;
    act(() => {
      flushPromise = result.current.flushRequirementTextSave();
    });

    expect(repository.updateRequirementText).toHaveBeenCalledTimes(1);
    expect(repository.updateRequirementText).toHaveBeenCalledWith(
      "立即生成前的新需求",
    );
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(repository.updateRequirementText).toHaveBeenCalledTimes(1);

    save.resolve();
    await act(async () => {
      await flushPromise;
    });
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
    const updatedRules = result.current.rules;
    const updatedFingerprint = requirementInputFingerprintFor("", updatedRules);
    expect(result.current.requirementInputFingerprint).toBe(updatedFingerprint);
    expect(repository.updateRequirementRules).toHaveBeenLastCalledWith(
      updatedRules,
      expect.objectContaining({
        requirementInputFingerprint: updatedFingerprint,
        rulesBasedOnTextVersion: 0,
        rulesVersion: 2,
      }),
    );

    act(() => {
      result.current.clearRequirementRules();
    });

    expect(result.current.rules).toEqual([]);
    const clearedFingerprint = requirementInputFingerprintFor("", []);
    expect(result.current.requirementInputFingerprint).toBe(clearedFingerprint);
    expect(repository.updateRequirementRules).toHaveBeenLastCalledWith(
      [],
      expect.objectContaining({
        requirementInputFingerprint: clearedFingerprint,
        rulesBasedOnTextVersion: 0,
        rulesVersion: 3,
      }),
    );
  });

  it("normalizes duplicate rule ids before persisting and editing rules", () => {
    const repository = createRepository();
    const { result } = renderHook(() => useRequirementsSlice(repository));

    act(() => {
      result.current.commitRequirementRules([
        {
          id: "r1",
          category: "功能需求",
          text: "读者可以检索图书。",
          relatedDiagrams: ["usecase"],
        },
        {
          id: "R1",
          category: "数据需求",
          text: "系统需要记录图书库存。",
          relatedDiagrams: ["class"],
        },
      ]);
    });

    expect(result.current.rules.map((rule) => rule.id)).toEqual(["r1", "R1-2"]);
    expect(repository.updateRequirementRules).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: "r1" }),
        expect.objectContaining({ id: "R1-2" }),
      ]),
      expect.objectContaining({ rulesVersion: 1 }),
    );

    act(() => result.current.deleteRequirementRule("R1-2"));

    expect(result.current.rules.map((rule) => rule.id)).toEqual(["r1"]);
    expect(repository.updateRequirementRules).toHaveBeenLastCalledWith(
      [expect.objectContaining({ id: "r1" })],
      expect.objectContaining({ rulesVersion: 2 }),
    );
  });
});
