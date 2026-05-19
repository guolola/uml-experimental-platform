// Owns prototype file state, file-tree derivation, and Sandpack file mapping.
import { useEffect, useMemo, useState } from "react";
import type { SandpackFiles } from "@codesandbox/sandpack-react";

const DEFAULT_EXPANDED_DIRS = new Set([
  "/src",
  "/src/components",
  "/src/data",
  "/src/domain",
]);

export type FileTreeNode = {
  type: "directory" | "file";
  name: string;
  path: string;
  children: FileTreeNode[];
};

function sortFileTreeNodes(nodes: FileTreeNode[]) {
  nodes.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "directory" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
  for (const node of nodes) {
    sortFileTreeNodes(node.children);
  }
}

function buildFileTree(paths: string[]) {
  const root: FileTreeNode = {
    type: "directory",
    name: "",
    path: "/",
    children: [],
  };
  const directories = new Map<string, FileTreeNode>([["/", root]]);

  for (const path of paths) {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const parts = normalizedPath.split("/").filter(Boolean);
    let current = root;

    for (let index = 0; index < parts.length; index += 1) {
      const name = parts[index];
      const nodePath = `/${parts.slice(0, index + 1).join("/")}`;
      const isFile = index === parts.length - 1;

      if (isFile) {
        if (!current.children.some((node) => node.path === nodePath)) {
          current.children.push({
            type: "file",
            name,
            path: nodePath,
            children: [],
          });
        }
        continue;
      }

      let directory = directories.get(nodePath);
      if (!directory) {
        directory = {
          type: "directory",
          name,
          path: nodePath,
          children: [],
        };
        directories.set(nodePath, directory);
        current.children.push(directory);
      }
      current = directory;
    }
  }

  sortFileTreeNodes(root.children);
  return root.children;
}

function parentDirectoriesForPath(path: string) {
  const parts = path.split("/").filter(Boolean);
  return parts.slice(0, -1).map((_, index) => `/${parts.slice(0, index + 1).join("/")}`);
}

function ensureVisibleFile(files: Record<string, string>, current: string | null) {
  if (current && files[current] !== undefined) {
    return current;
  }
  return files["/src/App.tsx"] !== undefined
    ? "/src/App.tsx"
    : Object.keys(files).sort()[0] ?? "/src/App.tsx";
}

function toSandpackFiles(files: Record<string, string>, activeFile: string): SandpackFiles {
  return Object.fromEntries(
    Object.entries(files).map(([path, code]) => [
      path,
      {
        code,
        active: path === activeFile,
      },
    ]),
  );
}

export function usePrototypeFiles({
  defaultFiles,
  generatedFiles,
  entryFile,
  onFileChange,
}: {
  defaultFiles: Record<string, string>;
  generatedFiles: Record<string, string>;
  entryFile: string | null;
  onFileChange: (path: string, value: string) => void;
}) {
  const initialFiles = useMemo(
    () =>
      Object.keys(generatedFiles).length > 0
        ? { ...defaultFiles, ...generatedFiles }
        : defaultFiles,
    [defaultFiles, generatedFiles],
  );
  const [files, setFiles] = useState<Record<string, string>>(initialFiles);
  const [activeFile, setActiveFile] = useState(() =>
    ensureVisibleFile(initialFiles, entryFile),
  );
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(
    () => new Set(DEFAULT_EXPANDED_DIRS),
  );

  useEffect(() => {
    setFiles(initialFiles);
    setActiveFile((current) => ensureVisibleFile(initialFiles, current));
  }, [initialFiles]);

  useEffect(() => {
    setExpandedDirs((current) => {
      const next = new Set(current);
      for (const directory of parentDirectoriesForPath(activeFile)) {
        next.add(directory);
      }
      return next;
    });
  }, [activeFile]);

  const sortedFiles = Object.keys(files).sort((a, b) => a.localeCompare(b));
  const fileTree = useMemo(() => buildFileTree(sortedFiles), [sortedFiles]);
  const sandpackFiles = useMemo(
    () => toSandpackFiles(files, activeFile),
    [activeFile, files],
  );

  const updateFile = (path: string, value: string) => {
    setFiles((current) => ({ ...current, [path]: value }));
    onFileChange(path, value);
  };

  const toggleDirectory = (path: string) => {
    setExpandedDirs((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  return {
    files,
    activeFile,
    setActiveFile,
    expandedDirs,
    sortedFiles,
    fileTree,
    sandpackFiles,
    updateFile,
    toggleDirectory,
  };
}
