---
name: lexical-plugin
description: 管理画面の Lexical に新しい plugin を追加するときに使う。dialog、command、listener のどれで実装するかを決め、editor への統合まで揃える。既存実装の監査や deprecated API 除去が主目的なら lexical-audit を使う。
paths:
  - src/**/lexical/plugins/*Plugin.tsx
---

# lexical-plugin

## lexical skill 使い分け

| 主目的                                              | 使う skill        |
| --------------------------------------------------- | ----------------- |
| 新しい node 型を追加（TextNode / DecoratorNode 等） | `lexical-node`    |
| 新しい plugin を追加（dialog / command / listener） | `lexical-plugin`  |
| 新しい toolbar 操作を追加（button / command 接続）  | `lexical-toolbar` |
| 既存実装を監査 / deprecated API / モダナイズ        | `lexical-audit`   |

`src/app/(admin)/**/lexical/**` に新しい Lexical plugin を追加するときに使う。
node 自体の追加が主目的なら `lexical-node`、toolbar 追加が主目的なら `lexical-toolbar` を使う。

## 入力

- `PluginName`
- `dialog`, `command`, `listener` のどれか
- 関連 node の有無
- UI が必要か

## 先に読む

1. `docs/reference/codex-rules/lexical-patterns.md`
2. `.claude/rules/react-patterns.md`
3. 既存実装:
   - `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/ImagePlugin.tsx`
   - `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/YouTubePlugin.tsx`
4. 長いコードひな形が必要なら `reference/scaffold-lexical-plugin.md`（任意）

## ワークフロー

1. plugin の責務を `dialog` / `command` / `listener` のどれに寄せるか決める
2. `plugins/${PluginName}Plugin.tsx` を追加する
3. dialog 型なら open/close state と submit flow を実装する
4. command 型なら command 定義、register、editor update を実装する
5. listener 型なら `mergeRegister` を使い、必要なら node transform へ寄せる
6. `plugins/index.ts` に export を追加する
7. `LexicalEditor` または呼び出し元へ plugin を統合する
8. 関連 node / dialog / toolbar と接続する

## ガードレール

- `updateListener` 内で `editor.update()` を呼ばない
- `$` 系 API は read/update クロージャの中だけで使う
- editor を Composer 外へ渡す必要がある場合は独自 `useEffect` で ref 同期せず `EditorRefPlugin` を使う
- HTML を node に変換して流し込む場合は `root.select()` の後に `$insertNodes()` する
- listener 登録解除を漏らさない
- plugin 単体で完結せず、呼び出し側統合を忘れない

## Done

- plugin 本体と必要な command / dialog hook を追加した
- `plugins/index.ts` と editor 統合を更新した
- listener の cleanup を保証した
- 関連テストまたは既存テスト影響を確認した
- `bun run validate` を実行した
