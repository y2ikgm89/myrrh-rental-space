---
description: Lexical エディタ内部・記事表示レイアウト・SanitizedHtml・prose・目次生成の SSoT
paths:
  - src/shared/lib/lexical/**
  - "src/**/lexical/**"
  - "src/**/*lexical*"
  - src/shared/components/SanitizedHtml*
  - src/shared/lib/html/extract-headings*
  - src/shared/lib/styles/prose*
  - src/shared/styles/lexical-content.css
  - "src/app/(public)/**/*article*"
---

# SSOT — Lexical / 記事表示

プロジェクト全体で単一定義を厳守する定数・シングルトン。ローカル再定義・重複定義は禁止。

| 定数/変数                                                                                                     | 場所                                                                                        | メモ                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ArticleLayout` / `ArticleHeader` / `ArticleFooter` / `ArticleTagList`                                        | `@/public/components/{layouts,ui}/article-*`                                                | 公開詳細 4 系統（events / news / posts / terms / preview）統一ラッパー SSoT。**spaces 詳細は Variant E 構造に移行し ArticleLayout 経由を廃止**（→ `frontend/design-config/public-page-gotchas.md`） |
| `SanitizedHtml` (`hydrateLexicalTabs` 内蔵)                                                                   | `@/shared/components/SanitizedHtml`                                                         | 管理者入力 HTML 表示 + Lexical 静的 HTML の client hydration SSoT。`<a target="_blank">` を含む HTML を表示する全箇所で必須。生の `dangerouslySetInnerHTML` 直書き禁止                              |
| `extractHeadingsFromHtml` / `injectHeadingAnchors` / `slugifyHeading` / `HeadingEntry`                        | `@/shared/lib/html/extract-headings`                                                        | 公開記事詳細の目次生成 SSoT（GFM / rehype-slug 互換）。posts / news / terms 共通                                                                                                                    |
| `CustomHeadingNode` / `anchorIdState` / `HeadingAnchorPlugin`                                                 | `@/admin/.../lexical/nodes,plugins`                                                         | `HeadingNode` の NodeState 拡張 + Node Replacement。`HeadingAnchorPlugin` が `anchorId` 自動生成                                                                                                    |
| `$getSelectionBlockNodes` / `$isMultiBlockSelection`                                                          | `@/admin/.../lexical/lib/selection-helpers`                                                 | 選択の「ブロック粒度」を求める SSoT。Floating Text FT ↔ Block FT の排他制御。ローカル再実装禁止                                                                                                     |
| `EDITORIAL_PROSE_CLASSES` / `EDITOR_PROSE_CLASSES`                                                            | `@/shared/lib/styles/prose`                                                                 | 公開 `Prose` Primitive と Lexical エディタの prose スタイル SSoT。Lexical `theme.ts` の heading/paragraph 等 utility は削除し外側 prose に委譲。直接書きクラスセット禁止                            |
| `[data-button-*]` セレクタ群 (`lexical-content.css` §1f)                                                      | `src/shared/styles/lexical-content.css`                                                     | Lexical 本文 Button の視覚 SSoT。Node の `decorate()` / `exportDOM()` は data-attribute only（→ `lexical/nodes.md`）。新 Lexical Node で公開 Primitive と一致が必要な場合は同パターン踏襲必須       |
| `InlineIconNode` / `$createInlineIconNode` / `$isInlineIconNode` / `inlineIconNameState` / `InlineIconPlugin` | `@/admin/.../lexical/nodes/InlineIconNode` + `@/admin/.../lexical/plugins/InlineIconPlugin` | 本文中の inline curated icon 挿入 SSoT。`/` ComponentPicker → `IconPickerDialog` → 選択。並立 inline-icon ノードの追加禁止                                                                          |
