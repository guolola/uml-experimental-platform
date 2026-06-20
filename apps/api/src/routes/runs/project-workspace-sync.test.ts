// Verifies terminal project runs reconcile their snapshots into workspace state without a browser client.
import assert from "node:assert/strict";
import test from "node:test";
import type {
  DesignDiagramModelSpec,
  DiagramModelSpec,
} from "@uml-platform/contracts";
import { createInMemoryAuthStore } from "../../auth/in-memory-auth-store.js";
import { createEmptyCodeSnapshot, createEmptyDesignSnapshot, createEmptyDocumentSnapshot, createEmptySnapshot } from "../../runs/records/snapshots.js";
import { emitEvent, type RunRecord } from "../../runs/records/run-record-store.js";
import { buildRequirementBaseline } from "../../runs/baselines/requirement-baseline.js";
import {
  attachProjectWorkspaceSync,
  createProjectWorkspaceSync,
} from "./project-workspace-sync.js";

const rule = {
  id: "REQ-001",
  category: "功能需求" as const,
  text: "用户可以发布文章并由管理员审核。",
  relatedDiagrams: ["usecase", "class"] as const,
};

const useCaseModel: DiagramModelSpec = {
  diagramKind: "usecase",
  title: "用例模型",
  summary: "文章发布与审核用例。",
  notes: [],
  actors: [],
  useCases: [],
  systemBoundaries: [],
  relationships: [],
};

const designClassModel: DesignDiagramModelSpec = {
  diagramKind: "class",
  modelId: "class:design",
  title: "设计类图",
  summary: "文章发布设计类。",
  notes: [],
  classes: [],
  interfaces: [],
  enums: [],
  relationships: [],
};

const interfaceModel: DesignDiagramModelSpec = {
  diagramKind: "activity",
  modelId: "activity:design-interface-relations",
  title: "界面关系图",
  summary: "文章发布界面跳转。",
  notes: [],
  swimlanes: [],
  nodes: [],
  relationships: [],
};

const componentModel: DesignDiagramModelSpec = {
  diagramKind: "component",
  modelId: "component:design",
  title: "组件关系图",
  summary: "文章发布组件。",
  notes: [],
  components: [],
  interfaces: [],
  relationships: [],
};

const deploymentModel: DesignDiagramModelSpec = {
  diagramKind: "deployment",
  modelId: "deployment:design",
  title: "部署设计",
  summary: "文章发布部署。",
  notes: [],
  nodes: [],
  databases: [],
  components: [],
  externalSystems: [],
  artifacts: [],
  relationships: [],
};

async function createWorkspaceSyncFixture() {
  const authStore = createInMemoryAuthStore();
  const user = await authStore.createUser({
    email: "workspace-sync@example.com",
    displayName: "Workspace Sync",
    passwordHash: "test",
    emailVerified: true,
  });
  assert.ok(user);
  const { project } = await authStore.createProject({
    ownerUserId: user.id,
    name: "Workspace Sync Project",
    description: null,
    visibility: "private",
  });
  return {
    authStore,
    project,
    user,
    syncProjectWorkspace: createProjectWorkspaceSync(authStore),
  };
}

function attachAndComplete(record: RunRecord, syncProjectWorkspace: ReturnType<typeof createProjectWorkspaceSync>) {
  attachProjectWorkspaceSync(record, syncProjectWorkspace);
  emitEvent(record, { type: "completed", snapshot: record.snapshot });
}

async function waitForWorkspace(
  read: () => Promise<Record<string, unknown>>,
  predicate: (state: Record<string, unknown>) => boolean,
) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = await read();
    if (predicate(state)) return state;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  const state = await read();
  assert.equal(predicate(state), true);
  return state;
}

