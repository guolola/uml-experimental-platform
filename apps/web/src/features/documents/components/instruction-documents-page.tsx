// Hosts generated instruction documents and opens them in the configured Word editor.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  DocumentKind,
  DocumentLibraryItem,
  DocumentStyleSettings,
  OnlyOfficeUiTheme,
  OnlyOfficeEditorConfigResponse,
} from "@uml-platform/contracts";
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  FileText,
  HardDrive,
  Loader2,
  Palette,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { Input } from "../../../shared/ui/input";
import { downloadBlobFile } from "../../../shared/lib/download";
import { useWorkspaceRepository } from "../../../services/workspace-repository";
import { useWorkspaceSession } from "../../workspace-session/state";
import { useWorkspaceShell } from "../../workspace-shell/state";
import { DocumentStyleDialog } from "./document-style-dialog";
import { OnlyOfficeEditorHost } from "./only-office-editor-host";
import { cloneDefaultDocumentStyle } from "../lib/document-style";
import { useTheme } from "../../../app/providers/theme-provider";

function onlyOfficeUiThemeForProjectTheme(theme: "light" | "dark"): OnlyOfficeUiTheme {
  return theme === "light" ? "theme-classic-light" : "theme-dark";
}

const DOCUMENT_DEFINITIONS = [
  {
    kind: "requirementsSpec",
    title: "需求规格说明书",
    fileName: "需求规格说明书.docx",
    source: "Generated from Requirement Model",
  },
  {
    kind: "softwareDesignSpec",
    title: "软件设计说明书",
    fileName: "软件设计说明书.docx",
    source: "Generated from Design Model",
  },
] satisfies Array<{
  kind: DocumentKind;
  title: string;
  fileName: string;
  source: string;
}>;

const IDLE_DOCUMENT_GENERATION_STATE: Record<DocumentKind, boolean> = {
  requirementsSpec: false,
  softwareDesignSpec: false,
};

