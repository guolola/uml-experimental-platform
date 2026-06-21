# Trusted Chain Audit Workbench

This directory is the persistent workbench for auditing whether the UML experimental platform can form an industry-acceptable chain from original user requirements to requirements rules, requirements models, design models, code, tests, and evidence.

The goal is not to claim that arbitrary natural-language requirements can be generated into correct software automatically. The goal is to reach an engineering chain that is structured, traceable, verifiable, reviewable, and honest about low confidence, conflict, and missing information.

## How To Resume This Work

When a new Codex session resumes this goal, read these files first:

1. `00-context-and-goal.md`
2. `01-industry-criteria.md`
3. `02-current-chain-map.md`
4. `04-findings-register.md`
5. `09-final-conclusion.md`

Then continue from the latest open item in `04-findings-register.md`, `05-risk-and-gap-register.md`, or `07-implementation-roadmap.md`.

## Document Map

| File | Responsibility |
|---|---|
| `00-context-and-goal.md` | Defines the audit goal, scope boundary, non-goals, and operating assumptions. |
| `01-industry-criteria.md` | Records the industry acceptance criteria derived from ISO/IEC/IEEE 29148, INCOSE, and CMMI-style traceability expectations. |
| `02-current-chain-map.md` | Maps the actual chain being audited, from user text to evidence package. |
| `03-agent-review-plan.md` | Defines subagent review roles, prompts, expected outputs, and acceptance gates. |
| `04-findings-register.md` | Tracks concrete findings with evidence, severity, recommendation, and status. |
| `05-risk-and-gap-register.md` | Tracks hidden risks, unverified assumptions, and remaining industry gaps. |
| `06-target-architecture.md` | Defines the target trustworthy chain architecture and artifact responsibilities. |
| `07-implementation-roadmap.md` | Breaks the work into staged, verifiable implementation increments. |
| `08-test-and-evidence-plan.md` | Defines regression domains, negative tests, evidence package checks, and quality gates. |
| `09-final-conclusion.md` | Holds the final audit verdict and the evidence behind it. |
| `10-generation-chain-automated-diagnostics.md` | Defines local-only automated diagnostics for generation-chain recovery, snapshot sync, run history, and sidebar consistency. |

## Current Working Verdict

The target verdict should be conservative:

> The platform can aim for an industry-acceptable engineering chain for ordinary business, teaching, and experimental use if it implements structured requirements baselines, bidirectional traceability, quality gates, evidence packages, browser-controlled acceptance checks for user-facing flows, and human review points. It must not claim stable full automation for arbitrary requirement text, especially in regulated or safety-critical domains.

## Source Baseline

The audit should use the following public reference anchors and should verify any detailed claim before final publication:

- ISO/IEC/IEEE 29148:2018, Systems and software engineering - Life cycle processes - Requirements engineering: https://www.iso.org/standard/72089.html
- IEEE listing for ISO/IEC/IEEE 29148:2018: https://standards.ieee.org/standard/29148-2018.html
- INCOSE Requirements Working Group: https://www.incose.org/communities/working-groups-initiatives/requirements
- SEI CMMI report examples containing bidirectional requirements traceability practices: https://resources.sei.cmu.edu/asset_files/TechnicalReport/2011_005_001_15392.pdf
