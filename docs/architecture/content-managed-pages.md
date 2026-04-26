# Content Managed Pages

最終更新: 2026-04-25

## 方針

このプロジェクトのページ編集は、自由配置エディタではなく **固定デザイン + 型付きコンテンツフォーム** を正本にする。

レンタルスペースサイトではデザインの自由編集よりも、文言、画像、CTA、FAQ、料金、設備説明を安全に更新できることを優先する。公開ページのレイアウト、余白、レスポンシブ挙動、表示順の基本形は React component と Section 定義で固定し、管理画面は content group の入力に絞る。

Section の visual style はコード所有の `getDefaultSectionStyle(section.type)` で決定する。管理画面に Style Library、style preset CRUD、page / global / instance override cascade は持たせない。

## 採用する編集モデル

- `Page` がページのメタデータ、公開状態、SEO を持つ
- `Section` がページ本文の固定テンプレート要素を持つ
- `Section.config` は Zod schema で型検証する
- `custom` section の長文だけ Lexical JSON / HTML cache を使う
- custom page の新規作成時は、hero / body / CTA の固定 Section を自動作成する
- public / preview は同じ `ManagedPageSections` renderer を使う

## 非採用

- Wix / Studio 型の自由配置 canvas
- drag / resize / layer tree / breakpoint override
- 任意 HTML、任意 script、custom CSS textarea
- custom page 用の freeform document / draft-published document
- 旧 freeform schema との runtime 互換分岐
- Style Library / admin-editable design preset / style override cascade

## 実装境界

- 管理 UI: `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/*`
- admin Server Actions: `src/app/(admin)/admin/(dashboard)/_shared/actions/page*.ts`
- page / section domain: `src/shared/domain/pages/*`, `src/shared/domain/sections/*`
- Section schema: `src/shared/lib/sections/*`, `src/shared/lib/validations/section.ts`
- 公開描画: `src/app/(public)/_shared/components/pages/ManagedPageSections.tsx`

## キャッシュ

管理画面の書き込みは Server Actions から実行し、Next.js の read-your-own-writes 用に `updateTag()` で `PAGES`, `PAGE_SECTIONS`, `SECTIONS` を更新する。公開 route / preview route は Section read model を読み、独自の builder cache tag は持たない。
