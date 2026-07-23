// Owns the diagram preview toolbar, SVG canvas, and overview drawer rendering.
import type { PointerEventHandler, RefObject } from "react";
import { useTranslation } from "react-i18next";
import type { DesignDiagramType, DiagramType } from "../../../entities/diagram/model";
import {
  type DiagramDetailGroup,
  type DiagramDetailItem,
  type DiagramRelationshipDetail,
} from "../../../entities/diagram/lib/model-details";
import {
  AlertTriangle,
  Download,
  ExternalLink,
  Maximize2,
  PanelRightOpen,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../../shared/ui/button";
import { Badge } from "../../../shared/ui/badge";
import { cn } from "../../../shared/ui/utils";
import { downloadTextFile } from "../../../shared/lib/download";
import { InlineSvg } from "./inline-svg";
import { getRelationDisplayLabel } from "../lib/diagram-detail-view-model";
import { diagramDetailFieldLabel, semanticElementLabel } from "../lib/diagram-presentation";

type DiagramPreviewError = {
  error?: {
    message?: string;
  };
} | null;

type DiagramPreviewPanelProps = {
  description: string;
  stage: "requirements" | "design" | "feasibility";
  type: DiagramType | DesignDiagramType;
  exportFileStem?: string;
  plantUmlSource: string;
  normalizedSvgMarkup: string;
  svgMarkup: string;
  svgUrl: string;
  svgScale: number;
  svgCanvasRef: RefObject<HTMLDivElement | null>;
  isPanning: boolean;
  svgPanOffset: { x: number; y: number };
  onUpdateSvgScale: (next: number) => void;
  onStartPan: PointerEventHandler<HTMLDivElement>;
  onMovePan: PointerEventHandler<HTMLDivElement>;
  onStopPan: PointerEventHandler<HTMLDivElement>;
  highlighted: DiagramDetailItem | undefined;
  highlightAliases: string[];
  highlightRequestId: number;
  diagramError: DiagramPreviewError;
  diagramLabel: string;
  isOverviewPanelOpen: boolean;
  overviewPanelId: string;
  compactViewport: boolean;
  onOpenOverviewPanel: () => void;
  onCloseOverviewPanel: () => void;
  onFocusAction: () => void;
  sourceRuleIds: string[];
  relatedRelationships: DiagramRelationshipDetail[];
  relatedItems: DiagramDetailItem[];
  itemsById: Map<string, DiagramDetailItem>;
  summaryGroups: DiagramDetailGroup[];
  relationshipsCount: number;
};

export function DiagramPreviewPanel({
  description,
  stage,
  type,
  exportFileStem,
  plantUmlSource,
  normalizedSvgMarkup,
  svgMarkup,
  svgUrl,
  svgScale,
  svgCanvasRef,
  isPanning,
  svgPanOffset,
  onUpdateSvgScale,
  onStartPan,
  onMovePan,
  onStopPan,
  highlighted,
  highlightAliases,
  highlightRequestId,
  diagramError,
  diagramLabel,
  isOverviewPanelOpen,
  overviewPanelId,
  compactViewport,
  onOpenOverviewPanel,
  onCloseOverviewPanel,
  onFocusAction,
  sourceRuleIds,
  relatedRelationships,
  relatedItems,
  itemsById,
  summaryGroups,
  relationshipsCount,
}: DiagramPreviewPanelProps) {
  const { t } = useTranslation();
  const fileStem = exportFileStem ?? `${stage}-${type}`;
  return (
    <section
      data-testid="diagram-preview-section"
      className="w-full min-w-0 overflow-hidden rounded-xl border border-border bg-background"
    >
      <div className="flex flex-col gap-3 rounded-t-xl border-b border-border p-3 sm:p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{t("diagrams.detail.preview")}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Button
            variant={isOverviewPanelOpen ? "secondary" : "outline"}
            size="sm"
            className="h-8"
            onClick={isOverviewPanelOpen ? onCloseOverviewPanel : onOpenOverviewPanel}
            aria-label={isOverviewPanelOpen ? t("diagrams.detail.collapseOverview") : t("diagrams.detail.openOverview")}
            aria-expanded={isOverviewPanelOpen}
            aria-controls={overviewPanelId}
          >
            <PanelRightOpen className="size-3.5" /> {t("diagrams.detail.modelOverview")}
          </Button>
          {normalizedSvgMarkup ? (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2"
                onClick={() => onUpdateSvgScale(svgScale - 0.25)}
                aria-label={t("diagrams.detail.zoomOut")}
              >
                <ZoomOut className="size-3.5" />
              </Button>
              <Badge variant="secondary" className="h-8 min-w-14 font-mono">
                {Math.round(svgScale * 100)}%
              </Badge>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2"
                onClick={() => onUpdateSvgScale(svgScale + 0.25)}
                aria-label={t("diagrams.detail.zoomIn")}
              >
                <ZoomIn className="size-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2"
                onClick={() => onUpdateSvgScale(1)}
                aria-label={t("diagrams.detail.fitWidth")}
              >
                <Maximize2 className="size-3.5" />
              </Button>
              {svgUrl && (
                <Button variant="outline" size="sm" className="h-8" asChild>
                  <a href={svgUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="size-3.5" /> {t("diagrams.detail.newTab")}
                  </a>
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => {
                  downloadTextFile(`${fileStem}.svg`, normalizedSvgMarkup, "image/svg+xml");
                  toast.success(t("diagrams.detail.exported", { file: `${fileStem}.svg` }));
                }}
              >
                <Download className="size-3.5" /> SVG
              </Button>
            </>
          ) : null}
          {plantUmlSource.trim() ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => {
                downloadTextFile(`${fileStem}.puml`, plantUmlSource, "text/plain");
                toast.success(t("diagrams.detail.exported", { file: `${fileStem}.puml` }));
              }}
            >
              <Download className="size-3.5" /> PlantUML
            </Button>
          ) : null}
        </div>
      </div>
      <div className="relative">
        <div
          ref={svgCanvasRef}
          data-testid="svg-preview-canvas"
          className={cn(
            "h-[560px] overflow-hidden select-none touch-none sm:h-[720px]",
            svgMarkup && (isPanning ? "cursor-grabbing" : "cursor-grab"),
          )}
          onPointerDown={onStartPan}
          onPointerMove={onMovePan}
          onPointerUp={onStopPan}
          onPointerCancel={onStopPan}
        >
          {normalizedSvgMarkup ? (
            <div
              className="flex min-h-full min-w-full items-center justify-center"
              style={{
                transform: `translate(${svgPanOffset.x}px, ${svgPanOffset.y}px)`,
              }}
            >
              <InlineSvg
                svg={normalizedSvgMarkup}
                scale={svgScale}
                highlightLabel={highlighted?.label}
                highlightAliases={highlightAliases}
                highlightKey={highlightRequestId}
                className="w-full select-none [&_*]:select-none [&>svg]:drop-shadow-sm"
              />
            </div>
          ) : diagramError ? (
            <div className="flex min-h-full items-center justify-center">
              <div className="max-w-xl rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
                <div className="flex items-center gap-2 font-medium text-destructive">
                  <AlertTriangle className="size-4 shrink-0" />
                  {t("diagrams.detail.generatedFailed", { label: diagramLabel })}
                </div>
                <div className="mt-2 leading-relaxed text-foreground">
                  {diagramError.error?.message}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-h-full items-center justify-center text-sm text-muted-foreground">
              {t("diagrams.detail.noSvg")}
            </div>
          )}
        </div>
        {isOverviewPanelOpen ? (
          <aside
            id={overviewPanelId}
            role="complementary"
            aria-label={highlighted ? t("diagrams.detail.focusDetails") : t("diagrams.detail.modelOverview")}
            className={cn(
              "absolute z-20 flex flex-col gap-3 overflow-auto rounded-xl border border-border bg-card/95 p-4 shadow-xl backdrop-blur",
              compactViewport
                ? "inset-x-3 bottom-3 top-auto max-h-[65%]"
                : "right-3 top-3 max-h-[calc(100%-1.5rem)] w-[min(22rem,calc(100%-1.5rem))] sm:w-80",
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-foreground">
                {highlighted ? t("diagrams.detail.focusElement") : t("diagrams.detail.modelOverview")}
              </h3>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2"
                aria-label={highlighted ? t("diagrams.detail.closeFocus") : t("diagrams.detail.closeOverview")}
                onClick={highlighted ? onFocusAction : onCloseOverviewPanel}
              >
                <X className="size-3.5" />
              </Button>
            </div>
            {highlighted ? (
              <>
                <section className="rounded-lg border border-border bg-background p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs uppercase tracking-wider text-primary">
                      focus
                    </span>
                    <Badge variant="secondary" className="font-mono">
                      {semanticElementLabel(highlighted.kind, t)}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                      {highlighted.label}
                    </span>
                  </div>
                  <div className="mt-4 text-xs text-muted-foreground">
                    <div className="font-medium text-foreground">{t("diagrams.detail.responsibilities")}</div>
                    {highlighted.description && (
                      <div className="mt-1 leading-relaxed">{highlighted.description}</div>
                    )}
                    {highlighted.fields.length > 0 ? (
                      <div className="mt-2 flex flex-col gap-1.5">
                        {highlighted.fields.slice(0, 6).map((field) => (
                          <div key={`${highlighted.id}:focus:${field.label}`}>
                            <span>{diagramDetailFieldLabel(field.label, t)}{t("traceability.refSeparator")}</span>
                            <span className="text-foreground">{field.value}</span>
                          </div>
                        ))}
                      </div>
                    ) : !highlighted.description ? (
                      <div className="mt-1">{t("diagrams.detail.noExtraAttributes")}</div>
                    ) : null}
                    {highlighted.sections && highlighted.sections.length > 0 ? (
                      <div className="mt-3 flex flex-col gap-3">
                        {highlighted.sections.map((section) => (
                          <div
                            key={`${highlighted.id}:section:${section.id}`}
                            className="rounded-md border border-border bg-muted/30 p-2.5"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="text-xs font-semibold text-foreground">
                                {diagramDetailFieldLabel(section.title, t)}
                              </div>
                              {section.summary ? (
                                <Badge variant="secondary" className="text-[10px]">
                                  {section.summary}
                                </Badge>
                              ) : null}
                            </div>
                            {section.fields && section.fields.length > 0 ? (
                              <div className="mt-2 grid gap-1 text-[11px] sm:grid-cols-2">
                                {section.fields.map((field) => (
                                  <div
                                    key={`${highlighted.id}:section:${section.id}:${field.label}`}
                                    className="min-w-0"
                                  >
                                    <span className="text-muted-foreground">
                                      {diagramDetailFieldLabel(field.label, t)}{t("traceability.refSeparator")}
                                    </span>
                                    <span className="break-words text-foreground">
                                      {field.value}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                            <div className="mt-2 flex flex-col gap-2">
                              {section.items.map((sectionItem) => (
                                <div
                                  key={`${highlighted.id}:section:${section.id}:${sectionItem.id}`}
                                  className="rounded-md bg-background p-2"
                                >
                                  <div className="text-[11px] font-medium text-foreground">
                                    {sectionItem.title}
                                  </div>
                                  {sectionItem.description ? (
                                    <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                                      {sectionItem.description}
                                    </div>
                                  ) : null}
                                  {sectionItem.fields.length > 0 ? (
                                    <div className="mt-1.5 grid gap-1 text-[11px] sm:grid-cols-2">
                                      {sectionItem.fields.map((field) => (
                                        <div
                                          key={`${highlighted.id}:section:${section.id}:${sectionItem.id}:${field.label}`}
                                          className="min-w-0"
                                        >
                                          <span className="text-muted-foreground">
                                            {diagramDetailFieldLabel(field.label, t)}{t("traceability.refSeparator")}
                                          </span>
                                          <span className="break-words text-foreground">
                                            {field.value}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {sourceRuleIds.length > 0 && (
                      <div className="mt-3">
                        {t("diagrams.detail.sourceRules", { rules: sourceRuleIds.slice(0, 3).join("、") })}
                        {sourceRuleIds.length > 3 ? ` +${sourceRuleIds.length - 3}` : ""}
                      </div>
                    )}
                  </div>
                </section>
                <section className="rounded-lg border border-border bg-background p-3">
                  <h4 className="text-sm font-semibold text-foreground">{t("diagrams.detail.relatedTitle")}</h4>
                  <div className="mt-3 text-xs leading-relaxed text-muted-foreground">
                    {t("diagrams.detail.relatedSummary", {
                      count: relatedRelationships.length,
                      items:
                        relatedItems.length > 0
                          ? t("diagrams.detail.relatedItems", {
                              items: relatedItems
                                .map((item) => item.label)
                                .slice(0, 4)
                                .join("、"),
                            })
                          : ".",
                    })}
                  </div>
                  {relatedRelationships[0] && (
                    <div className="mt-3 truncate text-sm text-foreground">
                      {getRelationDisplayLabel(relatedRelationships[0], itemsById)}
                    </div>
                  )}
                </section>
              </>
            ) : (
              <section className="rounded-lg border border-border bg-background p-3">
                <div className="flex flex-col gap-3">
                  {summaryGroups.slice(0, 6).map((group) => (
                    <div
                      key={`overview:${group.kind}`}
                      className="flex items-center justify-between gap-3 border-b border-border/70 pb-3 last:border-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm text-foreground">
                          {semanticElementLabel(group.kind, t)}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {group.items.slice(0, 3).map((item) => item.label).join("、") || t("diagrams.detail.noItems")}
                        </div>
                      </div>
                      <Badge variant="secondary" className="font-mono">
                        {group.items.length}
                      </Badge>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-3 border-b border-border/70 pb-3 last:border-0 last:pb-0">
                    <div>
                      <div className="text-sm text-foreground">{t("diagrams.detail.relations")}</div>
                      <div className="text-xs text-muted-foreground">{t("diagrams.detail.structuredConnections")}</div>
                    </div>
                    <Badge variant="secondary" className="font-mono">
                      {relationshipsCount}
                    </Badge>
                  </div>
                </div>
              </section>
            )}
          </aside>
        ) : null}
      </div>
    </section>
  );
}
