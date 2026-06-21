// Derives frontend downstream generation gates from run evidence packages stored in history.
import type { EvidencePackage } from "@uml-platform/contracts";
import type { RunHistoryItem } from "../../../entities/run-history";

export type EvidenceGateRunKind = "requirements" | "design" | "code" | "document";

export interface BlockingEvidencePackage {
  item: RunHistoryItem;
  evidencePackage: EvidencePackage;
  reason: string;
}

function historyRunKind(item: RunHistoryItem): EvidenceGateRunKind | null {
  if (
    item.runKind === "requirements" ||
    item.runKind === "design" ||
    item.runKind === "code" ||
    item.runKind === "document"
  ) {
    return item.runKind;
  }
  if (!item.snapshot) return null;
  if ("documentKind" in item.snapshot) return "document";
  if ("files" in item.snapshot) return "code";
  if ("requirementModels" in item.snapshot) return "design";
  return "requirements";
}

function evidenceForHistoryItem(item: RunHistoryItem) {
  return item.snapshot?.evidencePackage ?? null;
}

function sortedHistoryItems(items: RunHistoryItem[]) {
  return [...items].sort((left, right) => {
    const rightTime = new Date(right.createdAt).getTime();
    const leftTime = new Date(left.createdAt).getTime();
    return (Number.isFinite(rightTime) ? rightTime : 0) -
      (Number.isFinite(leftTime) ? leftTime : 0);
  });
}

export function evidencePackageBlockReason(packageValue: EvidencePackage | null) {
  if (!packageValue) return null;
  const pendingReviewCount = packageValue.reviewItems.filter(
    (item) => item.status === "pending",
  ).length;
  const pendingBrowserEvidenceCount = packageValue.browserEvidence.filter(
    (item) => item.status === "pending-review",
  ).length;
  const failedBrowserEvidenceCount = packageValue.browserEvidence.filter(
    (item) => item.status === "failed",
  ).length;

  if (packageValue.status === "failed") {
    return "证据包验证失败，请先在运行历史中复核失败证据后再继续生成。";
  }
  if (
    packageValue.status === "blocked" ||
    pendingReviewCount > 0 ||
    pendingBrowserEvidenceCount > 0 ||
    failedBrowserEvidenceCount > 0
  ) {
    const details = [
      pendingReviewCount > 0 ? `${pendingReviewCount} 项待复核` : null,
      pendingBrowserEvidenceCount > 0
        ? `${pendingBrowserEvidenceCount} 项浏览器证据待复核`
        : null,
      failedBrowserEvidenceCount > 0
        ? `${failedBrowserEvidenceCount} 项浏览器证据失败`
        : null,
    ].filter(Boolean);
    return details.length > 0
      ? `证据包${details.join("、")}，请先完成复核或接受风险后再继续生成。`
      : "证据包待复核，请先完成复核或接受风险后再继续生成。";
  }
  return null;
}

export function latestEvidencePackageForScopes(
  items: RunHistoryItem[],
  scopes: EvidenceGateRunKind[],
) {
  const scopeSet = new Set(scopes);
  return (
    sortedHistoryItems(items)
      .filter((item) => {
        const kind = historyRunKind(item);
        return kind ? scopeSet.has(kind) : false;
      })
      .map(evidenceForHistoryItem)
      .find((packageValue): packageValue is EvidencePackage =>
        Boolean(packageValue),
      ) ?? null
  );
}

export function findBlockingEvidencePackage(
  items: RunHistoryItem[],
  scopes: EvidenceGateRunKind[],
): BlockingEvidencePackage | null {
  const scopeSet = new Set(scopes);
  for (const item of sortedHistoryItems(items)) {
    const kind = historyRunKind(item);
    if (!kind || !scopeSet.has(kind)) continue;
    const evidencePackage = evidenceForHistoryItem(item);
    const reason = evidencePackageBlockReason(evidencePackage);
    if (evidencePackage && reason) {
      return { item, evidencePackage, reason };
    }
  }
  return null;
}
