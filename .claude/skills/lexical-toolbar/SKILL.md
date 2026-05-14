---
name: lexical-toolbar
description: 管理画面の Lexical toolbar に新しい操作を足すときに使う。button 配置、command 接続、dialog 連携、active state を一緒に揃える。既存 toolbar の監査やモダナイズが主目的なら audit-lexical を使う。
when_to_use: Lexical toolbar に新しい button / dropdown / dialog 操作を追加するとき。
paths:
  - src/**/lexical/plugins/toolbar/**
---

# lexical-toolbar

## lexical skill 使い分け

| 主目的                                              | 使う skill        |
| --------------------------------------------------- | ----------------- |
| 新しい node 型を追加（TextNode / DecoratorNode 等） | `lexical-node`    |
| 新しい plugin を追加（dialog / command / listener） | `lexical-plugin`  |
| 新しい toolbar 操作を追加（button / command 接続）  | `lexical-toolbar` |
| 既存実装を監査 / deprecated API / モダナイズ        | `audit-lexical`   |

`src/app/(admin)/**/lexical/**` の toolbar を拡張するときに使う。
plugin や node を伴う場合でも、主目的が toolbar 操作の追加ならこの skill を起点にする。

## 入力

- `FeatureName`
- button の動作: `dialog`, `direct-insert`, `format-toggle`
- 使用アイコン
- tooltip 文言

## 先に読む

1. `.claude/rules/frontend/lexical/toolbar-layout.md`（toolbar・floating toolbar・グループ化）
2. `.claude/rules/react/compiler.md`
3. 既存実装:
   - `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/ToolbarPlugin.tsx`
   - `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/LexicalEditor.tsx`
4. 長いコードひな形が必要なら `reference/scaffold-lexical-toolbar.md`（任意）

## ワークフロー

1. button が dialog 型か command 型か format toggle 型か決める
2. 必要なら plugin / command / dialog hook を先に追加する
3. `ToolbarPlugin.tsx` に button を追加する
4. `LexicalEditor.tsx` 側で callback や dialog を統合する
5. active state が必要なら selection 連動で反映する
6. 配置順、separator、tooltip を整える

## ガードレール

- button には `type=\"button\"` を付ける
- icon size と button size を既存規約に合わせる
- tooltip/title を省略しない
- 既に state を変更する command は `editor.update()` で包まず `dispatchCommand()` を直接使う
- toolbar だけ追加して backend/plugin 接続を置き忘れない

## Done

- button と必要な callback / command / dialog を追加した
- `ToolbarPlugin.tsx` と `LexicalEditor.tsx` の両方を更新した
- active state と tooltip を必要に応じて実装した
- 関連テストまたは既存テスト影響を確認した
- `bun run validate` を実行した
