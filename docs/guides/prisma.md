# Prisma ガイド

> このページは **リダイレクトのみ**。正本は以下を参照してください。

## 正本

| 対象                                                                           | 正本                                                                                                                          |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Prisma 7.x 実装パターン / WASM runtime / `$extends` / enum 運用                | [`.claude/rules/prisma-patterns.md`](../../.claude/rules/prisma-patterns.md)                                                  |
| `enums/prisma-types` re-export gateway                                         | [ADR 0002](../architecture/decisions/0002-prisma-type-only-gateway.md)                                                        |
| CLI フラグ（7.7 で `migrate diff --to-schema` / `--shadow-database-url` 削除） | [`CLAUDE.md` §Git / Migration](../../CLAUDE.md#git--migration) + [`.claude/rules/gotchas.md`](../../.claude/rules/gotchas.md) |
| マイグレーション運用（`prisma-migration` skill）                               | [`.claude/skills/prisma-migration/SKILL.md`](../../.claude/skills/prisma-migration/SKILL.md)                                  |
| Cloud Run / Cloud Build での WASM 起動                                         | [`.claude/rules/ops/deployment-patterns.md`](../../.claude/rules/ops/deployment-patterns.md)                                  |
| Prisma enum 追加の 8 箇所更新                                                  | [`.claude/skills/add-prisma-enum/SKILL.md`](../../.claude/skills/add-prisma-enum/SKILL.md)                                    |

## 補足

- 使用バージョンの SSoT は `package.json` + `bun.lock`
- 旧本文（2026-01-19 更新、Prisma 7.2.0 前提）は drift のため撤去。`git log` で過去版を参照できます
