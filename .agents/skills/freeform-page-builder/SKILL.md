---
name: freeform-page-builder
description: Use when changing this repository's custom page freeform builder, builder document schema, renderer, canvas, inspector, presets, preview, publish flow, or page-builder tests. Do not use for system page dedicated editors or unrelated Lexical, post, news, or terms editing.
---

# Freeform Page Builder

## Workflow

1. Read `docs/architecture/freeform-page-builder-design.md` and the latest phase notes in `docs/plans/2026-04-23-freeform-page-builder-v1.md`.
2. Confirm the change keeps the clean-break model: custom page uses freeform only, system page keeps its dedicated editor.
3. Keep document logic in `src/shared/lib/page-builder/*` or `src/shared/domain/page-builder/*`.
4. Keep rendering in `src/shared/page-builder/renderer/*`.
5. Keep editor-only UI in `src/app/(admin)/admin/(dashboard)/pages/[slug]/builder/*`.
6. Do not put selection borders, grid overlays, resize handles, or editor labels into the shared/public renderer.
7. Add or update focused unit tests for schema, document operations, selection math, presets, or rendering output.
8. For visible builder changes, verify with Browser Use on `/admin/pages/[slug]/builder` when available.

## Clean-Break Rules

- Runtime accepts `schemaVersion: 4` only.
- Do not add dual-mode `sections` / `freeform` compatibility paths.
- Do not add arbitrary HTML, arbitrary script, or custom CSS text areas.
- Prefer safe node types and allow-listed embeds.
- Preserve draft / published separation.

## Validation

- Unit scope: `bun test __tests__/unit/lib/page-builder`
- E2E scope: `bun run e2e -- e2e/authenticated/admin/page-builder.spec.ts`
- Minimum completion gate: `bun run validate`
