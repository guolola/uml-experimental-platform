import { describe, expect, it } from "vitest";
import {
  SHELL_ROUTE_MODULES,
  WORKSPACE_MODULES,
  assertUniqueWorkspaceModules,
  findShellRouteModule,
} from "./workspace-modules";

describe("workspaceModules", () => {
  it("keeps module ids and route tabs unique", () => {
    expect(() => assertUniqueWorkspaceModules()).not.toThrow();
    expect(new Set(WORKSPACE_MODULES.map((module) => module.id)).size).toBe(
      WORKSPACE_MODULES.length,
    );
  });

  it("keeps standalone route metadata discoverable", () => {
    expect(SHELL_ROUTE_MODULES.map((module) => module.route)).toEqual([
      "/workspace",
      "/exam",
      "/tutorial",
      "/about",
    ]);
    expect(findShellRouteModule("/tutorial").label).toBe("教程");
  });
});
