// Owns project document list interactions for the project workspace page and drawer.
import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { Input } from "../../../shared/ui/input";
import { Label } from "../../../shared/ui/label";
import { downloadBlobFile } from "../../../shared/lib/download";
import {
  downloadStatusLabel,
  formatDateTime,
  getProjectDocumentDisplayName,
  onlyOfficeStatusLabel,
  shortIdentifier,
} from "../lib/project-workspace-presentation";
import {
  platformApi,
  type PlatformDocument,
  type PlatformDocumentVersion,
} from "../services/platform-api";

export function ProjectDocuments({
  projectId,
  documents,
  layout = "page",
}: {
  projectId: string;
  documents: PlatformDocument[];
  layout?: "page" | "drawer";
}) {
  const [currentDocuments, setCurrentDocuments] = useState(documents);
  const [names, setNames] = useState<Record<string, string>>({});
  const [versions, setVersions] = useState<Record<string, PlatformDocumentVersion[]>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const applyDocuments = useCallback((nextDocuments: PlatformDocument[]) => {
    setCurrentDocuments(nextDocuments);
    setNames(
      Object.fromEntries(
        nextDocuments.map((document) => [
          document.id,
          getProjectDocumentDisplayName(document),
        ]),
      ),
    );
  }, []);

  useEffect(() => {
    applyDocuments(documents);
  }, [applyDocuments, documents]);

  useEffect(() => {
    let active = true;
    platformApi
      .listProjectDocuments(projectId)
      .then((response) => {
        if (!active) return;
        applyDocuments(response.documents);
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "加载项目文档失败。");
      });
    return () => {
      active = false;
    };
  }, [applyDocuments, projectId]);

  const updateDocument = (document: PlatformDocument) => {
    setCurrentDocuments((current) =>
      current.map((item) => (item.id === document.id ? { ...item, ...document } : item)),
    );
    setNames((current) => ({
      ...current,
      [document.id]: getProjectDocumentDisplayName(document),
    }));
  };

  const findDocumentDisplayName = (documentId: string) => {
    const document = currentDocuments.find((item) => item.id === documentId);
    return document ? getProjectDocumentDisplayName(document) : `文档 ${shortIdentifier(documentId)}`;
  };

  const loadVersions = async (documentId: string) => {
    setMessage("");
    setError("");
    const displayName = findDocumentDisplayName(documentId);
    try {
      const response = await platformApi.listProjectDocumentVersions(projectId, documentId);
      setVersions((current) => ({ ...current, [documentId]: response.versions }));
      setMessage(`已加载文档 ${displayName} 的版本记录。`);
    } catch (versionError) {
      setError(versionError instanceof Error ? versionError.message : "版本记录加载失败。");
    }
  };

  const renameDocument = async (documentId: string) => {
    setMessage("");
    setError("");
    try {
      const nextName = (names[documentId] ?? "").trim();
      if (!nextName) {
        setError("文档名称不能为空。");
        return;
      }
      const response = await platformApi.renameProjectDocument(projectId, documentId, nextName);
      updateDocument(response.document);
      setMessage(`文档 ${getProjectDocumentDisplayName(response.document)} 已重命名。`);
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : "重命名失败。");
    }
  };

  const deleteDocument = async (documentId: string) => {
    setMessage("");
    setError("");
    const displayName = findDocumentDisplayName(documentId);
    try {
      await platformApi.deleteProjectDocument(projectId, documentId);
      setCurrentDocuments((current) =>
        current.map((document) =>
          document.id === documentId ? { ...document, status: "deleted" } : document,
        ),
      );
      setMessage(`文档 ${displayName} 已删除，可在当前页面恢复。`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除失败。");
    }
  };

  const restoreDocument = async (documentId: string) => {
    setMessage("");
    setError("");
    try {
      const response = await platformApi.restoreProjectDocument(projectId, documentId);
      updateDocument(response.document);
      setMessage(`文档 ${getProjectDocumentDisplayName(response.document)} 已恢复。`);
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "恢复失败。");
    }
  };

  const downloadDocument = async (documentId: string) => {
    setMessage("");
    setError("");
    try {
      const file = await platformApi.downloadProjectDocument(projectId, documentId);
      downloadBlobFile(file.fileName, file.blob);
      setMessage(`已下载 ${file.fileName}。`);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "下载失败。");
    }
  };

  const batchDownload = async () => {
    const downloadableDocuments = currentDocuments.filter(
      (document) => document.status !== "deleted" && document.download?.status !== "unavailable",
    );
    if (downloadableDocuments.length === 0) {
      setError("当前没有可下载的文档。");
      return;
    }
    for (const document of downloadableDocuments) {
      await downloadDocument(document.id);
    }
    setMessage(`已触发 ${downloadableDocuments.length} 个文档下载。`);
  };

  const sectionClass = layout === "drawer" ? "p-4" : "";
  const gridClass = layout === "drawer" ? "grid gap-3" : "grid gap-4 lg:grid-cols-2";

  return (
    <section className={`rounded-md border border-border bg-card p-5 ${sectionClass}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base">项目文档</h2>
          <p className="text-sm text-muted-foreground">
            上传新文档当前没有项目 API 支撑，本页只展示已有文档能力。
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void batchDownload()}>
          <Download className="size-4" />
          批量下载
        </Button>
      </div>
      <div className={gridClass}>
        {currentDocuments.map((document) => {
          const displayName = getProjectDocumentDisplayName(document);
          return (
            <div key={document.id} className="rounded-md border border-border bg-background p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base">{displayName}</h2>
                <Badge variant="secondary">{document.status}</Badge>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                项目：{projectId}。版本 v{document.version ?? 1}，
                更新时间：{document.updatedAt ? formatDateTime(document.updatedAt) : "未记录"}。
              </p>
              <div className="mt-3 grid gap-1 text-sm text-muted-foreground">
                <span>OnlyOffice：{onlyOfficeStatusLabel(document.onlyOffice?.status)}</span>
                <span>编辑锁：{document.editLock?.lockedBy ?? document.onlyOffice?.lockedBy ?? "未锁定"}</span>
                <span>
                  下载：
                  {downloadStatusLabel(
                    document.download?.status ?? (document.status === "deleted" ? "unavailable" : "available"),
                  )}
                </span>
                <span>大小：{document.byteLength ? `${document.byteLength} bytes` : "未记录"}</span>
              </div>
              <div className="mt-4 grid gap-1.5">
                <Label htmlFor={`document-name-${document.id}`}>文档名称</Label>
                <Input
                  id={`document-name-${document.id}`}
                  value={names[document.id] ?? ""}
                  onChange={(event) =>
                    setNames((current) => ({
                      ...current,
                      [document.id]: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  aria-label={`下载 ${displayName}`}
                  onClick={() => void downloadDocument(document.id)}
                >
                  下载
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  aria-label={`重命名 ${displayName}`}
                  onClick={() => void renameDocument(document.id)}
                >
                  重命名
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  aria-label={`版本记录 ${displayName}`}
                  onClick={() => void loadVersions(document.id)}
                >
                  版本记录
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  aria-label={`恢复 ${displayName}`}
                  onClick={() => void restoreDocument(document.id)}
                >
                  恢复
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  aria-label={`删除 ${displayName}`}
                  onClick={() => void deleteDocument(document.id)}
                >
                  删除
                </Button>
              </div>
              {versions[document.id] && (
                <div className="mt-4 rounded-md border border-border bg-muted p-3 text-sm">
                  {versions[document.id].map((version) => (
                    <div key={`${document.id}-${version.version}`}>
                      v{version.version} {version.fileName}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {currentDocuments.length === 0 && (
          <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            暂无文档记录。
          </div>
        )}
      </div>
      {(message || error) && (
        <div className="mt-4 rounded-md border border-border bg-muted p-3 text-sm">
          {message || error}
        </div>
      )}
    </section>
  );
}
