---
name: project-workflow
description: Use when starting implementation, debugging, planning, or review work in the Myrrh Rental Space repository. Guides local-first context gathering, official docs usage, codebase-memory-mcp, safe command selection, verification scope, and context-efficient handoff. Do not use for unrelated repositories.
---

# Project Workflow

Use this skill as the first repo-specific workflow when a task touches code,
tests, configuration, or documentation in this repository.

## Workflow

1. Read `AGENTS.md` first.
2. Use local project state only unless the user explicitly asks for history,
   GitHub, issues, or remote state.
3. Use `rg` and targeted file reads before opening large files.
4. Use `codebase-memory-mcp` for graph status, dependency tracing, impact
   analysis, or symbol-level context when available.
5. Use Context7 for current library/framework/API docs before making claims
   about Next.js, Prisma, Playwright, Bun, React, Zod, or other dependencies.
6. Pick the narrowest verification command that covers the change.
7. Report only useful output: changed files, commands run, failures, and
   residual risk.

## Read When Needed

- `references/repo-map.md` for stack, directories, high-risk surfaces, and
  dependency boundaries.
- `references/verification.md` for command selection.
