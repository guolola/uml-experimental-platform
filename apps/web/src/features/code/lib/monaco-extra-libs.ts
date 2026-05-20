// Configures Monaco with lightweight React and runtime type declarations for prototypes.

import type { Monaco } from "@monaco-editor/react";

export const MONACO_REACT_TYPES = `
declare namespace JSX {
  interface Element {}
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}

declare module "react" {
  export type CSSProperties = Record<string, any>;
  export type ReactNode = any;
  export type SVGProps<T = any> = Record<string, any> & { ref?: any };
  export type ComponentType<P = Record<string, any>> = (props: P) => any;
  export type FC<P = Record<string, any>> = ComponentType<P>;
  export type ElementRef<T = any> = any;
  export type ComponentProps<T = any> = Record<string, any>;
  export type ComponentPropsWithoutRef<T = any> = Record<string, any>;
  export type ComponentPropsWithRef<T = any> = Record<string, any>;
  export type HTMLAttributes<T = any> = Record<string, any>;
  export type ButtonHTMLAttributes<T = any> = Record<string, any>;
  export type InputHTMLAttributes<T = any> = Record<string, any>;
  export const StrictMode: any;
  export const Fragment: any;
  export function createElement(...args: any[]): any;
  export function forwardRef<T = any, P = Record<string, any>>(render: (props: P, ref: any) => any): any;
  export function useCallback<T extends (...args: any[]) => any>(callback: T, deps: any[]): T;
  export function useEffect(effect: () => void | (() => void), deps?: any[]): void;
  export function useMemo<T>(factory: () => T, deps: any[]): T;
  export function useRef<T>(value: T): { current: T };
  export function useState<T>(value: T | (() => T)): [T, (next: T | ((current: T) => T)) => void];
  const React: {
    StrictMode: any;
    Fragment: any;
    createElement: typeof createElement;
    forwardRef: typeof forwardRef;
  };
  export default React;
}

declare module "react/jsx-runtime" {
  export const Fragment: any;
  export function jsx(...args: any[]): any;
  export function jsxs(...args: any[]): any;
}

declare module "react-dom/client" {
  export function createRoot(element: Element | DocumentFragment | null): {
    render(node: any): void;
    unmount(): void;
  };
}

declare module "*.css" {
  const content: string;
  export default content;
}
`;

export const MONACO_SHADCN_RUNTIME_TYPES = `
declare module "class-variance-authority" {
  export type VariantProps<T = any> = any;
  export function cva(...args: any[]): (...args: any[]) => string;
}

declare module "clsx" {
  export type ClassValue = any;
  export function clsx(...inputs: ClassValue[]): string;
  export default clsx;
}

declare module "tailwind-merge" {
  export function twMerge(...inputs: any[]): string;
}

declare module "@radix-ui/react-slot" {
  export const Slot: any;
}

declare module "@radix-ui/react-dialog" {
  export const Root: any;
  export const Trigger: any;
  export const Portal: any;
  export const Overlay: any;
  export const Content: any;
  export const Title: any;
  export const Description: any;
  export const Close: any;
}

declare module "@radix-ui/react-dropdown-menu" {
  export const Root: any;
  export const Trigger: any;
  export const Portal: any;
  export const Content: any;
  export const Group: any;
  export const Item: any;
  export const CheckboxItem: any;
  export const RadioItem: any;
  export const Label: any;
  export const Separator: any;
  export const Shortcut: any;
  export const Sub: any;
  export const SubTrigger: any;
  export const SubContent: any;
  export const RadioGroup: any;
}

declare module "@radix-ui/react-label" {
  export const Root: any;
}

declare module "@radix-ui/react-select" {
  export const Root: any;
  export const Group: any;
  export const Value: any;
  export const Trigger: any;
  export const Portal: any;
  export const Content: any;
  export const Viewport: any;
  export const Label: any;
  export const Item: any;
  export const ItemText: any;
  export const ItemIndicator: any;
  export const Separator: any;
  export const ScrollUpButton: any;
  export const ScrollDownButton: any;
  export const Icon: any;
}

declare module "@radix-ui/react-separator" {
  export const Root: any;
}

declare module "@radix-ui/react-switch" {
  export const Root: any;
  export const Thumb: any;
}

declare module "@radix-ui/react-tabs" {
  export const Root: any;
  export const List: any;
  export const Trigger: any;
  export const Content: any;
}

declare module "@radix-ui/react-checkbox" {
  export const Root: any;
  export const Indicator: any;
}
`;

