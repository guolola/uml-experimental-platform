# Select Dropdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace remaining native frontend dropdowns with the shared Radix Select component and polish the component into the approved restrained admin style.

**Architecture:** Keep dropdown behavior in `apps/web/src/shared/ui/select.tsx`, using Radix for focus, keyboard, ARIA, Portal, and selection semantics. Add a small `SelectControl` wrapper in the same file to make native select replacements concise and to map empty-string business values to a Radix-safe sentinel.

**Tech Stack:** React 18, TypeScript, Radix Select, Tailwind CSS 4, Vitest, Testing Library.

---

### Task 1: Shared Select Control Behavior

**Files:**
- Modify: `apps/web/src/shared/ui/select.tsx`
- Test: `apps/web/src/shared/ui/select.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/shared/ui/select.test.tsx` with a test that renders `SelectControl` using an empty-string option and verifies `onValueChange` receives `""` when that item is selected.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace @uml-platform/web -- src/shared/ui/select.test.tsx`

Expected: FAIL because `SelectControl` is not exported yet.

- [ ] **Step 3: Implement `SelectControl`**

Add `SelectControlOption`, `SelectControl`, and internal empty-value mapping in `select.tsx`. Keep the wrapper thin: it must compose `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, and `SelectItem`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace @uml-platform/web -- src/shared/ui/select.test.tsx`

Expected: PASS.

### Task 2: Shared Select Visual Polish

**Files:**
- Modify: `apps/web/src/shared/ui/select.tsx`

- [ ] **Step 1: Update trigger styles**

Adjust `SelectTrigger` classes to the approved style: `rounded-lg`, subtle border, `bg-background`, hover border/background, visible focus ring, `shadow-xs`, stable heights for `size="sm"` and default.

- [ ] **Step 2: Update content and item styles**

Adjust `SelectContent` classes to use popover background, border, stronger but restrained shadow, and `min-w-[var(--radix-select-trigger-width)]`. Adjust `SelectItem` classes for `cursor-pointer`, accent hover/focus, selected check visibility, and stable text truncation.

- [ ] **Step 3: Re-run the shared select test**

Run: `npm run test --workspace @uml-platform/web -- src/shared/ui/select.test.tsx`

Expected: PASS.

### Task 3: Replace Native Selects In Feature Pages

**Files:**
- Modify: `apps/web/src/features/user-platform/components/user-platform-pages.tsx`
- Modify: `apps/web/src/features/requirements/components/text-requirement-page.tsx`
- Modify: `apps/web/src/features/documents/components/instruction-documents-page.tsx`
- Modify: `apps/web/src/features/traceability/components/traceability-matrix-page.tsx`

- [ ] **Step 1: Replace static option native selects**

Use `SelectControl` for sort order, project type, visibility, run status, model, stage, document kind, and traceability filters. Preserve current labels, `aria-label`s, widths, disabled states, and `onChange` effects.

- [ ] **Step 2: Replace dynamic option native selects**

Use `SelectControl` for provider config, roles, page size, generated model lists, and category filters. Convert numeric values to strings at the component boundary and cast back in the handler where needed.

- [ ] **Step 3: Verify no native select remains in source**

Run: `rg -n "<select|<option|</select>|</option>" apps/web/src`

Expected: no matches in `apps/web/src`.

### Task 4: Regression Tests And Typecheck

**Files:**
- Test: existing feature tests under `apps/web/src/features/**`

- [ ] **Step 1: Run targeted tests**

Run: `npm run test --workspace @uml-platform/web -- src/shared/ui/select.test.tsx src/features/requirements/components/text-requirement-page.test.tsx src/features/traceability/components/traceability-matrix-page.test.tsx`

Expected: PASS.

- [ ] **Step 2: Run frontend typecheck**

Run: `npm run typecheck --workspace @uml-platform/web`

Expected: PASS.
