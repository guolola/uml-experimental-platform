// Guards the documented Radix/Tailwind shared UI system boundaries.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

type PackageManifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const requiredRuntimeDependencies = [
  "@radix-ui/react-checkbox",
  "@radix-ui/react-dialog",
  "@radix-ui/react-dropdown-menu",
  "@radix-ui/react-label",
  "@radix-ui/react-select",
  "@radix-ui/react-separator",
  "@radix-ui/react-slot",
  "@radix-ui/react-switch",
  "@radix-ui/react-tabs",
  "class-variance-authority",
  "clsx",
  "lucide-react",
  "tailwind-merge",
];

const requiredTailwindDependencies = ["tailwindcss", "@tailwindcss/vite"];

const disallowedUiLibraryFamilies = [
  {
    label: "MUI",
    matches: (dependencyName: string) => dependencyName.startsWith("@mui/"),
  },
  {
    label: "Ant Design",
    matches: (dependencyName: string) =>
      dependencyName === "antd" || dependencyName.startsWith("@ant-design/"),
  },
  {
    label: "Mantine",
    matches: (dependencyName: string) => dependencyName.startsWith("@mantine/"),
  },
];

const coreSharedUiFiles = [
  "badge.tsx",
  "button.tsx",
  "checkbox.tsx",
  "dialog.tsx",
  "dropdown-menu.tsx",
  "input.tsx",
  "label.tsx",
  "select.tsx",
  "separator.tsx",
  "switch.tsx",
  "tabs.tsx",
  "utils.ts",
];

const requiredThemeTokenMappings = [
  "--color-background: var(--background);",
  "--color-foreground: var(--foreground);",
  "--color-card: var(--card);",
  "--color-popover: var(--popover);",
  "--color-primary: var(--primary);",
  "--color-secondary: var(--secondary);",
  "--color-muted: var(--muted);",
  "--color-accent: var(--accent);",
  "--color-destructive: var(--destructive);",
  "--color-border: var(--border);",
  "--color-input: var(--input);",
  "--color-ring: var(--ring);",
  "--color-sidebar: var(--sidebar);",
  "--color-success: var(--success);",
  "--color-warning: var(--warning);",
  "--color-info: var(--info);",
  "--radius-md: var(--radius);",
  "--font-sans: var(--font-sans);",
  "--font-display: var(--font-display);",
  "--font-mono: var(--font-mono);",
];

const colorLiteralAllowedFiles = new Set([
  "src/app/styles/theme.css",
  "src/app/providers/theme-provider.test.tsx",
  "src/features/code/components/code-generation-page.test.tsx",
  "src/features/code/lib/default-prototype-files.ts",
  "src/features/code/lib/preview-runtime.ts",
]);

function readPackageManifest() {
  return JSON.parse(
    readFileSync("package.json", "utf-8"),
  ) as PackageManifest;
}

function sourceFilesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = `${directory}/${entry}`;
    const stat = statSync(path);
    if (stat.isDirectory()) {
      return sourceFilesUnder(path);
    }
    return [path];
  });
}

describe("frontend UI system governance", () => {
  it("keeps the app on the project-owned Radix and Tailwind UI stack", () => {
    const manifest = readPackageManifest();
    const allDependencies = {
      ...manifest.dependencies,
      ...manifest.devDependencies,
    };
    const dependencyNames = Object.keys(allDependencies);

    for (const dependencyName of requiredRuntimeDependencies) {
      expect(allDependencies, dependencyName).toHaveProperty(dependencyName);
    }
    for (const dependencyName of requiredTailwindDependencies) {
      expect(allDependencies, dependencyName).toHaveProperty(dependencyName);
    }

    const disallowedDependencies = dependencyNames.filter((dependencyName) =>
      disallowedUiLibraryFamilies.some((family) =>
        family.matches(dependencyName),
      ),
    );

    expect(disallowedDependencies).toEqual([]);
  });

  it("keeps shared primitives and theme token mappings in their documented homes", () => {
    const sharedUiFiles = new Set(readdirSync("src/shared/ui"));
    const themeCss = readFileSync("src/app/styles/theme.css", "utf-8");

    expect(existsSync("src/app/styles/theme.css")).toBe(true);
    for (const fileName of coreSharedUiFiles) {
      expect(sharedUiFiles, fileName).toContain(fileName);
    }
    for (const tokenMapping of requiredThemeTokenMappings) {
      expect(themeCss).toContain(tokenMapping);
    }
  });

  it("keeps raw theme color literals out of application UI source", () => {
    const rawColorLiteralPattern = /#[0-9a-fA-F]{3,8}\b|rgba?\(/u;
    const filesWithRawColors = sourceFilesUnder("src")
      .filter((filePath) => /\.(css|ts|tsx)$/.test(filePath))
      .filter((filePath) => !colorLiteralAllowedFiles.has(filePath))
      .filter((filePath) =>
        rawColorLiteralPattern.test(readFileSync(filePath, "utf-8")),
      );

    expect(filesWithRawColors).toEqual([]);
  });
});
