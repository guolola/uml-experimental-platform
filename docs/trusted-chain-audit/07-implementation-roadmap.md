# Implementation Roadmap

This roadmap is staged so the platform can improve trustworthiness without attempting a risky rewrite.

## Phase 0: Audit Current Chain

### Goal

Establish what the platform currently does and where it falls short of the trusted-chain criteria.

### Work

- Map relevant routes, pipelines, normalizers, adapters, document builders, and frontend flows.
- Run or inspect existing examples.
- Identify whether a RequirementBaseline or equivalent already exists.
- Identify where traceability currently starts and stops.
- Identify where low-confidence, ambiguity, conflict, and non-modelable requirements are handled.

### Exit Criteria

- `02-current-chain-map.md` has concrete file and function evidence.
- `04-findings-register.md` has evidence-backed findings.
- `05-risk-and-gap-register.md` has updated risk statuses.

## Phase 1: RequirementBaseline Foundation

### Goal

Create a source-attributed requirements baseline that all downstream stages must consume.

### Work

- Define RequirementBaseline schema.
- Define AtomicRequirement schema.
- Preserve source fragments and confidence.
- Classify functional, non-functional, data, role, constraint, exception, business-rule, interface, and assumption requirements.
- Add quality checks for ambiguity, conflict, missing actor, missing object, missing boundary, and non-verifiable wording.

### Exit Criteria

- Every run produces a RequirementBaseline.
- Critical quality failures can block downstream generation.
- Tests cover under-extraction, over-extraction, ambiguity, conflict, and missing-role cases.

### Phase 1 Completion Evidence

Status: implemented on 2026-05-24.

- Contracts define `RequirementBaseline`, `AtomicRequirement`, `RequirementQualityReport`, `RequirementAssumption`, and `RequirementConflict`.
- Requirement, design, code, and document snapshots carry `requirementBaseline`.
- Requirements pipeline rebuilds the baseline after rule extraction, emits a baseline artifact event, and blocks model generation when the baseline quality report is blocked.
- Design and code pipelines assert the baseline gate before downstream generation.
- Tests cover source attribution, missing-role/low-confidence blocking, conflict blocking, snapshot baseline creation, contracts, and full API regression.

## Phase 2: Coverage And Traceability

### Goal

Build bidirectional traceability across requirements, models, code, and tests.

### Work

- Add CoverageMatrix.
- Add TraceabilityMatrix.
- Add artifact IDs for model elements, generated code units, and tests.
- Add orphan detection.
- Add uncovered requirement detection.
- Add trace integrity checks to detect shallow or fake trace links.

### Exit Criteria

- Every accepted requirement has a coverage status.
- Every model, code, and test artifact can trace back to a requirement or approved assumption.
- Traceability failure blocks completion.

### Phase 2 Completion Evidence

Status: implemented for requirement, requirements-model, design-model, and code artifacts on 2026-05-24.

- Contracts define `CoverageMatrix`, `CoverageMatrixRow`, `TraceabilityMatrix`, `TraceabilityLink`, and `TraceabilityDiagnostic`.
- Coverage statuses are constrained to `covered`, `partially-covered`, `not-modelable`, `pending-review`, and `conflict`.
- Traceability artifact types support `requirement`, `requirements-model`, `design-model`, `code`, `test`, and `evidence`.
- Requirement, design, code, and document snapshots carry nullable `coverageMatrix` and `traceabilityMatrix` fields.
- Requirement, design, and code pipelines emit matrix artifact events and gate completion with the trusted-chain traceability check.
- Requirement/model gates detect uncovered accepted requirements, orphan model elements, fake rule links, and placeholder/shallow trace links.
- Design gates add requirement-to-design links and block orphan/fake/pending auto-filled design traceability.
- Code gates link generated code artifacts to accepted requirements through direct business terms or the root `/BUSINESS_CONTEXT.md` generated bundle manifest; unanchored non-infrastructure code blocks completion as orphan code.
- Tests cover contracts, uncovered requirements, orphan model artifacts, shallow placeholder traces, orphan code artifacts, full API regression, and API build.

