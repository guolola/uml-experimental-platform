// Wraps document, OnlyOffice, and evidence endpoints used by workspace repositories.
import type {
  DocumentKind,
  DocumentLibraryListResponse,
  EvidencePackage,
  EvidenceReviewDecision,
  OnlyOfficeEditorConfigResponse,
  OnlyOfficeUiTheme,
} from "@uml-platform/contracts";
import { downloadBlob, postJson, requestJson } from "../api-client";
import { requireProjectScope, withProjectHeaders } from "./project-scope";

function documentTimestamp(date = new Date()) {
  const pad = (value: number, length = 2) =>
    String(value).padStart(length, "0");
  const datePart = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(
    date.getDate(),
  )}`;
  const timePart = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(
    date.getSeconds(),
  )}`;
  return `${datePart}-${timePart}-${pad(date.getMilliseconds(), 3)}`;
}

export function documentFileName(documentKind: DocumentKind, date = new Date()) {
  const timestamp = documentTimestamp(date);
  return documentKind === "requirementsSpec"
    ? `需求规格说明书-${timestamp}.docx`
    : documentKind === "softwareDesignSpec"
      ? `软件设计说明书-${timestamp}.docx`
      : `可行性研究报告-${timestamp}.docx`;
}

export async function readRunEvidencePackage(
  runId: string,
  projectId: string | null = null,
) {
  const scopedProjectId = requireProjectScope(projectId);
  const response = await requestJson<{ evidencePackage: EvidencePackage }>(
    `/api/projects/${encodeURIComponent(scopedProjectId)}/runs/${encodeURIComponent(runId)}/evidence`,
    withProjectHeaders(scopedProjectId, {
      errorMessage: "读取可信证据包失败",
    }),
  );
  return response.evidencePackage;
}

export async function postRunReviewDecision(
  runId: string,
  decision: {
    reviewItemId: string;
    decision: EvidenceReviewDecision["decision"];
    comment: string;
  },
  projectId: string | null = null,
) {
  const scopedProjectId = requireProjectScope(projectId);
  const response = await postJson<{ evidencePackage: EvidencePackage }>(
    `/api/projects/${encodeURIComponent(scopedProjectId)}/runs/${encodeURIComponent(runId)}/review-decisions`,
    decision,
    withProjectHeaders(scopedProjectId, {
      errorMessage: "提交人工复核决策失败",
    }),
  );
  return response.evidencePackage;
}

export async function downloadDocumentRunFile(
  runId: string,
  defaultFileName?: string,
  projectId: string | null = null,
) {
  const scopedProjectId = requireProjectScope(projectId);
  return downloadBlob(
    `/api/document-runs/${runId}/download`,
    withProjectHeaders(scopedProjectId, {
      errorMessage: "下载说明书失败",
      defaultFileName: defaultFileName ?? "说明书.docx",
    }),
  );
}

export async function listDocumentLibraryItems(projectId: string | null = null) {
  const scopedProjectId = requireProjectScope(projectId);
  const response = await requestJson<DocumentLibraryListResponse>(
    `/api/projects/${encodeURIComponent(scopedProjectId)}/documents`,
    withProjectHeaders(scopedProjectId, {
      errorMessage: "读取说明书列表失败",
    }),
  );
  return response.documents;
}

export async function readOnlyOfficeEditorConfig(
  documentId: string,
  uiTheme?: OnlyOfficeUiTheme,
  projectId: string | null = null,
) {
  const scopedProjectId = requireProjectScope(projectId);
  const query = uiTheme ? `?uiTheme=${encodeURIComponent(uiTheme)}` : "";
  return requestJson<OnlyOfficeEditorConfigResponse>(
    `/api/projects/${encodeURIComponent(scopedProjectId)}/documents/${encodeURIComponent(documentId)}/editor-config${query}`,
    withProjectHeaders(scopedProjectId, {
      errorMessage: "读取 OnlyOffice 编辑器配置失败",
    }),
  );
}

export async function downloadDocumentFile(
  documentId: string,
  defaultFileName?: string,
  projectId: string | null = null,
) {
  const scopedProjectId = requireProjectScope(projectId);
  return downloadBlob(
    `/api/projects/${encodeURIComponent(scopedProjectId)}/documents/${encodeURIComponent(documentId)}/download`,
    withProjectHeaders(scopedProjectId, {
      errorMessage: "下载说明书失败",
      defaultFileName: defaultFileName ?? "说明书.docx",
    }),
  );
}