function formatUpdatedAt(value: string | null | undefined) {
  if (!value) return "尚未生成";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "更新时间未知";
  const diff = Date.now() - time;
  const minute = 60_000;
  const hour = minute * 60;
  const day = hour * 24;
  if (diff < minute) return "刚刚更新";
  if (diff < hour) return `${Math.max(1, Math.floor(diff / minute))} 分钟前更新`;
  if (diff < day) return `${Math.max(1, Math.floor(diff / hour))} 小时前更新`;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function documentDefinition(kind: DocumentKind) {
  return DOCUMENT_DEFINITIONS.find((item) => item.kind === kind)!;
}

function formatByteLength(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "大小未知";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatFullUpdatedAt(value: string | null | undefined) {
  if (!value) return "尚未生成";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function documentStyleSummary(style: DocumentStyleSettings) {
  return [
    style.includeTableOfContents ? "自动目录" : "无目录",
    style.autoNumberHeadings ? "标题编号" : "手动标题",
    style.body?.eastAsiaFont ?? "正文宋体",
  ];
}

function TemplatePreview({
  definition,
  documentStyle,
  onOpenStyle,
}: {
  definition: (typeof DOCUMENT_DEFINITIONS)[number];
  documentStyle: DocumentStyleSettings;
  onOpenStyle: () => void;
}) {
  return (
    <div className="flex h-44 flex-col gap-2 bg-muted/60 px-6 py-5">
      <div className="flex items-start justify-between gap-3">
        <Badge variant="secondary" className="rounded-full text-[10px]">
          课程设计模板
        </Badge>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 rounded-full bg-background/80 px-3"
          onClick={onOpenStyle}
        >
          <Palette className="size-3.5" />
          说明书样式
        </Button>
      </div>
      <div className="mt-auto space-y-3">
        <div>
          <p className="text-xs text-muted-foreground">生成模板</p>
          <p className="mt-1 text-lg font-semibold text-foreground">
            {definition.title}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {documentStyleSummary(documentStyle).map((item) => (
            <span
              key={item}
              className="rounded-full bg-background/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function GeneratedDocumentPreview({
  definition,
  document,
}: {
  definition: (typeof DOCUMENT_DEFINITIONS)[number];
  document: DocumentLibraryItem;
}) {
  return (
    <div className="flex h-44 flex-col justify-between bg-muted/60 px-6 py-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Badge variant="outline" className="rounded-full bg-background/70 text-[10px]">
            {definition.title}
          </Badge>
          <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <FileText className="size-4 text-primary" />
            DOCX 文件
          </p>
        </div>
        <Badge variant="secondary" className="rounded-full font-mono text-[10px]">
          v{document.version}
        </Badge>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
        <div>
          <dt className="text-muted-foreground">文件大小</dt>
          <dd className="mt-1 flex items-center gap-1.5 font-medium text-foreground">
            <HardDrive className="size-3.5 text-muted-foreground" />
            {formatByteLength(document.byteLength)}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-muted-foreground">最近更新</dt>
          <dd className="mt-1 font-medium text-foreground">
            {formatFullUpdatedAt(document.updatedAt)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function TemplateDocumentCard({
  definition,
  disabledReason,
  generating,
  documentStyle,
  onOpenStyle,
  onGenerate,
}: {
  definition: (typeof DOCUMENT_DEFINITIONS)[number];
  disabledReason: string | null;
  generating: boolean;
  documentStyle: DocumentStyleSettings;
  onOpenStyle: () => void;
  onGenerate: () => void;
}) {
  return (
    <article className="group flex min-h-[270px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-colors">
      <TemplatePreview
        definition={definition}
        documentStyle={documentStyle}
        onOpenStyle={onOpenStyle}
      />
      <div className="flex flex-1 flex-col gap-3 border-t border-border bg-card p-4">
        <div className="mt-auto rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          {disabledReason ?? "生成后可进入 Word 编辑器。"}
        </div>
        <Button
          type="button"
          size="sm"
          className="h-9 rounded-full"
          disabled={Boolean(disabledReason) || generating}
          title={disabledReason ?? `生成${definition.title}`}
          onClick={onGenerate}
        >
          {generating ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
          生成并打开
        </Button>
      </div>
    </article>
  );
}

function GeneratedDocumentCard({
  definition,
  document,
  onOpen,
  onDownload,
}: {
  definition: (typeof DOCUMENT_DEFINITIONS)[number];
  document: DocumentLibraryItem;
  onOpen: () => void;
  onDownload: () => void;
}) {
  return (
    <article
      className="group flex min-h-[315px] cursor-pointer flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-colors hover:border-primary/45 hover:shadow-md"
      onClick={onOpen}
    >
      <GeneratedDocumentPreview definition={definition} document={document} />
      <div className="flex flex-1 flex-col gap-3 border-t border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <FileText className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-foreground">
              {document.fileName}
            </h3>
            <p className="mt-2 text-xs font-medium tracking-[0.02em] text-muted-foreground">
              {definition.source}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {formatUpdatedAt(document.updatedAt)}
            </p>
          </div>
        </div>

        <div className="mt-auto flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 flex-1 rounded-full"
            onClick={(event) => {
              event.stopPropagation();
              onDownload();
            }}
          >
            <Download className="size-3.5" />
            下载
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-9 flex-1 rounded-full"
            onClick={(event) => {
              event.stopPropagation();
              onOpen();
            }}
          >
            <FileText className="size-3.5" />
            打开编辑器
          </Button>
        </div>
      </div>
    </article>
  );
}

export function InstructionDocumentsPage({
  activeDocumentId,
}: {
  activeDocumentId?: string;
}) {
  const repository = useWorkspaceRepository();
  const { theme } = useTheme();
  const {
    models,
    designModels,
    generateRequirementsSpec,
    generateSoftwareDesignSpec,
  } = useWorkspaceSession();
  const { openDocumentsHome, openDocumentEditor } = useWorkspaceShell();
  const [documents, setDocuments] = useState<DocumentLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<DocumentKind | "all">("all");
  const [editorConfig, setEditorConfig] =
    useState<OnlyOfficeEditorConfigResponse | null>(null);
  const [editorLoading, setEditorLoading] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [documentStyleDialogOpen, setDocumentStyleDialogOpen] = useState(false);
  const [documentStyle, setDocumentStyle] = useState(cloneDefaultDocumentStyle);
  const [documentGeneratingByKind, setDocumentGeneratingByKind] = useState(
    IDLE_DOCUMENT_GENERATION_STATE,
  );
  const activeDocumentGenerationsRef = useRef(IDLE_DOCUMENT_GENERATION_STATE);
  const activeDocumentGenerationCountRef = useRef(0);
  const autoOpenClaimedRef = useRef(false);
  const hasRequirementModels = Object.values(models).some(Boolean);
  const hasDesignModels = Object.values(designModels).some(Boolean);
  const onlyOfficeUiTheme = onlyOfficeUiThemeForProjectTheme(theme);

  const loadDocuments = useCallback(async () => {
    if (!repository.listDocuments) {
      setDocuments([]);
      setLoading(false);
      setErrorMessage("当前仓储暂不支持说明书列表");
      return [];
    }
    try {
      setLoading(true);
      setErrorMessage(null);
      const nextDocuments = await repository.listDocuments();
      setDocuments(nextDocuments);
      return nextDocuments;
    } catch (error) {
      const message = error instanceof Error ? error.message : "读取说明书列表失败";
      setErrorMessage(message);
      return [];
    } finally {
      setLoading(false);
    }
  }, [repository]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const filteredDocuments = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return documents.filter((document) => {
      if (typeFilter !== "all" && document.documentKind !== typeFilter) return false;
      const definition = documentDefinition(document.documentKind);
      const searchable =
        `${definition.title} ${definition.fileName} ${document.fileName}`.toLowerCase();
      return !normalizedQuery || searchable.includes(normalizedQuery);
    });
  }, [documents, query, typeFilter]);

  const activeDocument = useMemo(
    () => documents.find((document) => document.id === activeDocumentId) ?? null,
    [activeDocumentId, documents],
  );

  useEffect(() => {
    if (!activeDocumentId || !repository.getOnlyOfficeEditorConfig) {
      setEditorConfig(null);
      setEditorError(null);
      return;
    }
    let active = true;
    setEditorLoading(true);
    setEditorError(null);
    void repository
      .getOnlyOfficeEditorConfig(activeDocumentId, onlyOfficeUiTheme)
      .then((config) => {
        if (!active) return;
        setEditorConfig(config);
      })
      .catch((error) => {
        if (!active) return;
        setEditorConfig(null);
        setEditorError(
          error instanceof Error ? error.message : "读取 OnlyOffice 编辑器配置失败",
        );
      })
      .finally(() => {
        if (active) setEditorLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activeDocumentId, onlyOfficeUiTheme, repository]);

  const openDocument = useCallback(
    (document: DocumentLibraryItem) => {
      openDocumentEditor(document.id, document.fileName);
    },
    [openDocumentEditor],
  );

  const generateDocument = useCallback(
    async (kind: DocumentKind) => {
      if (activeDocumentGenerationsRef.current[kind]) return;

      if (activeDocumentGenerationCountRef.current === 0) {
        autoOpenClaimedRef.current = false;
      }
      activeDocumentGenerationCountRef.current += 1;
      activeDocumentGenerationsRef.current = {
        ...activeDocumentGenerationsRef.current,
        [kind]: true,
      };
      setDocumentGeneratingByKind(activeDocumentGenerationsRef.current);
      try {
        const snapshot =
          kind === "requirementsSpec"
            ? await generateRequirementsSpec(documentStyle)
            : await generateSoftwareDesignSpec(documentStyle);

        const nextDocuments = await loadDocuments();
        const document =
          nextDocuments.find((item) => item.id === snapshot?.documentId) ??
          nextDocuments.find((item) => item.documentKind === kind);
        if (document && !autoOpenClaimedRef.current) {
          autoOpenClaimedRef.current = true;
          openDocument(document);
        }
      } finally {
        activeDocumentGenerationCountRef.current = Math.max(
          0,
          activeDocumentGenerationCountRef.current - 1,
        );
        activeDocumentGenerationsRef.current = {
          ...activeDocumentGenerationsRef.current,
          [kind]: false,
        };
        setDocumentGeneratingByKind(activeDocumentGenerationsRef.current);
        if (activeDocumentGenerationCountRef.current === 0) {
          autoOpenClaimedRef.current = false;
        }
      }
    },
    [
      generateRequirementsSpec,
      generateSoftwareDesignSpec,
      documentStyle,
      loadDocuments,
      openDocument,
    ],
  );

  const downloadDocument = useCallback(
    async (document: DocumentLibraryItem) => {
      if (!repository.downloadDocument) {
        toast.error("当前仓储不支持下载说明书");
        return;
      }
      try {
        const downloaded = await repository.downloadDocument(
          document.id,
          document.fileName,
        );
        downloadBlobFile(downloaded.fileName, downloaded.blob);
        toast.success(`已下载 ${downloaded.fileName}`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "下载说明书失败");
      }
    },
    [repository],
  );

  const requirementDisabledReason = hasRequirementModels
    ? null
    : "请先在需求页生成需求模型";
  const designDisabledReason = hasDesignModels
    ? null
    : "请先在设计页生成设计模型";
  const disabledReasonByKind: Record<DocumentKind, string | null> = {
    requirementsSpec: requirementDisabledReason,
    softwareDesignSpec: designDisabledReason,
  };

  if (activeDocumentId) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-background">
        <div className="flex min-h-14 items-center justify-between gap-3 border-b border-border bg-card px-4">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 rounded-full"
              onClick={openDocumentsHome}
              aria-label="返回说明书列表"
            >
              <ArrowLeft className="size-4" />
            </Button>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground">
                {activeDocument?.fileName ?? editorConfig?.document.fileName ?? "说明书"}
              </div>
              <div className="text-xs text-muted-foreground">
                {activeDocument
                  ? `${documentDefinition(activeDocument.documentKind).title} · v${activeDocument.version}`
                  : "正在读取文档信息"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-full"
              onClick={() => void loadDocuments()}
            >
              <RefreshCw className="size-3.5" />
              刷新
            </Button>
            {activeDocument && (
              <Button
                type="button"
                size="sm"
                className="h-9 rounded-full"
                onClick={() => void downloadDocument(activeDocument)}
              >
                <Download className="size-3.5" />
                下载
              </Button>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 bg-muted">
          {editorLoading && (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              正在加载 OnlyOffice 编辑器...
            </div>
          )}
          {!editorLoading && editorConfig && (
            <OnlyOfficeEditorHost
              documentServerUrl={editorConfig.documentServerUrl}
              config={editorConfig.config}
              width="100%"
              height="100%"
              onLoadError={(description) => {
                setEditorError(description);
                setEditorConfig(null);
              }}
            />
          )}
          {!editorLoading && !editorConfig && (
            <div className="flex h-full items-center justify-center p-6">
              <div className="w-full max-w-xl rounded-xl border border-border bg-card p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />
                  <div>
                    <h2 className="text-base font-semibold text-foreground">
                      OnlyOffice 编辑器尚未就绪
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {editorError ??
                        "请确认 API 已配置 ONLYOFFICE_DOCUMENT_SERVER_URL，并且 Document Server 可以访问 PUBLIC_API_BASE_URL。"}
                    </p>
                    {activeDocument && (
                      <Button
                        type="button"
                        className="mt-4 h-9 rounded-full"
                        onClick={() => void downloadDocument(activeDocument)}
                      >
                        <Download className="size-3.5" />
                        下载当前 DOCX
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto bg-background">
      <div className="mx-auto flex w-[calc(100%-1.5rem)] max-w-none flex-col gap-6 py-6 sm:w-[calc(100%-2rem)] lg:w-[calc(100%-3rem)]">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-normal text-foreground">
              说明书
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              查看、生成并编辑需求规格说明书和软件设计说明书。
            </p>
          </div>
        </header>

        <section className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
            <div className="relative min-w-64 flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-10 rounded-lg bg-background pl-9"
                placeholder="搜索已生成的文档..."
              />
            </div>
            <label className="inline-flex h-10 items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm text-muted-foreground">
              <SlidersHorizontal className="size-4" />
              <select
                value={typeFilter}
                onChange={(event) =>
                  setTypeFilter(event.target.value as DocumentKind | "all")
                }
                className="bg-transparent text-sm text-foreground outline-none"
                aria-label="说明书类型"
              >
                <option value="all">所有类型</option>
                <option value="requirementsSpec">需求规格说明书</option>
                <option value="softwareDesignSpec">软件设计说明书</option>
              </select>
            </label>
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-full bg-background"
            onClick={() => void loadDocuments()}
          >
            <RefreshCw className="size-4" />
            刷新列表
          </Button>
        </section>

        {errorMessage && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {errorMessage}
          </div>
        )}

        {loading ? (
          <div className="flex min-h-52 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            正在读取说明书...
          </div>
        ) : (
          <>
            <section className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {DOCUMENT_DEFINITIONS.map((definition) => {
                const generating = documentGeneratingByKind[definition.kind];
                return (
                  <TemplateDocumentCard
                    key={definition.kind}
                    definition={definition}
                    disabledReason={disabledReasonByKind[definition.kind]}
                    generating={generating}
                    documentStyle={documentStyle}
                    onOpenStyle={() => setDocumentStyleDialogOpen(true)}
                    onGenerate={() => void generateDocument(definition.kind)}
                  />
                );
              })}
            </section>

            <section className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-foreground">
                  已生成说明书
                </h2>
                <span className="text-xs text-muted-foreground">
                  {filteredDocuments.length} 份
                </span>
              </div>
              {filteredDocuments.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-background px-4 py-8 text-center text-sm text-muted-foreground">
                  暂无匹配的说明书
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {filteredDocuments.map((document) => (
                    <GeneratedDocumentCard
                      key={document.id}
                      definition={documentDefinition(document.documentKind)}
                      document={document}
                      onOpen={() => openDocument(document)}
                      onDownload={() => void downloadDocument(document)}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
      <DocumentStyleDialog
        open={documentStyleDialogOpen}
        onOpenChange={setDocumentStyleDialogOpen}
        value={documentStyle}
        onChange={setDocumentStyle}
      />
    </div>
  );
}
