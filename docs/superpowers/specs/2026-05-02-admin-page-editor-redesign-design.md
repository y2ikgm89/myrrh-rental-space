# Admin Page Editor Redesign — Design Spec

> 対象: `/admin/pages/[slug]/edit` の大規模 refactor
> 作成: 2026-05-02
> ステータス: Draft（ユーザーレビュー待ち）

## 背景・動機

現在の編集画面は、SectionEditor カードが縦に積まれる単純構造で、以下の課題がある:

**【主】編集しづらい (UI/UX 構造)**

- セクションカードが縦に積まれ、どのセクションを編集中か把握しづらい
- ホームページのように 5〜6 セクションあると下までスクロール必須
- 1 カード内で「テキスト/画像/ボタン/色/レイアウト」が雑多に並び、何を編集しているか直感に乏しい
- 「デザイン」「詳細設定」Accordion は中身が見えないと存在に気づかない
- `PageHero` だけ別フォームで、できることが他セクションと違う

**【副】編集できない (機能 gap)**

- セクションの**並び替え・追加・削除・複製・有効/無効切替**が UI 化されていない（DB に `order Int` / `isActive` あるが Server Action 未実装）
- `post-list.categoryId` 等、field-registry 外で定義されたフィールドが自動生成に乗らない
- ボタンの色・variant 等、装飾系の細かいフィールドが一部未整備

## ゴール（全体）

「**ページの構成を素早く把握し、各セクションのテキスト・画像・ボタンを直感的に編集できる**」管理体験。

## スコープ分割（Phase 1 → 3）

3 Phase に分割。**各 Phase は独立した spec/plan/実装サイクル**を持ち、Phase 1 完了後に Phase 2 spec を別途作成する。

| Phase | テーマ                                    | DB変更      | 主要成果物                                       |
| ----- | ----------------------------------------- | ----------- | ------------------------------------------------ |
| **1** | UI 整理（master-detail + 意味別グループ） | なし        | 編集レイアウト全面刷新                           |
| **2** | セクション CRUD・並び替え                 | なし        | + / 削除 / 複製 / トグル / DnD                   |
| **3** | フィールド追加・gap 解消                  | type による | ボタン装飾・post-list categoryId・キャプション等 |

**本 spec は Phase 1 のみを対象**とする。Phase 2/3 はロードマップとして末尾に記載。

---

## Phase 1 設計

### Phase 1 のゴール

1. **master-detail レイアウト**: 左にセクション一覧（俯瞰）、右に選択中セクションの編集パネル
2. **編集パネル内のフィールド意味別グループ化**: 「テキスト」「画像」「ボタン・リンク」「デザイン」「詳細設定」など、現在の `content / design / advanced` より直感的な分類
3. **PageHero を section と同じ視覚的扱い**: 左一覧の先頭に「ヒーロー」を出し、選択時に右パネルで編集（内部的には現状の `Page.pageHero` Json 列維持。Phase 4 候補で完全統合）

### Out of Scope（Phase 1）

- ❌ Server Actions の追加（CRUD・reorder） → Phase 2
- ❌ DB schema 変更 → Phase 4 候補
- ❌ Field registry への新フィールド追加（既存 schema のまま） → Phase 3
- ❌ Live preview iframe 連動（現状の別タブで OK と確認済み）
- ❌ autosave / unsaved warning / スケジュール公開 → 別議論

### UI 構成（テキスト mockup）

