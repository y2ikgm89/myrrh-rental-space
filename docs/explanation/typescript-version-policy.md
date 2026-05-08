# TypeScript バージョン方針

## 正本

- 解決済みバージョン: [AGENTS.md](../../AGENTS.md#tech-stack) と [`bun.lock`](../../bun.lock)。
- `tsconfig` の `erasableSyntaxOnly` / `verbatimModuleSyntax` など TS 6 前提の設定は現行の major に追従する。

## メジャー・アップデート時

1. [TypeScript Release Notes](https://devblogs.microsoft.com/typescript/) と [Next.js の TypeScript 範囲](https://nextjs.org/docs/app/building-your-application/configuring/typescript) を確認する。
2. `bun add -d typescript@...` で更新する。
3. `bun run validate && bun run test:all && bun run build` を通す。

## セマバー範囲内の更新

`bun update` でよい。作業後は `bun run validate` を必ず通す。Codex の入口は `AGENTS.md` と `.agents/skills/project-validation`。Claude Code の依存更新フローは `.claude/skills/upgrade-deps` を参照する（Codex と混同しないこと）。
