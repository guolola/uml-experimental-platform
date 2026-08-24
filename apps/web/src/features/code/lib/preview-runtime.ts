// Builds the local iframe preview document and rewrites generated module imports.

import type * as TypeScript from "typescript";

export type PreviewBuildResult = {
  srcDoc: string;
  objectUrls: string[];
};

export const PREVIEW_IMPORT_MAP = {
  react: "https://esm.sh/react@18.3.1",
  "react-dom": "https://esm.sh/react-dom@18.3.1?external=react",
  "react/jsx-runtime": "https://esm.sh/react@18.3.1/jsx-runtime",
  "react/jsx-dev-runtime": "https://esm.sh/react@18.3.1/jsx-dev-runtime",
  "react-dom/client": "https://esm.sh/react-dom@18.3.1/client",
  "lucide-react": "https://esm.sh/lucide-react@0.487.0?external=react",
  "@radix-ui/react-slot": "https://esm.sh/@radix-ui/react-slot@1.1.2?bundle&external=react",
  "@radix-ui/react-dialog": "https://esm.sh/@radix-ui/react-dialog@1.1.6?bundle&external=react,react-dom",
  "@radix-ui/react-dropdown-menu": "https://esm.sh/@radix-ui/react-dropdown-menu@2.1.6?bundle&external=react,react-dom",
  "@radix-ui/react-label": "https://esm.sh/@radix-ui/react-label@2.1.2?bundle&external=react,react-dom",
  "@radix-ui/react-select": "https://esm.sh/@radix-ui/react-select@2.1.6?bundle&external=react,react-dom",
  "@radix-ui/react-separator": "https://esm.sh/@radix-ui/react-separator@1.1.2?bundle&external=react",
  "@radix-ui/react-switch": "https://esm.sh/@radix-ui/react-switch@1.1.3?bundle&external=react,react-dom",
  "@radix-ui/react-tabs": "https://esm.sh/@radix-ui/react-tabs@1.1.3?bundle&external=react",
  "@radix-ui/react-checkbox": "https://esm.sh/@radix-ui/react-checkbox@1.1.4?bundle&external=react,react-dom",
  "class-variance-authority": "https://esm.sh/class-variance-authority@0.7.1",
  clsx: "https://esm.sh/clsx@2.1.1",
  "tailwind-merge": "https://esm.sh/tailwind-merge@3.2.0",
};

export function normalizePreviewPath(path: string) {
  const parts = path.split("/").filter(Boolean);
  const normalized: string[] = [];

  for (const part of parts) {
    if (part === ".") continue;
    if (part === "..") {
      normalized.pop();
      continue;
    }
    normalized.push(part);
  }

  return `/${normalized.join("/")}`;
}

export function isPreviewLocalImport(specifier: string) {
  return (
    specifier.startsWith(".") ||
    specifier.startsWith("/") ||
    specifier.startsWith("@/")
  );
}

export function resolvePreviewImport(
  fromPath: string,
  specifier: string,
  files: Record<string, string>,
) {
  if (!isPreviewLocalImport(specifier)) return null;

  const fromDirectory = fromPath.split("/").slice(0, -1).join("/") || "/";
  const rawPath = specifier.startsWith("@/")
    ? `/src/${specifier.slice(2)}`
    : specifier.startsWith("/")
      ? specifier
      : `${fromDirectory}/${specifier}`;
  const normalizedPath = normalizePreviewPath(rawPath);
  const candidates = [
    normalizedPath,
    `${normalizedPath}.tsx`,
    `${normalizedPath}.ts`,
    `${normalizedPath}.jsx`,
    `${normalizedPath}.js`,
    `${normalizedPath}.css`,
    `${normalizedPath}/index.tsx`,
    `${normalizedPath}/index.ts`,
    `${normalizedPath}/index.jsx`,
    `${normalizedPath}/index.js`,
  ];

  return candidates.find((candidate) => files[candidate] !== undefined) ?? null;
}

export function previewErrorMessage(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  if (
    /Failed to fetch dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message)
  ) {
    return "页面资源已更新，请刷新页面后再运行预览。";
  }

  return message || "预览构建失败";
}

export function previewModuleUrl(source: string) {
  return `data:text/javascript;base64,${btoa(unescape(encodeURIComponent(source)))}`;
}

