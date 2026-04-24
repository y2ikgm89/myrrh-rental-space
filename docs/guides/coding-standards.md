# コーディング規約

> Codex では `CLAUDE.md` / `.claude/*` を追跡しない。`.claude` 参照は Claude Code 用 legacy reference として残すだけ。

## Codex 正本

| 対象                                             | Codex で読む場所                                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| 命名規則 / 型安全 / 型アサーション禁止           | [`AGENTS.md`](../../AGENTS.md)                                                                          |
| React 19 / Compiler 1.0 / eslint-react v4        | [`AGENTS.md`](../../AGENTS.md)                                                                          |
| Server Actions / `'use cache'` / `updateTag`     | [`AGENTS.md`](../../AGENTS.md) + [`admin-clean-break`](../../.agents/skills/admin-clean-break/SKILL.md) |
| Tailwind v4 / セマンティックトークン / `cn()`    | [`AGENTS.md`](../../AGENTS.md)                                                                          |
| エラーハンドリング                               | [`AGENTS.md`](../../AGENTS.md) と該当 domain / action の既存実装                                        |
| アクセシビリティ（WCAG 2.2 AA + 2.5.5 Enhanced） | [`AGENTS.md`](../../AGENTS.md) と公開 / 管理 UI の既存コンポーネント                                    |
| プロジェクト固有 gotchas                         | [`docs/architecture/`](../architecture/) と近接コード                                                   |

## Claude Code Legacy

`.claude/rules/**/*.md` は Claude Code 用に残置する。Codex 作業では参照しない。
