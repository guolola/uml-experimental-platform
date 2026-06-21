// Verifies deterministic project background matching and fallback behavior.
import { describe, expect, it } from "vitest";
import {
  fallbackProjectBackground,
  matchProjectBackground,
  resolveProjectBackground,
} from "./project-backgrounds";

describe("project backgrounds", () => {
  it("matches common business system keywords from project titles", () => {
    expect(matchProjectBackground("ERP 企业资源计划实验")?.key).toBe("erp");
    expect(matchProjectBackground("CRM 客户关系管理平台")?.key).toBe("crm");
    expect(matchProjectBackground("座位预约预订系统")?.key).toBe("booking");
    expect(matchProjectBackground("质量追溯系统 UML 项目")?.key).toBe("quality_traceability");
  });

  it("prefers saved manual backgrounds before title matching", () => {
    expect(
      resolveProjectBackground({
        id: "project-a",
        name: "CRM 客户系统",
        backgroundKey: "booking",
      }).key,
    ).toBe("booking");
  });

  it("uses stable fallback backgrounds for unmatched titles", () => {
    expect(fallbackProjectBackground("project-a:课程 UML 实验项目").key).toBe(
      fallbackProjectBackground("project-a:课程 UML 实验项目").key,
    );
    expect(resolveProjectBackground({ id: "project-a", name: "课程 UML 实验项目" }).imageUrl).toBeTruthy();
  });
});
