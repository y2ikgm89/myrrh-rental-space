---
paths:
  - src/app/(admin)/**/editor/inline/**
  - src/app/(admin)/admin/(dashboard)/posts/_components/**
  - src/app/(admin)/admin/(dashboard)/news/_components/**
---

# 管理画面インラインコンテンツエディタ（Post / News）

> 対象: メタデータ用 **UnifiedSidePanel** と **`content-types/*`**（本文編集は別系統の [Lexical エディタ](./lexical/core.md)）。

## 公式準拠の前提

- [React Hook Form](https://react-hook-form.com/) — 値の購読はコンポーネント内では **`useWatch`** を優先（`watch()` 禁止は `react/compiler.md`）
- [React 19](https://react.dev/) / React Compiler — 手動メモ化の追加は外部ライブラリ要件がある場合のみ
- 型は **フォームデータ型**（`FieldValues` を拡張した Zod `infer`）と一致させ、`exactOptionalPropertyTypes` 下で `disabled: undefined` を余計に渡さない

## ディレクトリ正本

| 領域           | パス（エイリアス例）                                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| シェル・パネル | `…/editor/inline/UnifiedSidePanel.tsx`, `SidePanelShell.tsx`, `InlineEditorShell.tsx`                                                                        |
| 型・定数       | `…/editor/inline/content-types/types.ts`（`ContentTypeConfig`, `SidePanelDefinition`, `PostSidePanelExtra`, `NewsSidePanelExtra`, `spreadOptionalDisabled`） |
| 設定（実装）   | `…/content-types/post.tsx`, `news.tsx`（**`"use client"`** — `render` で JSX を返す）                                                                        |
| 共有フィールド | `…/editor/inline/side-panel/*.tsx`                                                                                                                           |
| ページ         | `posts/_components/PostEditor.tsx`, `news/_components/NewsEditor.tsx`                                                                                        |

## サイドパネル設計（現行・後方互換なし）

### 採用パターン

- **`SidePanelDefinition<TForm, TExtra>`** — `tabs[].sections[]` は **`render: (ctx) => ReactNode`**
- **コンテキスト**: `ctx = SidePanelInjectedProps<TForm> & TExtra`（RHF の `register` / `control` / `errors` / `setValue` / **`getValues`（必須）** + 種別固有の `extra`）
- **`UnifiedSidePanel`** — **`extraProps: TExtra` は必須**（空でも呼び出し側で `satisfies` 等により型を固定）
- **`ContentTypeConfig`** — 第 5 ジェネリクス **`TSideExtra`**（未使用は `Record<string, never>`）

### 禁止パターン（再導入しない）

- `SectionDefinition` + **`component: ComponentType<…>`** + **`props` スプレッド** でのセクション登録
- サイドパネル用の **`ComponentType<any>`** 一覧（型安全の放棄）
- `extraProps` / `getValues` の省略（型と実行時の両方で不整合になる）

## Post / News の型分離

- **`PostSidePanelExtra`** — `categories`, `availableTags`, `onCreateCategory`, `onCreateTag`, `statusValue`, `onStatusChange`
- **`NewsSidePanelExtra`** — `isPublishedValue`, `onIsPublishedChange`
- エディターでは `const extra = { … } satisfies PostSidePanelExtra`（または News）を推奨

## `exactOptionalPropertyTypes` と `disabled`

- セクション内に `disabled={ctx.disabled}` のように **`undefined` を明示プロップで渡さない**
- 共通ヘルパー: **`spreadOptionalDisabled(ctx)`**（`content-types/types.ts`）

## `LayoutFields` のみ `any` 境界（意図的）

- RHF の **`Control` / `UseFormRegister` はジェネリクス不変**のため、Post と News を 1 つの厳密ジェネリクスに束ねると `Path<T>` / `useWatch` が破綻する
- **`LayoutFields`** だけ **`SidePanelSectionProps` + `eslint-disable @typescript-eslint/no-explicit-any`**（1 ファイル・コメント必須）
- **他の `side-panel` コンポーネント**は **`render` 内で `<XxxFields<PostFormData>>` 等、具体フォーム型を付ける**（`any` の拡大禁止）

## 新規コンテンツ種別を追加するとき

1. `content-types/types.ts` に **`*SidePanelExtra`** 型と `ContentTypeConfig<…, …, …, …, TSideExtra>` を定義できるよう第 5 引数を使う
2. **`content-types/<id>.tsx`** で `post.tsx` / `news.tsx` を手本に **`sidePanel.tabs[].sections[].render`** を記述（余剰プロパティで `UnifiedPublishFields` 等に丸ごと `ctx` を渡さない）
3. エディタで **`UnifiedSidePanel`** に **`config={…Config.sidePanel}`** と **`extraProps satisfies …`** を渡す
4. バリデーションスキーマに、レイアウト UI が触るキー（Post/News では `contentWidth`, `contentWidthCustom`）を **Zod で明示**し、`toSubmitPayload` では **Prisma モデルに存在するキーだけ**送る（DB に無い列はフォームに置かない）

## `ContentTypeId` と固定ページ

- インライン `content-types` の `ContentTypeId` は **`post` / `news` のみ**。固定ページのレイアウト（`showSidebar` 等）は **`@/shared/lib/validations/page`** とページ編集 UI が正本。将来インラインに載せる場合は `content-types/<id>.tsx` を追加し **`ContentTypeId` ユニオンを拡張**する

## 設定ダイアログの公式送信パターン（Terms / 将来の単一フォームエディタ）

Terms のように `content-types` 拡張を使わない単一 RHF フォームエディタで **Lexical 本文編集 + 設定ダイアログ** を持つものは、設定 UI を Radix `<Dialog>` 直接埋め込みで実装する。Radix 公式の async form submission パターンに準拠すること:

- `<DialogContent>` 直下を **`<form onSubmit={handleSubmit(onSubmit)}>`** でラップする（`onClick={handleSave}` のみでは Enter 送信が効かず non-idiomatic）
- 保存ボタンは **`type="submit"`**、閉じる/キャンセルは `type="button"` + `onOpenChange` でクローズ
- `onSubmit` 成功パスで **`reset(data)` + `setIsSettingsDialogOpen(false)`** を呼び dirty 状態クリア + ダイアログクローズ
- **`<DialogTitle>` + `<DialogDescription>`** 必須（WAI-ARIA）
- Tabs 内にバージョン管理など非送信アクションを混在させる場合、それらのボタンには **`type="button"` を明示**（暗黙 submit 防止）
- 参照実装: `terms/_components/TermsInlineEditor.tsx`

> **注**: FAQ 項目は Lexical エディタを廃止し、`FaqItemForm` + `AdminDetailLayout` + `<Textarea>` + `useFormAction` の標準管理フォームパターン（`FaqCategoryForm` 同型）に統一済み。本セクションの対象外。

## 関連ドキュメント

| 内容                   | 参照                          |
| ---------------------- | ----------------------------- |
| Lexical 本文・ブロック | `lexical/core.md`             |
| 管理 UI 全般           | `admin-ui-patterns.md`        |
| Server Actions         | `server-actions/use-cache.md` |

## 履歴計画書について

旧 `docs/plans/059-unified-editor-sidepanel.md` / `071-unified-content-editor.md` は設計変遷の記録として存在していたが、clean-break 原則（ADR-0015）により削除済み。過去の設計経緯は `git log --all --diff-filter=D -- docs/plans/059-* docs/plans/071-*` で辿る。現行の型名・ファイル名は **本ファイルとソース** を正とする。
