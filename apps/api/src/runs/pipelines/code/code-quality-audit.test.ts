// Verifies deterministic preview-breaking import checks for generated code.
import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyCodeSnapshot } from "../../records/snapshots.js";
import {
  auditCodePrototypeQuality,
  findMissingLocalUiNamedExports,
} from "./code-quality-audit.js";

function createSnapshotWithDialogSource(dialogSource: string) {
  const snapshot = createEmptyCodeSnapshot("code-audit-test", {
    requirementText: "学生预约图书馆座位。",
    rules: [],
    designModels: [],
  });
  snapshot.entryFile = "/src/App.tsx";
  snapshot.files = {
    "/src/App.tsx": "export function App() { return null; }",
    "/src/components/WorkspaceShell.tsx":
      "export function WorkspaceShell() { return null; }",
    "/src/domain/types.ts": "export interface Seat { id: string }",
    "/src/data/mock-data.ts": "export const seats = [];",
    "/src/styles.css":
      ":root { --bg:#fff; --surface:#fff; --text:#111; --muted:#666; --primary:#2563eb; --border:#ddd; } [data-theme=\"dark\"] { --bg:#111; }",
    "/src/lib/utils.ts":
      "import { clsx } from 'clsx'; export function cn(...inputs: unknown[]) { return clsx(inputs); }",
    "/src/components/ui/button.tsx":
      "import { cva } from 'class-variance-authority'; export const buttonVariants = cva('inline-flex'); export function Button() { return null; }",
    "/src/components/ui/dialog.tsx": dialogSource,
    "/src/pages/AdminSeatManagementPage.tsx":
      "import { Dialog, DialogContent } from '../components/ui/dialog'; export function Page() { return <Dialog open={false} onOpenChange={() => undefined}><DialogContent /></Dialog>; }",
  };
  return snapshot;
}

test("findMissingLocalUiNamedExports reports imported UI names that are not exported", () => {
  const snapshot = createSnapshotWithDialogSource(
    "export function Dialog() { return null; }",
  );

  assert.deepEqual(findMissingLocalUiNamedExports(snapshot), [
    {
      path: "/src/components/ui/dialog.tsx",
      names: ["DialogContent"],
    },
  ]);
  const diagnostic = auditCodePrototypeQuality(snapshot);
  assert.equal(
    diagnostic.issues.some(
      (issue) =>
        issue.path === "/src/components/ui/dialog.tsx" &&
        issue.message.includes("DialogContent"),
    ),
    true,
  );
});

test("findMissingLocalUiNamedExports accepts declared named UI exports", () => {
  const snapshot = createSnapshotWithDialogSource(
    "export function Dialog() { return null; } export const DialogContent = () => null;",
  );

  assert.deepEqual(findMissingLocalUiNamedExports(snapshot), []);
});
