---
name: add-section
description: 公開サイトのページビルダーに新しいセクション type (section type) を追加する完全手順。Zod schema (field.* ヘルパー)・metadata・registry 登録・SectionType 定数・SectionRenderer のレンダラー実装・page template 許可 (UNIVERSAL_SECTION_TYPES / additionalSectionTypes)・DEFAULT_PAGE_SECTIONS・drift gate テスト更新までを網羅。「セクションを追加 / 新セクション type / add section / new section type」の依頼時に使用する。
---

# 新セクション type の追加手順

設計上の常設規約 (safeParse({}) 契約の背景・余白 SSoT・page-hero 不変条件・CSP/barrel 境界) は
rules の `sections` を参照。本 skill は追加手順・チェックリスト・判断基準のみを扱う。

## 事前の判断 3 点

1. **type 名**: kebab-case (例 `"pricing-table"`)。DB の `Section.type` は素の VarChar(64)
   なので Prisma migration は不要。
2. **配置区分** (`src/shared/lib/sections/page-templates.ts`):
   - 純プレゼンテーション系 (データ結合・二重表示リスクなし) → `UNIVERSAL_SECTION_TYPES`
   - listing / form / calendar 系 → page-specific。該当テンプレートの
     `additionalSectionTypes` で opt-in (マーケ用途の listing は `MARKETING_SECTION_TYPES`)
   - **どちらにも入れないと orphan gate テストが fail する** (Step 6)
3. **feature module 連動の要否**: ON/OFF 可能な機能 (spaces / events 等) に属するデータを
   表示するなら `src/shared/lib/features/registry.ts` の `FEATURE_MODULES[<module>].sectionTypes`
   に追加が必要 (Step 5)。

命名規約 (既存例: type `"map"` → `mapConfigSchema` / `MapConfig` / `mapMetadata` /
`getMapConfig` / `MapSection` / `SectionType.MAP`)。

## Step 1: schema.ts

`src/shared/lib/sections/definitions/<type>/schema.ts` を新規作成。

- `export const <camel>ConfigSchema = z.object({...})` と
  `export type <Pascal>Config = z.infer<typeof <camel>ConfigSchema>` を export
- フィールドは `src/shared/lib/sections/field-registry.ts` の `field.*` ヘルパーのみで定義:
  `text / textarea / number / boolean / select / color / image / media / url / icon /
array / dynamicSelect / portableTextInline / portableTextBlock` (計 14 種)。
  opts で `group` (`content`(既定) / `design` / `advanced`)・`subGroup`・`helpText` 等を指定
- **契約: `safeParse({})` が必ず成功する** = 全フィールドが `.default()` / `.prefault()` を持つ。
  `field.select` は `default` が必須 opts。素の `z.string()` 等を直接混ぜない
- 共通部品 (`definitions/_shared/`):
  - 冒頭の sectionLabel + title → `section-header.ts` の
    `...sectionHeaderFields({ sectionLabelDefault: "..." })` を spread
  - **末尾に `layout: sectionLayoutSchema` (`_shared/layout.ts`) を必ず入れる** (全定義共通)
  - CTA ボタン配列 → `_shared/buttons.ts` の `createButtonsArraySchema`
- conform FormData 経由の string 入力対応は `field.number` / `field.boolean` /
  portableText 系が preprocess を内蔵済み。`z.coerce` の手書き禁止
- group を `.prefault({})` で包む場合は sectionLayoutSchema と同型にする
  (admin の zod-introspection が default/optional/prefault を unwrap する前提)

## Step 2: metadata.ts

同 dir に `metadata.ts`:

```ts
import type { SectionMetadata } from "../../types";
export const <camel>Metadata: SectionMetadata = {
  label: "表示名",
  description: "管理画面の説明文。",
  icon: "Icon〜",       // Tabler icon 名 (文字列)
  category: "content",  // hero | content | list | functional | media
};
```

`index.ts` barrel は作らない (Step 7 参照)。

## Step 3: registry.ts へ登録

`src/shared/lib/sections/registry.ts`:

1. schema と metadata を import
2. `definitions` レコードにエントリ追加 (key = type 文字列、`type` / `configSchema` / `metadata`)
3. ファイル冒頭と definitions 直上の「全 22 セクション定義」コメントの数を更新

## Step 4: validations 層 (SectionType 定数 + typed getter)

`src/shared/lib/validations/section.ts` (re-export shell。inline schema 定義は禁止):

1. `SectionType` 定数に `<UPPER_SNAKE>: "<type>"` を追加
2. `SECTION_TYPE_VALUES` 配列に `SectionType.<UPPER_SNAKE>` を追加
3. canonical re-export ブロックに `export { <camel>ConfigSchema, type <Pascal>Config } from ...` を追加
4. `SectionConfig` union: `import type { <Pascal>Config }` + union メンバー追加
5. (任意) runtime 型ガードが必要な場合のみ `createConfigGuard` で `is<Pascal>Config` を追加

`src/shared/lib/validations/section-defaults.ts`:

```ts
export const get<Pascal>Config =
  createTypedConfigGetterFromSchema(<camel>ConfigSchema);
```

(safeParse 失敗時は defaults に fallback する facade。公開レンダラーが使う)

## Step 5: 公開レンダラー

1. **コンポーネント**: `src/app/(public)/_components/<Pascal>Section.tsx` (Server Component)。
   props は `{ config: <Pascal>Config, style: SectionStylePayload }` + 必要なデータ props。
   ルートを `SectionWrapper` (`@/public/components/sections/SectionWrapper`) で包み
   `style` と `config.layout` を渡す。上下 padding を持たせない・px 直書き禁止
   (rules の `sections` / `frontend-ui` を参照)。config 型は
   `@/shared/lib/validations/section` から **type-only** で import (既存例: `MapSection`)
