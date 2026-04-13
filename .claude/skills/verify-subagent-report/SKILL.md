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

## 関連

- `.claude/rules/gotchas.md` §Claude Code 設定 — subagent 検証規律・haiku ban
- `.claude/hooks/post-subagent-git-snapshot.sh` — Task tool 実行後の自動 git state スナップショット
- `superpowers:subagent-driven-development` — implementer + spec reviewer + quality reviewer の 3 段ループ
