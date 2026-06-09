# Subagent / Worktree オーケストレーション最適化 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 公式 (code.claude.com) 最新推奨に沿って、並列処理の上位レイヤ（fork / background / Workflow 選択ポリシー）を codify し、worktree 孤児衛生を整備して、開発品質・効率・コンテキスト最適化のバランスを最高水準に引き上げる。

**Architecture:** src 変更ゼロ。`.claude/` config + docs のみ。土台（15 subagent frontmatter）は A+ と診断済みのため再設計は非目標。新規 path-scoped rule 1 本 + 既存 SSoT docs 同期 + worktree 孤児物理除去の 2 PR 構成。

**Tech Stack:** Claude Code (sub-agents / worktrees / agent-view 公式仕様)、Markdown (CommonMark + GFM + markdownlint、`markdown-style.md` 準拠)、Python3 (孤児 dir 除去)。

設計 SSoT: [`docs/superpowers/specs/2026-06-09-subagent-worktree-orchestration-design.md`](../specs/2026-06-09-subagent-worktree-orchestration-design.md)

**WorktreeRemove フック非採用の確定**: git 既定 VCS では既定 cleanup を置換するリスク（公式 docs は非 git VCS 用途）。孤児は稀な Windows パス長アーティファクトのため、予防規律 + 手動掃除手順で対処（hook 不要、churn/risk 回避）。

---

## PR1: Worktree 孤児衛生

**branch:** `chore/claude-parallel-orchestration`（既に origin/main から作成済み・本セッションで作業中）

> 注: PR1 と PR2 は同一 branch 上で別 commit に分離する（両者 `.claude/` docs + config のみで 1 logical change ずつ）。PR は commit 単位ではなく、まず PR1 commit 群を push → PR 化 → auto-merge 予約 → PR2 は前 PR merge 後に rebase して別 PR 化、または小規模ゆえ 2 commit を 1 PR にまとめる判断は実装時の行数で決める（両 PR 合算で 300 行/10 file soft limit 内なら 1 PR 集約可）。

### Task 1: 孤児 worktree ディレクトリの物理除去

**Files:**

- Delete (disk only, git 管理外): `.claude/worktrees/agent-a953e63a7a655de1a/`
- Delete (disk only, git 管理外): `.claude/worktrees/agent-ab1ad77816596c8a7/`

- [ ] **Step 1: 孤児が git 管理外であることを確認**

Run:

```bash
cd "G:/workspace/work/website/customer/myrrh-rental-space" && git worktree list
```

Expected: メイン checkout のみ表示。`agent-*` が出ないこと（= git 管理外の disk 残骸）。

- [ ] **Step 2: git worktree prune で参照をクリーンアップ**

Run:

```bash
cd "G:/workspace/work/website/customer/myrrh-rental-space" && git worktree prune -v; git worktree list
```

Expected: 変化なし（既に prune 済の残骸）。エラーなし。

- [ ] **Step 3: 孤児 dir を物理除去（CLAUDE.md の `rm -rf` deny に従い Python shutil）**

Run:

```bash
cd "G:/workspace/work/website/customer/myrrh-rental-space" && python3 -c "import shutil,os; [shutil.rmtree(p, ignore_errors=True) for p in ['.claude/worktrees/agent-a953e63a7a655de1a','.claude/worktrees/agent-ab1ad77816596c8a7']]; print('removed')"
```

Expected: `removed`。Windows パス長で一部残る場合は再実行 or `robocopy` empty-mirror trick で対処。

- [ ] **Step 4: 除去を検証**

Run:

```bash
cd "G:/workspace/work/website/customer/myrrh-rental-space" && ls .claude/worktrees/ 2>/dev/null || echo "empty-or-gone"
```

Expected: 空 or ディレクトリ消失。`agent-*` が残らないこと。

> 注: `.claude/worktrees/` は `.gitignore` 済（git status に出ない）。物理除去のみで commit 対象なし。本 Task は git commit を生成しない（後続 Task 2 で規律を commit）。

### Task 2: git-migration.md に worktree 衛生規律を追記

**Files:**

- Modify: `.claude/rules/git-migration.md`（§Worktree §✅ 使う場面 直後、または §Cleanup 内）

