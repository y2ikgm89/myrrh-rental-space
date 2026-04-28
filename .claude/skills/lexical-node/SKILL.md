---
name: lexical-node
description: 管理画面の Lexical に新しいノード型を追加するときに使う。NodeState API、JSON/DOM 往復、editor 登録までを一連で揃える。既存 node の監査や deprecated API 除去が主目的なら audit-lexical を使う。
paths:
  - src/**/lexical/nodes/**
---

# lexical-node

## lexical skill 使い分け

| 主目的                                              | 使う skill        |
| --------------------------------------------------- | ----------------- |
| 新しい node 型を追加（TextNode / DecoratorNode 等） | `lexical-node`    |
| 新しい plugin を追加（dialog / command / listener） | `lexical-plugin`  |
| 新しい toolbar 操作を追加（button / command 接続）  | `lexical-toolbar` |
| 既存実装を監査 / deprecated API / モダナイズ        | `audit-lexical`   |

`src/app/(admin)/**/lexical/**` に新しい Lexical node を追加するときに使う。
単なる toolbar 追加や command 追加だけなら別 skill を使う。

## 入力

- `NodeName`
- `decorator` か `element`
- 保存したい props
- HTML / DOM への変換要件

## 先に読む

1. `.claude/rules/frontend/lexical/nodes.md`（NodeState API・新規ノード登録チェックリスト）
2. `.claude/rules/type-safety.md`
3. `.claude/rules/react-patterns.md`
4. 既存実装:
   - `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/ImageNode.tsx`
   - `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/YouTubeNode.tsx`
5. 長いコードひな形が必要なら `reference/scaffold-lexical-node.md`（任意）

## ワークフロー

1. 既存 node のうち一番近い実装を選ぶ
2. file top-level に `createState()` を定義し、`parse` でデフォルトと入力検証を決める
3. `nodes/${NodeName}Node.tsx` に `$config()` と `stateConfigs` を実装する
4. 必要なら `importDOM` / `exportDOM` と `createDOM` / `updateDOM` を実装する
5. factory 関数と type guard を追加する
6. `nodes/index.ts` に export を追加する
7. 必要なら `theme.ts` と node label / registry を更新する
8. `LexicalEditor` 側の node registration と preview / renderer / inspector を追随させる

## ガードレール

- props は JSON serializable に限定する
- `Serialized*` interface、`static getType()`、`static clone()`、手書き `importJSON()` / `exportJSON()` に戻らない
- `__property`、getter / setter ラッパー、`getWritable()` / `getLatest()` ベースの旧パターンを増やさない
- DecoratorNode で `nodeKey` を子へ渡す場合は `this.getKey()` を使う
- 型アサーションに逃げない
- 公開側で表示する node は DOM / JSON の往復を欠かさない
- editor 登録だけして inspector や preview を置き忘れない

## Done

- node 本体、factory、type guard を追加した
- `nodes/index.ts` と editor registration を更新した
- 必要な DOM / JSON 往復を実装した
- preview / renderer / inspector の追随漏れがない
- 関連テストまたは既存テスト影響を確認した
- `bun run validate` を実行した