Known carry-forward: executable test artifacts and evidence-package links are supported by the contract but will be populated in Phase 4 and Phase 5, because business assertions and EvidencePackage do not exist yet.

## Phase 3: Model Quality Gates

### Goal

Ensure requirements and design models are semantically checked against the baseline.

### Work

- Check use cases against actors, goals, and acceptance criteria.
- Check class diagrams against domain data, relationships, and constraints.
- Check sequence diagrams against workflows, exceptions, and service boundaries.
- Check state diagrams against lifecycle rules when present.
- Preserve non-modelable requirements for alternative evidence.

### Exit Criteria

- Model generation can explain coverage decisions.
- Non-functional requirements are not dropped.
- Partial coverage and non-modelable statuses appear in the evidence package.

### Phase 3 Completion Evidence

Status: implemented for backend requirement/design model gates on 2026-05-24.

- Contracts add the blocking traceability diagnostic code `semantic-model-gap`.
- Requirement-stage trusted-chain checks now group traced model elements per baseline requirement and require at least one business-bearing element to explain baseline actor/action/object/condition/outcome slots; structural actor, relationship, system-boundary, and start/end nodes are not accepted as sole semantic proof. A 2026-05-24 follow-up tightened behavior requirements so matching only actor/object words is not enough: the action slot must be evidenced, and object evidence is required when the baseline has an object.
- Design-stage trusted-chain checks now validate sequence message text and non-sequence source records against the resolved baseline requirement before completion.
- Non-functional accepted requirements without direct UML traces are preserved as `not-modelable` coverage rows with `alternative-evidence:<requirementId>` review items.
- RequirementBaseline extraction now infers unseen domain actors and objects from sentence structure, so Phase 3 does not depend on adding every actor noun to a fixed vocabulary.
- Tests cover semantically mismatched use-case coverage, object-only false coverage, sequence diagrams that do not explain workflow actions, non-functional `not-modelable` review paths, and domain actor/object inference.
- Verification passed: `npm run build:contracts`, `npm run test:contracts`, `npx tsx --test apps/api/src/runs/traceability/trusted-chain-traceability.test.ts`, `npm run build:api`, and `npm run test --workspace @uml-platform/api`.

Known carry-forward: `not-modelable` rows are preserved for review. Phase 5 adds the EvidencePackage/review API, and Phase 7 adds frontend review/export plus browser acceptance evidence. Earlier web typecheck failures around `modelId`, `visibleGenerationTask`, `RunStatus.cancelled`, SVG `generatedAt`, and diagram error shape conversions were resolved during Phase 7.

## Phase 4: Code Business Assertions

### Goal

Ensure generated code implements business behavior and not only structural shells.

### Work

- Generate or map business assertions for permissions, roles, state transitions, data constraints, boundary cases, and exceptions.
- Add tests that fail when code lacks required business behavior.
- Link generated assertions back to requirement IDs.
- Block code generation or completion when critical business assertions cannot be generated.

### Exit Criteria

- Code generation produces traceable business-rule evidence.
- UI-only generated output cannot be marked as complete for behavior-heavy requirements.
- Tests cover happy paths and negative paths.

### Phase 4 Completion Evidence

Status: implemented for backend code business assertion gates on 2026-05-24.

