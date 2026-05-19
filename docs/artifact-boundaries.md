# Artifact Boundaries

This repo keeps source, generated assets, and third-party runtimes in separate buckets.

- `apps/web/public/sandpack/` is prepared by `apps/web/scripts/prepare-sandpack.mjs` for browser previews. Treat it as generated runtime output; do not hand-edit files inside it.
- `plantuml/build/libs/plantuml-1.2026.3beta8.jar` is the pinned PlantUML runtime allowed through `.gitignore`. Other PlantUML build output remains ignored.
- `__pycache__/`, `*.pyc`, app `dist/`, Vite caches, logs, screenshots, and local document exports remain ignored development artifacts.

When adding another large runtime asset, add a short note here and a narrow `.gitignore` exception instead of committing a whole generated tree.
