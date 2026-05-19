// Bridges generated prototype files into Monaco models and the active editor.

import { useEffect, useRef } from "react";
import Editor, { useMonaco } from "@monaco-editor/react";
import {
  configureMonacoForPrototype,
  monacoUriForPath,
  shouldSyncMonacoModel,
} from "../lib/monaco-extra-libs";
import { languageForPath } from "../lib/file-paths";

export function MonacoFileModelSync({
  files,
}: {
  files: Record<string, string>;
}) {
  const monaco = useMonaco();
  const createdModelUrisRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!monaco) return;

    configureMonacoForPrototype(monaco);
    const activeUris = new Set<string>();

    for (const [path, code] of Object.entries(files)) {
      if (!shouldSyncMonacoModel(path)) continue;

      const uri = monacoUriForPath(monaco, path);
      const uriString = uri.toString();
      activeUris.add(uriString);

      const existingModel = monaco.editor.getModel(uri);
      if (existingModel) {
        if (existingModel.getValue() !== code) {
          existingModel.setValue(code);
        }
        continue;
      }

      monaco.editor.createModel(code, languageForPath(path), uri);
      createdModelUrisRef.current.add(uriString);
    }

    for (const uriString of [...createdModelUrisRef.current]) {
      if (activeUris.has(uriString)) continue;

      const model = monaco.editor.getModel(monaco.Uri.parse(uriString));
      model?.dispose();
      createdModelUrisRef.current.delete(uriString);
    }
  }, [files, monaco]);

  return null;
}

export function EditorBridge({
  activeFile,
  files,
  onChange,
}: {
  activeFile: string;
  files: Record<string, string>;
  onChange: (path: string, value: string) => void;
}) {
  const value = files[activeFile] ?? "";

  return (
    <Editor
      height="100%"
      path={activeFile}
      value={value}
      language={languageForPath(activeFile)}
      theme="vs-dark"
      beforeMount={configureMonacoForPrototype}
      options={{
        minimap: { enabled: false },
        fontSize: 13,
        lineHeight: 20,
        wordWrap: "on",
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
      }}
      onChange={(next) => {
        const code = next ?? "";
        onChange(activeFile, code);
      }}
    />
  );
}
