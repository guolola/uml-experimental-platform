// Coordinates active generation runs so stale async events cannot update session state.
import { useCallback, useMemo, useRef } from "react";

type RunScope = "requirements" | "design" | "code" | "workspace";

export function useRunController() {
  const nextRunRequestIdRef = useRef(0);
  const activeRunRequestIdRef = useRef<Record<RunScope, number>>({
    requirements: 0,
    design: 0,
    code: 0,
    workspace: 0,
  });

  const beginRun = useCallback((scope: RunScope = "workspace") => {
    nextRunRequestIdRef.current += 1;
    activeRunRequestIdRef.current[scope] = nextRunRequestIdRef.current;
    return nextRunRequestIdRef.current;
  }, []);

  const isCurrentRun = useCallback((runRequestId: number, scope: RunScope = "workspace") => {
    return runRequestId === activeRunRequestIdRef.current[scope];
  }, []);

  return useMemo(
    () => ({
      beginRun,
      isCurrentRun,
    }),
    [beginRun, isCurrentRun],
  );
}
