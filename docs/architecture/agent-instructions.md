# AI エージェント向け指示の配置（正本）

このリポジトリは [AGENTS.md 形式](https://agents.md/) をルート `AGENTS.md` で採用し、Codex・Cursor・Claude Code が同じリポジトリを共有する。

**Claude Code を使う場合、`.claude/` は第一級のプロジェクト資産**である（ルール自動ロード、サブエージェント、hooks、設定）。Codex 向けに「どのパスをコード正本にするか」を分けているだけで、`.claude` がオプションという意味ではない。

**二重スキル本文だけ避ける**: 同じワークフローの長文手順・`scripts/`・`data/` は **一箇所（`.agents/skills/`）**に置き、`.claude/skills/` の同名は **発見用スタブ**にとどめる（CSV 等の複製を増やさない）。

## 優先順位（全ツール共通の考え方）

1. ユーザーの直接指示
2. 最も近い `AGENTS.override.md`
3. ルート `AGENTS.md`
4. `docs/reference/codex-rules/*.md`（詳細ルール）
5. `.agents/skills/<name>/SKILL.md`（繰り返しワークフロー）

詳細な置き場所の基準は `docs/reference/codex-rules/instruction-topology.md` を参照する。

## ツール別の読み込み

| 領域 | Codex / 一般エージェント | Claude Code（`.claude` をフル活用） |
| ---- | ------------------------ | ----------------------------------- |
| ルート方針 | `AGENTS.md` | **`CLAUDE.md`** + `AGENTS.md`（共通不変条件） |
| 詳細ルール（分野別） | `docs/reference/codex-rules/` | **`.claude/rules/**/*.md`**（`paths:` 付きで編集時に自動ロード） |
| 自動ガード | （各エージェントの設定に依存） | **`.claude/hooks/*.sh`** + **`.claude/settings.json`** の hooks 登録 |
| スキル（手順） | **`.agents/skills/` のみ**（本文・任意の `reference/scaffold-*.md`） | **`.claude/skills/<name>/SKILL.md`** は **スタブ**（`ui-ux-pro-max` / `frontend-design` / `lexical-node` / `lexical-plugin` / `lexical-toolbar` 等）→ 正本を読む |
| レビュー用サブエージェント | 増やさない（skill / ルールへ寄せる） | **`.claude/agents/*.md`**（Task / 専門レビュー） |

## 二重管理が必要なトピック

Lexical シェル、Three.js / Pixi 方針、`bun-patterns` 相当など、**同じ内容が** `docs/reference/codex-rules/` と `.claude/rules/` の両方にある場合は、**方針・公式リンク・「未依存」「削除済み」の事実を一致**させる。片方だけにレガシー説明を残さない。

## サブエージェント（`.claude/agents/`）

Claude Code 専用。各ファイルは YAML フロントマターで **`name` / `description` / `model` / `tools`** を揃え、`description` には発火条件と出力形式を短く書く。Codex 向けに同内容の「疑似エージェント」や重複 skill は増やさない（`instruction-topology.md` の delegation stance）。

## メンテナンス時のチェック

- 新しい恒久ルールを skill に書き捨てていないか（ルールは `codex-rules` または `.claude/rules`、手順だけ skill）
- **Codex 向け**文書（`.agents/skills` 本文など）が `.claude/*` を「ルールのコード正本」として参照していないか（Claude 利用者向けの説明では `.claude` 参照でよい）
- スキルのコマンド例のパスが `.agents/skills/` を指しているか（スタブ経由でも実行できること）
- hooks や `settings.json` を変えたら、Claude Code 上で期待どおり動くか確認する
