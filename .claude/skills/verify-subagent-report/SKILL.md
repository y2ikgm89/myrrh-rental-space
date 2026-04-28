---
name: verify-subagent-report
description: Use immediately after dispatching an implementer subagent via Agent tool. Independently verifies reported commit SHA / file changes / test results against actual git state to detect report fabrication.
---

# verify-subagent-report

Subagent implementer の報告を鵜呑みにせず、git state に対して独立検証する手順。

## 背景

過去のセッションで haiku モデル implementer が以下を捏造した事例が発生:

- commit SHA を報告したが `git cat-file` で不在
- ファイル変更を報告したが working tree に反映されていない
- テスト pass 数を報告したが実際は未実行

対策として、implementer 完了後に必ず本スキルを適用する。

## 検証プロトコル

implementer 報告が以下を含む場合、それぞれ対応する検証コマンドを実行する。

### 1. Commit 実在検証

```bash
git cat-file -e <sha>^{commit} 2>/dev/null && echo "✓ exists: <sha>" || echo "✗ MISSING: <sha>"
```

実在しない SHA を報告された場合は **即座に fabrication 確定** → 同じタスクを sonnet 以上で再 dispatch。

### 2. Commit 内容の一致

```bash
git show --stat <sha>
```

実行結果と implementer 報告のファイル変更リストを項目ごとに照合:

- ファイルパスの一致
- 追加/削除行数の近接（±10% 程度まで許容）
- report に無いファイルの変更がないか

### 3. HEAD 位置

```bash
git log --oneline -5
```

報告された commit が HEAD またはその近傍にあることを確認。worktree 実行の場合は対象 worktree の HEAD を確認（`git -C .worktrees/<name> log --oneline -5`）。

### 4. テスト結果の再現

implementer が「N tests pass」を報告した場合、該当テストファイルのみを再実行:

```bash
bun test <path-from-report> 2>&1 | tail -5
```

pass 数が報告と一致すれば OK。不一致なら fabrication または環境依存。

### 5. 型チェック

implementer が `bun run type-check: PASS (EXIT 0)` を報告した場合、当該 worktree で再実行:

```bash
bun run type-check 2>&1 | tail -3
echo "EXIT:$?"
```

## 失敗パターン早見表

| 症状                      | 原因                                             | アクション                                         |
| ------------------------- | ------------------------------------------------ | -------------------------------------------------- |
| `git cat-file` が MISSING | implementer が SHA を捏造                        | sonnet+ で再 dispatch                              |
| ファイルリスト不一致      | implementer が概要のみ報告 or 一部スキップ       | 実差分を読み scope を再確認                        |
| HEAD 位置の乖離           | 実行先の worktree 間違い                         | `git worktree list` で確認、対象 worktree で再実行 |
| テスト pass 数不一致      | テスト未実行 or 異なるテストファイルを対象にした | 該当ファイルを自分で再実行                         |
| 型チェック失敗            | implementer が型エラーを見逃した                 | エラーメッセージを読み修正 dispatch                |

## スキップ条件

以下の場合は検証不要:

- Subagent が read-only（Explore / codebase-explorer / Plan 等）— commit 主張なし
- Subagent が `BLOCKED` / `NEEDS_CONTEXT` を報告 — 実装未実施
- Subagent が明示的に「ファイル変更なし」を報告 — 検証対象なし

## 6. Parallel dispatch cross-revert 検証（N 並列 implementer 用）

N 並列 implementer（2 件以上同時）を dispatch した場合、一方の `git reset` / `git restore` / `git stash` が他方の成果や controller の直前編集を silent revert する事故が実際に発生しうる。全員の完了報告受領後、controller は必ず以下の 3 段検証を実行する。

### 6.1. `git status --short` で全 modifications + untracked を列挙

```bash
git status --short
```

**注意**: `[post-subagent] git snapshot` hook の出力は truncate されうるため authoritative でなく、`git status` 直接実行が ground truth。hook snapshot で 5 件だったはずのファイルが 3 件に減っているケースは silent revert の兆候。

### 6.2. `wc -l` で対象ファイルの行数 delta 確認

各 agent が「旧 N → 新 M 行」と報告した場合、実体と照合する:

```bash
wc -l src/path/to/agent-1-target.tsx \
      src/path/to/agent-2-target.tsx \
      src/path/to/agent-3-target.tsx \
      src/path/to/agent-4-target.tsx
```

agent 報告と一致しないファイルは revert されている可能性が高い（例: 791 行→93 行と報告されたが実体 791 行のまま → agent の main file 編集が revert された）。

### 6.3. `grep` で期待 symbol 存在 + 削除 symbol 不在を確認

新規 import / 既存 symbol / 削除 symbol を明示的に検証する:

```bash
# 分割後に期待される新規 sub-component 参照
grep -rn "import.*\\(TaxonomyFormFields\\|EventBasicFields\\|SidebarWidgetCard\\)" src/

# 分割前の旧 symbol が消えているか
grep -rn "const SortableWidgetItem" src/   # Sidebar 旧 inline 定義
grep -rn "function CategoryFormFields" src/app/\\(admin\\)/admin/\\(dashboard\\)/posts/taxonomy/_components/TaxonomyEditor.tsx
```

**重要**: `system-reminder` の「X was modified by linter」は edit 時点の snapshot を表示するケースがあり stale しうる。旧内容が表示されても、実体が何かは `grep` / `Read` で直接確認する。

### 6.4. 異常検出時の recovery

| 症状                                                      | 対処                                       |
| --------------------------------------------------------- | ------------------------------------------ |
| controller の quick fixes が消えている                    | 同じ edit を再適用（Edit/Write を再実行）  |
| 一部 agent の main file が元のまま                        | 該当 agent を再 dispatch（今度は単独実行） |
| `[post-subagent] snapshot` と `git status` で件数が異なる | `git status` 直接実行を正とする            |
| `git reflog -5` に `reset: moving to HEAD` が登場         | 本事故の確定兆候、3 段検証を完走           |

### 6.5. 予防策

implementer prompt に以下を明記済みか確認（未明記なら追記して再 dispatch）:

> 🚫 **絶対禁止**: `git add` / `git commit` / `git push` / `git reset` / `git checkout` / `git restore` / `git stash` — 一切の git コマンド実行禁止。ファイル編集のみ。

`git add / commit` 禁止だけでは不十分（`reset / restore / stash` が working tree を巻き戻す破壊操作）。

## 関連

- `.claude/rules/gotchas/claude-code.md` — subagent 検証規律・haiku ban
- `.claude/hooks/post-subagent-git-snapshot.sh` — Task tool 実行後の自動 git state スナップショット
- `CLAUDE.md` §Subagent 規律 — implementer dispatch の git 全面禁止 + 3 段検証
- `superpowers:subagent-driven-development` — implementer + spec reviewer + quality reviewer の 3 段ループ
