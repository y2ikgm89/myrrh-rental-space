---
description: 並列プリミティブ（main / fork / subagent / background / worktree / Workflow）選択ポリシー SSoT
paths:
  - ".claude/agents/**"
  - ".claude/skills/**"
  - "docs/superpowers/plans/**"
  - "docs/superpowers/specs/**"
---

# 並列オーケストレーション選択ポリシー

> 出典: [sub-agents](https://code.claude.com/docs/en/sub-agents) / [worktrees](https://code.claude.com/docs/en/worktrees) / [agent-view](https://code.claude.com/docs/en/agent-view) / [agent-teams](https://code.claude.com/docs/en/agent-teams)
> 並列化プリミティブ採否の SSoT。土台（subagent frontmatter）は健全のため、本 rule は「どの並列手段をいつ使うか」のみを規定する。

## 判定原則

**メインスレッドを軽く保つ。並列化は「隔離が context を節約する」か「真に独立」な時のみ。** 闇雲な並列化は各 agent の fresh context + rule 再注入で rate をむしろ悪化させる。fork はキャッシュ共有で安い同一コンテキスト並列、fresh subagent は research の context 隔離に使い分ける。

## 選択マトリクス

| プリミティブ                                                           | 使う時                                                                        | コンテキスト/コスト                                        | 隔離                                   |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------- |
| **main thread 直接**                                                   | 単一 commit 完結 / 頻繁な往復 / 低レイテンシ要 / 1-2 layer scope              | 最小（再注入なし）                                         | なし                                   |
| **`/fork <directive>`**                                                | 同一コンテキストの side task（並行下書き・複数アプローチ試行）                | **安い（親プロンプトキャッシュ共有）**、結果のみ戻る       | file edit は `isolation:"worktree"` 可 |
| **named subagent** (`Agent` tool)                                      | 独立 research / verbose 出力隔離 / tool 制約 / 実装 implementer               | fresh context（CLAUDE.md+memory 再ロード）、要約のみ戻る   | tools / permission                     |
| **background subagent** (`background:true` / Ctrl+B / `claude agents`) | 持続的並列・非ブロッキング作業                                                | 並行、permission auto-deny（prompt 不可）                  | tools                                  |
| **worktree 隔離** (`isolation:"worktree"`)                             | 同一 file の並行編集 / destructive migration 実験 / dev server 別 branch 常駐 | file-system 隔離（`worktree.baseRef:"head"` で WIP base）  | git worktree                           |
| **agent teams** (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`)             | 持続的大規模並列（各ワーカー独立 context + SendMessage）                      | 高                                                         | 完全分離                               |
| **Workflow tool**（ハーネス提供・公式 docs 外）                        | 多次元監査 / レビュー / migration の決定論的 fan-out                          | 並列自動上限 min(16,cores-2) + token 予算 + 構造化スキーマ | agent 毎 worktree 可                   |

## プリミティブ別の規律

### Fork（`/fork`）

- v2.1.161 から `/fork` は既定有効（設定不要）。**同一コンテキストの side task** に使う。fork は親のプロンプトキャッシュを共有するため fresh subagent より安い（出典: sub-agents#fork「forking cheaper than spawning a fresh subagent for tasks that need the same context」）。
- **`CLAUDE_CODE_FORK_SUBAGENT=1` をグローバル設定しない** — 全 general-purpose spawn が fork 化 + background 化し、独立 research や大コンテキストでは逆効果。fork は手動 `/fork` 経由に限定する。
- 実装 implementer dispatch は fork ではなく named subagent / worktree 隔離（fresh context 隔離が正しい）。

### Named subagent / 実装 dispatch

- 詳細規律は `subagent-dispatch-template` SKILL が SSoT（git 全面禁止 / import alias / 完了報告フォーマット / scope 物理制限）。
- 手動並列 dispatch は **3 件まで**（[issue #23463](https://github.com/anthropics/claude-code/issues/23463): 7 並列で parent context overflow）。**Workflow tool 利用時はこの手動上限は不要**（自動上限 min(16,cores-2)）。

### Background agents

- `background:true` frontmatter / Ctrl+B / `claude agents`（agent-view）で持続的並列セッションを 1 画面監視。background subagent は permission auto-deny のため、permission を要する操作は foreground で。

### Agent teams（experimental・不採用）

- `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` は experimental。公式が「推奨」する段階ではないため**本プロジェクトは不採用**（再検討は公式が stable 化してから）。

### Workflow tool（ハーネス提供・opt-in）

- **本ハーネス提供の決定論的オーケストレーション**で code.claude.com 公式 docs には未掲載（公式 docs 掲載機能＝subagent/fork/background/teams と区別する）。
- 多次元監査・コードレビュー・大規模 migration の fan-out が canonical。pipeline/parallel + 構造化スキーマ + adversarial verify で「並列3件まで」の手動 juggling を置換。
- **常時 ON にしない**（rate balance）。opt-in トリガー: ユーザー明示「use a workflow」/ ultracode / skill 経由のみ。

## 関連 SSoT

- 実装 dispatch 規律: `subagent-dispatch-template` SKILL
- worktree 採否 + 衛生: `.claude/rules/git-migration.md` §Worktree
- harness gotchas: `.claude/rules/claude-code-patterns.md`
