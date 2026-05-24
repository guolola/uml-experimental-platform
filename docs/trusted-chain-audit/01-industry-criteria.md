# Industry Criteria

This document translates public requirements-engineering and process-improvement expectations into concrete acceptance criteria for this platform.

## Reference Anchors

| Source | Relevant idea for this audit |
|---|---|
| ISO/IEC/IEEE 29148:2018 | Requirements engineering should include structured requirements activities, documentation, management, and verification/validation-oriented practices. |
| IEEE listing for 29148:2018 | Confirms the standard scope as systems and software engineering requirements engineering. |
| INCOSE Requirements Working Group | Emphasizes needs and requirements definition, management, verification, and validation across the lifecycle. |
| CMMI/SEI requirements management reports | Emphasize maintaining bidirectional traceability between requirements and downstream work products. |

Public anchors:

- https://www.iso.org/standard/72089.html
- https://standards.ieee.org/standard/29148-2018.html
- https://www.incose.org/communities/working-groups-initiatives/requirements
- https://resources.sei.cmu.edu/asset_files/TechnicalReport/2011_005_001_15392.pdf

## Acceptance Criteria For This Platform

### 1. Structured Requirements Baseline

The platform must create a RequirementBaseline before model or code generation. Each atomic requirement should include:

- Stable requirement ID.
- Source text span or source fragment.
- Requirement type: functional, non-functional, data, role, constraint, exception, business rule, interface, or assumption.
- Actor or stakeholder when applicable.
- Trigger, condition, action, and expected outcome when applicable.
- Priority or criticality when available.
- Confidence level.
- Status: accepted, ambiguous, conflict, pending-review, rejected, or derived.
- Acceptance criteria or verification method.

### 2. Requirements Quality Gate

The platform must check requirements for:

- Ambiguity.
- Conflict.
- Missing actor or subject.
- Missing object or target data.
- Missing condition or boundary.
- Non-verifiable wording.
- Untraceable derived assumptions.
- Duplicates or near-duplicates.
- Non-functional requirements that cannot be represented directly in UML but still need verification.

Critical failures must block downstream generation.

### 3. Coverage Matrix

Every accepted requirement must enter a coverage matrix with one of these statuses:

- `covered`
- `partially-covered`
- `not-modelable`
- `pending-review`
- `conflict`

The system must explain the status. `not-modelable` does not mean the requirement can be ignored; it means it needs another evidence path such as tests, documentation, configuration, performance checks, or manual review.

### 4. Bidirectional Traceability

Traceability must work in both directions:

- Requirement -> requirements model -> design model -> code -> tests/evidence.
- Test/code/model artifact -> source requirement.

The platform must detect orphan artifacts:

- Model elements with no requirement source.
- Code paths with no requirement source.
- Tests with no requirement source.
- Requirements with no downstream coverage.

### 5. Model Validity

Requirements models and design models must not be accepted just because they are syntactically valid. They must be checked against the baseline:

- Use cases should map to actors, goals, and acceptance criteria.
- Class model elements should map to domain data, constraints, and relationships.
- Sequence diagrams should map to workflows, state transitions, exceptions, and service boundaries.
- State diagrams should map to lifecycle rules and terminal states where applicable.

### 6. Code Business Assertions

Generated code must carry business-rule evidence. The audit should check whether generated code implements:

- Permissions and role constraints.
- State machine transitions.
- Data consistency rules.
- Boundary conditions.
- Error and exception feedback.
- Idempotency or duplicate-action handling where relevant.
- Validation for required fields and invalid states.

UI pages alone are not enough.

### 7. Evidence Package

Each generation run should be able to output:

- RequirementBaseline.
- Requirement quality report.
- Coverage matrix.
- Model traceability matrix.
- Code traceability matrix.
- Test and assertion results.
- Browser-driven acceptance evidence when the generated web experience or workflow is user-visible.
- Pending human review items.
- Failure, repair, and retry records.

### 8. Human Review Points

The system must require human review when:

- Requirements conflict.
- Critical actors, data, or state rules are missing.
- Confidence is below the configured threshold.
- A requirement is business-critical but only partially covered.
- A non-functional requirement cannot be automatically verified.
- The system derived assumptions that affect behavior.

## Conservative Verdict Rule

If a claim cannot be backed by the baseline, trace matrix, test evidence, or explicit human approval, the platform should not present it as confirmed.

## Browser-Driven Acceptance Criteria

When the generated artifact includes a web UI or user-facing workflow, verification must include browser-controlled acceptance checks, not only API or unit tests.

The browser acceptance check should verify:

- The generated UI exposes the traced requirements that are supposed to be user-visible.
- Disabled actions show the missing prerequisite or review reason inline.
- Pending-review, conflict, and low-confidence states block the relevant downstream user action.
- User workflows enforce permissions, required fields, state transitions, boundary values, and exception feedback.
- Evidence package links can be reached or exported from the run result.
- The page has no obvious visual breakage that prevents review, such as overlapping controls, clipped key text, or inaccessible critical actions.

Browser checks should use deterministic automation such as Playwright or the available browser-control tool. Screenshots, DOM assertions, network observations, and console errors should be recorded as evidence when they affect acceptance.
