# Findings Register

This register tracks concrete evidence-backed findings from the trusted chain audit.

## Severity Definitions

| Severity | Meaning |
|---|---|
| `critical` | Prevents an industry-acceptable trusted chain or can produce false confidence. |
| `high` | Materially weakens traceability, coverage, verification, or reviewability. |
| `medium` | Creates reliability, maintainability, or evidence gaps but has a workaround. |
| `low` | Improves clarity, documentation, diagnostics, or future auditability. |

## Status Definitions

| Status | Meaning |
|---|---|
| `open` | Confirmed and not yet addressed. |
| `investigating` | Evidence suggests a problem, but more review is needed. |
| `planned` | Accepted for implementation in the roadmap. |
| `fixed` | Implemented and verified. |
| `deferred` | Accepted as out of scope for the current phase. |
| `not-an-issue` | Rejected after evidence review. |

## Phase 0 Revalidation

2026-05-24 revalidation found no source implementation that invalidated the initial findings. Phase 1 subsequently implemented the `RequirementBaseline` foundation. Phase 2 subsequently implemented first-class coverage and traceability matrices for requirement, design, and code runs, including backend completion gates for uncovered accepted requirements, orphan artifacts, fake trace links, placeholder/shallow trace links, and pending auto-filled design mappings. Phase 3 subsequently implemented deterministic semantic model-quality gates for requirement/design models and preserved non-functional requirements through `not-modelable` alternate-evidence review rows. Phase 4 subsequently implemented requirement-linked code business assertions and a backend completion gate for failed critical assertions. Phase 5 subsequently implemented first-class EvidencePackage contracts, API review decisions, and downstream start-route evidence gates. Phase 6 subsequently added backend cross-domain and negative regression coverage. Phase 7 subsequently added frontend EvidencePackage review/export, browser evidence visibility, downstream blocking for failed/pending browser evidence records, and Playwright browser acceptance checks.

## Findings

