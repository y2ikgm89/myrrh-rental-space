# 067: Lexical コメント機能 - InlineEditor統合

## 概要

Lexicalエディタのコメント機能（Phase 2で実装済み）をBlog/News/PageのInlineEditorに統合し、排他的パネル管理パターンを導入。

## 実装内容

- 排他的パネル管理フック（useEditorPanels）追加 - 設定パネルとコメントパネルが同時に開かない
- EditorHeaderにコメントボタン追加（MessageSquareアイコン、コメント数バッジ）
- CommentPanelにisOpenプロパティとサイドバーラッパー追加
- LexicalEditorにonMarkClick/onAddCommentコールバック追加
- FloatingToolbarPluginにコメント追加ボタン統合
- BlogInlineEditor、NewsInlineEditor、PageInlineEditorにコメント機能統合

## 新規ファイル

なし

## 変更ファイル

- `@/admin/components/editor/inline/hooks.ts` - useSidePanel削除、useEditorPanels追加
- `@/admin/components/editor/inline/types.ts` - EditorHeaderProps拡張、AddCommentPayload型追加
- `@/admin/components/editor/inline/EditorHeader.tsx` - コメントボタン追加
- `@/admin/components/editor/inline/index.ts` - エクスポート更新
- `@/admin/components/editor/comment-panel/CommentPanel.tsx` - isOpenプロパティ、サイドバーラッパー追加
- `@/admin/components/editor/lexical/types.ts` - onMarkClick/onAddCommentプロパティ追加
- `@/admin/components/editor/lexical/LexicalEditor.tsx` - CommentPlugin統合、コールバック処理
- `@/admin/components/editor/lexical/plugins/FloatingToolbarPlugin.tsx` - onAddComment追加
- `@/admin/blog/_components/BlogInlineEditor.tsx` - コメント機能統合
- `@/admin/news/_components/NewsInlineEditor.tsx` - コメント機能統合
- `@/admin/pages/_components/PageInlineEditor.tsx` - コメント機能統合

## 削除ファイル

- `@/admin/components/editor/inline/InlineEditorLayout.tsx` - 未使用
- `@/admin/components/editor/inline/EditorCanvas.tsx` - deprecated

## 検証

- [x] type-check通過
- [x] lint通過
- [x] build成功

## マイグレーション

不要（Phase 2でPrismaスキーマは実装済み）

## 環境変数

なし
