# コーディング規約

> このページは **リダイレクトのみ**。正本は以下を参照してください。

## 正本

| 対象                                             | 正本                                                                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| 命名規則 / 型安全 / 型アサーション禁止           | [`AGENTS.md`](../../AGENTS.md) + [`.claude/rules/type-safety.md`](../../.claude/rules/type-safety.md) |
| React 19 / Compiler 1.0 / eslint-react v4        | [`.claude/rules/react-patterns.md`](../../.claude/rules/react-patterns.md)                            |
| Server Actions / `'use cache'` / `updateTag`     | [`.claude/rules/server-actions.md`](../../.claude/rules/server-actions.md)                            |
| Tailwind v4 / セマンティックトークン / `cn()`    | [`.claude/rules/tailwind-patterns.md`](../../.claude/rules/tailwind-patterns.md)                      |
| エラーハンドリング                               | [`.claude/rules/error-handling.md`](../../.claude/rules/error-handling.md)                            |
| アクセシビリティ（WCAG 2.2 AA + 2.5.5 Enhanced） | [`.claude/rules/frontend/accessibility.md`](../../.claude/rules/frontend/accessibility.md)            |
| プロジェクト固有 gotchas                         | [`.claude/rules/gotchas.md`](../../.claude/rules/gotchas.md)                                          |
| ハードルール一覧                                 | [`CLAUDE.md` §ハードルール](../../CLAUDE.md#ハードルールプロジェクト固有)                             |

## 補足

- `.claude/rules/**/*.md` は `paths:` フロントマターで条件付き自動ロードされます
- 旧本文は drift のため撤去。`git log` で過去版を参照できます
