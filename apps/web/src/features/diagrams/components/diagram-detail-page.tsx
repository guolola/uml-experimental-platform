import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ExternalLink,
  ArrowLeft,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Download,
  Maximize2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "../../../shared/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../shared/ui/tabs";
import { Badge } from "../../../shared/ui/badge";
import { Section } from "../../../shared/ui/section";
import { InlineSvg } from "./inline-svg";
import { cn } from "../../../shared/ui/utils";
import { downloadTextFile } from "../../../shared/lib/download";
import {
  DESIGN_DIAGRAM_META,
  DIAGRAM_META,
  type DesignDiagramType,
  type DiagramType,
} from "../../../entities/diagram/model";
import { useWorkspaceShell } from "../../workspace-shell/state";
import { useWorkspaceSession } from "../../workspace-session/state";
import {
  SEMANTIC_KIND_META,
  buildDiagramDetailModel,
  type DiagramDetailItem,
} from "../../../entities/diagram/lib/model-details";

export function DiagramView({
  type,
  highlightedElement,
}: {
  type: DiagramType;
  highlightedElement?: { kind: string; id: string } | null;
}) {
  return (
    <DiagramDetailView
      stage="requirements"
      type={type}
      highlightedElement={highlightedElement}
    />
  );
}

export function DesignDiagramView({ type }: { type: DesignDiagramType }) {
  return <DiagramDetailView stage="design" type={type} highlightedElement={null} />;
}

