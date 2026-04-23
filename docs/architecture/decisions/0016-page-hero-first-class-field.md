# 0016. ホームヒーローを `Page.pageHero` 第一級フィールドへ移行し `homepage-hero` Section を廃止する

- **Status**: Accepted
- **Date**: 2026-04-22
- **Deciders**: y2ikgm89
- **Related**: Phase A 実装 commit `0dd7c4f3`〜`29ad57b6`（プランは clean-break 原則で削除済、`git log --all --diff-filter=D -- docs/superpowers/plans/` で復元可） / Phase B（`SectionStyle`）は [ADR 0017](./0017-section-style-cascade.md)

## Context

ホームのヒーローが DB 上は `Section` 行（`type = homepage-hero`）として扱われ、他セクションと同じ `SectionRenderer` 経路に載っていた。一方でヒーローは（1）ページ全体の入口として意味が異なり、（2）variant・画像スライド・遷移モードなど構造が他セクションより複雑、（3）1 ページ 1 ヒーローという不変条件を Section 汎用モデルで暗黙に表現していた。

Phase A では Utopia 系 `--space-*` トークンと `SectionWrapper` による design SSoT を全セクションに広げる前提で、ヒーローだけ「ページ属性」として切り出すと責務が明確になる。

## Decision

### D1: `Page.pageHero`（JSONB, nullable）を追加する

- Prisma `Page` に `pageHero Json?` を追加する。
- 公開ホームは `pageHero` を `PageHero` スキーマ（Zod discriminated union）で検証し、`<PageHero />` から variant 別コンポーネントへ dispatch する。
- **`homepage-hero` Section type は削除**し、既存行はマイグレーションで `pageHero` に移してから `DELETE` する。

### D2: 検証と編集の単一正本

- 正本: `src/shared/lib/sections/page-hero/schema.ts` の `pageHeroSchema` / `parsePageHero`。
- 管理画面ホームのみ「ヒーロー」タブで編集し、`updatePageHero` Server Action 経由で永続化する（slug `home` のみ）。
- 旧 `homepage-hero` Section 定義・registry 登録は削除（再導入しない）。

### D3: 縦余白トークン

- 廃止: `--spacing-section` / `--spacing-section-compact` を `src` から参照しない（`__tests__/unit/architecture-boundaries.test.ts` で検出）。
- 採用: `--space-3xs` … `--space-2xl` と `SectionWrapper` の `paddingTop` / `paddingBottom` マップ（`--space-sm` … `--space-xl`）。

## Consequences

### Positive

- ヒーローと「ページに複数並ぶセクション」のデータモデルが一致し、説明コストが下がる。
- ホームのヒーロー変更が Section 並び替え・type フィルタと混ざらない。
- Phase B の `SectionStyle` cascade 設計と独立してヒーローを進化できる。

### Negative

- ホーム以外で同じ UI を使う場合は `pageHero` ではなく別機構（将来の共有 Style や Section）を検討する必要がある。
- 既存 DB はマイグレーション必須（未適用環境では列不足で実行時エラー）。

## Compliance / Validation

- `bun run validate` / `bun run build`
- `__tests__/unit/lib/sections/page-hero/schema.test.ts` / `migration.test.ts`
- `__tests__/unit/architecture-boundaries.test.ts`（`--spacing-section*` 禁止・セクション surface の `px-4`/`px-6` 禁止）

## Links

- [Prisma JSON フィールド](https://www.prisma.io/docs/orm/prisma-schema/data-model/models#working-with-json-fields)
- [Zod discriminated union](https://zod.dev/)
