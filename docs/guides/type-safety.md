# 型安全ガイド

> このページは **リダイレクトのみ**。正本は以下を参照してください。

## 正本

| 対象                                                      | 正本                                                                                                                                                  |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript / 型アサーション / `satisfies` / 型ガード      | [`.claude/rules/type-safety.md`](../../.claude/rules/type-safety.md)                                                                                  |
| Zod スキーマ（`.refine()` / cross-field / `error:` 必須） | [`.claude/rules/zod-patterns.md`](../../.claude/rules/zod-patterns.md)                                                                                |
| Prisma ゲートウェイ（`enums/prisma-types`）               | [`.claude/rules/prisma-patterns.md`](../../.claude/rules/prisma-patterns.md) + [ADR 0002](../architecture/decisions/0002-prisma-type-only-gateway.md) |
| `noUncheckedIndexedAccess` + bun test 型注意点            | [`.claude/rules/test-quality.md`](../../.claude/rules/test-quality.md)                                                                                |
| React 19 / eslint-react v4                                | [`.claude/rules/react-patterns.md`](../../.claude/rules/react-patterns.md)                                                                            |

## 補足

- プロジェクトの型アサーション禁止・`enum` 禁止（TypeScript 6.0 `erasableSyntaxOnly`）・`verbatimModuleSyntax` 等の原則は `CLAUDE.md` §ハードルール §型・コード品質 を参照
- 旧本文は drift 化していたため撤去。`git log` で過去版を参照できます
