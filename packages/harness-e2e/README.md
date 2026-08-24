# @uml-platform/harness-e2e

Browser-level acceptance checks for the UML experimental platform.

This package verifies that trusted-chain evidence is visible, reviewable,
exportable, and tied to representative generated workflows. It complements the
API-level regression tests by exercising browser-visible evidence and business
constraints.

Current coverage includes:

- Trusted coverage, traceability, and generated workflow business assertions.
- Browser evidence display for screenshots, DOM, console, and network records.
- A representative generated workflow covering permissions, required fields,
  state transitions, boundary checks, exception feedback, and idempotency.

Run from the repository root:

```powershell
npm run test:harness-e2e
```
