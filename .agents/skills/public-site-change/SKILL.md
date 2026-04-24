---
name: public-site-change
description: Use when changing public routes, public layout, public components, SEO metadata, public forms, customer-facing visual design, animations, or public content rendering. Do not use for admin dashboard, freeform builder internals, or database-only changes.
---

# Public Site Change

## Workflow

1. Identify whether the change belongs under `src/app/(public)`, `@/public/*`, or shared domain code.
2. Keep public-only UI out of admin components and admin-only styling out of public components.
3. Prefer Server Components. Add `'use client'` only for interaction, animation, form state, or browser APIs.
4. Validate public form input with Zod and keep user-facing errors non-sensitive.
5. Use semantic Tailwind tokens and existing public visual patterns. Do not add hardcoded colors without a design-system reason.
6. For route, metadata, or canonical URL changes, verify SEO and navigation behavior.
7. Add targeted tests for public actions, rendering helpers, or routing changes before broad validation.

## Guardrails

- Do not import admin modules from public routes.
- Do not introduce client components at layout scope unless necessary.
- Do not break Multiple Root Layout separation between public and admin.
- Do not add arbitrary script or HTML injection paths.

## Validation

- Public action scope: nearest `__tests__/integration/actions/public/*` test.
- Routing/metadata scope: nearest unit test or targeted route test.
- Minimum completion gate: `bun run validate`.
- Before PR / release / commit: `bun run validate && bun run build`.
