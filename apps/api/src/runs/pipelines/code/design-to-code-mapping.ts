// Builds deterministic design-model to generated-code targets for code-stage prompts and audits.
import {
  designModelCoverageReportSchema,
  designToCodeMappingSchema,
  type CodeDesignDiagramKind,
  type CodeMappingTargetType,
  type DesignDiagramModelSpec,
  type DesignModelCoverageReport,
  type DesignToCodeMapping,
  type DesignToCodeMappingItem,
} from "@uml-platform/contracts";

type DesignElementRef = {
  designModelId: string;
  diagramKind: CodeDesignDiagramKind;
  elementId: string;
  elementKind: string;
  label: string;
};

function compactText(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

function modelId(model: DesignDiagramModelSpec) {
  const explicit = compactText((model as unknown as Record<string, unknown>).modelId);
  return explicit || model.diagramKind;
}

function slug(value: string, fallback: string) {
  const normalized = value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return normalized || fallback;
}

function pascal(value: string, fallback: string) {
  const parts = slug(value, fallback).split("-").filter(Boolean);
  const name = parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  return name || fallback;
}

function ref(
  model: DesignDiagramModelSpec,
  elementId: string,
  elementKind: string,
  label: string,
): DesignElementRef {
  return {
    designModelId: modelId(model),
    diagramKind: model.diagramKind as CodeDesignDiagramKind,
    elementId,
    elementKind,
    label: label || elementId,
  };
}

function relationshipLabel(record: Record<string, unknown>) {
  return [
    compactText(record.label),
    compactText(record.name),
    compactText(record.description),
    `${compactText(record.sourceId)}->${compactText(record.targetId)}`,
  ].find(Boolean) ?? compactText(record.id);
}

function collectDesignElements(model: DesignDiagramModelSpec): DesignElementRef[] {
  switch (model.diagramKind) {
    case "architecture":
      return [
        ...model.packages.map((item) => ref(model, item.id, "architecture-package", item.name)),
        ...model.components.map((item) =>
          ref(model, item.id, "architecture-component", item.name),
        ),
        ...model.relationships.map((item) =>
          ref(model, item.id, "architecture-relationship", relationshipLabel(item)),
        ),
      ];
    case "sequence":
      return [
        ...model.participants.map((item) =>
          ref(model, item.id, "sequence-participant", item.name),
        ),
        ...model.messages.map((item) => ref(model, item.id, "sequence-message", item.name)),
        ...model.fragments.map((item) => ref(model, item.id, "sequence-fragment", item.label)),
      ];
    case "activity":
      return [
        ...model.nodes.map((item) =>
          ref(model, item.id, `activity-${item.type}`, compactText(item.name) || item.id),
        ),
        ...model.relationships.map((item) =>
          ref(model, item.id, "activity-relationship", relationshipLabel(item)),
        ),
      ];
    case "class":
      return [
        ...model.classes.map((item) => ref(model, item.id, "class", item.name)),
        ...model.interfaces.map((item) => ref(model, item.id, "interface", item.name)),
        ...model.enums.map((item) => ref(model, item.id, "enum", item.name)),
        ...model.relationships.map((item) =>
          ref(model, item.id, "class-relationship", relationshipLabel(item)),
        ),
      ];
    case "component":
      return [
        ...model.components.map((item) => ref(model, item.id, "component", item.name)),
        ...model.interfaces.map((item) => ref(model, item.id, "component-interface", item.name)),
        ...model.relationships.map((item) =>
          ref(model, item.id, "component-relationship", relationshipLabel(item)),
        ),
      ];
    case "deployment":
      return [
        ...model.nodes.map((item) => ref(model, item.id, "deployment-node", item.name)),
        ...model.databases.map((item) =>
          ref(model, item.id, "deployment-database", item.name),
        ),
        ...model.components.map((item) =>
          ref(model, item.id, "deployment-component", item.name),
        ),
        ...model.externalSystems.map((item) =>
          ref(model, item.id, "external-system", item.name),
        ),
        ...model.artifacts.map((item) =>
          ref(model, item.id, "deployment-artifact", item.name),
        ),
        ...model.relationships.map((item) =>
          ref(model, item.id, "deployment-relationship", relationshipLabel(item)),
        ),
      ];
    case "table":
      return [
        ...model.tables.flatMap((table) => [
          ref(model, table.id, "table", table.name),
          ...table.columns.map((column) =>
            ref(
              model,
              `${table.id}.${column.id}`,
              "table-column",
              `${table.name}.${column.name}`,
            ),
          ),
        ]),
        ...model.relationships.map((item) =>
          ref(model, item.id, "table-relationship", relationshipLabel(item)),
        ),
      ];
  }
}

function targetFor(ref: DesignElementRef): {
  targetType: CodeMappingTargetType;
  targetPath: string;
  rationale: string;
} {
  const readableId = slug(ref.elementId, "design-element");
  const readableLabel = slug(ref.label, readableId);
  const componentName = pascal(ref.label, pascal(ref.elementId, "MappedComponent"));
  switch (ref.diagramKind) {
    case "architecture":
      if (ref.elementKind === "architecture-package") {
        return {
          targetType: "feature-module",
          targetPath: `/src/features/${readableLabel}/index.ts`,
          rationale: "总体架构图包决定 feature 模块边界。",
        };
      }
      return {
        targetType: ref.elementKind === "architecture-component" ? "component" : "feature-module",
        targetPath:
          ref.elementKind === "architecture-component"
            ? `/src/components/${componentName}.tsx`
            : "/src/components/WorkspaceShell.tsx",
        rationale: "总体架构图组件和依赖决定页面组合、主导航和模块依赖。",
      };
    case "sequence":
      return {
        targetType:
          ref.elementKind === "sequence-fragment"
            ? "state-machine"
            : ref.elementKind === "sequence-participant"
              ? "component"
              : "mock-service",
        targetPath:
          ref.elementKind === "sequence-participant"
            ? `/src/components/${componentName}.tsx`
            : "/src/services/mock-services.ts",
        rationale: "用例实现设计决定用户操作、handler、mock service 调用顺序和异常分支。",
      };
    case "activity":
      return {
        targetType:
          ref.elementKind === "activity-decision" || ref.elementKind.includes("relationship")
            ? "route-state"
            : "page",
        targetPath:
          ref.elementKind === "activity-decision" || ref.elementKind.includes("relationship")
            ? "/src/components/WorkspaceShell.tsx"
            : `/src/pages/${pascal(ref.label, pascal(ref.elementId, "MappedPage"))}.tsx`,
        rationale: "界面关系图决定页面流、模拟路由、条件渲染和状态切换。",
      };
    case "class":
      return {
        targetType: "domain-type",
        targetPath: "/src/domain/types.ts",
        rationale: "设计类图决定实体类型、接口、枚举、关系和状态结构。",
      };
    case "component":
      return {
        targetType: ref.elementKind === "component" ? "component" : "feature-module",
        targetPath:
          ref.elementKind === "component"
            ? `/src/components/${componentName}.tsx`
            : "/src/components/component-contracts.ts",
        rationale: "组件关系图决定前端组件拆分、组件接口和复用依赖方向。",
      };
    case "deployment":
      return {
        targetType:
          ref.elementKind === "external-system" ? "mock-service" : "environment-boundary",
        targetPath:
          ref.elementKind === "external-system"
            ? "/src/services/mock-services.ts"
            : "/src/data/mock-data.ts",
        rationale: "部署设计只决定前端环境提示、外部系统 mock 边界和接口占位。",
      };
    case "table":
      return {
        targetType: ref.elementKind === "table-column" ? "domain-type" : "mock-data",
        targetPath:
          ref.elementKind === "table-column" ? "/src/domain/types.ts" : "/src/data/mock-data.ts",
        rationale: "数据库设计决定 mock 数据结构、列表详情字段和 CRUD 表单字段。",
      };
  }
}

export function buildDesignToCodeMapping(
  designModels: DesignDiagramModelSpec[],
  generatedAt = new Date().toISOString(),
): DesignToCodeMapping {
  const diagnostics: string[] = [];
  const items: DesignToCodeMappingItem[] = [];
  for (const model of designModels) {
    const refs = collectDesignElements(model);
    if (refs.length === 0) {
      diagnostics.push(`设计模型缺少可实现依据：${modelId(model)}(${model.diagramKind})`);
      continue;
    }
    for (const element of refs) {
      items.push({
        ...element,
        ...targetFor(element),
      });
    }
  }
  return designToCodeMappingSchema.parse({
    generatedAt,
    items,
    diagnostics,
  });
}

export function buildDesignModelCoverageReport({
  designModels,
  mapping,
  strictMode = false,
  files,
  generatedAt = new Date().toISOString(),
}: {
  designModels: DesignDiagramModelSpec[];
  mapping: DesignToCodeMapping;
  strictMode?: boolean;
  files?: Record<string, string>;
  generatedAt?: string;
}): DesignModelCoverageReport {
  const diagnostics = [...mapping.diagnostics];
  const models = designModels.map((model) => {
    const id = modelId(model);
    const refs = collectDesignElements(model);
    const mapped = mapping.items.filter((item) => item.designModelId === id);
    const mappedIds = new Set(mapped.map((item) => item.elementId));
    const missingTargetPaths = files
      ? Array.from(new Set(mapped.map((item) => item.targetPath))).filter(
          (path) => !files[path],
        )
      : [];
    const missingElements = refs
      .filter((item) => !mappedIds.has(item.elementId))
      .map((item) => `${item.elementKind}:${item.elementId}`);
    if (refs.length === 0) {
      missingElements.push(`${model.diagramKind}:${id}`);
    }
    for (const path of missingTargetPaths) {
      missingElements.push(`target-file:${path}`);
    }
    const status =
      mapped.length === 0
        ? "unmapped"
        : missingElements.length > 0
          ? "partial"
          : "covered";
    if (status !== "covered") {
      diagnostics.push(
        `设计模型映射不完整：${id}(${model.diagramKind}) -> ${status}`,
      );
    }
    return {
      designModelId: id,
      diagramKind: model.diagramKind,
      mappedElementCount: mapped.length,
      targetPaths: Array.from(new Set(mapped.map((item) => item.targetPath))),
      status,
      missingElements,
      message:
        status === "covered"
          ? `设计模型 ${id} 已映射到 ${mapped.length} 个代码目标。`
          : `设计模型缺少可实现依据或映射不完整：${id}`,
    };
  });
  return designModelCoverageReportSchema.parse({
    generatedAt,
    strictMode,
    models,
    diagnostics,
    passed: models.every((entry) => entry.status === "covered"),
  });
}
