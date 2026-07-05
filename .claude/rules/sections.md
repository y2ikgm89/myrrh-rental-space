---
paths:
  [
    "src/shared/lib/sections/**",
    "src/shared/lib/portable-text/**",
    "src/shared/lib/validations/section*.ts",
    "src/shared/domain/sections/**",
    "src/app/(public)/_shared/components/sections/**",
  ]
---

# セクションシステム（動的ページ構成）

## 登録と SSoT

- セクション定義は `src/shared/lib/sections/registry.ts` の definitions レコードに集約。
  1 定義 = `definitions/<type>/schema.ts`（configSchema）+ `metadata.ts`（SectionMetadata）の
  組で登録（新規追加の完全手順は `add-section` skill）
- `SectionType` 文字列値の SSoT は `src/shared/lib/validations/section.ts`。
  同ファイルは re-export shell であり inline schema 定義の再導入は禁止
- DB の `Section.type` は素の VarChar(64)（enum なし）。未登録 type は
  SectionRenderer の default 分岐で **silent に非表示**になる

## 全スキーマの契約: safeParse({}) が必ず成功する

全フィールドが `.default()` / `.prefault()` を持つこと。defaults 生成
（`createPageSectionCommand`）と render fallback がこの契約に依存する。

- フィールドは `field-registry.ts` の `field.*` ヘルパーで定義（Zod registry 登録で
  管理画面フォームが自動生成される。group は content / design / advanced）
- `field.array` の `.default([])` は `.min()/.max()` を fallback 経路で skip する
- `.prefault({})` の group schema は zod-introspection が unwrap する前提

## CSP / bundle 境界

- portable-text と page-hero の barrel から Zod schema 値を re-export しない
  （deep-import 指示、テスト強制）
- `src/app/(public)` の `'use client'` ファイルは Zod-heavy 6 module の value-import 禁止
  （type-only import のみ可）。新規 Zod-heavy 公開 module は
  ZOD_HEAVY_DENY_MODULES への 1 行追加が必要

## page-hero の不変条件

1 ページ 1 つのみ（重複 create は CONFLICT）/ order は -1 sentinel 固定で常に先頭 /
個別削除・複製不可 / reorder でも -1 維持。

## デフォルトとテンプレート

- `DEFAULT_PAGE_SECTIONS`（10 slug）は render fallback + 起動時の冪等補充
  （`ensurePageSectionsCommand`、不足 type のみ）+ PAGE_TEMPLATES の供給源。
  DB に section が 1 件でもあれば fallback は混ざらない
- PAGE_TEMPLATES は UNIVERSAL_SECTION_TYPES + additionalSectionTypes の opt-in 制
  （listing/form/calendar 系は page-specific）。server 側 create も同じ許可 floor を強制。
  requiredSectionTypes のセクションは削除不可
- drift gate: registry 定義数（現在 22）/ DEFAULT_PAGE_SECTIONS の schema 適合・
  order 重複なし / required ⊆ defaultSections をテストが固定。定義の増減時は
  これらのテストも更新する

## レンダリングと余白

- SectionRenderer（Server Component）は `await connection()` 後に type で switch。
  disabled feature module の type は早期 null
- セクション間の上下余白の SSoT は SectionStack の gap のみ。
  **各セクションに上下 padding を持たせない**（二重余白/ゼロ余白が再発する）
