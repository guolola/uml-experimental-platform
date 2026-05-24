# Test And Evidence Plan

This document defines how to verify the trusted chain. It intentionally includes both positive and negative cases.

## Regression Domains

The platform should not be judged only by a single library-management example. Use a cross-domain suite:

| Domain | What it should test |
|---|---|
| Library management | Borrowing rules, overdue returns, inventory states, member roles. |
| E-commerce orders | Cart, order creation, payment state, cancellation, refunds, stock boundaries. |
| Hospital appointment scheduling | Patient roles, doctor availability, appointment status, privacy-sensitive data. |
| Course selection | Student prerequisites, capacity limits, timetable conflicts, enrollment states. |
| Dormitory repair | Request submission, assignment, status transitions, feedback, SLA-like non-functional needs. |
| Inventory purchasing | Supplier, purchase request, approval, receiving, stock consistency. |
| Permission approval flow | Role-based approval, escalation, rejection, audit trail, state transitions. |

## Positive Test Expectations

Each domain should verify:

- Original requirements are preserved as source fragments.
- Atomic requirements are not under-extracted.
- Ambiguity and assumptions are explicitly recorded.
- Each critical requirement has a model, code, test, or review path.
- Requirements model elements trace back to requirements.
- Design model elements trace back to requirements or requirements-model elements.
- Code artifacts trace back to requirements.
- Business assertions are generated and run.
- Evidence package contains baseline, coverage, traceability, review items, tests, and repair logs.
- Browser-controlled acceptance checks confirm the user-visible flow matches backend evidence.

## Negative Tests

| Case | Expected behavior |
|---|---|
| Conflicting requirements | Mark conflict and block downstream generation until reviewed. |
| Missing role | Mark pending-review or ambiguity; do not invent a role as confirmed. |
| Missing boundary value | Mark incomplete acceptance criteria or pending-review. |
| Non-functional requirement cannot be diagrammed | Mark `not-modelable` and require alternative evidence. |
| Fake traceability | Fail trace integrity check if semantic coverage is absent. |
| Code only generates pages | Fail business assertion coverage for behavior requirements. |
| Model element has no requirement | Mark orphan model artifact. |
| Code path has no requirement | Mark orphan code artifact unless tied to approved infrastructure assumption. |
| Test has no requirement | Mark orphan test or classify as infrastructure test. |
| Low confidence critical requirement | Block downstream generation or require human approval. |

## Evidence Package Assertions

A run should pass only if the evidence package includes:

- RequirementBaseline reference.
- Requirement quality report.
- Coverage matrix.
- Traceability matrix.
- Model artifacts.
- Code artifacts.
- Business assertion results.
- Test results.
- Browser acceptance results for user-facing workflows.
- Human review items.
- Failure and repair records when applicable.

## Minimum Quality Gates

1. No critical accepted requirement may lack an explicit coverage status of `covered`, `partially-covered`, `not-modelable`, `pending-review`, or `conflict`.
2. No conflict may continue downstream without a human decision.
3. No critical low-confidence requirement may be silently generated.
4. No generated model element may be untraceable unless explicitly classified as layout, infrastructure, or approved derived artifact.
5. No generated business code may be marked complete without a requirement link and test or accepted manual evidence.
6. No non-functional requirement may be dropped because it is not diagrammable.
7. No user-facing generated workflow may be accepted without browser-controlled verification when the UI is part of the claimed output.

## Browser Acceptance Checks

When the platform generates or presents web workflows, acceptance must include browser control through Playwright or an equivalent browser automation tool.

Required checks:

- Open the run creation or run result page and verify the chain status is visible.
- Verify RequirementBaseline, coverage matrix, traceability matrix, pending review items, and evidence package are reachable or exportable.
- Submit at least one representative happy-path example and confirm the UI result matches backend evidence.
- Submit conflict, missing-role, missing-boundary, non-functional, fake-traceability, and UI-only-code negative cases when implemented.
- Confirm blocked states prevent downstream generation and show the reason inline.
- Confirm console errors and failed network requests are absent or documented.
- Capture screenshots for pass, fail, and blocked states when visual evidence matters.

## Manual Review Evidence

Manual review items should record:

