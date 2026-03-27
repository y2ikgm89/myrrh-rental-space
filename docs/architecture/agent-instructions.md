# AI エージェント向け指示の配置（正本）

このリポジトリは [AGENTS.md 形式](https://agents.md/) をルート `AGENTS.md` で採用し、Codex・Claude Code が同じリポジトリを共有する。

**Claude Code を使う場合、`.claude/` は第一級のプロジェクト資産**である（ルール自動ロード、サブエージェント、hooks、設定）。

## 優先順位（全ツール共通）

1. ユーザーの直接指示
2. 最も近い `AGENTS.override.md`
3. ルート `AGENTS.md`
4. `docs/reference/codex-rules/*.md`（詳細ルール）
5. `.agents/skills/<name>/SKILL.md`（繰り返しワークフロー）

## ツール別の読み込み

| 領域             | Codex                                | Claude Code                                                      |
| ---------------- | ------------------------------------ | ---------------------------------------------------------------- |
| ルート方針       | `AGENTS.md`                          | **`CLAUDE.md`** + `AGENTS.md`（不変条件）                        |
| 詳細ルール       | `docs/reference/codex-rules/`        | **`.claude/rules/**/\*.md`**（`paths:` 付き自動ロード）          |
| 自動ガード       | エージェント設定に依存               | **`.claude/hooks/*.sh`** + **`.claude/settings.json`**           |
| スキル           | **`.agents/skills/`**（正本）        | **`.claude/skills/`**（スタブ → `.agents/skills/` の正本を参照） |
| サブエージェント | 増やさない（skill / ルールへ寄せる） | **`.claude/agents/*.md`**                                        |

## スキル配置

- **Codex**: `.agents/skills/<name>/SKILL.md` に本文・`reference/`・`scripts/`・`data/` を置く
- **Claude Code**: `.claude/skills/<name>/SKILL.md` はスタブ（正本へのポインタ）。Skill ツールで自動検出される
- 索引: `.agents/skills/README.md`

> **将来の統合**: Claude Code 公式は `.claude/skills/` に正本を推奨。Codex 互換が不要になった時点で `.agents/skills/` → `.claude/skills/` に一本化する。

## 二重管理が必要なトピック

`docs/reference/codex-rules/` と `.claude/rules/` の両方に同トピックがある場合、**方針・公式リンク・「未依存」「削除済み」の事実を一致**させる。

対象: Lexical シェル、インラインエディタ、`bun-patterns` 相当の記述

## サブエージェント（`.claude/agents/`）

Claude Code 専用。YAML フロントマターで `name` / `description` / `model` / `disallowedTools` を定義。`description` に発火条件と出力形式を記載。

## メンテナンス時のチェック

- 恒久ルールを skill に書き捨てていないか（ルールは `codex-rules` / `.claude/rules`、手順だけ skill）
- Codex 向け文書が `.claude/*` を正本参照していないか
- hooks / `settings.json` 変更後は Claude Code で動作確認