- Contracts define `CodeBusinessAssertion`, `CodeBusinessAssertionResult`, assertion categories, and the blocking traceability diagnostic code `business-assertion-gap`.
- Code snapshots persist `businessAssertionResults`; the code pipeline emits a `businessAssertionResults` artifact event during `verify_code_business_assertions`.
- Deterministic business assertions are generated from the `RequirementBaseline`, `CodeBusinessLogic`, and generated source files. Assertions bind to `requirementId` and cover permission, role, state-machine, data-consistency, boundary-condition, exception-feedback, idempotency, and business-behavior categories where relevant.
- `/BUSINESS_CONTEXT.md` and UI text alone are not accepted as behavior proof; assertions scan generated source files for guard, state, validation, data, exception, idempotency, or observable interaction evidence.
- Passing assertions are added to CoverageMatrix rows as `tests` and linked bidirectionally in the TraceabilityMatrix as requirement-to-test evidence. Failed critical assertions block completion through `business-assertion-gap`.
- API code-run fixtures were realigned so happy-path generated code actually implements the active UML-generation requirement, rather than passing with unrelated campus-activity UI.
- Verification passed: `npm run build:contracts`, `npm run test:contracts`, `npx tsx --test apps/api/src/runs/pipelines/code/code-business-assertions.test.ts`, `npx tsx --test apps/api/src/runs/traceability/trusted-chain-traceability.test.ts`, `npm run build:api`, and `npm run test --workspace @uml-platform/api`.

Known carry-forward: assertions are static backend checks, not proof of arbitrary runtime behavior. Phase 5-7 add EvidencePackage review, cross-domain regression, and Playwright/browser acceptance for representative generated workflows; future work can broaden runtime checks for richer generated applications.

## Phase 5: Evidence Package And Review Workflow

### Goal

Make every run reviewable and auditable.

### Work

- Emit EvidencePackage for each generation run.
- Include baseline, quality report, coverage matrix, traceability matrix, model artifacts, code artifacts, tests, review items, and repair records.
- Add frontend or API affordances for pending human review.
- Add terminal event handling so blocked or failed runs close clearly and preserve evidence.

### Exit Criteria

- A reviewer can reconstruct the run from evidence artifacts.
- Human review items block downstream progress until resolved.
- Failed and repaired runs retain records.

### Phase 5 Completion Evidence

Status: implemented for backend/API evidence and review workflow on 2026-05-24.

- Contracts define `EvidencePackage`, `EvidenceReviewItem`, `EvidenceReviewDecision`, artifact summaries, browser evidence records, failure records, and repair records.
- Requirement, design, code, and document snapshots persist `evidencePackage`; pipelines attach and emit an `evidencePackage` artifact before completion or failure handling.
- EvidencePackage aggregation includes the RequirementBaseline, requirement quality report, CoverageMatrix, TraceabilityMatrix, model/code artifact summaries, business assertion results, browser evidence placeholders, review items, review decisions, failures, and repairs.
- Review items are generated for pending review, conflict, low confidence, derived assumptions, `not-modelable`, partial coverage, blocking traceability diagnostics, and failed/pending business assertions.
- Project run APIs expose `GET /api/projects/:projectId/runs/:runId/evidence` and `POST /api/projects/:projectId/runs/:runId/review-decisions`; decisions are durable in the snapshot package and can resolve or preserve review blocks.
- Design, code, and document start routes accept supplied upstream EvidencePackage evidence and reject blocked or failed packages with HTTP 409 before queuing the downstream run.
- Tests cover unresolved `not-modelable` evidence blocking, durable human decision resolution, project evidence/review APIs, and downstream design-run start rejection for blocked evidence.
- Verification passed: `npm run build:contracts`, `npm run test:contracts`, `npx tsx --test apps/api/src/runs/evidence/evidence-package.test.ts`, `npx tsx --test apps/api/src/routes/runs/register-run-routes.test.ts`, `npm run build:api`, and `npm run test --workspace @uml-platform/api`.

Known carry-forward: Phase 7 adds the dedicated frontend evidence/review/export screen and Playwright evidence capture. Future hardening should persist browser evidence from generated application runs automatically, rather than only accepting supplied browser evidence records.

## Phase 6: Cross-Domain Regression

### Goal

Prove the chain across varied ordinary business domains and negative cases.

### Work

- Add regression domains listed in `08-test-and-evidence-plan.md`.
- Add conflict, missing-role, missing-boundary, non-functional, fake-traceability, and UI-only-code negative tests.
- Add run-level evidence assertions.

### Exit Criteria

- Regression suite covers multiple domains.
- Negative cases fail for the right reasons.
- The final conclusion can cite repeatable verification evidence.

### Phase 6 Completion Evidence

