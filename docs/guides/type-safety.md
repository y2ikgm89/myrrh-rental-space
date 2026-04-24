# 型安全ガイド

> Codex では `CLAUDE.md` / `.claude/*` を追跡しない。型安全の正本は `AGENTS.md` と該当 Codex skill。

## Codex 正本

| 対象                                                      | Codex で読む場所                                                                                                                                  |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript / 型アサーション / `satisfies` / 型ガード      | [`AGENTS.md`](../../AGENTS.md)                                                                                                                    |
| Zod スキーマ（`.refine()` / cross-field / `error:` 必須） | [`AGENTS.md`](../../AGENTS.md) と変更対象の skill                                                                                                 |
| Prisma ゲートウェイ（`enums/prisma-types`）               | [ADR 0002](../architecture/decisions/0002-prisma-type-only-gateway.md) + [`prisma-data-change`](../../.agents/skills/prisma-data-change/SKILL.md) |
| `noUncheckedIndexedAccess` + bun test 型注意点            | [`project-validation`](../../.agents/skills/project-validation/SKILL.md) と近接テスト                                                             |
| React 19 / eslint-react v4                                | [`AGENTS.md`](../../AGENTS.md)                                                                                                                    |

## Claude Code Legacy

`.claude/rules/type-safety.md` や `.claude/rules/zod-patterns.md` は Claude Code 用に残置する。Codex 作業では参照しない。
