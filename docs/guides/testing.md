# テストガイド

> このページは **リダイレクトのみ**。正本は以下を参照してください。

## 正本

| 対象                                       | 正本                                                                                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 実行コマンド（日常運用）                   | [`CLAUDE.md` §コマンド](../../CLAUDE.md#コマンド)                                                                                                            |
| テスト実行ポリシー（何をいつ走らせるか）   | [`CLAUDE.md` §検証](../../CLAUDE.md#検証)                                                                                                                    |
| テスト記述規約（mock / 型安全 / DO/DON'T） | [`.claude/rules/test-quality.md`](../../.claude/rules/test-quality.md)                                                                                       |
| Bun Test 固有パターン                      | [`.claude/rules/bun-patterns.md`](../../.claude/rules/bun-patterns.md)                                                                                       |
| per-directory batch の決定                 | [ADR 0010](../architecture/decisions/0010-per-directory-test-batch.md)                                                                                       |
| script 整理とテスト実行ポリシー            | [ADR 0014](../architecture/decisions/0014-test-script-consolidation.md)                                                                                      |
| E2E / Playwright 認証                      | [ADR 0003](../architecture/decisions/0003-playwright-storage-state-auth.md) + [`.claude/agents/e2e-test-writer.md`](../../.claude/agents/e2e-test-writer.md) |

## 補足

- 正本優先原則により、旧 1623 行の内容はすべて撤去しました。`git log` で過去版を参照できます
- 外部 AI tool からの参照は `AGENTS.md` を起点にしてください
