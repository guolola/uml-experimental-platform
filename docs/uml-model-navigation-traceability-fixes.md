# UML Model Navigation And Traceability Fixes

This note tracks the production issues found in project `653499e3-22b4-442f-8aa7-6b901fd68d2e` so the implementation can survive long context.

## Observed Production State

- The current use case model has 5 use cases: `uc-1` through `uc-5`.
- Requirement analysis models and design sequence models each contain 8 use-case-scoped records, including stale `uc-6`, `uc-7`, and `uc-8` records that no longer have matching use cases.
- Requirement SVG artifacts only include `usecase`; analysis models have structured data but no SVG artifacts.
- Database table structured names are stored without `tbl_`, while table ids and rendered SVG labels often include the `tbl_` prefix.
- Design class traceability entries currently map to requirement elements but do not include `upstreamDesignRefs` back to use case realization design elements.

## Fix Targets

- Database design navigation should select and visually focus a table even when the rendered SVG text uses the table id or a prefixed name instead of the structured display name.
- Database design sidebar should show columns as children under their parent table rather than as a peer-level field group.
- Requirement analysis and design sequence sidebars should only show models whose `sourceUseCaseId` still exists in the current use case model, except while active generation tasks are pending.
- Sidebar completion/check status should mean that an SVG is viewable. Structured-only models should not show as completed viewable items; they should surface a clear unavailable reason.
- Database SVG/table labels should be normalized consistently for display and highlighting, using a friendly table name while still accepting `tbl_` ids as SVG highlight aliases.
- Design traceability should preserve and, when needed, derive `upstreamDesignRefs` for downstream class/table/activity/deployment elements that are generated from use case realization designs.

## Verification

- Add focused frontend tests for sidebar filtering, table-column nesting, structured-only status, and SVG highlight aliases.
- Add traceability normalizer tests for deriving downstream design upstream refs from sequence models.
- Add or update diagram page tests for database table highlight behavior with `tbl_` SVG labels.
- Add an end-to-end-style user flow test that loads a workspace with the production-shaped mismatch and verifies the sidebar does not expose orphan models and table clicks focus the correct element.
- Run targeted tests first, then broader `npm run test:web` and `npm run typecheck:web` if time and dependencies allow.