Status: implemented for backend deterministic trusted-chain regression on 2026-05-24.

- Added `apps/api/src/runs/trusted-chain-regression.test.ts` as the cross-domain regression suite.
- Positive coverage spans the required ordinary business domains from `08-test-and-evidence-plan.md`: library borrowing, e-commerce orders, appointment scheduling, course selection, dormitory repair, inventory purchasing, and permission approval flow.
- Negative coverage verifies the expected gate for conflict, missing role, missing boundary, non-functional `not-modelable`, fake/shallow semantic traceability, UI-only code, orphan code, orphan test evidence, and low-confidence critical requirements.
- The suite asserts that accepted domain examples pass RequirementBaseline quality, CoverageMatrix coverage, and traceability completion gates, while negative examples fail through the intended quality, coverage, traceability, or business-assertion gate.
- Verification passed: `npx tsx --test apps/api/src/runs/trusted-chain-regression.test.ts`, `npm run build:api`, and `npm run test --workspace @uml-platform/api`.

Known carry-forward: this is backend deterministic regression evidence. Phase 7 adds browser-controlled evidence for frontend review/export and a representative generated workflow acceptance fixture.

## Phase 7: Browser Acceptance Verification

### Goal

Verify the trusted chain through the actual user-facing web experience, not only through backend tests or generated artifacts.

### Work

- Use browser automation to create or inspect runs for representative domains.
- Confirm RequirementBaseline, coverage matrix, traceability matrix, pending review items, and evidence package are visible or exportable.
- Confirm conflict, pending-review, low-confidence, and critical partial coverage states block downstream actions in the UI.
- Confirm user-visible workflows enforce permissions, state transitions, required fields, boundaries, and exception feedback.
- Capture screenshots, console errors, failed network requests, and DOM assertions as acceptance evidence.

### Exit Criteria

- Browser-driven checks pass for at least one happy-path domain and the required negative blocking cases.
- UI evidence matches backend evidence package status.
- No visual or interaction issue prevents a reviewer from understanding why a run passed, failed, or was blocked.

### Phase 7 Completion Evidence

Status: implemented for frontend review/export and browser-controlled acceptance on 2026-05-24.

- Added a trusted-chain evidence page under the workspace sidebar (`可信证据`) that loads run EvidencePackages through the project run evidence API.
- The page exposes RequirementBaseline, CoverageMatrix, TraceabilityMatrix diagnostics, browser evidence records, pending review items, gate status, and JSON export.
- Human review decisions can be submitted from the UI; resolved decisions update the EvidencePackage status from `blocked` to `complete` when no pending items remain.
- Browser evidence records are displayed by type (`screenshot`, `dom`, `console`, `network`, `assertion`) and status, so browser acceptance is visible to reviewers rather than hidden in raw JSON.
- Supplied EvidencePackages with `failed` or `pending-review` browser evidence now fail the downstream evidence gate, preventing failed browser acceptance from being silently treated as approved evidence.
- Added Playwright configuration and `npm run test:harness-e2e` for browser acceptance.
- Playwright verifies that baseline, coverage, traceability, blocked review reasons (`conflict`, `low-confidence`, `critical partial coverage`, `not-modelable`), workflow browser evidence, JSON export, screenshots, DOM snapshots, console logs, and network logs are captured.
- Playwright also runs a representative generated workflow fixture in the browser and verifies permission denial, required-field validation, state transition, boundary value feedback, exception feedback, and idempotent duplicate approval behavior.
- Verification passed: `npm run typecheck:web`, targeted trusted-chain evidence component test, `npm run build:web`, `npx tsx --test apps/api/src/runs/evidence/evidence-package.test.ts`, `npx tsx --test apps/api/src/routes/runs/register-run-routes.test.ts`, and `npm run test:harness-e2e`.

Known limitation: the browser workflow fixture is representative browser-controlled acceptance evidence. The platform should still be extended to persist browser evidence from arbitrary generated Sandpack/application runs automatically. This implementation is an auditable review and verification control, not a promise of fully automatic correctness for every natural-language requirement.
