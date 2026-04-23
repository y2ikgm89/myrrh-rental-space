# 0017. SectionStyle を独立 entity 化し 4 段 cascade で解決する

- **Status**: Accepted
- **Date**: 2026-04-22
- **Deciders**: y2ikgm89
- **Related**:
  - Phase B 実装 commit `25ce3ff7`〜`a03a739c`（プランは clean-break 原則で削除済、`git log --all --diff-filter=D -- docs/superpowers/plans/` で復元可）
  - [Section Style Cascade Design Spec](../../superpowers/specs/section-style-cascade-design.md)
  - [ADR 0016 PageHero first-class field](./0016-page-hero-first-class-field.md)（Phase A で採択）

## Context

Phase A で全 section が `SectionWrapper` 経由となり、管理画面の design 制御は完全に機能する状態になった。しかし design payload は `Section.design`（per-instance JSON）に閉じており、以下の課題が残る:

1. **DRY 違反** — 「Editorial Hero スタイル」を複数 page で使うと同一 JSON をコピペすることになる。
2. **一括変更不可** — 「全 section の paddingTop を `xl` に」のような global 調整に全 Section レコード update が必要。
3. **A/B テスト困難** — 内容同じ見た目違いを作るには section 複製が必要。
4. **マルチサイト非対応** — テナントごとの preset 切替機構がない。

業界実装（Sanity object reference / Webflow Class System / WordPress Block Style Variations / Material Design Tokens）は、design を独立 entity + cascade で解決する。本プロジェクトもこの方向に寄せる。

## Decision

### D1: `SectionStyle` を独立モデルとして新設する

`SectionStyle` モデルに design 5 group（`spacing` / `background` / `container` / `typography` / `animation`） + `customClass` + `applicableTypes[]` + 版管理（`version` / `parentId`）+ 監査 + soft delete を持たせる。scope は `"global" | "page" | "section"`。

### D2: 4 段 cascade + instance override で解決する

specificity 低 → 高:

1. **Hardcoded fallback** (`DEFAULT_SECTION_STYLE`)
2. **Theme default** (`Settings.globalSectionStyleId`)
3. **Page-level** (`Page.pageStyleId`)
4. **Section preset** (`Section.styleId`)
5. **Section instance override** (`Section.styleOverride` JSON)

`resolveSectionStyle(section, page, settings)` を domain 層 pure function として実装。

業界標準との比較:

| システム           | Cascade 構造                                                 |
| ------------------ | ------------------------------------------------------------ |
| WordPress          | 3 階層（Core → theme.json → User）                           |
| Sanity             | document reference / inline embed（cascade は schema 依存）  |
| Material Design    | Reference → System → Component                               |
| **本プロジェクト** | **4 段 + instance override**（WordPress に Page 階層を追加） |

Page 階層を加えた理由: 「1 page 内の全 section を一括で editorial tone に」を editor が直感的に制御できるようにするため。WordPress は block-level の variation で代替しているが、本プロジェクトは page-level cascade を first-class で提供する。

### D3: 既存 `Section.design` を自動移行して削除する

Phase B.P3 の data migration script で全 `Section.design` をハッシュ統合し `SectionStyle` preset に変換、`Section.styleId` に紐づける。P4 で `ALTER TABLE "Section" DROP COLUMN design` を実行（`styleId NULL === 0` を確認してから）。

### D4: Style 削除は `ON DELETE SET NULL` + soft delete の併用

- `Section.styleId` / `Page.pageStyleId` / `Settings.globalSectionStyleId` は `ON DELETE SET NULL`
- `SectionStyle.deletedAt` で soft delete 可能
- Admin UI は削除前に usage 一覧を強制表示

### D5: scope ごとに UI 配置を分離する

- `global` scope → `/admin/settings/design`
- `page` scope → `/admin/pages/[slug]/edit` の Page Style タブ
- `section` scope → `/admin/styles`（最も頻繁に使われる、専用 Library）

### D6: `applicableTypes` で section type との互換性を明示する

`applicableTypes: string[]`（空配列なら全 type 適用可）。Admin StyleSelector で section.type に対応しない Style を dropdown から除外。

### D7: Phase 分割で段階的に移行する

1. P1: spec + ADR（本 ADR）
2. P2: schema + migration + seed preset 5 件
3. P3: domain cascade resolver + data migration script
4. P4: 公開ページ cascade 統合 + `DROP COLUMN design`（destructive）
5. P5: admin Style Library + Section editor 改修

worktree 隔離（`feature/section-arch-phase-b`）で main を常にクリーンに保つ。

## Consequences

### Positive

- 同一 design の再利用が editor 体験として直感的に可能になる。
- 「全 page 一括調整」「1 page 内 cascade」「section 個別 override」の 3 粒度を統一 API で扱える。
- マルチサイト化時に Settings を sub-tenant 化するだけで Style cascade が追従する。
- Phase A の PageHero first-class と独立して Style を進化できる（責務が分離されたまま）。
- 業界標準 CMS（Sanity / WordPress / Webflow）との mental model 互換性が高まる。

### Negative

- モデル 1 つと cascade resolver の実装コスト。migration script が複雑化する（design 重複統合）。
- editor 学習コストが上がる: 「Style を選ぶ or override を調整 or new Style を作る」の 3 分岐を理解する必要がある。対策として `docs/guides/admin/style-library.md` を整備する。
- `onDelete: SetNull` で Style 削除時に視覚的 regression が起こりうる。削除前 usage 一覧強制表示で緩和する。
- cache invalidation が複雑化（style 編集 → 該当 section + page 全部 invalidate）。`CACHE_TAGS.SECTION_STYLES` + `invalidateSectionStyleCaches()` で一元化する。

## Compliance / Validation

- `bun run validate` / `bun run build`
- unit tests: `style-resolver.test.ts` / `style-merger.test.ts` / `applicable-types.test.ts`
- integration tests: `section-style-crud.test.ts` / `section-design-migration.test.ts`
- E2E: `admin/section-styles.spec.ts`
- `prisma.section.count({ where: { styleId: null } })` === 0（P3 完了後）
- `.claude/rules/ssot-singletons.md` に `SectionStyle` / cascade resolver を追記
- `__tests__/unit/architecture-boundaries.test.ts` に `Section.design` 直接参照禁止 grep を追加

## Links

- [WordPress theme.json global settings and styles](https://developer.wordpress.org/block-editor/how-to-guides/themes/global-settings-and-styles/)
- [WordPress block.json supports.spacing](https://developer.wordpress.org/block-editor/reference-guides/block-api/block-supports/)
- [Sanity Object types](https://www.sanity.io/docs/object-type)
- [Sanity Page Builder guide (Roboto Studio)](https://robotostudio.com/blog/the-only-sanity-page-builder-guide-youll-ever-need)
- [Strapi v5 Page Builder best practices](https://strapi.io/blog/building-a-page-builder-via-content-modeling-best-practices-in-strapi5)
- [Material Design Tokens](https://m3.material.io/foundations/design-tokens)
