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
  repository: WorkspaceRepository;
  setHistoryItems: Dispatch<SetStateAction<RunHistoryItem[]>>;
  setRunUiState: Dispatch<SetStateAction<RunUiState>>;
}

export function useWorkspaceInitialization({
  applyWorkspaceRecord,
  repository,
  setHistoryItems,
  setRunUiState,
}: WorkspaceInitializationInput) {
  useEffect(() => {
    let active = true;

    void repository
      .loadWorkspace()
      .then((workspace) => {
        if (!active) return;
        applyWorkspaceRecord(workspace);
        void repository
          .listRunHistory()
          .then((items) => {
            if (active) {
              setHistoryItems(items);
            }
          })
          .catch((error) => {
            if (!active) return;
            setRunUiState((current) => ({
              ...current,
              errorMessage:
                error instanceof Error ? error.message : "读取运行历史失败",
            }));
          });
      })
      .catch((error) => {
        if (!active) return;
        setRunUiState((current) => ({
          ...current,
          errorMessage:
            error instanceof Error ? error.message : "加载工作台失败",
        }));
      });

    return () => {
      active = false;
    };
  }, [applyWorkspaceRecord, repository, setHistoryItems, setRunUiState]);
}
