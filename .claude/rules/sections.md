---
paths:
  - "src/shared/lib/sections/**"
  - "src/shared/lib/validations/section*.ts"
  - "src/shared/lib/constants/default-page-sections.ts"
  - "src/shared/domain/sections/**"
  - "src/shared/domain/pages/**"
  - "src/app/(public)/_shared/components/sections/**"
  - "src/app/(admin)/admin/(dashboard)/pages/**"
---

# ページとセクション（CMS）

**公開ページはすべて `Page` + `Section[]` + `SectionRenderer` で構成する。**
ページ専用のトピックファイルは作らない。セクションは 23 型。

| 役割                      | 場所                                                                |
| ------------------------- | ------------------------------------------------------------------- |
| セクション型の SSoT       | `src/shared/lib/validations/section.ts` の `SectionType`            |
| 定義（schema + metadata） | `src/shared/lib/sections/definitions/<type>/`                       |
| レジストリ                | `src/shared/lib/sections/registry.ts`（`sectionDefinitions`）       |
| テンプレート              | `src/shared/lib/sections/page-templates.ts`（`PAGE_TEMPLATES`）     |
| 初期セクション            | `src/shared/lib/constants/default-page-sections.ts`                 |
| 描画                      | `src/app/(public)/_shared/components/sections/section-renderer.tsx` |

## どのページにどの型を置けるか

`PageTemplate.allowedSectionTypes` は **computed 値**で、
`UNIVERSAL_SECTION_TYPES`（hero zone / content / media の純プレゼンテーション系）
＋ そのテンプレートの `additionalSectionTypes` の和。

`additionalSectionTypes` には **universal でないものだけ**を書く。listing
（`space-list` / `news-list` など）・form（`contact-form` /
`reservation-form`）・`event-calendar`・`location-list` は page-specific 扱いで、
テンプレートが明示的に opt-in したときだけ追加できる。「予約ページに
`space-list` を足して二重表示」のような UX バグを AddSectionDialog の段階で
構造的に防ぐための設計で、registry と SectionRenderer は 23 型すべてに対応した
まま。

機能モジュールが OFF のときは、その module の `sectionTypes` /
`templates` が `getFeatureFilterContext()` 経由で除外され、ページ作成は
`assertPageTemplateEnabled` で fail-closed になる。

## セクション型を足すとき

1. `SectionType` に値を追加（kebab-case）
2. `SECTION_TYPE_VALUES` にも追加（Zod の `z.enum` がこの配列を見る）
3. `src/shared/lib/sections/definitions/<type>/` に `schema.ts` と
   `metadata.ts` を追加
4. `registry.ts` の import と `sectionDefinitions` に登録
5. `section-renderer.tsx` に `case` を追加
6. どのテンプレートで使えるかを `page-templates.ts` で決める
   （universal かどうか）
7. 機能モジュールに紐づくなら `features/registry.ts` の `sectionTypes` にも

`__tests__/unit/architecture/section-registry-clean-break.test.ts` が
互換 wrapper の再導入を落とす。

## 気をつけること

- **barrel から schema の「値」を re-export しない。** `'use client'` 側から
  Zod が value import され、static prelude に載って CSP nonce gap を作る
  （`.claude/rules/app-structure.md`）。`portable-text` と `page-hero` の
  barrel に専用ゲートがある。
- 見出し・リンクテキスト・本文は素の `string` ではなく
  `PortableTextSpan[]` / `PortableTextBlock[]`。schema が `string` を受け付け
  ないことをゲートが固定している。
- `SectionConfig` の判別 union を widening cast で潰さない。
- **`page-hero` 以外のセクションは複製できる**（`duplicatePageSectionCommand`）。
  slug など「データ由来だけ」で DOM id を組み立てると複製後に衝突する。
- `Section` の並び替えは `order-sql.ts` の一時値退避パターンを使う
  （`.claude/rules/db-domain.md`）。

## 公開ページを 1 つ足すとき

`Page` レコード + セクションのほかに、chrome（header/footer の扱い）・
`noindex` の要否・route 単位の `loading` / `error` 上書きの 3 点を確認する。
