// Renders the generated prototype file tree with collapsible directories.

import { ChevronDown, ChevronRight, FileCode2, Folder, FolderOpen } from "lucide-react";
import { cn } from "../../../shared/ui/utils";
import type { FileTreeNode } from "../hooks/use-prototype-files";

export function FileTree({
  nodes,
  activeFile,
  expandedDirs,
  onToggleDirectory,
  onSelectFile,
}: {
  nodes: FileTreeNode[];
  activeFile: string;
  expandedDirs: Set<string>;
  onToggleDirectory: (path: string) => void;
  onSelectFile: (path: string) => void;
}) {
  const renderNode = (node: FileTreeNode, depth: number) => {
    const isDirectory = node.type === "directory";
    const isExpanded = expandedDirs.has(node.path);

    if (isDirectory) {
      const DirectoryIcon = isExpanded ? FolderOpen : Folder;
      return (
        <div key={node.path}>
          <button
            type="button"
            onClick={() => onToggleDirectory(node.path)}
            aria-expanded={isExpanded}
            data-testid={`file-tree-dir-${node.path}`}
            className="flex h-8 w-full items-center gap-1.5 px-2 text-left text-xs text-sidebar-foreground/85 transition-colors hover:bg-muted hover:text-sidebar-foreground"
            style={{ paddingLeft: 8 + depth * 14 }}
          >
            {isExpanded ? (
              <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
            )}
            <DirectoryIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{node.name}</span>
          </button>
          {isExpanded &&
            node.children.map((child) => renderNode(child, depth + 1))}
        </div>
      );
    }

    return (
      <button
        key={node.path}
        type="button"
        onClick={() => onSelectFile(node.path)}
        data-testid={`file-tree-file-${node.path}`}
        className={cn(
          "flex h-8 w-full items-center gap-2 px-2 text-left text-xs transition-colors",
          activeFile === node.path
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/80 hover:bg-muted hover:text-sidebar-foreground",
        )}
        style={{ paddingLeft: 24 + depth * 14 }}
      >
        <FileCode2 className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
      </button>
    );
  };

  return <>{nodes.map((node) => renderNode(node, 0))}</>;
}
