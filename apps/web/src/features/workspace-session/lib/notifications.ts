// Owns user-facing generation notifications and completion events.

import { toast } from "sonner";
import type { DocumentKind } from "@uml-platform/contracts";

export const GENERATION_COMPLETED_EVENT = "uml-generation-completed";

export function notifyGenerationCompleted(kind: "requirements" | "design") {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(GENERATION_COMPLETED_EVENT, {
        detail: { kind },
      }),
    );
  }
}

export function notifyGenerationStarted(
  kind: "requirements" | "design" | "code" | "document",
  documentKind?: DocumentKind,
) {
  const message =
    kind === "requirements"
      ? "需求生成已开始"
      : kind === "design"
        ? "设计生成已开始"
        : kind === "code"
          ? "代码生成已开始"
          : documentKind === "requirementsSpec"
            ? "需求规格说明书生成已开始"
            : "软件设计说明书生成已开始";
  toast.message(message);
}

export function notifyGenerationFailed(message: string) {
  void message;
}

export function notifyGenerationResultStale() {
  toast.message("结果基于生成开始时的内容，期间修改不会自动合并到本次结果");
}
