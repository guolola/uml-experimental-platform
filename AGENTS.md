# Codex Project Guidance

This repository is a TypeScript monorepo for the UML experimental platform. Keep changes aligned with the existing `apps/` and `packages/` workspace layout, and preserve the frontend boundaries between `app`, `features`, `entities`, `services`, and `shared`.

## Working Standards

- Read the relevant module, tests, and contracts before changing behavior.
- Keep edits scoped to the requested task; do not perform opportunistic rewrites or unrelated cleanup.
- Never revert user changes unless the user explicitly asks for that exact rollback.
- Prefer existing project patterns, components, helpers, and test utilities over new abstractions.
- Treat generated assets, vendor runtimes, large binaries, and caches as special-case artifacts; do not add them to source control unless the task explicitly requires it.

## Comments and Generated Files

- New files must start with a short responsibility note when their purpose is not obvious from the filename.
- Add concise comments for core workflows, state transitions, cross-module contracts, and non-obvious edge-case handling.
- Do not add noisy line-by-line comments or comments that merely restate the code.
- Generated code should include useful intent comments around important logic so future Codex runs and human maintainers can quickly understand the design.

## Frontend Expectations

- Keep page components focused on composition; move reusable state, derived rules, and workflow decisions into hooks or helpers when they start to grow.
- Preserve user-facing constraints in both UI state and action guards, then cover them with tests.
- Use existing shared UI primitives and maintain accessible labels for controls.
- When a model, diagram, or generation step has prerequisites, show the reason inline instead of only disabling controls.

## Verification

- Add or update tests for user-visible behavior changes.
- Prefer targeted tests first, then broader workspace scripts such as `npm run test:web` and `npm run typecheck:web`.
- If verification cannot be run, state the reason clearly in the final response.
