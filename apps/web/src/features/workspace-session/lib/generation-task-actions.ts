// Owns generation task list selection, creation, and status update actions.
import { useCallback, useMemo, useState } from "react";
import type { DocumentKind } from "@uml-platform/contracts";
import type {
  GenerationTask,
  GenerationTaskKind,
} from "../model/session-state";
import {
  createClientTaskId,
  createGenerationTask,
  isTaskClearableCompleted,
  isTaskActive,
} from "./generation-tasks";

const MAX_VISIBLE_GENERATION_TASKS = 30;

function retainGenerationTasksWithinCapacity(tasks: GenerationTask[]) {
  const activeCount = tasks.filter(isTaskActive).length;
  const terminalCapacity = Math.max(
    MAX_VISIBLE_GENERATION_TASKS - activeCount,
    0,
  );
  let terminalCount = 0;
  return tasks.filter((task) => {
    if (isTaskActive(task)) return true;
    if (terminalCount >= terminalCapacity) return false;
    terminalCount += 1;
    return true;
  });
}

export function useGenerationTaskActions() {
  const [generationTasks, setGenerationTasks] = useState<GenerationTask[]>([]);
  const [selectedGenerationTaskId, setSelectedGenerationTaskId] = useState<
    string | null
  >(null);

  const selectGenerationTask = useCallback((id: string) => {
    setSelectedGenerationTaskId(id);
  }, []);

  const clearCompletedGenerationTasks = useCallback(() => {
    setGenerationTasks((current) => {
      const retained = current.filter(
        (task) => !isTaskClearableCompleted(task),
      );
      setSelectedGenerationTaskId((selectedId) =>
        selectedId && retained.some((task) => task.clientTaskId === selectedId)
          ? selectedId
          : (retained[0]?.clientTaskId ?? null),
      );
      return retained;
    });
  }, []);

  const enqueueGenerationTask = useCallback(
    (input: {
      kind: GenerationTaskKind;
      title: string;
      providerModel: string | null;
      documentKind?: DocumentKind;
      message: string;
      startedAtMs: number;
      subtasks?: GenerationTask["subtasks"];
    }) => {
      const clientTaskId = createClientTaskId(input.kind);
      const startedAt = new Date(input.startedAtMs).toISOString();
      const task = createGenerationTask({
        clientTaskId,
        kind: input.kind,
        title: input.title,
        providerModel: input.providerModel,
        documentKind: input.documentKind,
        message: input.message,
        subtasks: input.subtasks,
        startedAt,
      });
      setGenerationTasks((current) =>
        retainGenerationTasksWithinCapacity([task, ...current]),
      );
      setSelectedGenerationTaskId(clientTaskId);
      return clientTaskId;
    },
    [],
  );

  const updateGenerationTask = useCallback(
    (
      clientTaskId: string,
      updater: (task: GenerationTask) => GenerationTask,
    ) => {
      setGenerationTasks((current) =>
        current.map((task) =>
          task.clientTaskId === clientTaskId ? updater(task) : task,
        ),
      );
    },
    [],
  );

  const visibleGenerationTask = useMemo(() => {
    if (selectedGenerationTaskId) {
      const selected = generationTasks.find(
        (task) => task.clientTaskId === selectedGenerationTaskId,
      );
      if (selected) return selected;
    }
    return generationTasks.find(isTaskActive) ?? generationTasks[0] ?? null;
  }, [generationTasks, selectedGenerationTaskId]);

  const generating = generationTasks.some(
    (task) => task.kind !== "document" && isTaskActive(task),
  );

  return {
    clearCompletedGenerationTasks,
    enqueueGenerationTask,
    generating,
    generationTasks,
    selectGenerationTask,
    selectedGenerationTaskId,
    updateGenerationTask,
    visibleGenerationTask,
  };
}