```
┌──────────────────────────────────────────────────────────────────────────┐
│ AdminDetailLayout: ← 戻る  /  「ホームページ を編集」  /  /home          │
│                                          [Badge] [Publish] [プレビュー]  │
├──────────────────────────────────────────────────────────────────────────┤
│ Tabs: [コンテンツ] [SEO・OGP]                                           │
├──────────────────────────────────────────────────────────────────────────┤
│ ┌────────────────────────┬───────────────────────────────────────────┐  │
│ │ セクション一覧          │ ヒーロー (editorial-split)                 │  │
│ │ (左サイド · sticky top) │                                            │  │
│ │                         │ ┌────────────────────────────────────────┐ │  │
│ │ ▸ ヒーロー [active]     │ │ ▼ テキスト                             │ │  │
│ │   ─────────────────     │ │   ラベル / タイトル / 説明              │ │  │
│ │ ▸ お知らせ              │ ├────────────────────────────────────────┤ │  │
│ │ ▸ スペース紹介          │ │ ▼ 画像                                  │ │  │
│ │ ▸ コンセプト            │ │   ヒーロー画像 (8枚スライド可)          │ │  │
│ │ ▸ 利用の流れ            │ ├────────────────────────────────────────┤ │  │
│ │ ▸ お問合せ CTA          │ │ ▼ ボタン・リンク                        │ │  │
│ │                         │ │   ボタン文言 / URL                      │ │  │
│ │ (Phase 2 でここに       │ ├────────────────────────────────────────┤ │  │
│ │  + 追加ボタン / kebab)  │ │ ▷ デザイン (折りたたみ)                  │ │  │
│ │                         │ ├────────────────────────────────────────┤ │  │
│ │                         │ │ ▷ 詳細設定 (折りたたみ)                  │ │  │
│ │                         │ └────────────────────────────────────────┘ │  │
│ │                         │                              [保存]        │  │
│ └────────────────────────┴───────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

### モバイル対応

- `lg:` 以上で master-detail 2カラム
- それ以下では **左一覧を上**、選択時に **下に編集パネル展開** の縦積み（`@container/main` で named container 適応）
- もしくは Drawer で選択時に編集パネルをスライドイン（実装簡易な縦積みを優先候補）

### レスポンシブ breakpoint

`admin-ui/forms.md` 「左1枚 + 右複数カード」と整合する `lg:grid-cols-[280px_1fr]`。`@container/main` 名前空間で `@5xl/main:` 適応。

### コンポーネント変更

#### 新規作成

| ファイル                                               | 役割                                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------------------- |
| `pages/[slug]/edit/_components/SectionListSidebar.tsx` | 左サイドのセクション一覧（PageHero + sections 統合表示・active 状態管理） |
| `pages/[slug]/edit/_components/SectionListItem.tsx`    | 一覧の 1 行（type icon + ラベル + active 状態）                           |
| `pages/[slug]/edit/_components/SectionEditPanel.tsx`   | 右の編集パネル（PageHero or Section 編集を統一エントリ）                  |
| `pages/[slug]/edit/_components/section-edit-state.ts`  | active section ID の nuqs query state SSoT                                |

#### 変更

| ファイル                                                   | 変更内容                                                                            |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `pages/[slug]/edit/_components/PageEditor.tsx`             | 縦積み → master-detail へ書き換え                                                   |
| `pages/[slug]/edit/_components/SectionEditor.tsx`          | カード見出し+保存だけのラッパー → 削除（SectionEditPanel に吸収）                   |
| `pages/[slug]/edit/_components/PageHeroEditor.tsx`         | variant 別の手書きフォーム → AutoSectionForm 互換のフィールドメタ駆動に書き換え     |
| `pages/[slug]/_sections/_components/auto-section-form.tsx` | content グループ内をさらに「テキスト/画像/ボタン・リンク」サブグループ化            |
| `shared/lib/sections/field-registry.ts`                    | `FieldMeta.subGroup` を追加（`"text" \| "image" \| "button" \| "other"`、optional） |

#### 削除候補

なし（Phase 1 では既存ファイルは保持、書き換えのみ）。

### データフロー

```
URL: /admin/pages/home/edit?tab=content&section=hero
              │
              ▼
       PageEditor (Tabs)
              │
              ├── tab=content
              │   ▼
              │   PageEditor 本体
              │   ┌─────────────┬──────────────────────┐
              │   │             │                       │
              │   ▼             ▼                       │
              │  SectionListSidebar    SectionEditPanel │
              │   - PageHero 行       (active section)  │
              │   - sections.map     ┌─ "hero"          │
              │   - 選択 → URL 更新    │   PageHeroEditor│
              │                       └─ section.id      │
              │                           AutoSectionForm│
              │                                          │
              └── tab=seo
                  ▼
                  PageSeoForm (現状維持)
