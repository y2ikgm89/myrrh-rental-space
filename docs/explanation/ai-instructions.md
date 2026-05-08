# AI Agent Instructions

最終更新: 2026-05-08

このリポジトリは Codex / Claude Code の 2 つの AI エージェントを併用する。両者の正本は完全に分離し、一方を他方にミラーしない。後方互換のための同期スクリプトや mirror 用 CI job は持たない。

## Codex の正本

OpenAI Codex 公式の配置に合わせる。

| 用途                     | 正本                             | 備考                                                              |
| ------------------------ | -------------------------------- | ----------------------------------------------------------------- |
| 常時読むプロジェクト指示 | `AGENTS.md`                      | Codex が作業前に読み込む入口。短く、全体制約に絞る                |
| 繰り返しワークフロー     | `.agents/skills/<name>/SKILL.md` | `name` / `description` frontmatter のみ。description に境界を書く |
| 専門 subagent            | `.codex/agents/*.toml`           | 明示依頼時だけ使う狭い専門ロール。1 TOML 1 agent                  |
| コマンド承認ルール       | `.codex/rules/default.rules`     | sandbox 外コマンド承認の `prefix_rule`。coding rules ではない     |
| Codex app                | `.codex/config.toml`             | app / CLI で共有する subagent 上限のみ                            |
| lifecycle hooks          | `.codex/hooks.json`              | Windows では公式上無効。未採用で維持                              |

### 読み込み順

1. ユーザーの直接指示
2. Codex home の `AGENTS.override.md` または `AGENTS.md`
3. プロジェクトルートから作業ディレクトリまでの各階層にある `AGENTS.override.md` または `AGENTS.md`
4. 必要時に Codex が選ぶ `.agents/skills/<name>/SKILL.md`
5. 明示依頼された場合のみ `.codex/agents/*.toml`

同じ階層では `AGENTS.override.md` が `AGENTS.md` より優先される。このリポジトリではルート `AGENTS.md` を恒久的な正本にし、下位 override は必要になるまで追加しない。

### Repository Skills と Custom Agents

Skill 名・用途・Sandbox 別 subagent は [AGENTS.md](../../AGENTS.md) を正本とし、この文書では二重管理しない。

Codex は subagent を明示依頼なしに spawn しない。ユーザーが「subagent を使って」「並列で調査して」などと指示したときだけ `.codex/agents/*.toml` を使う。

## Claude Code の正本

Claude Code 公式の配置 (`code.claude.com/docs/en/{memory,sub-agents,skills,settings,hooks}`) に合わせる。

| 用途              | 正本                                                      | 備考                                                                    |
| ----------------- | --------------------------------------------------------- | ----------------------------------------------------------------------- |
| 常時読むメモリ    | `CLAUDE.md`                                               | プロジェクトレベルのプロンプトキャッシュ層                              |
| 個人メモリ        | `~/.claude/projects/<slug>/memory/MEMORY.md`              | セッション跨ぎの記憶（plain markdown）                                  |
| Path-scoped rules | `.claude/rules/**/*.md`                                   | `paths:` frontmatter 必須。常時ロード rule は禁止                       |
| Subagents         | `.claude/agents/<name>.md`                                | `name` / `description` frontmatter 必須                                 |
| Skills            | `.claude/skills/<name>/SKILL.md`                          | description recommended。500 行未満、reference は `reference/*.md` 分割 |
| Hooks             | `.claude/settings.json` の `hooks` + `.claude/hooks/*.sh` | 公式 event のみ                                                         |

### 撤回済み独自パターン（再導入禁止）

| パターン                                               | 撤回理由                             | 公式代替                                           |
| ------------------------------------------------------ | ------------------------------------ | -------------------------------------------------- |
| barrel index rule（`react-patterns.md` 等の TOC のみ） | `paths:` なし常時注入で context 浪費 | sub-file が path-scoped で個別 auto-load           |
| process barrel（`process/*.md` 4 ファイル常時ロード）  | 公式は「常時ロードは最小限」         | path-scoped rule + skill 統合                      |
| gotchas/ メタ分類（落とし穴の独立カテゴリ）            | ドメイン rule と重複・直交分類       | ドメイン rule 末尾の `## Gotchas` セクションに統合 |
| ADR system（`docs/architecture/decisions/`）           | 公式機能ではない                     | path-scoped rule 本文 + plan + git log で代替      |

## 共通ドキュメント

両 AI から参照する非エージェント専用ドキュメントは `docs/` に集約する。AI 専用ディレクトリ名（`claude-rules` のような別名）は使わない。

| パス                | 内容                             |
| ------------------- | -------------------------------- |
| `docs/explanation/` | 設計の「なぜ」                   |
| `docs/how-to/`      | 手順                             |
| `docs/reference/`   | API・ランタイムの事実記述        |
| `docs/superpowers/` | plan / spec ドラフト・アーカイブ |
| `docs/templates/`   | doc / plan の雛形                |

## 相互参照禁止のルール

- Codex 用ドキュメントから `.claude/*` を正本として案内しない
- Claude Code 用 rule から `.agents/skills/*` / `.codex/*` を正本として案内しない
- `.claude/rules` と Codex 資産を同期しない
- Codex 用 skill を `.claude/skills` へ置かない
- Codex 用 agent を `.claude/agents` へ置かない
- どちらの AI からも参照する内容は `docs/reference/` または `docs/explanation/` に置く

## メンテナンス基準

- 恒久的なプロジェクト制約は `AGENTS.md` / `CLAUDE.md` に置く（短く、全体制約に絞る）
- 手順化された反復作業は `.agents/skills/` または `.claude/skills/` に置く
- subagent は「探索」「レビュー」「検証」「一次情報調査」のように狭く分け、`name` / `description` を必ず定義する
- command allow / prompt / forbidden は `.codex/rules/` に置き、`match` / `not_match` で意図を残す
- hooks を有効化する前に、各 AI の現行公式ドキュメントで Windows support と対象 event の対応状況を確認する
- アーキテクチャや運用の方針変更は本ファイル（`docs/explanation/ai-instructions.md`）に記録する

## 参照した公式ドキュメント

### Codex

- [Codex app](https://developers.openai.com/codex/app)
- [Agent Skills](https://developers.openai.com/codex/skills)
- [Subagents](https://developers.openai.com/codex/subagents)
- [Rules](https://developers.openai.com/codex/rules)
- [Hooks](https://developers.openai.com/codex/hooks)
- [Custom instructions with AGENTS.md](https://developers.openai.com/codex/guides/agents-md)

### Claude Code

- [Memory](https://code.claude.com/docs/en/memory)
- [Sub-agents](https://code.claude.com/docs/en/sub-agents)
- [Skills](https://code.claude.com/docs/en/skills)
- [Settings](https://code.claude.com/docs/en/settings)
- [Hooks](https://code.claude.com/docs/en/hooks)

## Local Tooling Notes

- Windows ではユーザー領域の `C:\Users\y2ikg\.local\bin\rg.exe` を `rg` の正本として扱う
- Codex Desktop 同梱の `WindowsApps\OpenAI.Codex_...\app\resources\rg.exe` は外部 PowerShell から直接起動できない場合がある。WindowsApps の所有権 / ACL は変更せず、通常版 ripgrep を PATH で優先する
- `.codex/rules/*.rules` は sandbox 外コマンド承認だけに使う（local tooling 情報を書かない）
