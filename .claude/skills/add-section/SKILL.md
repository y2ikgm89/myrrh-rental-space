---
name: add-section
description: 公開ページ用のセクション型を新しく追加する手順。CMS のページビルダーに新しいブロックを足す、既存セクションの設定項目を増やす、どのページテンプレートで使えるようにするかを決めるときに使う。
---

# セクション型を追加する

設計の SSoT は `.claude/rules/sections.md`。ここは**触るファイルの順番**。

公開ページはすべて `Page` + `Section[]` + `SectionRenderer` なので、
「新しいページの見た目」はほぼ常にセクションの追加として実装する。
ページ専用のトピックファイルを作らない。

## 0. 既存で足りないか先に確認する

23 型ある。`src/shared/lib/sections/registry.ts` の `sectionDefinitions` と
各 `definitions/<type>/metadata.ts` を読んでから決める。設定項目を増やすだけで
足りるなら型は増やさない。

## 1. 型の値を足す

`src/shared/lib/validations/section.ts`

1. `SectionType` に kebab-case の値を追加
2. `SECTION_TYPE_VALUES` にも追加（Zod の `z.enum` はこの配列を見る。
   片方だけだと保存時に弾かれる）

## 2. 定義を作る

`src/shared/lib/sections/definitions/<type>/`

- `schema.ts` — Zod schema。見出し・本文・リンクテキストは素の `string` では
  なく `PortableTextSpan[]` / `PortableTextBlock[]`。必須テキストは
  `z.string().trim().min(1)`（`.min(1).trim()` は空白を通す）
- `metadata.ts` — `SectionMetadata`（`label` / `description` / `icon` /
  `category`）

**schema の「値」を barrel から re-export しない。** `'use client'` 側に Zod が
value import されると static prelude に載り、CSP nonce gap になる。

## 3. レジストリに登録する

`src/shared/lib/sections/registry.ts` に import 2 行と `sectionDefinitions`
のエントリを足す。

## 4. 描画を足す

`src/app/(public)/_shared/components/sections/section-renderer.tsx` に
`case SectionType.X:` を追加。横パディングは `px-4` / `px-6` を直書きせず
`Container` / `SectionWrapper` のトークン経由。

## 5. どこで使えるかを決める

`src/shared/lib/sections/page-templates.ts`

- どのページに置いても破綻しない純プレゼンテーション系 → `UNIVERSAL_SECTION_TYPES`
- listing / form / calendar のようにページ文脈に依存する → 使わせたい
  テンプレートの `additionalSectionTypes` にだけ足す

**listing 系を universal にしない。**「予約ページに space-list を足して
二重表示」のような UX バグは、ここで構造的に防いでいる。

初期配置が要るなら `src/shared/lib/constants/default-page-sections.ts`。

## 6. 機能モジュールと紐づくなら

`src/shared/lib/features/registry.ts` の該当 module の `sectionTypes` に足す。
これで機能 OFF のときに AddSectionDialog から消える。

## 7. 確認する

```sh
bun run validate
bun scripts/run-tests.ts __tests__/unit/architecture/section-registry-clean-break.test.ts
bun scripts/run-tests.ts __tests__/unit/architecture
```

管理画面（`/admin/pages/<slug>/edit`）でセクションを追加・保存し、公開側で
描画されることを実際に見る。保存の成否は toast ではなく**リロード後の
永続化状態**で判定する。

## 気をつけること

- セクションは `page-hero` 以外すべて複製できる。DOM id を slug などデータ由来
  だけで組み立てると複製後に衝突する。
- 並び替えは `order-sql.ts` の一時値退避パターン（直接 swap は unique index に
  当たる）。
- キャッシュ無効化は `CACHE_TAGS.PAGE_SECTIONS` 系を
  `invalidateSiteWideCache` 経由で（`.claude/rules/caching.md`）。
