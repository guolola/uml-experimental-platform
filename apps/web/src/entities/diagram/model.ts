import type { DesignDiagramKind, DiagramKind } from "@uml-platform/contracts";

export type DiagramType = DiagramKind;
export type DesignDiagramType = DesignDiagramKind;

export const DIAGRAM_META: Record<
  DiagramType,
  { label: string; english: string; description: string }
> = {
  usecase: {
    label: "用例模型",
    english: "Use Case Diagram",
    description: "系统边界、角色与用例关系",
  },
  class: {
    label: "领域概念模型",
    english: "Class Diagram",
    description: "领域实体、属性与关联",
  },
  activity: {
    label: "界面关系",
    english: "Activity Diagram",
    description: "界面跳转与操作流程",
  },
  deployment: {
    label: "部署模型",
    english: "Deployment Diagram",
    description: "物理节点与网络拓扑",
  },
};

export const DIAGRAM_ORDER: DiagramType[] = [
  "usecase",
  "class",
  "activity",
  "deployment",
];

export const DESIGN_DIAGRAM_META: Record<
  DesignDiagramType,
  { label: string; english: string; description: string }
> = {
  sequence: {
    label: "顺序图",
    english: "Sequence Diagram",
    description: "对象间的方法调用时序与动态行为",
  },
  activity: {
    label: "界面关系",
    english: "Activity Diagram",
    description: "全局业务逻辑流转、并行与分支",
  },
  class: {
    label: "领域概念模型",
    english: "Class Diagram",
    description: "实体、接口、聚合根及静态关联",
  },
  deployment: {
    label: "部署模型",
    english: "Deployment Diagram",
    description: "组件在 Pod、服务器、数据库上的分布",
  },
};

export const DESIGN_DIAGRAM_ORDER: DesignDiagramType[] = [
  "sequence",
  "activity",
  "deployment",
  "class",
];