| ID | Area | Finding | Evidence | Severity | Recommendation | Status |
|---|---|---|---|---|---|---|
| F-001 | Requirements baseline | No first-class `RequirementBaseline` existed, and downstream stages were not forced through a baseline gate. | Phase 1 adds `RequirementBaseline` / `AtomicRequirement` contracts, persists `requirementBaseline` on run snapshots, emits a baseline artifact event, and asserts the baseline gate in requirements, design, and code pipelines. Verified by `npm run test:contracts`, `npm run test:api`, and `npm run build:api`. | critical | Continue Phase 2/3 work so downstream coverage and semantic model checks consume the baseline instead of relying on loose local artifact completeness. | fixed |
| F-002 | Requirement quality | Extracted requirements lacked source span, role, structured state/data/constraint/exception fields, ambiguity, assumption, confidence, criticality, and acceptance criteria. | Phase 1 baseline builder creates source-attributed atomic requirements with type, actor/subject/action/object/condition/outcome, confidence, status, criticality, acceptance criteria, assumptions/conflicts containers, and a quality report. Missing actor, missing object, missing boundary, low-confidence critical requirements, and conflicts can block downstream generation. | critical | Expand extraction quality in later phases with stronger semantic parsing and frontend human review decisions. | fixed |
| F-003 | Coverage matrix | No `CoverageMatrix` existed with the required status set `covered`, `partially-covered`, `not-modelable`, `pending-review`, `conflict`. | Phase 2 adds `coverageMatrixSchema`, snapshot persistence, artifact events, and run-level coverage rows for every atomic requirement. Requirement/design/code pipelines now build the matrix before completion, and `pending-review` / `conflict` rows block completion. Verified by `npm run test:contracts`, `npx tsx --test apps/api/src/runs/traceability/trusted-chain-traceability.test.ts`, `npm run test:api`, and `npm run build:api`. | critical | Continue Phase 3/5 work for semantic explanations, alternate evidence paths, and frontend review/export. | fixed |
| F-004 | Traceability | Traceability was partial and not fully bidirectional across requirement, model, design, code, test, and evidence artifacts. | Phase 2 adds `traceabilityMatrixSchema` with artifact types `requirement`, `requirements-model`, `design-model`, `code`, `test`, and `evidence`; requirement/design/code pipelines now emit bidirectional links and block uncovered accepted requirements, orphan model/code artifacts, fake rule references, placeholder/shallow trace links, and pending design auto-fill. Tests cover orphan, uncovered, fake/shallow, and code orphan cases. | high | Populate test and evidence links in Phase 4/5 and expose the matrix in the frontend. | fixed |
| F-005 | Review gates | Low-confidence and auto-filled design traceability require explicit human review before being trusted. | Phase 2 backend traceability gates mark `auto-filled-pending-review` / `pending` design mappings as blocking `pending-review` diagnostics before completion. Phase 5 converts pending-review, conflict, low-confidence, derived-assumption, not-modelable, partial-coverage, and failed-assertion states into EvidencePackage review items; durable API review decisions resolve or preserve the block, and design/code/document start routes reject supplied blocked or failed evidence with HTTP 409. Phase 7 exposes the same review gate and reasons in the frontend/browser flow. | critical | Future work can add richer reviewer policy and identity controls, but the minimum review gate is implemented. | fixed |
| F-006 | Code generation | Code generation analyzes business logic but did not generate executable business assertions or tests tied to requirement IDs. | Phase 4 adds `CodeBusinessAssertionResult` contracts, persists `businessAssertionResults` on code snapshots, emits a `businessAssertionResults` artifact event, generates deterministic assertions from the baseline/business logic/source files, and adds passed assertions as `test` traceability links. Failed critical assertions produce blocking `business-assertion-gap` diagnostics. | critical | Extend static assertions with richer generated tests and browser-executed workflow verification in Phase 6/7. | fixed |
| F-007 | Code gates | Code quality, fidelity, and preview reports do not fully replace hard run acceptance gates. | Phase 4 blocks failed critical business assertions before `completed`, so UI-only code can no longer satisfy behavior-heavy accepted requirements. Phase 7 adds browser-controlled acceptance checks for representative generated workflow permissions, required fields, state transitions, boundary values, exception feedback, and idempotency. `assertEvidencePackageAllowsDownstream` now rejects supplied EvidencePackages containing failed or pending-review browser evidence. | critical | Future hardening should automatically persist browser evidence from arbitrary generated app runs, but failed/pending browser evidence can no longer be silently approved downstream. | fixed |
| F-008 | Evidence package | No first-class `EvidencePackage` exists for a run. | Phase 5 adds `EvidencePackage` contracts, snapshot persistence, pipeline `artifact_ready:evidencePackage` events, project-run evidence API, review-decision API, and review/failure/repair aggregation in `apps/api/src/runs/evidence/evidence-package.ts`. Phase 7 exposes/exports the package in the frontend and displays browser evidence records. | high | Continue hardening automatic browser evidence ingestion from generated app runs. | fixed |
| F-009 | Frontend reviewability | The frontend can inspect model element traceability but could not review RequirementBaseline, CoverageMatrix, end-to-end traceability, pending review decisions, or EvidencePackage. | Phase 7 adds `apps/web/src/features/trusted-chain/components/trusted-chain-evidence-page.tsx`, workspace shell/sidebar routing for `可信证据`, project evidence API wiring in the workspace repository, JSON export, browser evidence visibility, and review-decision submission. Verified by `trusted-chain-evidence-page.test.tsx`, `npm run typecheck:web`, `npm run build:web`, and Playwright. | high | Future UI work can add richer filtering and reviewer identity display, but the minimum evidence/review/export control is implemented. | fixed |
| F-010 | Browser acceptance | Browser-controlled acceptance verification was not implemented. | Phase 7 adds Playwright under `packages/harness-e2e`, root script `npm run test:harness-e2e`, browser tests for EvidencePackage visibility/export/review/blocking reasons/screenshot/DOM/console/network evidence, and a representative generated workflow browser fixture for permission, required-field, state, boundary, exception, and idempotency checks. | high | Extend the same checks to live generated Sandpack/application runs in future hardening. | fixed |
| F-011 | Model quality gates | UML models could be syntactically valid and traced while failing to explain the baseline semantics. | Phase 3 adds `semantic-model-gap` diagnostics to `TraceabilityMatrix`, checks requirement-model business-bearing elements against baseline actor/action/object/condition/outcome slots, checks sequence design messages against resolved workflow requirements, and blocks completion when a traced model does not explain the requirement. The 2026-05-24 follow-up added a regression proving that actor/object word overlap alone cannot satisfy a behavior requirement: `管理员必须审批退款` traced to `查看退款记录` now fails because the `审批` action is absent. | critical | Keep Phase 3 deterministic gates conservative and extend with richer parsers in future phases; do not present them as full natural-language correctness. | fixed |

## Finding Template

Use this format for detailed findings when a table row is not enough:

```markdown
## F-001: Short Finding Title

**Area:** Requirements baseline / Traceability / Model generation / Code generation / Tests / Evidence

**Severity:** critical / high / medium / low

**Status:** open / investigating / planned / fixed / deferred / not-an-issue

**Evidence:**
- File or artifact:
- Function, schema, route, prompt, test, or output:
- Observed behavior:

**Why it matters:**

**Recommendation:**

**Verification after fix:**
```
