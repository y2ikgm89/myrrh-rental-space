---
name: project-workflow
description: Use when working in the Myrrh Rental Space repository on local implementation, debugging, review, planning, documentation, repository instructions, or verification tasks.
---

# Project Workflow

Use this as the repo-level orchestration skill before touching files in this
repository.

## Workflow

1. Read `AGENTS.md`.
2. Stay local-first unless the user explicitly asks for history, GitHub, issues,
   pull requests, memories, or remote project state.
3. Use `rg`, targeted file reads, and `codebase-memory-mcp` for graph, impact,
   dependency, or symbol questions.
4. Add specialized repo skills when their trigger matches the touched surface:
   `$next-db-cache-boundaries`, `$type-safety`, `$e2e-test-quality`, or
   `$admin-ui-review`.
5. Use Context7 only when the task depends on current library, framework, SDK,
   CLI, or cloud-service behavior.
6. Pick the narrowest verification command that proves the change.
7. Report changed files, verification commands, failures, and residual risk.

## Read When Needed

- `references/repo-map.md` for directories, boundaries, and high-risk surfaces.
- `references/verification.md` for command selection.
