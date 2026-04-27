---
name: lexical-audit
description: 管理画面の Lexical 実装を監査またはモダナイズするときに使う。deprecated API、private API、listener waterfall、NodeState 逸脱、HTML import、table API を点検し、現行の公式推奨へ寄せる。新しい node/plugin/toolbar を追加する作業には使わない。
paths:
  - src/**/lexical/**
---

# lexical-audit

## lexical skill 使い分け

| 主目的                                              | 使う skill        |
| --------------------------------------------------- | ----------------- |
| 新しい node 型を追加（TextNode / DecoratorNode 等） | `lexical-node`    |
| 新しい plugin を追加（dialog / command / listener） | `lexical-plugin`  |
| 新しい toolbar 操作を追加（button / command 接続）  | `lexical-toolbar` |
| 既存実装を監査 / deprecated API / モダナイズ        | `lexical-audit`   |

`src/app/(admin)/**/lexical/**` の既存実装を見直すときに使う。
新機能追加が主目的なら `lexical-node`、`lexical-plugin`、`lexical-toolbar` を使う。

## 入力

- 対象 path または feature
- 監査したい観点
- 破壊的変更を許容するか

## 先に読む

1. `docs/reference/codex-rules/lexical-patterns.md`（**「LexicalEditor（メイン）のレイアウト・DraggableBlock・プレースホルダー」** 節、および **「HTML → Lexical JSON」** 節 — シェル・フォーク・`tryConvertHtmlStringToLexicalJsonString` 等の正本）
2. `.claude/rules/react-patterns.md`
3. `.claude/rules/type-safety.md`
4. 必要なら `package.json` の Lexical バージョン

## ワークフロー

1. 対象範囲とインストール済み Lexical バージョンを確認する
2. ローカル規約を読み、ユーザーが公式準拠を求めている場合は現行の公式資料と突き合わせる
3. 高シグナルなアンチパターンを検索する

```text
static getType
static clone
static importJSON
exportJSON(
__key
__property
getWritable(
getLatest(
registerUpdateListener(
editor.update(
__EXPERIMENTAL
EditorRefPlugin
root.select(
```

4. 誤検知を除き、deprecated / private / duplicate pattern をまとめて置換する
5. 互換レイヤーを足さず、現行の canonical pattern に寄せる
6. **`@lexical/react` を上げた場合**: `node_modules/.../LexicalDraggableBlockPlugin` と `plugins/lexical-draggable-block-plugin.ts` を差分比較し、upstream のバグ修正・座標ロジックをフォークへマージする（直接パッケージ import に戻さない）
7. ローカルの `codex-rules`（および条件付きで `.claude/rules/frontend/lexical-patterns.md`）や関連 skill が古ければ **同じ変更で同期**する
8. `bun run validate` を実行する
9. 変更が広い場合は `bun run build` まで確認する

## ガードレール

- 旧実装と新実装を併存させない
- `updateListener` は読み取り専用に保ち、変更は command / transform / 明示的な `editor.update()` へ寄せる
- `DecoratorNode` の React props へ private field を直接渡さない
- deprecated API を別名で包んで延命しない
- **メインエディタの DraggableBlock** は `@lexical/react` のみに置き換えず、`editor-layout-constants` とフォークを前提に監査する
- ルール更新が必要な場合は `AGENTS.md` ではなく `docs/reference/codex-rules/`（＋ Codex と二重管理のトピックは `.claude/rules` も同期）か skill 側に寄せる

## Done

- deprecated / private API を除去したか、残す理由を明文化した
- 互換ハックを足していない
- 関連する `codex-rules` / skill の古い記述を更新した
- `bun run validate` を実行した
- 影響が広い場合は `bun run build` を実行した
