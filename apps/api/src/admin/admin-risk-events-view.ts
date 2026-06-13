// Owns the admin risk-event read model and event shape used by admin routes.
export type AdminRiskEvent = {
  id: string;
  eventType: string;
  severity: "low" | "medium" | "high" | "critical";
  actorUserId: string | null;
  projectId: string | null;
  targetType: string;
  targetId: string | null;
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export function listAdminRiskEvents(readRiskEvents: () => AdminRiskEvent[]) {
  return readRiskEvents();
}

export function buildAdminRiskEventsView(
  readRiskEvents: () => AdminRiskEvent[],
) {
  return {
    generatedAt: new Date().toISOString(),
    riskEvents: listAdminRiskEvents(readRiskEvents),
  };
}
