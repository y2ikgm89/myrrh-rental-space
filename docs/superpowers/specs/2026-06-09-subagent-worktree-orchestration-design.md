# Subagent / Worktree オーケストレーション最適化 設計

> 目的: 開発品質・効率・コンテキスト/rate 最適化のバランスを、公式 (code.claude.com) 最新推奨に沿って最高水準に引き上げる。
> 一次情報: [sub-agents](https://code.claude.com/docs/en/sub-agents) / [worktrees](https://code.claude.com/docs/en/worktrees) / [agent-view](https://code.claude.com/docs/en/agent-view) / [agent-teams](https://code.claude.com/docs/en/agent-teams) / [common-workflows](https://code.claude.com/docs/en/common-workflows)

## 背景と現状診断

15 体の subagent を全数検証した結果、**実装の土台は既に公式 frontmatter ツールキットをほぼ完全活用済み**:

- `model` 全体指定（codebase-explorer=haiku / 他=sonnet）、`tools` allowlist 絞り込み、`effort` per-agent、`memory: project` 4 体 + `.claude/agent-memory/<name>/` 実体整合、`skills:` preload（design-memory）、`maxTurns`（security-reviewer=18）。

したがって **subagent 定義の全面再設計は不要**（churn は逆効果）。公式最新で未取り込みのギャップは「並列処理の上位レイヤ」と「worktree 衛生」に集約される。

### 確定した一次情報（重要な非自明事実）

1. **Fork は親のプロンプトキャッシュを共有する** — 「forking cheaper than spawning a fresh subagent for tasks that need the same context」。`/fork` は v2.1.161 から既定有効。ただし `CLAUDE_CODE_FORK_SUBAGENT=1` は **全 general-purpose spawn を fork 化 + background 化**するため、大コンテキスト/独立 research では逆効果。
2. **`isolation: worktree` の base branch** — 既定は **default branch (`origin/HEAD`)**。本プロジェクトは `worktree.baseRef: "head"` 設定済みで未 push WIP ベース（in-progress 隔離に正しい）。
3. **`.worktreeinclude` は gitignored かつパターン一致のファイルのみ copy**（tracked は複製しない）。node_modules は対象外。
4. **worktree 自動 cleanup 条件** — uncommitted / untracked / unpushed が無い時のみ。`--worktree` 手動作成分は `cleanupPeriodDays` sweep の対象外（subagent / background 分のみ対象）。
5. **subagent 起動時ロード** — 非 Explore/Plan の custom subagent は CLAUDE.md + memory 階層 + git status を毎回ロード（Explore/Plan のみ省略）。

### 確定したバグ（具体）

`.claude/worktrees/agent-a953e63a7a655de1a` / `agent-ab1ad77816596c8a7` が node_modules ごと残留。`git worktree list` に未登録 = `git worktree remove` 後に Windows パス長で disk 上 dir 削除が失敗した残骸（git-migration.md:132 で「harmless」と既知化済みだが、Glob/Grep 結果を汚染する実害あり）。原因: worktree 隔離 implementer が検証のため `bun install` を実行 → node_modules 生成 → cleanup 時に Windows で削除失敗。

## スコープ（採用範囲）

**採用**: 公式 docs 掲載機能の full 採用 + Workflow を opt-in fan-out 層として codify。
**除外**: skills preload への reviewer 大量移行（baseline context 増の逆効果 = コンテキスト最適化に反する）/ agent-teams 常用（experimental）。

## 設計詳細

### Unit 1: 並列プリミティブ選択ポリシー（新規 path-scoped rule）

`.claude/rules/parallel-orchestration.md` を新設。`paths:` は `.claude/**` の orchestration 関連編集時に auto-load。1 枚の決定マトリクスで全プリミティブを比較:

| プリミティブ                                         | 使う時                                                          | コンテキスト/コスト特性                                      | 隔離                                   |
| ---------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------- |
| **main thread (直接)**                               | 単一 commit 完結 / 頻繁な往復 / 低レイテンシ要                  | 最小（再注入なし）                                           | なし                                   |
| **`/fork`**                                          | 同一コンテキストの side task（並行下書き / 複数アプローチ試行） | **安い（親キャッシュ共有）**、結果のみ戻る                   | file edit は `isolation:"worktree"` 可 |
| **named subagent**                                   | 独立 research / verbose 出力の隔離 / tool 制約                  | fresh context（rule 再注入あり）、要約のみ戻る               | tools/permission                       |
| **background subagent** (`background:true` / Ctrl+B) | 持続的並列・非ブロッキング                                      | 並行、permission auto-deny                                   | tools                                  |
| **worktree 隔離** (`isolation:worktree`)             | 同一 file の並行編集 / destructive migration 実験               | file-system 隔離                                             | git worktree                           |
| **agent teams** (experimental)                       | 持続的大規模並列（各ワーカー独立 context）                      | 高、**experimental・不採用**                                 | 完全分離                               |
| **Workflow tool** (ハーネス提供)                     | 多次元監査/レビュー/migration の決定論的 fan-out                | 並列自動上限 min(16,cores-2)、token 予算管理、構造化スキーマ | agent 毎 worktree 可                   |

判定原則を本文冒頭に明記: 「メインを軽く保つ。並列化は隔離が context を節約する／真に独立な時のみ。fork はキャッシュ共有で安い同一コンテキスト並列、fresh subagent は research の context 隔離に使い分ける。」

### Unit 2: Fork モードの採用（規律のみ、env 強制しない）

- `/fork <directive>` を「同一コンテキスト side task」の canonical として codify（Unit 1 マトリクス内）。
- **`CLAUDE_CODE_FORK_SUBAGENT=1` をグローバル設定しない** — 理由を明記（全 spawn fork+background 化で独立 research が逆効果）。`/fork` は v2.1.161 既定有効のため設定不要。
- 既存「実装 implementer dispatch」は named subagent / worktree 隔離のまま（fresh context 隔離が正しい）。

### Unit 3: Worktree 衛生

1. **即時**: 既存孤児 `agent-a953e63a7a655de1a` / `agent-ab1ad77816596c8a7` を物理除去（CLAUDE.md の `rm -rf` deny に従い `python3 -c "import shutil; shutil.rmtree(...)"`）。
2. **予防規律**（git-migration.md §Worktree に追記）: worktree 隔離 implementer は **`bun install` / `bun run validate` を実行しない** — controller が main で merge 後に検証する。worktree を node_modules-free に保ち自動 cleanup を機能させる。例外的に worktree 内検証が必要な場合は完了後に node_modules を明示削除してから session を閉じる。
3. **掃除手順**: 孤児 dir 検出 + 除去手順を git-migration.md §Worktree §Cleanup に明文化（`git worktree prune` では disk 上 dir は消えないため Windows は手動 rmtree が必要な旨）。
   - `WorktreeRemove` フックは git default cleanup を置換するリスク（公式 docs は非 git VCS 用途として記述）があるため **実装時に hook semantics を一次情報で再検証**してから採否決定。置換リスクが確認されたら hook ではなく掃除手順の明文化に留める。

### Unit 4: Workflow を opt-in fan-out 層として codify

- Unit 1 マトリクスに含めつつ、`subagent-dispatch-template` SKILL に「手動『並列 dispatch 3 件まで』制約は Workflow tool 利用時は不要（自動上限 min(16,cores-2)）。多次元監査/レビューは Workflow の pipeline/parallel + adversarial verify が canonical」と追記。
- **ハーネス提供ツールであり code.claude.com docs 外である旨を明記**（公式 docs 掲載機能と区別）。
- **常時 ON にしない**（rate balance）。opt-in トリガー: ユーザー明示「use a workflow」/ ultracode / skill 経由。

### Unit 5: Background agents 規律 + Agent teams 評価メモ

- `claude-code-patterns.md` の公式機能 awareness に `background:true` / `claude agents` (agent-view) / Ctrl+B を追記（持続的並列の選択肢）。
- agent-teams は **experimental につき評価のみ・不採用**を明記（再 litigate 防止）。

### Unit 6: SSoT 同期

- `CLAUDE.md`: §自動完遂ポリシー or §プロセスに「並列プリミティブ選択は `parallel-orchestration.md` が SSoT」+ 「ultracode = opt-in（明示時のみ）」を 1-2 行で明記。
- `claude-code-patterns.md`: 公式 5 層表は不変、`## 本プロジェクト固有 harness gotchas` に fork/Workflow/orphan-worktree の要点を追記。
- `subagent-dispatch-template` SKILL: Workflow cross-link（Unit 4）。
- `git-migration.md`: worktree 衛生（Unit 3）。
- `hooks-patterns.md`: WorktreeRemove を採用した場合のみ更新（Unit 3 の再検証次第）。

## PR 粒度

| PR      | 内容                                                                                                                                 | logical change       |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| **PR1** | Unit 3（worktree 衛生: 孤児除去 + git-migration.md 規律 + 掃除手順）                                                                 | worktree hygiene     |
| **PR2** | Unit 1/2/4/5/6（新規 parallel-orchestration.md + fork/background/Workflow codify + 既存 docs cross-link + CLAUDE.md ultracode 方針） | orchestration policy |

両 PR とも `.claude/` config + docs のみ（src 変更ゼロ）。各 300 行/10 file soft limit 内。

## 検証

- `.claude/settings.json` JSON validation（`python3 -c "import json; json.load(...)"`）。
- 新規 rule の `paths:` glob が実在 file にマッチ（`/audit-claude-config` の `check-stale-paths.ts` 相当）。
- 新規 rule の injection-cost 確認（over-broad glob 回避）。
- markdownlint 主要ルール（`markdown-style.md` 準拠）。
- 孤児除去後 `git worktree list` と `.claude/worktrees/` の整合確認。
- src 変更が無いため `bun run build` は対象外、`bun run validate` で lint/type-check 影響ゼロを確認。

## 非目標 (YAGNI)

- subagent 定義の再設計（土台 A+、不要）。
- reviewer の skills preload 大量移行（baseline context 増）。
- agent-teams 常用（experimental）。
- `CLAUDE_CODE_FORK_SUBAGENT=1` グローバル強制（独立 research で逆効果）。
- 独自オーケストレーション機構の新設（公式機能のみ、`claude-code-patterns.md` の独自機能禁止に準拠）。
