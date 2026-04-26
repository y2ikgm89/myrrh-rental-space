# 0021. Remove SectionStyle library and keep page design code-owned

- **Status**: Accepted
- **Date**: 2026-04-26
- **Deciders**: y2ikgm89
- **Supersedes**: [ADR 0017](./0017-section-style-cascade.md)

## Context and Problem Statement

ADR 0017 introduced `SectionStyle` as an admin-editable database entity with global, page, section, and instance override cascade layers. After the page editor was simplified to fixed templates and typed content forms, that model no longer matched the product direction: rental-space operators should safely edit content, not layout, spacing, typography, or style inheritance.

Keeping Style Library in the admin UI also adds a second mental model beside the fixed page templates, increases RBAC/API surface area, and makes public rendering depend on mutable visual data.

## Decision Drivers

- 管理画面は実務向けにし、文言・画像・リンク・SEO などの content editing に絞る
- 公開ページの visual design は React component / section definition 側で所有する
- Next.js App Router の Server Components 既定に合わせ、不要な client islands/API route を削る
- Prisma migration history を書き換えず、新しい migration で破壊的変更を表現する
- 後方互換パス、hidden CRUD、unused RBAC permission を残さない

## Considered Options

1. **Style Library をサイドバーから隠すだけ**
2. **Admin CRUD だけ削除し、DB cascade は残す**
3. **SectionStyle entity / cascade / admin UI / RBAC を clean-break で削除**

## Decision Outcome

**Chosen option**: Option 3 — SectionStyle entity / cascade / admin UI / RBAC を clean-break で削除。

理由:

- 固定テンプレート + 型付き content form 方針と完全に一致する
- 公開ページの design source of truth が DB ではなくコードに一本化される
- `sectionStyle:*` 権限、`/admin/styles`、`/admin/api/section-styles`、Style CRUD actions を同時に消せる
- 既存 migration は残し、後続 migration で table / FK / column を drop するため Prisma Migrate の履歴モデルと整合する

### Consequences

**良い点**:

- admin UI が content-only になり、運用者が layout/design を壊す経路がなくなる
- public / preview renderer の props と query が単純化される
- style 編集用 Server Actions、API Route、RBAC、cache tag が不要になる

**悪い点 / トレードオフ**:

- 既存 DB の `section_styles`、`Section.styleId`、`styleOverride`、`Page.pageStyleId`、`Settings.globalSectionStyleId` は削除される
- 既存データの style 設定は移行しない。これは clean-break として意図的に破棄する
- 今後 section ごとの visual variation が必要な場合は、admin-editable DB entity ではなく code-owned section type / config schema として追加する

### Compliance / Validation

- Prisma schema から `SectionStyle` と関連 FK / column を削除
- 新規 migration `20260426090000_drop_section_style_cascade` で破壊的変更を表現
- `/admin/styles` と `/admin/api/section-styles` を削除
- `sectionStyle:*` RBAC permission を削除
- public / preview renderer は `getDefaultSectionStyle(section.type)` を使用
- `bun run db:generate`
- `bun run validate`

## Links / References

- [Next.js Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- [Next.js `use client` directive](https://nextjs.org/docs/app/api-reference/directives/use-client)
- [Prisma Migrate troubleshooting](https://docs.prisma.io/docs/orm/prisma-migrate/workflows/troubleshooting)
- [Prisma production patching and hotfixing](https://www.prisma.io/docs/guides/migrate/production-troubleshooting)
