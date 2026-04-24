# TypeScript バージョン方針

## 現状

- `package.json` は **`typescript@^6.0.1-rc`**（npm `latest` は 5.9 系のため、6.0 安定版リリースまで **RC を正**とする）。
- `erasableSyntaxOnly` / `verbatimModuleSyntax` / TS 6 前提の `tsconfig` 設定を維持する。

## 安定版 6.0 へ移行するとき

1. [TypeScript Release Notes](https://devblogs.microsoft.com/typescript/) と [Next.js サポート範囲](https://nextjs.org/docs/app/building-your-application/configuring/typescript) を確認。
2. `bun add -d typescript@latest`（6.0 が `latest` になった後）で更新。
3. `bun run validate && bun run test:all && bun run build` を通す。

## 依存更新

セマンバー範囲内の更新は `bun update`。Codex では `AGENTS.md`、`project-validation`、変更対象の skill を入口にする。

`.claude/skills/upgrade-deps` は Claude Code 用 legacy reference として残置する。Codex 作業では参照しない。