```

### URL state

```typescript
// page-edit-tabs.ts に統合
export const PAGE_EDIT_TAB_VALUES = ["content", "seo"] as const;

// section-edit-state.ts (新規)
// content タブ内で active section を URL に保持
// 値: "hero" | <section.id (uuid)>
//   - "hero" は PageHero 専用 sentinel
//   - sections の id に該当しなければ「最初の active section or hero」にフォールバック
```

`nuqs` の `parseAsString.withDefault("hero")` + `withOptions({ history: "push", shallow: true })`。

### フィールド意味別グループ化

`FieldMeta` に optional な `subGroup` を追加:

```typescript
type FieldSubGroup = "text" | "image" | "button" | "other";

interface FieldMeta {
  label: string;
  group: "content" | "design" | "advanced";
  subGroup?: FieldSubGroup; // 新規（content グループのみ意味あり）
  // ...
}
```

`field.text(label, opts?)` の opts に `subGroup` を追加し、各 section schema で適切に分類:

```typescript
// 例: cta/schema.ts
sectionLabel: field.text("ラベル", { subGroup: "text" }),
title: field.text("タイトル", { subGroup: "text" }),
description: field.textarea("説明", { subGroup: "text" }),
buttons: field.array("ボタン", { subGroup: "button", fields: { ... } }),
```

`subGroup` 未指定は `"other"` 扱い。AutoSectionForm 側で:

```tsx
{/* content グループを subGroup でさらに分類して描画 */}
<FieldGroupSection title="テキスト" icon={IconTypography}>
  {textFields.map(renderField)}
</FieldGroupSection>
<FieldGroupSection title="画像" icon={IconPhoto}>
  {imageFields.map(renderField)}
</FieldGroupSection>
<FieldGroupSection title="ボタン・リンク" icon={IconLink}>
  {buttonFields.map(renderField)}
