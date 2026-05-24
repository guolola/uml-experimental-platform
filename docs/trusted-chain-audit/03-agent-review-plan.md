# Agent Review Plan

This document defines the subagent review structure for the trusted chain audit. Each subagent should return evidence-backed findings, not broad opinions.

## Shared Review Rules

Every subagent must:

- Read relevant source files before judging behavior.
- Cite file paths, functions, schemas, route names, prompts, tests, or generated artifacts as evidence.
- Separate confirmed findings from hypotheses.
- Mark severity as `critical`, `high`, `medium`, or `low`.
- State whether the issue affects industry acceptability.
- Avoid suggesting unrelated rewrites.
- Record findings in `04-findings-register.md`.

## Subagent 1: Requirements Engineering Standards Review

### Mission

Assess whether the current chain has a structured requirements engineering process compatible with ISO/IEC/IEEE 29148 and INCOSE-style requirements quality expectations.

### Focus

- RequirementBaseline existence and authority.
- Atomic requirement extraction.
- Source attribution.
- Requirement type classification.
- Requirement quality checks.
- Ambiguity, conflict, assumption, and low-confidence handling.
- Verification or acceptance criteria.

### Output

```markdown
## Requirements Engineering Standards Review

### Confirmed Strengths

### Findings

| ID | Finding | Evidence | Severity | Recommendation |
|---|---|---|---|---|

### Industry Verdict

### Open Questions
```

## Subagent 2: Bidirectional Traceability Review

### Mission

Assess whether requirements can be traced downstream and whether downstream artifacts can be traced back to requirements.

### Focus

- Requirement -> model trace.
- Requirement -> code trace.
- Requirement -> test trace.
- Model/code/test -> requirement trace.
- Detection of orphan artifacts.
- Detection of uncovered requirements.
- Detection of fake or shallow traceability.

### Output

```markdown
## Bidirectional Traceability Review

### Traceability Map

### Findings

| ID | Finding | Evidence | Severity | Recommendation |
|---|---|---|---|---|

### Blocking Gaps

### Open Questions
```

## Subagent 3: Requirements Model Review

### Mission

Assess whether the requirements model preserves the user's original goals, actors, constraints, exceptions, and non-functional requirements.

### Focus

- Use-case extraction accuracy.
- Domain entity extraction.
- Actor and role mapping.
- Business rules and constraints.
- Exceptional flows.
- Boundary cases.
- Non-functional requirements preservation.
- Over-generation and under-extraction.

### Output

```markdown
## Requirements Model Review

### Sample Chain Walkthroughs

### Findings

| ID | Finding | Evidence | Severity | Recommendation |
|---|---|---|---|---|

### Missing Coverage Patterns

### Open Questions
```

## Subagent 4: Design Model Review

### Mission

Assess whether the design model faithfully refines requirements and requirements models into implementation-facing structures.

### Focus

- Class diagram semantics.
- Sequence diagram workflow coverage.
- State transitions and terminal states.
- Service boundaries.
- Error flows.
- Mapping from design elements back to requirements.
- Prevention of design hallucination.

### Output

```markdown
## Design Model Review

### Refinement Chain

### Findings

| ID | Finding | Evidence | Severity | Recommendation |
|---|---|---|---|---|

### Design Risks

### Open Questions
```

## Subagent 5: Code Generation Review

### Mission

Assess whether generated code implements traced business behavior rather than only producing screens, routes, or shells.

### Focus

- Business rules in code.
- Permission and role checks.
- State machine enforcement.
- Data validation.
- Exception and feedback handling.
- Test generation.
- Code trace comments or metadata.
- Handling of partially covered or pending-review requirements.

### Output

```markdown
## Code Generation Review

### Requirement-To-Code Walkthroughs

### Findings

| ID | Finding | Evidence | Severity | Recommendation |
|---|---|---|---|---|

### Business Assertion Gaps

### Open Questions
```

## Subagent 6: Test And Evidence Review

### Mission

Assess whether the platform can prove what it generated and expose what it could not prove.

### Focus

- Cross-domain regression coverage.
- Negative tests.
- Evidence package contents.
- Quality gate tests.
- Traceability integrity tests.
- Repair loop records.
- Human review item blocking behavior.
- Browser-controlled acceptance checks for user-visible workflows.

### Output

```markdown
## Test And Evidence Review

### Evidence Inventory

### Findings

| ID | Finding | Evidence | Severity | Recommendation |
|---|---|---|---|---|

### Required Regression Additions

### Open Questions
```

## Subagent 7: Browser Acceptance Review

### Mission

Control the browser to verify whether the generated user-facing chain is actually reviewable and enforceable in the UI.

### Focus

- Run creation and result review flows.
- Visibility of RequirementBaseline, coverage matrix, traceability, review items, and evidence package.
- UI blocking behavior for conflict, pending-review, low-confidence, and uncovered critical requirements.
- Workflow behavior for permissions, state transitions, boundary validation, and exception feedback.
- Console errors, failed network requests, inaccessible controls, clipped text, and layout problems that prevent serious review.

### Output

```markdown
## Browser Acceptance Review

### Browser Environment

### Flows Exercised

### Findings

| ID | Finding | Evidence | Severity | Recommendation |
|---|---|---|---|---|

### Screenshots Or Artifacts

### Open Questions
```

## Consolidation Procedure

After all subagents report:

1. Deduplicate findings.
2. Promote any repeated issue to a higher severity if it affects multiple stages.
3. Separate immediate blockers from roadmap improvements.
4. Update `05-risk-and-gap-register.md`.
5. Update `06-target-architecture.md`.
6. Update `07-implementation-roadmap.md`.
7. Write the conservative verdict in `09-final-conclusion.md`.
