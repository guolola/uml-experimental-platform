// Loads the initial workspace snapshot and run history for the session provider.
import {
  useEffect,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { WorkspaceRecord } from "../../../entities/workspace/model";
import type { RunHistoryItem } from "../../../entities/run-history";
import type { WorkspaceRepository } from "../../../services/workspace-repository";
import type { createEmptyRunUiState } from "./run-ui-state";

type RunUiState = ReturnType<typeof createEmptyRunUiState>;

interface WorkspaceInitializationInput {
  applyWorkspaceRecord: (workspace: WorkspaceRecord) => void;
  getHasActiveGenerationTask?: () => boolean;
  repository: WorkspaceRepository;
  setHistoryItems: Dispatch<SetStateAction<RunHistoryItem[]>>;
  setRunUiState: Dispatch<SetStateAction<RunUiState>>;
}

export function useWorkspaceInitialization({
  applyWorkspaceRecord,
  getHasActiveGenerationTask,
  repository,
  setHistoryItems,
  setRunUiState,
}: WorkspaceInitializationInput) {
  useEffect(() => {
    let active = true;

    const refreshHistory = async () => {
      try {
        const items = await repository.listRunHistory();
        if (!active) return;
        setHistoryItems(items);
      } catch (error) {
        if (!active) return;
        setRunUiState((current) => ({
          ...current,
          errorMessage:
            error instanceof Error ? error.message : "读取运行历史失败",
        }));
      }
    };

    const refreshWorkspaceAndHistory = async (applyWorkspace: boolean) => {
      if (applyWorkspace) {
        try {
          const workspace = await repository.loadWorkspace();
          if (!active) return;
          applyWorkspaceRecord(workspace);
        } catch (error) {
          if (!active) return;
          setRunUiState((current) => ({
            ...current,
            errorMessage:
              error instanceof Error ? error.message : "加载工作台失败",
          }));
          return;
        }
      }
      await refreshHistory();
    };

    const refreshAfterResume = () => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      ) {
        return;
      }
      const hasActiveGenerationTask = getHasActiveGenerationTask?.() ?? false;
      void refreshWorkspaceAndHistory(!hasActiveGenerationTask);
    };

    void refreshWorkspaceAndHistory(true);

    if (typeof window !== "undefined") {
      window.addEventListener("online", refreshAfterResume);
    }
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", refreshAfterResume);
    }

    return () => {
      active = false;
      if (typeof window !== "undefined") {
        window.removeEventListener("online", refreshAfterResume);
      }
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", refreshAfterResume);
      }
    };
  }, [
    applyWorkspaceRecord,
    getHasActiveGenerationTask,
    repository,
    setHistoryItems,
    setRunUiState,
  ]);
}
