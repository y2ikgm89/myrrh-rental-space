---
name: admin-ui-review
description: Use when reviewing or polishing admin dashboard UI, shared admin chrome, layout layering, accessibility, navigation links, z-index tokens, or reusable admin UI primitives. Do not use for public-only UI, database contracts, auth/RBAC behavior, or freeform builder internals unless those surfaces are directly affected.
---

# Admin UI Review

## Workflow

1. Identify the changed admin surface: root layout, sidebar, top bar, shared UI primitive, table/list page, detail page, dialog, popover/dropdown/select, or bulk action bar.
2. Check cross-cutting admin UX risks first: mobile layout, focus targets, keyboard access, z-index layering, overflow/scroll behavior, and text fitting.
3. Keep styling inside admin tokens and existing primitives. Do not add hardcoded colors or public-site CSS dependencies.
4. For links that open a new tab, include `rel="noopener noreferrer"`.
5. For layer changes, update `@/admin/lib/styles/z-index` and add or extend targeted tests instead of scattering `z-*` classes.
6. Prefer small fixes in shared primitives when the issue affects multiple admin pages.

## Guardrails

- Do not refactor page-specific CRUD logic while reviewing visual or interaction issues.
- Do not change auth, RBAC, Server Actions, Prisma schema, or storage behavior from this skill alone; combine with the relevant domain skill when needed.
- Do not introduce new UI libraries or broad component abstractions for one-off polish.

## Validation

- Run the smallest relevant UI/unit test first, such as `bun test __tests__/unit/lib/styles/z-index.test.ts` for layer changes.
- Then run `bun run validate` before reporting completion.
