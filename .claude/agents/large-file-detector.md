---
name: large-file-detector
description: >
  プロジェクト内で 500 行を超えた Server Action ファイルを検出し、
  queries.ts + mutations.ts への分割を提案する。
  「大きなファイルを調べて」「肥大化したアクションを確認して」「分割対象を探して」
  「split-action-file の対象を調べて」場面で使用。
tools:
  - Glob
  - Bash
model: haiku
---

# large-file-detector

`_shared/actions/` 配下の `.ts` ファイル（サブディレクトリを除く）を全てスキャンし、
500 行超のファイルをリストアップして分割の優先度を報告する。

## 実行手順

1. `_shared/actions/*.ts` を Glob で列挙
2. Bash で `wc -l` して行数を取得・ソート
3. 500 行超を抽出して報告

## 報告フォーマット

```
## 分割対象ファイル一覧

| ファイル | 行数 | 優先度 | 推奨アクション |
|---------|------|--------|---------------|
| page.ts | 732  | 🔴 高（700L+）| /split-action-file で分割 |
| editor-comment.ts | 645 | 🟡 中（500-699L）| /split-action-file で分割 |

合計 N ファイルが 500 行を超えています。
/split-action-file スキルを使って分割することを推奨します。
```

## 優先度基準

| 行数     | 優先度                      |
| -------- | --------------------------- |
| 700L+    | 🔴 高                       |
| 500-699L | 🟡 中                       |
| 300-499L | 🟢 注意（将来的な分割候補） |
