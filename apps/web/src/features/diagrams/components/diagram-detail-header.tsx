// Renders editable diagram title/summary metadata and compact model counts.
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  MobileStatusPill,
  MobileStatusRail,
} from "../../workspace-shell/components/mobile-density";
import { stringValue } from "../lib/model-editing";

type DiagramDetailHeaderProps = {
  draft: Record<string, unknown> | null;
  modelTitle: string;
  modelSummary: string;
  sourceText: string | null;
  saveStatus: "idle" | "saving" | "saved" | "error";
  saveStatusLabel: string;
  compactViewport: boolean;
  itemCount: number;
  relationshipCount: number;
  groupCount: number;
  onChangeTitle: (value: string) => void;
  onChangeSummary: (value: string) => void;
};

export function DiagramDetailHeader({
  draft,
  modelTitle,
  modelSummary,
  sourceText,
  saveStatus,
  saveStatusLabel,
  compactViewport,
  itemCount,
  relationshipCount,
  groupCount,
  onChangeTitle,
  onChangeSummary,
}: DiagramDetailHeaderProps) {
  const { t } = useTranslation();
  return (
    <header className="px-1">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {draft ? (
              <input
                aria-label={t("diagrams.detail.titleAria")}
                value={stringValue(draft.title)}
                onChange={(event) => onChangeTitle(event.target.value)}
                className="min-w-0 flex-1 truncate rounded-md border border-transparent bg-transparent px-1 py-0 text-2xl font-semibold tracking-normal text-foreground outline-none transition-colors hover:border-border focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              />
            ) : (
              <h2 className="truncate text-2xl font-semibold tracking-normal text-foreground">
                {modelTitle}
              </h2>
            )}
          </div>
          {draft ? (
            <textarea
              aria-label={t("diagrams.detail.summaryAria")}
              value={stringValue(draft.summary)}
              onChange={(event) => onChangeSummary(event.target.value)}
              rows={2}
              className="mt-1 block w-full max-w-3xl resize-y rounded-md border border-transparent bg-transparent px-1 py-0 text-sm leading-6 text-muted-foreground outline-none transition-colors hover:border-border focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />
          ) : (
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              {modelSummary}
            </p>
          )}
          {sourceText ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded-md border border-border bg-muted/40 px-2 py-1">
                {sourceText}
              </span>
              {saveStatus === "saving" ? (
                <span className="inline-flex items-center gap-1 text-primary">
                  <Loader2 className="size-3 animate-spin" />
                  {t("diagrams.detail.savingAndUpdating")}
                </span>
              ) : saveStatus === "saved" ? (
                <span className="text-success">{t("diagrams.detail.changesSaved")}</span>
              ) : saveStatus === "error" ? (
                <span className="text-destructive">{t("diagrams.detail.headerSaveFailed")}</span>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="min-w-0 sm:w-auto">
          {compactViewport ? (
            <MobileStatusRail>
              <MobileStatusPill>
                <span>{t("diagrams.detail.items")}</span>
                <span className="font-mono text-foreground">{itemCount}</span>
              </MobileStatusPill>
              <MobileStatusPill>
                <span>{t("diagrams.detail.relations")}</span>
                <span className="font-mono text-foreground">{relationshipCount}</span>
              </MobileStatusPill>
              <MobileStatusPill>
                <span>{t("diagrams.detail.groups")}</span>
                <span className="font-mono text-foreground">{groupCount}</span>
              </MobileStatusPill>
              {sourceText ? (
                <MobileStatusPill>
                  <span>{t("diagrams.detail.source")}</span>
                  <span className="max-w-40 truncate text-foreground">{sourceText}</span>
                </MobileStatusPill>
              ) : null}
              {saveStatus !== "idle" ? (
                <MobileStatusPill>
                  <span>{t("diagrams.detail.save")}</span>
                  <span className="text-foreground">{saveStatusLabel}</span>
                </MobileStatusPill>
              ) : null}
            </MobileStatusRail>
          ) : (
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border border-border bg-muted/30 px-4 py-2">
                <div className="font-mono text-lg font-semibold text-foreground">
                  {itemCount}
                </div>
                <div className="text-xs text-muted-foreground">{t("diagrams.detail.items")}</div>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 px-4 py-2">
                <div className="font-mono text-lg font-semibold text-foreground">
                  {relationshipCount}
                </div>
                <div className="text-xs text-muted-foreground">{t("diagrams.detail.relations")}</div>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 px-4 py-2">
                <div className="font-mono text-lg font-semibold text-foreground">
                  {groupCount}
                </div>
                <div className="text-xs text-muted-foreground">{t("diagrams.detail.groups")}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