export const MONACO_LUCIDE_TYPES = `
declare module "lucide-react" {
  import type { ComponentType, SVGProps } from "react";
  export type LucideIcon = ComponentType<SVGProps<SVGSVGElement>>;
  export const Activity: LucideIcon;
  export const AlertCircle: LucideIcon;
  export const AlertTriangle: LucideIcon;
  export const ArrowLeft: LucideIcon;
  export const ArrowRight: LucideIcon;
  export const BarChart3: LucideIcon;
  export const Bell: LucideIcon;
  export const Calendar: LucideIcon;
  export const Check: LucideIcon;
  export const CheckCircle: LucideIcon;
  export const CheckCircle2: LucideIcon;
  export const ChevronDown: LucideIcon;
  export const ChevronLeft: LucideIcon;
  export const ChevronRight: LucideIcon;
  export const ChevronUp: LucideIcon;
  export const Circle: LucideIcon;
  export const Clock: LucideIcon;
  export const Code2: LucideIcon;
  export const Database: LucideIcon;
  export const Download: LucideIcon;
  export const Edit: LucideIcon;
  export const Edit3: LucideIcon;
  export const Eye: LucideIcon;
  export const FileCode2: LucideIcon;
  export const FileText: LucideIcon;
  export const Filter: LucideIcon;
  export const Folder: LucideIcon;
  export const FolderTree: LucideIcon;
  export const Home: LucideIcon;
  export const Info: LucideIcon;
  export const LayoutDashboard: LucideIcon;
  export const Loader2: LucideIcon;
  export const LogIn: LucideIcon;
  export const LogOut: LucideIcon;
  export const Mail: LucideIcon;
  export const Menu: LucideIcon;
  export const MoreHorizontal: LucideIcon;
  export const Pencil: LucideIcon;
  export const Play: LucideIcon;
  export const Plus: LucideIcon;
  export const RefreshCw: LucideIcon;
  export const Save: LucideIcon;
  export const Search: LucideIcon;
  export const Settings: LucideIcon;
  export const Shield: LucideIcon;
  export const Trash: LucideIcon;
  export const Trash2: LucideIcon;
  export const User: LucideIcon;
  export const Users: LucideIcon;
  export const X: LucideIcon;
  export const XCircle: LucideIcon;
}
`;

let monacoConfigured = false;

export function configureMonacoForPrototype(monaco: Monaco) {
  if (monacoConfigured) return;

  const ts = monaco.languages.typescript;
  const compilerOptions = {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    jsx: ts.JsxEmit.ReactJSX,
    allowNonTsExtensions: true,
    allowSyntheticDefaultImports: true,
    esModuleInterop: true,
    isolatedModules: true,
    noEmit: true,
    resolveJsonModule: true,
    strict: false,
    baseUrl: "file:///",
  };

  ts.typescriptDefaults.setCompilerOptions(compilerOptions);
  ts.javascriptDefaults.setCompilerOptions(compilerOptions);
  ts.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });
  ts.typescriptDefaults.setEagerModelSync(true);
  ts.typescriptDefaults.addExtraLib(
    MONACO_REACT_TYPES,
    "file:///node_modules/@types/react-prototype/index.d.ts",
  );
  ts.typescriptDefaults.addExtraLib(
    MONACO_LUCIDE_TYPES,
    "file:///node_modules/@types/lucide-react/index.d.ts",
  );
  ts.typescriptDefaults.addExtraLib(
    MONACO_SHADCN_RUNTIME_TYPES,
    "file:///node_modules/@types/shadcn-preview-runtime/index.d.ts",
  );

  monacoConfigured = true;
}

export function shouldSyncMonacoModel(path: string) {
  return /\.(ts|tsx|js|jsx)$/.test(path);
}

export function monacoUriForPath(monaco: Monaco, path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return monaco.Uri.parse(`file://${normalizedPath}`);
}

export function isMonacoManualCancelation(reason: unknown) {
  if (!reason || typeof reason !== "object") return false;
  const value = reason as { type?: unknown; msg?: unknown };
  return (
    value.type === "cancelation" &&
    value.msg === "operation is manually canceled"
  );
}
