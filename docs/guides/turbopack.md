# Turbopack ガイド

> このページは **リダイレクトのみ**。正本は以下を参照してください。

## 正本

| 対象                                                                                                    | 正本                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Next.js 16 Turbopack の設定・注意点                                                                     | [`CLAUDE.md` §技術スタック](../../CLAUDE.md#技術スタック非自明な注意点のみ)                                                                        |
| Turbopack HMR / Fast Refresh の既知問題（`module factory is not available` / server cache 古 stale 等） | [`.claude/rules/gotchas.md`](../../.claude/rules/gotchas.md) §Turbopack                                                                            |
| HMR 復旧の緊急対処                                                                                      | [`.claude/skills/turbopack-hmr/SKILL.md`](../../.claude/skills/turbopack-hmr/SKILL.md)                                                             |
| Turbopack-native bundle analyzer                                                                        | [ADR 0004](../architecture/decisions/0004-turbopack-native-bundle-analyzer.md)                                                                     |
| `"use server"` ファイルの export 契約（Turbopack bundler の silent bug 対策）                           | [`.claude/rules/server-actions.md`](../../.claude/rules/server-actions.md) + [`CLAUDE.md` §アーキテクチャ境界](../../CLAUDE.md#アーキテクチャ境界) |

## 補足

- `bun run dev` は Turbopack 前提。Webpack build は運用していません
- 旧本文は drift のため撤去。`git log` で過去版を参照できます
