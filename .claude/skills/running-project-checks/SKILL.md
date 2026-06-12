---
name: running-project-checks
description: Runs this project's validation gates (type-check, lint, build, tests) with the correct Bun commands and known Windows gotchas, and interprets failures. Use before reporting work complete or committing in this repo.
---

# プロジェクトの検証を実行する

完了報告・コミット前のゲート。コマンドは `package.json` の scripts が SSoT（`tsc` / `eslint` を直接叩かない）。

## 標準ゲート

1. `bun run validate` — type-check ＋ lint。まずこれを通す。
2. `bun run build` — コミット前は validate と併せて本番ビルドも通す。
3. 変更箇所に応じて: `bun run test:unit` / `bun run test:integration` / `bun run e2e`。

## 既知の落とし穴

- type-check が `.next/dev/types/routes.d.ts` の破損で失敗することがある（dev server 停止後など）。`next typegen` は dev types を再生成しないため、`.next/dev/types` を削除してから `bun run type-check` を再実行する。
- パッケージ実行は Bun のみ（`npm` / `yarn` / `pnpm` 不可）。
- Windows + PowerShell。コマンドは PowerShell 構文で書く。

## 結果の扱い

- 失敗はエラー出力の全文を根拠に報告する。「緑」「直った」は実コマンド出力でのみ主張する。
- lint の auto-fix は `bun run format` / ESLint `--fix`（コミット時は lefthook が staged に適用）。
