# nuqs ガイド

> このページは **リダイレクトのみ**。正本は以下を参照してください。

## 正本

| 対象                                                                         | 正本                                                                                                 |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| nuqs 2.x 実装パターン / パーサーマップ / `shallow: false` / `useQueryStates` | [`.claude/rules/nuqs-patterns.md`](../../.claude/rules/nuqs-patterns.md)                             |
| パーサー SSoT（`@/shared/lib/nuqs`）                                         | プロジェクト内 `src/shared/lib/nuqs/*`                                                               |
| URL 由来初期値の remount（`key={urlValue}`）                                 | [`.claude/rules/react-patterns.md`](../../.claude/rules/react-patterns.md) §Resetting state with key |
| フィルター UI 閾値（pill / scroll / dropdown）                               | [`CLAUDE.md` §実装パターン](../../CLAUDE.md#実装パターン)                                            |

## 補足

- 使用バージョンの SSoT は `package.json` + `bun.lock`
- 旧本文（2026-01-07 更新）は drift のため撤去。`git log` で過去版を参照できます
