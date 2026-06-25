// Owns Sandpack synchronization and the local iframe prototype preview.

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { useSandpack } from "@codesandbox/sandpack-react";
import { toast } from "sonner";
import { cn } from "../../../shared/ui/utils";
import { buildLocalPreviewDocument, previewErrorMessage } from "../lib/preview-runtime";

export function SandpackFileSync({
  files,
}: {
  files: Record<string, string>;
}) {
  const { sandpack } = useSandpack();
  const updateFileRef = useRef(sandpack.updateFile);
  const syncedFilesRef = useRef<Record<string, string>>({});

  useEffect(() => {
    updateFileRef.current = sandpack.updateFile;
  }, [sandpack.updateFile]);

  useEffect(() => {
    const previousFiles = syncedFilesRef.current;
    for (const [path, code] of Object.entries(files)) {
      if (previousFiles[path] !== code) {
        updateFileRef.current(path, code);
      }
    }
    syncedFilesRef.current = { ...files };
  }, [files]);

  return null;
}

export type LocalPrototypePreviewHandle = {
  openPreviewWindow: () => void;
};

export const LocalPrototypePreview = forwardRef<LocalPrototypePreviewHandle, {
  files: Record<string, string>;
  entryFile: string;
  onBuildError?: (message: string) => void;
  onBuildReady?: () => void;
  onBuildStart?: () => void;
}>(function LocalPrototypePreview(
  {
    files,
    entryFile,
    onBuildError,
    onBuildReady,
    onBuildStart,
  },
  ref,
) {
  const buildIndexRef = useRef(0);
  const activeBuildIdRef = useRef("");
  const [previewState, setPreviewState] = useState<{
    srcDoc: string;
    buildError: string | null;
    runtimeError: string | null;
    ready: boolean;
  }>({
    srcDoc: "",
    buildError: null,
    runtimeError: null,
    ready: false,
  });

  useEffect(() => {
    const buildId = `preview-${Date.now()}-${buildIndexRef.current + 1}`;
    buildIndexRef.current += 1;
    activeBuildIdRef.current = buildId;
    let objectUrls: string[] = [];
    let disposed = false;

    setPreviewState({
      srcDoc: "",
      buildError: null,
      runtimeError: null,
      ready: false,
    });
    onBuildStart?.();

    void buildLocalPreviewDocument(files, entryFile, buildId)
      .then((result) => {
        if (disposed) {
          for (const url of result.objectUrls) {
            URL.revokeObjectURL(url);
          }
          return;
        }
        objectUrls = result.objectUrls;
        setPreviewState({
          srcDoc: result.srcDoc,
          buildError: null,
          runtimeError: null,
          ready: false,
        });
        onBuildReady?.();
      })
      .catch((error) => {
        if (disposed) return;
        const message = previewErrorMessage(error);
        setPreviewState({
          srcDoc: "",
          buildError: message,
          runtimeError: null,
          ready: false,
        });
        onBuildError?.(message);
      });

    return () => {
      disposed = true;
      for (const url of objectUrls) {
        URL.revokeObjectURL(url);
      }
    };
  }, [entryFile, files, onBuildError, onBuildReady, onBuildStart]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data as {
        source?: string;
        buildId?: string;
        type?: string;
        message?: string;
      };

      if (
        data.source !== "local-prototype-preview" ||
        data.buildId !== activeBuildIdRef.current
      ) {
        return;
      }

      if (data.type === "ready") {
        setPreviewState((current) => ({
          ...current,
          ready: true,
          runtimeError: null,
        }));
        return;
      }

      if (data.type === "error") {
        const message = data.message ?? "预览运行出错";
        setPreviewState((current) => ({
          ...current,
          ready: false,
          runtimeError: message,
        }));
        onBuildError?.(message);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onBuildError]);

  const previewMessage =
    previewState.buildError ??
    previewState.runtimeError ??
    (previewState.ready ? null : "预览正在编译");
  const isError = Boolean(previewState.buildError || previewState.runtimeError);

  const openPreviewWindow = useCallback(() => {
    if (!previewState.srcDoc) {
      toast.error(previewState.buildError ?? "预览还没有准备好");
      return;
    }

    const blobUrl = URL.createObjectURL(
      new Blob([previewState.srcDoc], { type: "text/html" }),
    );
    const opened = window.open(blobUrl, "_blank", "noopener,noreferrer");
    if (!opened) {
      URL.revokeObjectURL(blobUrl);
      toast.error("新窗口被浏览器拦截，请允许弹窗后重试");
      return;
    }
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  }, [previewState.buildError, previewState.srcDoc]);

  useImperativeHandle(ref, () => ({ openPreviewWindow }), [openPreviewWindow]);

  return (
    <div className="relative h-full overflow-hidden border border-border bg-background">
      {previewMessage && (
        <div
          data-testid="local-preview-status"
          className={cn(
            "absolute left-3 right-3 top-3 z-10 rounded-md border px-3 py-2 text-xs shadow-sm",
            isError
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-border bg-background/95 text-muted-foreground",
          )}
        >
          {previewMessage}
        </div>
      )}
      {previewState.srcDoc ? (
        <iframe
          title="Prototype Preview"
          sandbox="allow-scripts allow-forms"
          srcDoc={previewState.srcDoc}
          className="h-full w-full bg-white"
        />
      ) : (
        <div className="grid h-full place-items-center px-6 text-center text-xs text-muted-foreground">
          {previewState.buildError ?? "暂无可预览内容"}
        </div>
      )}
    </div>
  );
});