- [ ] **Step 1: §Cleanup の現行構造を確認**

Run:

```bash
cd "G:/workspace/work/website/customer/myrrh-rental-space" && grep -n "^### Cleanup\|^## Worktree\|孤児\|node_modules" .claude/rules/git-migration.md
```

Expected: §Worktree（line ~14）と §Cleanup（line ~69）の位置確認。

- [ ] **Step 2: §Cleanup（公式仕様）の末尾に「孤児 dir 衛生」小節を追記**

`.claude/rules/git-migration.md` の §Cleanup（公式仕様）リスト直後に以下を挿入:

```markdown
### Worktree 孤児 dir 衛生（Windows）

- **`git worktree remove` 後も disk 上 dir が残る Windows 罠** — subagent worktree 隔離 implementer が検証目的で `bun install` を実行すると node_modules（数万 file・長 path）が生成され、cleanup 時に Windows パス長制限で dir 削除が失敗する。`git worktree list` から消えていても `.claude/worktrees/agent-*` が disk に残り、Glob/Grep 結果を汚染する。
- **予防規律（最重要）**: **worktree 隔離 implementer は `bun install` / `bun run validate` / `bun run build` を実行しない**。controller が main で merge 後に検証する（`subagent-dispatch-template` の VERIFICATION 節は controller 用、implementer は編集のみ）。worktree を node_modules-free に保てば公式自動 cleanup（uncommitted/untracked/unpushed なし時）が機能する。例外的に worktree 内検証が不可避な場合は session 終了前に `python3 -c "import shutil; shutil.rmtree('.claude/worktrees/<name>/node_modules', ignore_errors=True)"` で明示削除する。
- **掃除手順（孤児発生時）**: `git worktree prune -v`（git 参照クリーンアップ、disk dir は消えない）→ `python3 -c "import shutil; shutil.rmtree('.claude/worktrees/<orphan>', ignore_errors=True)"`（CLAUDE.md `rm -rf` deny のため Python shutil）。`WorktreeRemove` hook は git 既定 cleanup を置換するリスク（公式 docs は非 git VCS 用途）があるため**採用しない** — 手動掃除手順で対処する。
```

- [ ] **Step 3: markdownlint 主要ルール確認**

Run:

```bash
cd "G:/workspace/work/website/customer/myrrh-rental-space" && grep -nE ' +$' .claude/rules/git-migration.md | head; echo "trailing-space-check-done"
```

Expected: 追記部分に行末空白なし。

- [ ] **Step 4: Commit（PR1）**

