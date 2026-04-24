# AI エージェント向け指示の配置

最終更新: 2026-04-24

このリポジトリの Codex 向け正本は OpenAI Codex 公式の配置に合わせる。`.claude/*` は残すが、Codex からは参照・同期・正本扱いしない。

## Codex の正本

| 用途                     | 正本                             | 備考                                                              |
| ------------------------ | -------------------------------- | ----------------------------------------------------------------- |
| 常時読むプロジェクト指示 | `AGENTS.md`                      | Codex が作業前に読み込む入口                                      |
| 繰り返しワークフロー     | `.agents/skills/<name>/SKILL.md` | `name` / `description` frontmatter のみ。description に境界を書く |
| 専門 subagent            | `.codex/agents/*.toml`           | 明示依頼時だけ使う。1 TOML 1 agent                                |
| コマンド承認ルール       | `.codex/rules/*.rules`           | `prefix_rule` による sandbox 外コマンド制御                       |
| lifecycle hooks          | `.codex/hooks.json`              | Windows では公式上無効。未採用で維持                              |

## 優先順位

1. ユーザーの直接指示
2. 最も近い `AGENTS.override.md`
3. ルート `AGENTS.md`
4. 必要時に Codex が選ぶ `.agents/skills/<name>/SKILL.md`
5. 明示依頼された場合のみ `.codex/agents/*.toml`

`docs/reference/codex-rules/*` は使わない。Codex の rules は `.codex/rules/*.rules` に置く command approval policy だけを指す。

## `.claude` の扱い

`.claude/*` は削除しないが、Codex ネイティブ構成の一部ではない。

- Codex 用ドキュメントから `.claude/*` を正本として案内しない。
- Codex 用 skill を `.claude/skills` へ置かない。
- Codex 用 agent を `.claude/agents` へ置かない。
- `.claude/rules` と Codex 資産を同期しない。

## メンテナンス基準

- 恒久的なプロジェクト制約は `AGENTS.md` に置く。
- 手順化された反復作業は `.agents/skills` に置く。
- subagent は「探索」「レビュー」「検証」「一次情報調査」のように狭く分け、`name` / `description` / `developer_instructions` を必ず定義する。
- command allow / prompt / forbidden は `.codex/rules` に置き、`match` / `not_match` で意図を残す。
- hooks を有効化する前に、現在の OpenAI Codex hooks ドキュメントで Windows support と対象 event の対応状況を確認する。
- アーキテクチャや運用の方針変更は `docs/architecture/codex-instructions.md` に記録する。
