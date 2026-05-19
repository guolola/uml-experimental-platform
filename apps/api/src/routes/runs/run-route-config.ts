// Defines the stable public routes for each run kind.
export const RUN_ROUTE_CONFIG = {
  requirements: {
    startPath: "/api/runs",
    snapshotPath: "/api/runs/:runId",
    eventsPath: "/api/runs/:runId/events",
    notFoundMessage: "Run not found",
  },
  design: {
    startPath: "/api/design-runs",
    snapshotPath: "/api/design-runs/:runId",
    eventsPath: "/api/design-runs/:runId/events",
    notFoundMessage: "Design run not found",
  },
  code: {
    startPath: "/api/code-runs",
    snapshotPath: "/api/code-runs/:runId",
    eventsPath: "/api/code-runs/:runId/events",
    notFoundMessage: "Code run not found",
    lostSnapshotMessage: "代码生成任务已丢失，可能是本地 API 服务重启，请重新生成",
  },
  document: {
    startPath: "/api/document-runs",
    snapshotPath: "/api/document-runs/:runId",
    eventsPath: "/api/document-runs/:runId/events",
    downloadPath: "/api/document-runs/:runId/download",
    notFoundMessage: "Document run not found",
  },
} as const;
