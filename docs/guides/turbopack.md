# Turbopack ガイド

> Codex では `CLAUDE.md` / `.claude/*` を追跡しない。Turbopack 変更は Codex 正本と ADR を入口にする。

## Codex 正本

| 対象                                    | Codex で読む場所                                                                    |
| --------------------------------------- | ----------------------------------------------------------------------------------- |
| Next.js 16 Turbopack の設定・注意点     | [`AGENTS.md`](../../AGENTS.md), [`next.config.ts`](../../next.config.ts), 近接 docs |
| Turbopack HMR / Fast Refresh の既知問題 | 近接ログ、`next.config.ts`、既存 issue / ADR                                        |
| HMR 復旧の緊急対処                      | dev server 再起動と `.next` 生成物の確認。削除は明示 target を確認して実施          |
| Turbopack-native bundle analyzer        | [ADR 0004](../architecture/decisions/0004-turbopack-native-bundle-analyzer.md)      |
| `"use server"` ファイルの export 契約   | [`AGENTS.md`](../../AGENTS.md) と Server Action の近接実装                          |

## Claude Code Legacy

`.claude/rules/gotchas.md`、`.claude/rules/server-actions.md`、`.claude/skills/turbopack-hmr` は Claude Code 用に残置する。Codex 作業では参照しない。

## 補足

- `bun run dev` は Turbopack 前提。Webpack build は運用していません。
