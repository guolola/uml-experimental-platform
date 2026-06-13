// Loads workspace edit and generation permissions for the session provider.
import { useEffect, useState } from "react";
import type { WorkspaceRepository } from "../../../services/workspace-repository";

export function useWorkspacePermissions(repository: WorkspaceRepository) {
  const [workspacePermissions, setWorkspacePermissions] = useState({
    canUpdateWorkspace: true,
    canStartRuns: true,
    reason: null as string | null,
  });

  useEffect(() => {
    if (!repository.getProjectCapabilities) {
      setWorkspacePermissions({
        canUpdateWorkspace: true,
        canStartRuns: true,
        reason: null,
      });
      return;
    }
    let active = true;
    repository
      .getProjectCapabilities()
      .then((capabilities) => {
        if (!active) return;
        const canUpdateWorkspace = capabilities.includes("update_project");
        const canStartRuns = capabilities.includes("start_runs");
        setWorkspacePermissions({
          canUpdateWorkspace,
          canStartRuns,
          reason:
            canUpdateWorkspace && canStartRuns
              ? null
              : "当前项目角色仅允许查看，不能编辑内容或启动生成。",
        });
      })
      .catch(() => {
        if (!active) return;
        setWorkspacePermissions({
          canUpdateWorkspace: false,
          canStartRuns: false,
          reason: "无法确认当前项目权限，已临时禁用编辑和生成操作。",
        });
      });
    return () => {
      active = false;
    };
  }, [repository]);

  return workspacePermissions;
}
