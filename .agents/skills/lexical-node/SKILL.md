---
name: lexical-node
description: 管理画面の Lexical に新しいノード型を追加するときに使う。既存 node 構成、JSON/DOM 往復、editor 登録までを一連で揃える。
---

# lexical-node

`src/app/(admin)/**/lexical/**` に新しい Lexical node を追加するときに使う。
単なる toolbar 追加や command 追加だけなら別 skill を使う。

## 入力

- `NodeName`
- `decorator` か `element`
- 保存したい props
- HTML / DOM への変換要件

## 先に読む

1. `docs/reference/codex-rules/lexical-patterns.md`
2. `docs/reference/codex-rules/type-safety.md`
3. `docs/reference/codex-rules/react-patterns.md`
4. 既存実装:
   - `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/ImageNode.tsx`
   - `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/YouTubeNode.tsx`

## ワークフロー

1. 既存 node のうち一番近い実装を選ぶ
2. `nodes/${NodeName}Node.tsx` を追加する
3. `Serialized*` 型、`importJSON` / `exportJSON`、必要なら `importDOM` / `exportDOM` を実装する
4. factory 関数と type guard を追加する
5. `nodes/index.ts` に export を追加する
6. 必要なら `theme.ts` と node label / registry を更新する
7. `LexicalEditor` 側の node registration を更新する
8. 必要なら preview / renderer 側も追随させる

## ガードレール

- props は JSON serializable に限定する
- private field は `__` prefix を使う
- 型アサーションに逃げない
- 公開側で表示する node は DOM / JSON の往復を欠かさない
- editor 登録だけして inspector や preview を置き忘れない

## Done

- node 本体、factory、type guard を追加した
- `nodes/index.ts` と editor registration を更新した
- 必要な DOM / JSON 往復を実装した
- 関連テストまたは既存テスト影響を確認した
- `bun run validate` を実行した
