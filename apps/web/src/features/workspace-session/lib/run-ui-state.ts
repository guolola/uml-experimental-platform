// Provides the empty run UI status used before and after generation tasks.

import type { RunStatus } from "../../../entities/workspace/model";

export function createEmptyRunUiState() {
  return {
    runStatus: "idle" as RunStatus,
    runProgress: 0,
    runMessage: null as string | null,
    errorMessage: null as string | null,
  };
}
