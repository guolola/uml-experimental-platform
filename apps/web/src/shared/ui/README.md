# Shared UI

This directory owns the project-level UI primitives for the web app. Components here should be reusable across feature domains, styled with Tailwind classes backed by `src/app/styles/theme.css`, and composed from Radix primitives when they need popovers, dialogs, menus, selection, focus management, or keyboard behavior.

Feature-specific UI belongs in `src/features/*/components` until it is reused across multiple domains. Keep business state, API calls, routing decisions, and workflow rules out of this directory.

When adding or changing a shared component:

- prefer existing shared primitives and `cn` before introducing another abstraction;
- use `lucide-react` for icon buttons when a matching icon exists;
- preserve accessible names, disabled states, focus-visible styles, and dark mode behavior;
- add focused Vitest / Testing Library coverage for reusable behavior or user-visible state changes.