- Requirement ID.
- Reason for review.
- Options presented to reviewer.
- Decision.
- Reviewer identity or session marker where available.
- Timestamp.
- Downstream artifacts affected by the decision.

## Final Verification Command Log

When implementation begins, record exact commands and results here:

| Date | Command | Purpose | Result | Notes |
|---|---|---|---|---|
| 2026-05-24 | Pending | Audit workbench setup only. | Pending. | No implementation verification run yet. |
| 2026-05-24 | `rg -n "RequirementBaseline|AtomicRequirement|CoverageMatrix|EvidencePackage|TraceabilityMatrix" packages/contracts/src apps/api/src apps/web/src packages/harness-e2e/src --glob "!**/public/**"` | Phase 0 source revalidation for first-class trusted-chain artifacts. | Found only frontend `TraceabilityMatrixPage` naming; no first-class baseline, coverage matrix, traceability matrix, or evidence package contracts/API artifacts. | Confirms F-001, F-003, F-004, F-008, and F-009 remain open. |
| 2026-05-24 | `rg -n "status = \"completed\"|pending|auto-filled|confidence|quality|fidelity|business" apps/api/src/runs/pipelines apps/api/src/normalizers apps/api/src/documents --glob "!**/public/**"` | Phase 0 source revalidation for pending-review and terminal gate behavior. | Found design auto-fill as pending/low confidence and pipelines still setting completed snapshots; code quality/fidelity checks exist but are not requirement-linked business assertions. | Confirms F-005, F-006, and F-007 remain open. |
| 2026-05-24 | Read `packages/harness-e2e/README.md` and `packages/harness-e2e/src/index.ts`. | Phase 0 browser acceptance revalidation. | Package is still a browser/integration smoke-test scaffold with no trusted-chain browser acceptance checks. | Confirms F-010 remains open. |
| 2026-05-24 | `npm run test:contracts` | Phase 0 contract regression check for current traceability-related contracts. | Passed: 19 tests, 0 failures. | Existing contracts still validate pending design traceability but do not define trusted-chain baseline/coverage/evidence artifacts. |
| 2026-05-24 | `npx tsx --test apps/api/src/normalizers/traceability/traceability-normalizer.test.ts apps/api/src/documents/context/document-context.test.ts` | Phase 0 API targeted check for traceability normalization and document review cues. | Passed: 8 tests, 0 failures. | Confirms current local traceability/document cues are stable. |
| 2026-05-24 | `npm run test --workspace @uml-platform/web -- src/features/workspace-session/lib/generation-tasks.test.ts` | Phase 0 frontend targeted check for pending-review task visibility. | Passed: 1 test file, 2 tests, 0 failures. | Confirms pending traceability is visible in task summaries, not a hard trusted-chain gate. |
| 2026-05-24 | `npm run test:contracts` | Phase 1 contract verification for RequirementBaseline schemas. | Passed: 20 tests, 0 failures. | Includes `contracts describe source-attributed requirement baselines`. |
| 2026-05-24 | `npx tsx --test apps/api/src/runs/baselines/requirement-baseline.test.ts apps/api/src/runs/records/snapshots.test.ts` | Phase 1 targeted API verification for baseline builder and snapshot persistence. | Passed: 7 tests, 0 failures. | Covers source attribution, missing role blocking, conflict blocking, and snapshot baseline creation. |
| 2026-05-24 | `npm run test:api` | Phase 1 full API regression. | Passed: 236 tests, 0 failures. | Confirms baseline gates do not break existing happy-path requirements/design/code/document runs. |
| 2026-05-24 | `npm run build:api` | Phase 1 TypeScript build verification. | Passed. | Contracts were rebuilt first so API consumed the new baseline exports. |
| 2026-05-24 | `npm run typecheck:web` | Phase 1 frontend typecheck smoke check. | Failed with pre-existing web type errors around `visibleGenerationTask`, `RunStatus` including `cancelled`, diagram `modelId`, SVG `generatedAt`, and diagram error shape conversions. | Not caused by Phase 1 baseline files; must be resolved before final Phase 7/browser acceptance. |
| 2026-05-24 | `npm run test:contracts` | Phase 2 contract verification for CoverageMatrix and TraceabilityMatrix schemas. | Passed: 21 tests, 0 failures. | Includes required coverage status enum rejection and bidirectional traceability matrix parsing. |
| 2026-05-24 | `npm run build:contracts` | Phase 2 rebuild so API consumes new matrix exports. | Passed. | Required before API tests imported `coverageMatrixSchema` and `traceabilityMatrixSchema` from the workspace package. |
| 2026-05-24 | `npx tsx --test apps/api/src/runs/traceability/trusted-chain-traceability.test.ts` | Phase 2 targeted API verification for trusted-chain builder and gates. | Passed: 5 tests, 0 failures. | Covers covered requirement links, uncovered accepted requirements, orphan model artifacts, shallow placeholder traceability, and orphan code artifacts. |
| 2026-05-24 | `npm run build:api` | Phase 2 TypeScript build verification. | Passed. | Confirms requirements/design/code pipeline matrix gates and snapshot contract changes compile. |
| 2026-05-24 | `npm run test:api` | Phase 2 full API regression. | Passed: 241 tests, 0 failures. | Confirms matrix artifact events and completion gates do not break existing requirement, design, code, document, project, auth, and admin API flows. |
| 2026-05-24 | `npm run typecheck:web` | Phase 2 frontend smoke check after contract changes. | Failed with existing web type errors around `modelId`, `visibleGenerationTask`, `RunStatus` including `cancelled`, SVG `generatedAt`, and diagram error shape conversions. | Same class as Phase 1; frontend trusted-chain review UI remains future Phase 5/7 work. |
| 2026-05-24 | `npx tsx --test apps/api/src/runs/baselines/requirement-baseline.test.ts` | Phase 3 RED/targeted verification for domain-generic baseline actor/object extraction. | Initially failed on `仓库主管可以审核采购单。`; passed after structural actor/object extraction was implemented: 4 tests, 0 failures. | Prevents RequirementBaseline from relying only on a fixed actor vocabulary. |
| 2026-05-24 | `npx tsx --test apps/api/src/runs/traceability/trusted-chain-traceability.test.ts` | Phase 3 targeted verification for semantic model gates and non-functional `not-modelable` handling. | Passed: 8 tests, 0 failures. | Covers semantic use-case mismatch, sequence workflow mismatch, NFR alternative-evidence review path, and previous Phase 2 traceability gates. |
| 2026-05-24 | `npx tsx --test apps/api/src/runs/traceability/trusted-chain-traceability.test.ts` | Phase 3 follow-up for non-lexical semantic coverage. | Initially failed for `管理员必须审批退款` traced to `查看退款记录`; passed after behavior requirements were changed to require action-slot evidence plus object evidence where applicable: 11 tests, 0 failures. | Prevents object-only word overlap from being treated as trusted model coverage. |
| 2026-05-24 | `npm run build:contracts` | Phase 3 rebuild so API consumes `semantic-model-gap` contract changes. | Passed. | Required before API build/tests after contract enum update. |
| 2026-05-24 | `npm run test:contracts` | Phase 3 contract regression after diagnostic enum update. | Passed: 21 tests, 0 failures. | Existing coverage/traceability contracts remain stable. |
| 2026-05-24 | `npm run build:api` | Phase 3 API TypeScript build verification. | Passed. | Confirms semantic gate changes compile and code skills copy succeeds. |
| 2026-05-24 | `npm run test --workspace @uml-platform/api` | Phase 3 full API regression. | Passed: 245 tests, 0 failures. | Required several fixture corrections where happy-path tests had mismatched requirements/models that Phase 3 now correctly blocks. |
| 2026-05-24 | `npm run typecheck:web` | Phase 3 frontend smoke check. | Failed with existing web type errors around `modelId`, `visibleGenerationTask`, `RunStatus.cancelled`, SVG `generatedAt`, and diagram error shape conversions. | Not caused by Phase 3 backend gate files; remains a prerequisite before Phase 7 browser acceptance can be called complete. |
| 2026-05-24 | `npm run test:contracts` | Phase 4 RED/targeted contract verification for requirement-linked code business assertions. | Initially failed because `codeBusinessAssertionResultSchema` did not exist; passed after contract implementation: 22 tests, 0 failures. | Adds assertion result schema and `business-assertion-gap` diagnostic support. |
| 2026-05-24 | `npx tsx --test apps/api/src/runs/pipelines/code/code-business-assertions.test.ts` | Phase 4 targeted verification for UI-only negative case and guarded behavior positive case. | Initially failed because the assertion builder module did not exist; passed after implementation: 2 tests, 0 failures. | Proves UI text alone cannot satisfy behavior requirements and guarded code can satisfy the assertion. |
| 2026-05-24 | `npx tsx --test apps/api/src/runs/traceability/trusted-chain-traceability.test.ts` | Phase 4 targeted traceability verification for assertion failures and requirement-to-test links. | Initially failed because code-stage trusted chain ignored assertion results; passed after implementation: 10 tests, 0 failures. | Covers failed assertion blocking and passing assertion links in CoverageMatrix/TraceabilityMatrix. |
| 2026-05-24 | `npm run build:contracts` | Phase 4 rebuild so API consumes new assertion contracts and diagnostic enum. | Passed. | Required before API imports could see `codeBusinessAssertionResultSchema`. |
| 2026-05-24 | `npm run build:api` | Phase 4 API TypeScript build verification. | Passed. | Confirms code business assertion pipeline integration and frontend stage enum labels compile in API. |
| 2026-05-24 | `npm run test --workspace @uml-platform/api` | Phase 4 full API regression. | Passed: 249 tests, 0 failures. | API code-run fixtures were aligned to the active UML-generation requirement after the new gate correctly blocked unrelated campus-activity UI. |
| 2026-05-24 | `npm run typecheck:web` | Phase 4 frontend smoke check after new code assertion stage. | Failed with existing web type errors around `modelId`, `visibleGenerationTask`, `RunStatus.cancelled`, SVG `generatedAt`, and diagram error shape conversions. | New `verify_code_business_assertions` stage labels were added; remaining failures are the previously recorded web type gaps and still block final Phase 7 completion. |
| 2026-05-24 | `npm run test:contracts` | Phase 5 contract verification for EvidencePackage, review decisions, and downstream request compatibility. | Passed: 23 tests, 0 failures. | Includes `contracts describe evidence packages and human review decisions`; design/code/document start schemas now accept optional upstream `evidencePackage`. |
| 2026-05-24 | `npm run build:contracts` | Phase 5 rebuild so API route tests consume the updated EvidencePackage request fields. | Passed. | Required because API tests import `@uml-platform/contracts` from the built workspace package. |
| 2026-05-24 | `npx tsx --test apps/api/src/runs/evidence/evidence-package.test.ts` | Phase 5 targeted EvidencePackage review-gate verification. | Passed: 2 tests, 0 failures. | Covers unresolved `not-modelable` review items blocking the package and durable human decisions resolving the block. |
| 2026-05-24 | `npx tsx --test apps/api/src/routes/runs/register-run-routes.test.ts` | Phase 5 RED/GREEN route verification for evidence APIs and downstream gate. | Initially failed because a blocked EvidencePackage on `/api/design-runs` returned 202; passed after contracts/routes enforced the gate: 22 tests, 0 failures. | Covers `GET /api/projects/:projectId/runs/:runId/evidence`, `POST /review-decisions`, and HTTP 409 for blocked supplied evidence. |
| 2026-05-24 | `npm run build:api` | Phase 5 API TypeScript build verification. | Passed. | Confirms EvidencePackage builder, route helpers, snapshot fields, and pipeline artifact events compile. |
| 2026-05-24 | `npm run test --workspace @uml-platform/api` | Phase 5 full API regression. | Passed: 257 tests, 0 failures. | Includes baseline, coverage, traceability, model semantic gates, code business assertions, evidence package tests, and route-level review gate tests. |
| 2026-05-24 | `npm run typecheck:web` | Phase 5 frontend smoke check after EvidencePackage contract changes. | Failed with existing web type errors around `modelId`, `visibleGenerationTask`, `RunStatus.cancelled`, SVG `generatedAt`, and diagram error shape conversions. | Same class as previous phases; Phase 5 backend/API changes did not complete the frontend review/browser acceptance work required by Phase 7. |
| 2026-05-24 | `npx tsx --test apps/api/src/runs/trusted-chain-regression.test.ts` | Phase 6 cross-domain and negative trusted-chain regression. | Passed: 3 tests, 0 failures. | Covers seven required domains plus conflict, missing role, missing boundary, non-functional `not-modelable`, fake/shallow traceability, UI-only code, orphan code, orphan test evidence, and low-confidence critical requirements. |
| 2026-05-24 | `npm run build:api` | Phase 6 API TypeScript build verification after regression suite addition. | Passed. | Confirms the new regression suite and existing trusted-chain APIs compile. |
| 2026-05-24 | `npm run test --workspace @uml-platform/api` | Phase 6 full API regression. | Passed: 260 tests, 0 failures. | Includes the new cross-domain suite as tests 254-256 in the full API run. |
| 2026-05-24 | `npm run test --workspace @uml-platform/web -- src/features/trusted-chain/components/trusted-chain-evidence-page.test.tsx` | Phase 7 RED/GREEN frontend evidence review verification. | Initially failed because browser evidence records were not rendered; passed after adding the browser evidence section: 1 test, 0 failures. | Covers RequirementBaseline, CoverageMatrix, TraceabilityMatrix, `not-modelable`, pending review, browser evidence visibility, and review decision resolution. |
| 2026-05-24 | `npx tsx --test apps/api/src/runs/evidence/evidence-package.test.ts` | Phase 7 RED/GREEN backend gate for failed browser evidence. | Initially failed because failed browser evidence did not block downstream; passed after `assertEvidencePackageAllowsDownstream` rejected failed/pending browser evidence: 3 tests, 0 failures. | Prevents browser acceptance failures from being silently treated as approved downstream evidence. |
| 2026-05-24 | `npx tsx --test apps/api/src/routes/runs/register-run-routes.test.ts` | Phase 7 route regression after EvidencePackage browser gate update. | Passed: 22 tests, 0 failures. | Confirms project evidence/review APIs and downstream start-route gates still pass. |
| 2026-05-24 | `npm run typecheck:web` | Phase 7 frontend TypeScript verification. | Passed. | Resolves the earlier web typecheck blockers around `modelId`, `visibleGenerationTask`, `RunStatus.cancelled`, SVG render metadata, and diagram error shapes. |
| 2026-05-24 | `npm run build:web` | Phase 7 production web build verification. | Passed with existing Vite large chunk warnings. | Build produced web assets successfully; warnings are bundle-size guidance, not test failures. |
| 2026-05-24 | `npm run test:harness-e2e` | Phase 7 Playwright browser acceptance verification. | Passed: 2 tests, 0 failures. | Verifies EvidencePackage visibility/export/review, conflict/low-confidence/critical partial/not-modelable blocked reasons, screenshots, DOM, console/network evidence, and representative generated workflow permission/required/state/boundary/exception/idempotency behavior. |
| 2026-05-24 | `npm run build:contracts` | Final Phase 0-7 contract build verification. | Passed. | Confirms final contract package emits successfully after all trusted-chain schema additions. |
| 2026-05-24 | `npm run test:contracts` | Final Phase 0-7 contract regression. | Passed: 23 tests, 0 failures. | Covers baseline, coverage/traceability, business assertions, EvidencePackage, run payloads, and existing platform DTOs. |
| 2026-05-24 | `npm run build:api` | Final Phase 0-7 API build verification. | Passed. | Confirms API TypeScript and code-skill copy after the browser-evidence downstream gate change. |
| 2026-05-24 | `npm run test --workspace @uml-platform/api` | Final Phase 0-7 API regression. | Passed: 261 tests, 0 failures. | Includes the new failed-browser-evidence downstream gate plus all baseline, traceability, model, assertion, evidence, project, and SSE tests. |
| 2026-05-24 | `npm run typecheck:web` | Final Phase 0-7 web typecheck. | Passed. | Confirms frontend review/export and earlier type fixes are type-safe. |
| 2026-05-24 | `npm run build:web` | Final Phase 0-7 web production build. | Passed with existing Vite large chunk warnings. | The warnings are bundle-size guidance and did not fail the build. |
| 2026-05-24 | `npm run test:harness-e2e` | Final Phase 0-7 browser acceptance. | Passed: 2 tests, 0 failures. | Captures EvidencePackage UI/export evidence and representative generated workflow browser evidence. |
