# テストガイド

> Codex では `CLAUDE.md` / `.claude/*` を追跡しない。検証判断は Codex skill を入口にする。

## Codex 正本

| 対象                                       | Codex で読む場所                                                            |
| ------------------------------------------ | --------------------------------------------------------------------------- |
| 実行コマンド（日常運用）                   | [`AGENTS.md`](../../AGENTS.md)                                              |
| テスト実行ポリシー（何をいつ走らせるか）   | [`project-validation`](../../.agents/skills/project-validation/SKILL.md)    |
| テスト記述規約（mock / 型安全 / DO/DON'T） | 近接テストと既存 helper                                                     |
| Bun Test 固有パターン                      | 近接テストと `package.json` scripts                                         |
| per-directory batch の決定                 | [ADR 0010](../architecture/decisions/0010-per-directory-test-batch.md)      |
| script 整理とテスト実行ポリシー            | [ADR 0014](../architecture/decisions/0014-test-script-consolidation.md)     |
| E2E / Playwright 認証                      | [ADR 0003](../architecture/decisions/0003-playwright-storage-state-auth.md) |

## Claude Code Legacy

`.claude/rules/test-quality.md`、`.claude/rules/bun-patterns.md`、`.claude/agents/e2e-test-writer.md` は Claude Code 用に残置する。Codex 作業では参照しない。
