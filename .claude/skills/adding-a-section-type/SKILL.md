---
name: adding-a-section-type
description: Adds a new public-page section type to this project end to end — config schema, registry entry, SectionRenderer case, and page-template allow-list. Use when the user wants to add, create, or register a new section type for public pages.
---

# 新しいセクション type を追加する

公開ページのセクションは「config schema / 定義 registry / SectionRenderer / page-template」の整合が必須。1つでも欠けると、保存はできても描画で silent break する。以下を順に揃える。

## 手順

1. **既存セクションを読む** — 似たセクション（`hero` / `features` など）を Read し、スキーマ・命名・ファイル配置を踏襲する。
2. **config schema** — そのセクションの Zod スキーマを `src/shared/lib/sections/` に定義する。PortableText 化済みのフィールドは `string` を受け付けない点に注意。
3. **registry 登録** — `src/shared/lib/sections/registry.ts` に type を追加し、`validateSectionConfig(type, config)` が通るようにする。
4. **SectionRenderer** — `src/app/(public)/_shared/components/sections/` に描画コンポーネントを追加し、renderer の分岐に `case` を追加する（Server Component。データ取得が要るなら `@/shared/domain` 経由）。
5. **page-template** — `src/shared/lib/sections/page-templates.ts` で、このセクションを許可するページの `allowedSectionTypes`（必要なら `requiredSectionTypes`）に追加する。許可しないページには入れない（二重配置などの UX バグ防止）。
6. **検証** — `bun run validate` を通す。管理画面の AddSectionDialog に出るか、公開ページで描画されるかを確認する。

## 注意

- 公開側からの DB アクセスは必ず domain 経由。`@/shared/db*` を import しない。
- cache に関わる場合はタグを直書きせず `CACHE_TAGS` / `getCacheTag` を使う。