</FieldGroupSection>
{otherFields.length > 0 && <div>{otherFields.map(renderField)}</div>}
```

`FieldGroupSection` は意味別の見出し付きラッパー（折りたたみなし、常時展開で視覚的整理のみ）。

### PageHero の AutoSectionForm 移行

`page-hero/schema.ts` の variant 別 schema は既に Zod。これに `field.text()` 等を再注入すれば AutoSectionForm で描画可能:

```typescript
// page-hero/schema.ts (改修案)
const editorialSplitFields = {
  variant: z.literal("editorial-split"),
  label: field.text("ラベル", { subGroup: "text" }),
  title: field.text("タイトル", { subGroup: "text" }),
  description: field.textarea("説明", { subGroup: "text" }),
  images: field.array("ヒーロー画像", { subGroup: "image", fields: { ... } }),
  transition: field.select("トランジション", { subGroup: "image", options: [...], default: "crossfade" }),
  buttonText: field.text("ボタン文言", { subGroup: "button" }),
  buttonUrl: field.url("ボタン URL", { subGroup: "button" }),
};
```

variant 切替は AutoSectionForm の上に簡易 Select を別配置（discriminated union のため variant 自身は registry に乗らない）。

`updatePageHero` action はそのまま使う（slug === "home" 制約は Phase 1 維持）。

### 既存契約・互換性

- `Section.config Json` のスキーマは変えない → 全既存データそのまま動作
- `Page.pageHero Json` も変えない
- `field-registry` への `subGroup` 追加は optional のため、既存 22 section type に影響なし（subGroup 未指定 → "other" にフォールバック → 既存と同じ縦並び）

### テスト方針

- **Unit**: `field-registry` の `subGroup` メタ取得テスト追加
- **Unit**: `extractSchemaFields` が subGroup を返すことを確認
- **Integration**: 既存 `architecture-boundaries.test.ts` への影響確認
- **E2E (任意)**: `/admin/pages/home/edit` で master-detail が描画されることを確認、section 切替で URL 更新を確認
- 既存 section 22 種すべてが新 UI で描画できることをローカル目視で確認（manual smoke test）

### リスク

| リスク                                                     | 影響                                  | 対策                                                                                                     |
| ---------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| nuqs `tab=content&section=xxx` の depth 1 keys 制限        | URL state 競合                        | 既存 `tab` と直交キーで定義、`shallow: true` で SC 再フェッチを抑制                                      |
| AutoSectionForm の form state を section 切替で reset 必要 | 切替時に編集中値が他 section に漏れる | `<SectionEditPanel key={activeId}>` で remount 強制（既存 `key={section.id}` パターンに整合）            |
| PageHero の variant 切替時 form reset                      | variant 切替で別フィールドが必要      | `variant` Select を AutoSectionForm 外に置き、value 変更で AutoSectionForm を `key={variant}` で remount |
| field-registry の `subGroup` propagation 漏れ              | 一部フィールドが「その他」に落ちる    | 22 section schema を一括 grep で確認、必要箇所に subGroup 注入する commit を分割                         |
| @lg breakpoint 以下のレイアウト崩れ                        | モバイルで操作不能                    | 縦積み fallback 実装＋ Playwright で 390px 幅を smoke test                                               |

### 計画される commit 分割（writing-plans で詳細化）

1. `feat(field-registry): add optional subGroup meta to FieldMeta` (no behavioral change)
2. `feat(sections): annotate 22 section schemas with subGroup`
3. `feat(page-edit): introduce SectionListSidebar / SectionEditPanel skeleton`
4. `feat(page-edit): wire master-detail layout in PageEditor`
5. `feat(page-edit): URL state for active section (nuqs)`
6. `refactor(page-hero): convert PageHeroEditor to AutoSectionForm-driven`
7. `feat(auto-section-form): render content fields by subGroup with section headings`
8. `chore(page-edit): drop SectionEditor wrapper card`
9. `test(field-registry): subGroup tests + manual smoke test checklist`

最終 commit 数は plan で確定。

---

## Phase 2 ロードマップ（参考）

Phase 1 完了後に別 spec を作成。

- `createPageSection(pageId, type)` Server Action
- `deletePageSection(id)` Server Action
- `duplicatePageSection(id)` Server Action
- `togglePageSectionActive(id)` Server Action
- `reorderPageSections(pageId, orderedIds[])` Server Action
- 左サイドバーに **「+ セクション追加」ボタン**（type picker dialog）
- 各 SectionListItem に **kebab メニュー**（複製・削除・有効/無効切替）
- 左サイドバーで **dnd-kit による drag-and-drop 並び替え**
- システムページの場合 `isSystemPage` で操作制限（既存セクションの並び替え・toggle は許可、削除は不可）

## Phase 3 ロードマップ（参考）

- `post-list.categoryId` を field-registry 経由で `field.select` 化（PostCategory list を Server Component で fetch して options 注入）
- `cta.buttons[].variant` 等装飾系フィールドの拡張
- 画像フィールドに `caption` / `alt` 追加（必要なら）
- ユーザーフィードバックで gap が見えてから個別対応

## Phase 4 ロードマップ（参考、destructive migration 必要）

- `Page.pageHero Json` → `Section` テーブルに `type = "page-hero"` で統合
- destructive migration（data migration + DROP COLUMN）
- `updatePageHero` 削除、`updatePageSection` に統合
- seed.ts の `seedPages()` 修正

## Open Questions（ユーザー確認用）

1. **subGroup の分類粒度**: `text / image / button / other` の 4 値で十分か？
   候補: 加えて `"layout"`（columns / spacing 等を「その他」と区別）など
2. **モバイル fallback**: 縦積み と Drawer のどちらを優先？
   推奨: **縦積み**（実装簡易・親指操作に優しい）
3. **PageHero variant 切替の場所**: 編集パネル先頭の Select か、左サイドの「ヒーロー」項目右に icon ボタンか
   推奨: **編集パネル先頭の Select**（他セクションと UI 整合）
4. **Phase 1 commit 数**: 9 commits 分割で OK か、もっと粒度を粗く（1 PR で squash）にするか
   推奨: **9 commits を保ちつつ 1 PR でまとめる**（git log の追跡性）