export async function buildLocalPreviewDocument(
  files: Record<string, string>,
  preferredEntryFile: string,
  buildId: string,
): Promise<PreviewBuildResult> {
  const ts: typeof TypeScript = await import("typescript");

  const entryFile = files["/src/main.tsx"]
    ? "/src/main.tsx"
    : files[preferredEntryFile]
      ? preferredEntryFile
      : Object.keys(files).find((path) => /\.(tsx|ts|jsx|js)$/.test(path));

  if (!entryFile) {
    throw new Error("没有找到可运行的入口文件。");
  }

  const objectUrls: string[] = [];
  const compiledUrls = new Map<string, string>();
  const compilingFiles = new Set<string>();
  const importExpressionPattern =
    /((?:import|export)\s+(?:[^'"]*?\s+from\s*)?["'])([^"']+)(["'])/g;

  const compileFile = (path: string): string => {
    const existingUrl = compiledUrls.get(path);
    if (existingUrl) return existingUrl;

    const source = files[path];
    if (source === undefined) {
      throw new Error(`预览文件不存在: ${path}`);
    }

    if (compilingFiles.has(path)) {
      throw new Error(`检测到循环导入，暂时无法预览: ${path}`);
    }
    compilingFiles.add(path);

    if (path.endsWith(".css")) {
      const cssModule = [
        "const style = document.createElement('style');",
        `style.dataset.previewFile = ${JSON.stringify(path)};`,
        `style.textContent = ${JSON.stringify(source)};`,
        "document.head.appendChild(style);",
        "export default style.textContent;",
      ].join("\n");
      const url = previewModuleUrl(cssModule);
      compiledUrls.set(path, url);
      compilingFiles.delete(path);
      return url;
    }

    const output = ts.transpileModule(source, {
      fileName: path,
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2020,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
        allowSyntheticDefaultImports: true,
        esModuleInterop: true,
        isolatedModules: true,
        resolveJsonModule: true,
      },
      reportDiagnostics: false,
    }).outputText;

    const rewrittenOutput = output.replace(
      importExpressionPattern,
      (match, prefix: string, specifier: string, quote: string) => {
        if (!isPreviewLocalImport(specifier)) return match;

        const resolvedPath = resolvePreviewImport(path, specifier, files);
        if (!resolvedPath) {
          throw new Error(`${path} 无法解析导入 ${specifier}`);
        }

        return `${prefix}${compileFile(resolvedPath)}${quote}`;
      },
    );

    const url = previewModuleUrl(rewrittenOutput);
    compiledUrls.set(path, url);
    compilingFiles.delete(path);
    return url;
  };

  const entryUrl = compileFile(entryFile);
  const importMap = JSON.stringify({ imports: PREVIEW_IMPORT_MAP });
  const tailwindBrowserUrl = new URL(
    "/vendor/tailwindcss-browser.js",
    window.location.origin,
  ).toString();
  const srcDoc = [
    "<!doctype html>",
    '<html lang="zh-CN">',
    "  <head>",
    '    <meta charset="UTF-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    "    <style>",
    "      html, body, #root { min-height: 100%; margin: 0; }",
    "      body { background: #ffffff; }",
    "    </style>",
    "    <style type=\"text/tailwindcss\">",
    "      @custom-variant dark (&:where(.dark, .dark *, [data-theme=\"dark\"], [data-theme=\"dark\"] *));",
    "    </style>",
    `    <script type="importmap">${importMap}</script>`,
    `    <script src="${tailwindBrowserUrl}"></script>`,
    "  </head>",
    "  <body>",
    '    <div id="root"></div>',
    "    <script>",
    `      const buildId = ${JSON.stringify(buildId)};`,
    "      const report = (type, message) => parent.postMessage({ source: 'local-prototype-preview', buildId, type, message }, '*');",
    "      document.addEventListener('click', (event) => {",
    "        const target = event.target instanceof Element ? event.target.closest('a[href^=\"#\"]') : null;",
    "        if (target) event.preventDefault();",
    "      });",
    "      window.addEventListener('error', (event) => report('error', event.message || '预览运行出错'));",
    "      window.addEventListener('unhandledrejection', (event) => {",
    "        const reason = event.reason;",
    "        report('error', reason && reason.message ? reason.message : String(reason || '预览运行出错'));",
    "      });",
    "    </script>",
    "    <script type=\"module\">",
    `      import(${JSON.stringify(entryUrl)})`,
    "        .then(() => parent.postMessage({ source: 'local-prototype-preview', buildId, type: 'ready' }, '*'))",
    "        .catch((error) => parent.postMessage({ source: 'local-prototype-preview', buildId, type: 'error', message: error && error.message ? error.message : String(error) }, '*'));",
    "    </script>",
    "  </body>",
    "</html>",
  ].join("\n");

  return { srcDoc, objectUrls };
}
