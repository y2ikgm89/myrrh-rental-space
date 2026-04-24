# Prisma ガイド

> Codex では `CLAUDE.md` / `.claude/*` を追跡しない。Prisma 変更は Codex skill を入口にする。

## Codex 正本

| 対象                                                            | Codex で読む場所                                                                 |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Prisma 7.x 実装パターン / WASM runtime / `$extends` / enum 運用 | [`prisma-data-change`](../../.agents/skills/prisma-data-change/SKILL.md)         |
| `enums/prisma-types` re-export gateway                          | [ADR 0002](../architecture/decisions/0002-prisma-type-only-gateway.md)           |
| CLI フラグ / migration / seed / generated client                | [`prisma-data-change`](../../.agents/skills/prisma-data-change/SKILL.md)         |
| Auth adapter と Better Auth 境界                                | [`auth-rbac-change`](../../.agents/skills/auth-rbac-change/SKILL.md)             |
| Cloud Run / Cloud Build での WASM 起動                          | [`docs/operations/`](../operations/) と [`docs/architecture/`](../architecture/) |
| Prisma enum 追加                                                | [`prisma-data-change`](../../.agents/skills/prisma-data-change/SKILL.md)         |

## Claude Code Legacy

`.claude/rules/prisma-patterns.md` や `.claude/skills/prisma-migration` は Claude Code 用に残置する。Codex 作業では参照しない。

## 補足

- 使用バージョンの SSoT は `package.json` + `bun.lock`