function DiagramDetailView({
  stage,
  type,
  highlightedElement,
}: {
  stage: "requirements" | "design";
  type: DiagramType | DesignDiagramType;
  highlightedElement?: { kind: string; id: string } | null;
}) {
  const {
    models,
    plantUml,
    svgArtifacts,
    diagramErrors,
    designModels,
    designPlantUml,
    designSvgArtifacts,
    designDiagramErrors,
    rulesForDiagram,
    staleDiagrams,
    generateDiagrams,
    generating,
  } = useWorkspaceSession();
  const { openDiagram, openDesignDiagram, openDiagramElement, openRequirementsText } =
    useWorkspaceShell();
  const isDesign = stage === "design";
  const requirementType = type as DiagramType;
  const designType = type as DesignDiagramType;
  const isStale = !isDesign && staleDiagrams.includes(requirementType);
  const meta = isDesign ? DESIGN_DIAGRAM_META[designType] : DIAGRAM_META[requirementType];
  const source = isDesign
    ? designPlantUml[designType] ?? ""
    : plantUml[requirementType] ?? "";
  const model = isDesign ? designModels[designType] : models[requirementType];
  const svgMarkup = isDesign
    ? designSvgArtifacts[designType]?.svg ?? ""
    : svgArtifacts[requirementType]?.svg ?? "";
  const diagramError = isDesign
    ? designDiagramErrors[designType] ?? null
    : diagramErrors[requirementType] ?? null;
  const [svgUrl, setSvgUrl] = useState("");
  const [svgScale, setSvgScale] = useState(1);
  const updateSvgScale = (next: number) => {
    setSvgScale(Math.min(3, Math.max(0.25, Math.round(next * 100) / 100)));
  };
  useEffect(() => {
    if (!svgMarkup || typeof URL.createObjectURL !== "function") {
      setSvgUrl("");
      return;
    }

    const objectUrl = URL.createObjectURL(
      new Blob([svgMarkup], { type: "image/svg+xml" }),
    );
    setSvgUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [svgMarkup]);
  const sourceRules = isDesign ? [] : rulesForDiagram(requirementType);
  const detailModel = useMemo(() => buildDiagramDetailModel(model), [model]);
  const { items, groups, relationships } = detailModel;

  const highlighted: DiagramDetailItem | undefined = useMemo(() => {
    if (!highlightedElement) return undefined;
    return items.find(
      (e) => e.kind === highlightedElement.kind && e.id === highlightedElement.id,
    );
  }, [items, highlightedElement]);

  return (
    <div className="flex h-full flex-col overflow-auto">
      {!source ? (
        diagramError ? (
            <div className="m-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-8 text-sm">
              <div className="flex items-center gap-2 font-medium text-destructive">
                <AlertTriangle className="size-4 shrink-0" />
                {meta.label} 生成失败
              </div>
            <div className="mt-2 leading-relaxed text-foreground">
              {diagramError.message}
            </div>
          </div>
        ) : (
          <div className="m-3 border border-dashed border-border bg-muted/30 px-4 py-12 text-center text-sm text-muted-foreground">
            尚未生成。请回到「{isDesign ? "设计" : "需求"}」点击「生成模型」。
          </div>
        )
      ) : (
        <>
          {isStale && (
            <div className="flex items-center gap-2 border-b border-warning/40 bg-warning/10 px-3 py-2 text-sm">
              <AlertTriangle className="size-4 shrink-0 text-warning" />
              <span>此图基于旧规则生成，可能已过时。</span>
              <Button
                size="sm"
                variant="outline"
                className="ml-auto h-7"
                onClick={() => generateDiagrams([requirementType])}
                disabled={generating}
              >
                {generating ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
                重新生成此图
              </Button>
            </div>
          )}

          {highlighted && (
            <div className="flex items-center gap-2 border-b border-primary/30 bg-primary/10 px-3 py-2 text-sm">
              <span className="font-mono text-xs uppercase tracking-wider text-primary">
                focus
              </span>
              <Badge variant="secondary" className="font-mono">
                {SEMANTIC_KIND_META[highlighted.kind].label}
              </Badge>
              <span className="font-medium">{highlighted.label}</span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-7"
                onClick={() =>
                  isDesign ? openDesignDiagram(designType) : openDiagram(requirementType)
                }
              >
                清除高亮
              </Button>
            </div>
          )}

          <Tabs defaultValue="diagram" className="flex flex-col">
            <TabsList className="mx-3 mt-3 self-start">
              <TabsTrigger value="diagram">图</TabsTrigger>
              <TabsTrigger value="elements">
                元素
                <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                  {items.length}
                </span>
              </TabsTrigger>
              <TabsTrigger value="relations">
                关系
                <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                  {relationships.length}
                </span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="diagram" className="m-0">
              <Section
                title="预览"
                actions={
                  svgMarkup ? (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => updateSvgScale(svgScale - 0.25)}
                        aria-label="缩小 SVG"
                      >
                        <ZoomOut className="size-3.5" />
                      </Button>
                      <Badge variant="secondary" className="h-7 min-w-14 font-mono">
                        {Math.round(svgScale * 100)}%
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => updateSvgScale(svgScale + 0.25)}
                        aria-label="放大 SVG"
                      >
                        <ZoomIn className="size-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => updateSvgScale(1)}
                        aria-label="适应宽度"
                      >
                        <Maximize2 className="size-3.5" />
                      </Button>
                      {svgUrl && (
                        <Button variant="outline" size="sm" className="h-7" asChild>
                          <a href={svgUrl} target="_blank" rel="noreferrer">
                            <ExternalLink className="size-3.5" /> 新标签
                          </a>
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7"
                        onClick={() => {
                          downloadTextFile(`${stage}-${type}.svg`, svgMarkup, "image/svg+xml");
                          toast.success(`已导出 ${type}.svg`);
                        }}
                      >
                        <Download className="size-3.5" /> SVG
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7"
                        onClick={() => {
                          if (!model) return;
                          downloadTextFile(
                            `${stage}-${type}.model.json`,
                            JSON.stringify(model, null, 2),
                            "application/json",
                          );
                          toast.success(`已导出 ${type}.model.json`);
                        }}
                        disabled={!model}
                      >
                        <Download className="size-3.5" /> JSON
                      </Button>
                    </div>
                  ) : undefined
                }
              >
                <div
                  className="min-h-[320px] overflow-auto rounded-xl border border-border bg-zinc-100 p-4"
                  onWheel={(event) => {
                    if (!event.ctrlKey || !svgMarkup) {
                      return;
                    }
                    event.preventDefault();
                    updateSvgScale(svgScale + (event.deltaY < 0 ? 0.1 : -0.1));
                  }}
                >
                  {svgMarkup ? (
                    <div className="flex min-h-[288px] min-w-full items-center justify-center">
                      <InlineSvg
                        svg={svgMarkup}
                        scale={svgScale}
                        highlightLabel={highlighted?.label}
                        className="w-full [&>svg]:drop-shadow-sm"
                      />
                    </div>
                  ) : diagramError ? (
                    <div className="flex min-h-[288px] items-center justify-center">
                      <div className="max-w-xl rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
                        <div className="flex items-center gap-2 font-medium text-destructive">
                          <AlertTriangle className="size-4 shrink-0" />
                          {meta.label} 生成失败
                        </div>
                        <div className="mt-2 leading-relaxed text-foreground">
                          {diagramError.message}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex min-h-[288px] items-center justify-center text-sm text-muted-foreground">
                      尚未生成 SVG
                    </div>
                  )}
                </div>
              </Section>
            </TabsContent>

            <TabsContent value="elements" className="m-0">
              <Section title="元素清单">
                {groups.length === 0 ? (
                  <div className="border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-xs text-muted-foreground">
                    未识别到元素。
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {groups.map(({ kind, items }) => (
                      <div key={kind}>
                        <div className="mb-1.5 flex items-center gap-2 border-b border-border pb-1">
                          <span className="text-xs uppercase tracking-wider text-muted-foreground">
                            {SEMANTIC_KIND_META[kind].label}
                          </span>
                          <Badge variant="secondary" className="font-mono">
                            {items.length}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {items.map((el) => {
                            const active =
                              highlighted &&
                              highlighted.kind === el.kind &&
                              highlighted.id === el.id;
                            return (
                              <button
                                type="button"
                                key={`${el.kind}:${el.id}`}
                                onClick={() =>
                                  isDesign
                                    ? openDesignDiagram(designType)
                                    : openDiagramElement(
                                        requirementType,
                                        el.kind,
                                        el.id,
                                        el.label,
                                      )
                                }
                                className={cn(
                                  "rounded-sm border px-2 py-0.5 text-xs transition-colors",
                                  active
                                    ? "border-primary bg-primary/15 text-primary"
                                    : "border-border bg-card hover:bg-accent",
                                )}
                              >
                                {el.label}
                              </button>
                            );
                          })}
                        </div>
                        {highlighted && highlighted.kind === kind && highlighted.fields.length > 0 && (
                          <div className="mt-2 rounded-lg border border-border bg-muted/30 p-3 text-xs">
                            <div className="mb-2 font-medium text-foreground">
                              {highlighted.label}
                            </div>
                            <div className="flex flex-col gap-1.5">
                              {highlighted.fields.map((field) => (
                                <div key={`${highlighted.id}:${field.label}`}>
                                  <span className="text-muted-foreground">{field.label}：</span>
                                  <span>{field.value}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            </TabsContent>

            <TabsContent value="relations" className="m-0">
              <Section title="关系说明">
                {relationships.length === 0 ? (
                  <div className="border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-xs text-muted-foreground">
                    暂无结构化关系。
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {relationships.map((relation) => (
                      <div
                        key={relation.id}
                        className="rounded-lg border border-border bg-card p-3 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="font-mono">
                            {relation.typeLabel}
                          </Badge>
                          <span className="font-medium">{relation.label}</span>
                        </div>
                        <div className="mt-2 text-muted-foreground">
                          {relation.sourceId} → {relation.targetId}
                        </div>
                        {relation.fields.length > 0 && (
                          <div className="mt-2 flex flex-col gap-1.5">
                            {relation.fields.map((field) => (
                              <div key={`${relation.id}:${field.label}`}>
                                <span className="text-muted-foreground">{field.label}：</span>
                                <span>{field.value}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            </TabsContent>

          </Tabs>

          {!isDesign && (
          <Section
            title="溯源·需求规则"
            badge={
              <Badge variant="secondary" className="font-mono">
                {sourceRules.length}
              </Badge>
            }
            actions={
              <Button
                variant="ghost"
                size="sm"
                className="h-7"
                onClick={openRequirementsText}
              >
                <ArrowLeft className="size-3.5" /> 需求
              </Button>
            }
          >
            {sourceRules.length === 0 ? (
              <div className="border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-xs text-muted-foreground">
                暂无关联规则。
              </div>
            ) : (
              <ul className="flex flex-col">
                {sourceRules.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-start gap-2 border-l-2 border-border py-1.5 pl-3 text-xs hover:border-primary/60 hover:bg-accent/30"
                  >
                    <Badge variant="secondary" className="shrink-0 font-mono">
                      {r.category}
                    </Badge>
                    <span className="font-mono text-[10px] uppercase text-muted-foreground">
                      {r.id}
                    </span>
                    <span className="flex-1 leading-relaxed">{r.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          )}
        </>
      )}
    </div>
  );
}