test("terminal requirement snapshots auto-sync into project workspace", async () => {
  const { authStore, project, user, syncProjectWorkspace } =
    await createWorkspaceSyncFixture();
  const snapshot = createEmptySnapshot("run-requirement-sync", rule.text, ["usecase"], [rule], {
    models: [useCaseModel],
  });
  snapshot.status = "completed";
  const record: RunRecord = {
    snapshot,
    events: [],
    listeners: new Set(),
    terminal: false,
    metadata: {
      projectId: project.id,
      userId: user.id,
      createdAt: "2026-06-20T00:00:00.000Z",
    },
  };

  attachAndComplete(record, syncProjectWorkspace);

  const state = await waitForWorkspace(
    async () => (await authStore.getProjectWorkspace(project.id)).state,
    (candidate) => Boolean((candidate.models as Record<string, unknown> | undefined)?.usecase),
  );
  assert.equal((state.models as Record<string, { diagramKind: string }>).usecase.diagramKind, "usecase");
});

test("terminal design snapshots auto-sync successful design models into project workspace", async () => {
  const { authStore, project, user, syncProjectWorkspace } =
    await createWorkspaceSyncFixture();
  const baseline = buildRequirementBaseline({
    runId: "design-baseline",
    requirementText: rule.text,
    rules: [rule],
  });
  const snapshot = createEmptyDesignSnapshot("run-design-sync", {
    selectedDiagrams: ["class", "activity", "component", "deployment"],
    requestedDiagrams: ["activity", "deployment"],
    requirementBaseline: baseline,
    requirementModels: [useCaseModel],
    requirementModelTraceability: [],
  });
  snapshot.models = [
    designClassModel,
    interfaceModel,
    componentModel,
    deploymentModel,
  ];
  snapshot.status = "completed";
  const record: RunRecord = {
    snapshot,
    events: [],
    listeners: new Set(),
    terminal: false,
    metadata: {
      projectId: project.id,
      userId: user.id,
      createdAt: "2026-06-20T00:00:00.000Z",
    },
  };

  attachAndComplete(record, syncProjectWorkspace);

  const state = await waitForWorkspace(
    async () => (await authStore.getProjectWorkspace(project.id)).state,
    (candidate) =>
      Boolean(
        (candidate.designModels as Record<string, unknown> | undefined)?.[
          "class:design"
        ],
      ),
  );
  const designModels = state.designModels as Record<string, unknown>;
  assert.ok(designModels["class:design"]);
  assert.ok(designModels["activity:design-interface-relations"]);
  assert.ok(designModels["component:design"]);
  assert.ok(designModels["deployment:design"]);
});

test("terminal code snapshots auto-sync generated files while document snapshots are skipped", async () => {
  const { authStore, project, user, syncProjectWorkspace } =
    await createWorkspaceSyncFixture();
  const codeSnapshot = createEmptyCodeSnapshot("run-code-sync", {
    requirementText: rule.text,
    rules: [rule],
    designModels: [designClassModel],
  });
  codeSnapshot.files = {
    "/src/App.tsx": "export default function App() { return null; }",
  };
  codeSnapshot.status = "completed";
  attachAndComplete(
    {
      snapshot: codeSnapshot,
      events: [],
      listeners: new Set(),
      terminal: false,
      metadata: {
        projectId: project.id,
        userId: user.id,
        createdAt: "2026-06-20T00:00:00.000Z",
      },
    },
    syncProjectWorkspace,
  );

  await waitForWorkspace(
    async () => (await authStore.getProjectWorkspace(project.id)).state,
    (candidate) =>
      Boolean((candidate.codeFiles as Record<string, string> | undefined)?.["/src/App.tsx"]),
  );

  const beforeDocument = await authStore.getProjectWorkspace(project.id);
  const documentSnapshot = createEmptyDocumentSnapshot("run-document-sync", {
    documentKind: "requirementsSpec",
    requirementText: rule.text,
  });
  documentSnapshot.status = "completed";
  attachAndComplete(
    {
      snapshot: documentSnapshot,
      events: [],
      listeners: new Set(),
      terminal: false,
      metadata: {
        projectId: project.id,
        userId: user.id,
        createdAt: "2026-06-20T00:00:00.000Z",
      },
    },
    syncProjectWorkspace,
  );

  await new Promise((resolve) => setTimeout(resolve, 20));
  const afterDocument = await authStore.getProjectWorkspace(project.id);
  assert.equal(afterDocument.version, beforeDocument.version);
});
