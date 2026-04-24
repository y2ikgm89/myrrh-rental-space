---
name: media-storage-change
description: Use when changing media domain logic, R2/S3 upload or delete flows, media picker UI, image metadata, public asset handling, seed media, or storage-related tests. Do not use for static copy changes that only reference existing images.
---

# Media Storage Change

## Workflow

1. Identify the surface: upload, delete, listing, picker UI, metadata, seed asset, public rendering, or storage key generation.
2. Keep storage key construction and validation in shared media/storage helpers.
3. Validate file metadata, mime type, size, and user-controlled paths before persistence or storage calls.
4. Preserve draft/published and admin/public boundaries when media is used by page content.
5. Use existing media picker patterns for admin UI changes.
6. Add focused tests for storage keys, upload/delete helpers, media queries, or picker behavior.
7. Avoid broad storage cleanup unless the user explicitly approves the target prefix and deletion plan.

## Guardrails

- Do not expose raw bucket internals or private credentials to public components.
- Do not trust client-provided filenames as storage keys.
- Do not hand-edit generated seed artifacts unless they are intentionally source-controlled assets.
- Do not add arbitrary remote image domains without reviewing `next.config.ts`.

## Validation

- Storage helper scope: `bun test __tests__/unit/shared/lib/r2/keys.test.ts __tests__/unit/shared/lib/r2/upload.test.ts __tests__/unit/shared/lib/r2/delete.test.ts`.
- Media domain scope: `bun test __tests__/unit/domain/media`.
- Minimum completion gate: `bun run validate`.
- Before PR / release / commit: `bun run validate && bun run build`.