```bash
cd "G:/workspace/work/website/customer/myrrh-rental-space" && git add .claude/rules/git-migration.md && git commit -m "chore(claude): worktree 孤児 dir 衛生規律を追記 + 既存残骸除去

subagent worktree 隔離 implementer の bun install 起因で生じる Windows
パス長 cleanup 失敗（node_modules orphan）の予防規律と掃除手順を
git-migration.md §Cleanup に明文化。既存孤児 agent-* 2 件を物理除去済。
WorktreeRemove hook は git 既定 cleanup 置換リスクのため非採用。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## PR2: 並列オーケストレーション・ポリシー

### Task 3: 新規 path-scoped rule `parallel-orchestration.md` 作成

**Files:**

- Create: `.claude/rules/parallel-orchestration.md`

- [ ] **Step 1: 既存 rule の frontmatter 規約と paths 慣習を確認**

Run:

```bash
cd "G:/workspace/work/website/customer/myrrh-rental-space" && head -10 .claude/rules/git-migration.md && echo "---" && ls docs/superpowers/plans/ | tail -2
```

Expected: `description:` + `paths:` 配列形式を確認。

- [ ] **Step 2: rule ファイルを作成**

Create `.claude/rules/parallel-orchestration.md` with:

```markdown
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
```

- [ ] **Step 3: paths glob が実在 file にマッチすることを検証**

Run:

```bash
cd "G:/workspace/work/website/customer/myrrh-rental-space" && ls .claude/agents/*.md | head -1 && ls .claude/skills/ | head -1 && ls docs/superpowers/plans/*.md | head -1
```

Expected: 各 glob に実在 file がある（stale path でない）。

- [ ] **Step 4: markdownlint + frontmatter 検証**

Run:

```bash
cd "G:/workspace/work/website/customer/myrrh-rental-space" && grep -nE ' +$' .claude/rules/parallel-orchestration.md | head; head -7 .claude/rules/parallel-orchestration.md
```

Expected: 行末空白なし。`description:` + `paths:` frontmatter 正常。

### Task 4: subagent-dispatch-template SKILL に Workflow cross-link 追記

**Files:**

- Modify: `.claude/skills/subagent-dispatch-template/SKILL.md`（§Scope 物理制限、「並列 dispatch は 3 件まで」行付近）

- [ ] **Step 1: 該当行を確認**

Run:

```bash
cd "G:/workspace/work/website/customer/myrrh-rental-space" && grep -n "並列 dispatch は 3 件まで\|Scope 物理制限" .claude/skills/subagent-dispatch-template/SKILL.md
```

Expected: §Scope 物理制限（line ~153）と「並列 dispatch は 3 件まで」（line ~161）。

- [ ] **Step 2: 「並列 dispatch は 3 件まで」の bullet に Workflow 注記を追記**

`.claude/skills/subagent-dispatch-template/SKILL.md` の該当 bullet を以下に置換:

```markdown
- **並列 dispatch は 3 件まで** — 4 件以上は逐次（[issue #23463](https://github.com/anthropics/claude-code/issues/23463): 7 並列で parent context overflow）。**この手動上限は `Agent` tool 直 dispatch 時のみ。多次元監査/レビュー/migration の決定論的 fan-out はハーネス提供 `Workflow` tool（自動上限 min(16,cores-2) + token 予算 + 構造化スキーマ + adversarial verify）が canonical。並列プリミティブ選択は `.claude/rules/parallel-orchestration.md` が SSoT**
```

- [ ] **Step 3: 検証**

Run:

```bash
cd "G:/workspace/work/website/customer/myrrh-rental-space" && grep -n "parallel-orchestration\|Workflow" .claude/skills/subagent-dispatch-template/SKILL.md
```

Expected: cross-link 追記を確認。

### Task 5: claude-code-patterns.md の harness gotchas に追記

**Files:**

- Modify: `.claude/rules/claude-code-patterns.md`（§本プロジェクト固有 harness gotchas）

- [ ] **Step 1: セクション末尾を確認**

Run:

```bash
cd "G:/workspace/work/website/customer/myrrh-rental-space" && grep -n "harness gotchas\|管理画面ログイン URL は" .claude/rules/claude-code-patterns.md
```

Expected: §本プロジェクト固有 harness gotchas の最終 bullet 位置。

- [ ] **Step 2: 最終 bullet の後に並列プリミティブ awareness を追記**

§本プロジェクト固有 harness gotchas の最終 bullet 直後に以下を挿入:

```markdown
- **並列プリミティブ選択は `.claude/rules/parallel-orchestration.md` が SSoT** — main / fork / named-subagent / background / worktree隔離 / agent-team / Workflow の選択マトリクス。要点: ① `/fork`（v2.1.161 既定有効）は同一コンテキスト side task に安い（親キャッシュ共有）、`CLAUDE_CODE_FORK_SUBAGENT=1` グローバル化は逆効果で非設定 ② background subagent（`background:true`/Ctrl+B/`claude agents`）は持続的並列の選択肢 ③ agent-teams は experimental につき不採用 ④ `Workflow` tool（ハーネス提供・公式 docs 外）は多次元監査/レビューの決定論的 fan-out で opt-in（常時 ON にしない）
```

- [ ] **Step 3: 検証**

Run:

```bash
cd "G:/workspace/work/website/customer/myrrh-rental-space" && grep -n "parallel-orchestration\|fork\|Workflow" .claude/rules/claude-code-patterns.md
```

Expected: 追記を確認。

### Task 6: CLAUDE.md に ultracode 方針 + SSoT ポインタを追記

**Files:**

- Modify: `CLAUDE.md`（§プロセス §Subagent / Worktree）

- [ ] **Step 1: §Subagent / Worktree を確認**

Run:

```bash
cd "G:/workspace/work/website/customer/myrrh-rental-space" && grep -n "Subagent / Worktree\|subagent-dispatch-template SKILL 経由" CLAUDE.md
```

Expected: §Subagent / Worktree（"### Subagent / Worktree"）の位置。

- [ ] **Step 2: §Subagent / Worktree の bullet リストに 1 行追記**

`CLAUDE.md` の §Subagent / Worktree の bullet リスト末尾に以下を追加:

```markdown
- **並列プリミティブ選択（main / fork / subagent / background / worktree / Workflow）は `.claude/rules/parallel-orchestration.md` が SSoT** — `/fork` は同一コンテキスト side task の安い並列（親キャッシュ共有）。`Workflow` tool（ハーネス提供）は多次元監査/レビューの fan-out 用で **opt-in（明示「use a workflow」/ ultracode 時のみ、常時 ON にしない）**。agent-teams は experimental につき不採用
```

- [ ] **Step 3: 検証**

Run:

```bash
cd "G:/workspace/work/website/customer/myrrh-rental-space" && grep -n "parallel-orchestration" CLAUDE.md
```

Expected: 追記を確認。

### Task 7: PR2 検証 + commit

- [ ] **Step 1: JSON validation（settings 無変更だが念のため）**

Run:

```bash
cd "G:/workspace/work/website/customer/myrrh-rental-space" && python3 -c "import json; json.load(open('.claude/settings.json', encoding='utf-8')); print('settings.json OK')"
```

Expected: `settings.json OK`。

- [ ] **Step 2: validate（src 無変更で影響ゼロ確認）**

Run:

```bash
cd "G:/workspace/work/website/customer/myrrh-rental-space" && bun run validate
```

Expected: exit 0（src 無変更のため type-check/lint に影響なし）。

- [ ] **Step 3: stale path 検出（新規 rule の paths glob）**

Run:

```bash
cd "G:/workspace/work/website/customer/myrrh-rental-space" && grep -rn "parallel-orchestration" .claude/ CLAUDE.md | wc -l
```

Expected: cross-link が CLAUDE.md / claude-code-patterns.md / subagent-dispatch-template / 自ファイルに存在。

- [ ] **Step 4: Commit（PR2）**

```bash
cd "G:/workspace/work/website/customer/myrrh-rental-space" && git add .claude/rules/parallel-orchestration.md .claude/skills/subagent-dispatch-template/SKILL.md .claude/rules/claude-code-patterns.md CLAUDE.md && git commit -m "feat(claude): 並列オーケストレーション選択ポリシーを codify

新規 .claude/rules/parallel-orchestration.md で main/fork/subagent/
background/worktree/agent-team/Workflow の選択マトリクスを SSoT 化。
fork(同一context・親キャッシュ共有で安い) / background / Workflow(opt-in
fan-out, ハーネス提供) を公式仕様に沿って codify。agent-teams は
experimental につき不採用。subagent-dispatch-template / claude-code-patterns
/ CLAUDE.md に cross-link。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## PR 統合判断

両 PR 合算で `.claude/` docs + config のみ、推定 < 250 行 / 6 file。**300 行/10 file soft limit 内のため 1 PR に集約してよい**（1 logical change = "並列オーケストレーション最適化 + worktree 衛生"）。spec の 2 PR 分割は粒度上限であり、実測が limit 内なら 1 PR で push → auto-merge 予約。

## Self-Review チェック結果

- **Spec coverage**: Unit 1→Task 3 / Unit 2→Task 3(fork節)+Task 6 / Unit 3→Task 1,2 / Unit 4→Task 3(Workflow節)+Task 4 / Unit 5→Task 3+Task 5 / Unit 6→Task 4,5,6。全 Unit にタスク対応。
- **Placeholder scan**: TBD/TODO なし。全 Step に実コマンド + 実挿入内容あり。
- **Type/名称整合**: ファイルパス `parallel-orchestration.md` 全タスクで一致。section 名（§Cleanup / §Scope 物理制限 / §harness gotchas / §Subagent / Worktree）は実ファイル grep で確認済の既存 anchor。