2. **SectionRenderer** (`src/app/(public)/_shared/components/sections/section-renderer.tsx`):
   switch に `case SectionType.<UPPER_SNAKE>:` を追加。
   `const config = get<Pascal>Config(section.config);` → コンポーネントに
   `config` と `style={resolved}` を渡す。DB データが必要なら case 内で
   `src/shared/domain/*` の公開 query を呼ぶ (既存の list 系 case が参照実装)。
   未登録 type は `default: return null` で silent 非表示になるため、追加漏れに注意
3. **feature module gate** (該当時のみ): `src/shared/lib/features/registry.ts` の
   `FEATURE_MODULES[<module>].sectionTypes` に type を追加。SectionRenderer 冒頭の
   `getFeatureFilterContext().disabledSectionTypes` による早期 null が自動で効く
4. **表示 style** (任意): 既定は `DEFAULT_SECTION_STYLE`。変えたい場合のみ
   `src/shared/domain/section-styles/types.ts` の `SECTION_TYPE_STYLES` にエントリ追加
   (`CTA_SECTION_STYLE` / `HERO_ADJACENT_STYLE` / `FULL_BLEED_STYLE` が既存プリセット)

キャッシュ配線は不要: セクション read は `getPageSections` の
`CACHE_TAGS.SECTIONS / PAGE_SECTIONS` 一本で、admin mutation の invalidation も既存の
page-section action が全 type 共通で行う。

## Step 6: テンプレート許可 (必須)

`src/shared/lib/sections/page-templates.ts`:

- universal → `UNIVERSAL_SECTION_TYPES` に追加 (全 11 テンプレートで追加可能になる)
- page-specific → 該当テンプレートの `additionalSectionTypes` に追加。
  universal と重複させない (disjoint テストあり)
- server 側の許可 floor (`createPageSectionCommand` が `template.allowedSectionTypes` を検証、
  `src/shared/domain/sections/commands.ts`) は自動で追従する。追加作業なし

**デフォルト配置が必要な場合のみ** `src/shared/lib/constants/default-page-sections.ts` の
`DEFAULT_PAGE_SECTIONS` に `DefaultSectionDef` を追加:

- `config` は schema の canonical 形 (integration テストが safeParse を強制)
- `order` は slug 内で重複禁止。`-1` は page-hero 専用 sentinel
- 起動時の `bootstrapSystemPages` (`src/instrumentation.ts` →
  `ensurePageSectionsCommand`) が不足 type のみ冪等補充するため、既存 DB にも次回起動で反映
- テンプレートの `requiredSectionTypes` に入れる場合は、そのテンプレートの
  defaultSections にも必ず含める (drift gate テストが fail する)

## Step 7: barrel / Zod-heavy deny list の判断

- `definitions/<type>/index.ts` barrel を**作らない** (schema 値の re-export は
  architecture-boundaries の gate 対象。page-hero の type-only barrel が唯一の例外前例)
- `__tests__/unit/architecture-boundaries.test.ts` の `ZOD_HEAVY_DENY_MODULES` への追加は
  原則不要 (registry / validations/section 経由の import は既に deny 済み)。
  公開側 `'use client'` から schema module を直接 value-import し得る構造
  (page-hero 型の barrel + client 消費) を作った場合のみ
  `@/shared/lib/sections/definitions/<type>/schema` を 1 行追加する

## Step 8: 管理画面 (ほぼ自動)

- 編集フォームは AutoSectionForm が field registry から自動生成 — 作業なし
- AddSectionDialog の一覧カードも registry の metadata から自動表示 — 作業なし
- (任意) 一覧アイコン: `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/SectionTypeIcon.tsx`
  の `sectionTypeIconComponents` にエントリ追加 (未登録は IconFileText に fallback)

## Step 9: drift gate テストの更新

| テスト                                                       | 更新内容                                                                                                                                                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `__tests__/unit/domain/sections/registry.test.ts`            | `toHaveLength(22)` と「全カテゴリの合計件数が 22 件」の数を +1、`expectedTypes` 配列に type 追加、該当カテゴリの `toContain` テストに追加                                 |
| `__tests__/unit/shared/lib/sections/page-templates.test.ts`  | orphan gate (`no orphans`) は Step 6 実施で自動 pass。page-specific にした場合は「gated to their templates」の not.toContain 検証に追加を検討                             |
| `__tests__/integration/sections/page-defaults.test.ts`       | 自動走査 (registry 整合 / order 重複 / canonical config)。DEFAULT_PAGE_SECTIONS を触った場合に fail しないこと                                                            |
| `__tests__/unit/forms/section-config-empty-optional.test.ts` | 全定義を自動列挙し空 FormData で parseWithZod する。defaults 契約を満たせば自動 pass。discriminated union schema にした場合のみ page-hero と同様の variant 個別対応が必要 |

registry / definitions のコメント上の定義数 (registry.ts 冒頭、`_shared/layout.ts` の
「全 N sections」等) も併せて更新する。

## Step 10: 検証

```sh
bun scripts/run-tests.ts __tests__/unit/domain/sections \
  __tests__/unit/shared/lib/sections \
  __tests__/unit/forms/section-config-empty-optional.test.ts \
  __tests__/unit/architecture-boundaries.test.ts
bun scripts/run-tests.ts __tests__/integration/sections/page-defaults.test.ts
bun run type-check
bun run validate   # 完了報告前に必須
```

テストは必ず `scripts/run-tests.ts` 経由 (rules の `testing-unit` を参照)。
動作確認: 管理画面 `/admin/pages/<slug>/edit` の「セクションを追加」に新 type が出ること・
空のまま保存できること・公開ページで描画されることを確認する。
