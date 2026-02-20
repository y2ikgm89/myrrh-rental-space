# Claude Code 自動化改善 実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Claude Code 自動化スコアを 94/100 → 100/100 に改善する（5ファイル追加/変更）

**Architecture:** PreToolUse フックで危険 Bash コマンドをハードブロック、Notification フックで Windows トースト通知、performance-analyzer エージェント追加、CLAUDE.md に commit スキルを追記。

**Tech Stack:** Bash, PowerShell (Windows built-in), Claude Code hooks/agents

---

### Task 1: block-dangerous-bash.sh を作成する

**Files:**

- Create: `.claude/hooks/block-dangerous-bash.sh`

**Step 1: ファイルを作成する**

```bash
#!/usr/bin/env bash
# PreToolUse hook: 危険な Bash コマンドをハードブロック（exit 2）
# stdin から tool event JSON を受け取り、command フィールドを検査する

set -euo pipefail

INPUT=$(cat)
COMMAND=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || echo "")

[ -z "$COMMAND" ] && exit 0

block() {
  echo "Blocked: $1" >&2
  echo "ターミナルで直接実行してください（Claude Code の Bash ツールからは実行不可）。" >&2
  exit 2
}

# rm -rf / rm -r（再帰的削除）
if printf '%s' "$COMMAND" | grep -qE 'rm\s+(-[a-zA-Z]*r[a-zA-Z]*|-r\b)'; then
  block "再帰的削除 (rm -r/-rf) は禁止されています。ファイル削除が必要な場合は python3 -c \"import shutil; shutil.rmtree('path')\" を使用してください。"
fi

# git reset --hard
if printf '%s' "$COMMAND" | grep -qE 'git\s+reset\s+.*--hard'; then
  block "git reset --hard は禁止されています。未コミット変更が完全に失われます。"
fi

# git push --force / -f（--force-with-lease は許可）
if printf '%s' "$COMMAND" | grep -qE 'git\s+push\s+.*(\s-f\b|--force\b)'; then
  block "git push --force は禁止されています。リモート履歴が上書きされます。--force-with-lease は許可されています。"
fi

# git clean -f / -fd / -dfx（追跡外ファイル削除）
if printf '%s' "$COMMAND" | grep -qE 'git\s+clean\s+.*-[a-zA-Z]*f'; then
  block "git clean -f は禁止されています。追跡外ファイルが完全に削除されます。"
fi

# git checkout . （作業ツリー全変更破棄）
if printf '%s' "$COMMAND" | grep -qE "git\s+checkout\s+\.(\s|$)"; then
  block "git checkout . は禁止されています。全変更が破棄されます。git stash を使用してください。"
fi

# git restore . （作業ツリー全変更破棄）
if printf '%s' "$COMMAND" | grep -qE "git\s+restore\s+\.(\s|$)"; then
  block "git restore . は禁止されています。全変更が破棄されます。git stash を使用してください。"
fi

# git branch -D（強制ブランチ削除）
if printf '%s' "$COMMAND" | grep -qE 'git\s+branch\s+.*\s-D\b'; then
  block "git branch -D は禁止されています。ブランチが強制削除されます。-d を使用してください。"
fi

# diskpart / format（Windows ディスク破壊操作）
if printf '%s' "$COMMAND" | grep -qiE '(^|\s|\|)(diskpart|format\s+[a-zA-Z]:)'; then
  block "ディスク操作コマンドは禁止されています。"
fi

exit 0
```

**Step 2: 実行権限を付与する**

```bash
chmod +x .claude/hooks/block-dangerous-bash.sh
```

※ MINGW64 では chmod が deny されているため、スクリプト先頭の `#!/usr/bin/env bash` で bash が実行する。chmod は不要。

**Step 3: 動作確認（手動テスト）**

```bash
# ブロックされること（exit 2 = 非ゼロ）を確認
echo '{"tool_input":{"command":"rm -rf /tmp/test"}}' | bash .claude/hooks/block-dangerous-bash.sh
echo "exit code: $?"  # → exit code: 2

echo '{"tool_input":{"command":"git reset --hard HEAD"}}' | bash .claude/hooks/block-dangerous-bash.sh
echo "exit code: $?"  # → exit code: 2

# 通過すること（exit 0）を確認
echo '{"tool_input":{"command":"git status"}}' | bash .claude/hooks/block-dangerous-bash.sh
echo "exit code: $?"  # → exit code: 0

echo '{"tool_input":{"command":"bun run build"}}' | bash .claude/hooks/block-dangerous-bash.sh
echo "exit code: $?"  # → exit code: 0
```

---

### Task 2: notification.sh を作成する

**Files:**

- Create: `.claude/hooks/notification.sh`

**Step 1: ファイルを作成する**

```bash
#!/usr/bin/env bash
# Notification hook: Windows トースト通知（PowerShell 組み込み、追加モジュール不要）
# Claude Code が通知を送りたい時（長時間タスク完了・入力待ち）に発火

set -euo pipefail

INPUT=$(cat)

# stdin JSON から message を取得（特殊文字を除去してPowerShell埋め込みを安全にする）
MESSAGE=$(printf '%s' "$INPUT" | jq -r '.message // "入力を待機しています"' 2>/dev/null \
  | tr -d "'\"\`\$\n\r" \
  | cut -c1-150 \
  || echo "入力を待機しています")

# Windows balloon notification（NotifyIcon - Windows 10/11 組み込み）
# 非ブロッキング: & でバックグラウンド実行 → hook はすぐ exit 0 を返す
powershell.exe -NonInteractive -WindowStyle Hidden -Command "
  try {
    Add-Type -AssemblyName System.Windows.Forms
    \$n = New-Object System.Windows.Forms.NotifyIcon
    \$n.Icon = [System.Drawing.SystemIcons]::Information
    \$n.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Info
    \$n.BalloonTipTitle = 'Claude Code'
    \$n.BalloonTipText = '${MESSAGE}'
    \$n.Visible = \$true
    \$n.ShowBalloonTip(8000)
    Start-Sleep -Seconds 9
    \$n.Dispose()
  } catch { }
" 2>/dev/null &

exit 0
```

**Step 2: 動作確認**

```bash
# 手動実行でトースト通知が表示されることを確認
echo '{"message":"テスト通知: Claude Code が完了しました"}' | bash .claude/hooks/notification.sh
# → Windows タスクバー右下にバルーン通知が出現する
```

---

### Task 3: settings.json を更新する

**Files:**

- Modify: `.claude/settings.json`

**Step 1: 現在の内容を確認してから編集する**

現在の `"PreToolUse"` 配列に `Bash` matcher エントリを追加し、`"Notification"` セクションを追加する。

追加後の `settings.json`:

```json
{
  "enableAllProjectMcpServers": true,
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "echo '=== 進行中の計画 ===' && grep -rl '実装中\\|設計承認済み' \"$CLAUDE_PROJECT_DIR/docs/plans\" 2>/dev/null | grep -v README | grep -v CLAUDE | head -5 || echo '(なし)' && echo '' && echo '=== プロジェクト状況 (docs/plans/README.md 上位100行) ===' && head -100 \"$CLAUDE_PROJECT_DIR/docs/plans/README.md\" 2>/dev/null",
            "statusMessage": "進行中タスクを確認中..."
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/block-sensitive-files.sh",
            "statusMessage": "Checking file protection..."
          }
        ]
      },
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/block-dangerous-bash.sh",
            "statusMessage": "Checking dangerous commands..."
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/prettier-format.sh",
            "statusMessage": "Formatting...",
            "timeout": 30
          },
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/eslint-fix.sh",
            "statusMessage": "Linting...",
            "timeout": 30
          },
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/schema-change-guard.sh",
            "statusMessage": "Checking schema changes..."
          },
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/connection-reminder.sh",
            "statusMessage": "Checking connection()..."
          }
        ]
      }
    ],
    "Notification": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/notification.sh",
            "statusMessage": "通知を送信中..."
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/type-check-on-stop.sh",
            "statusMessage": "型チェック中...",
            "timeout": 60
          }
        ]
      }
    ]
  }
}
```

**Step 2: JSON が有効であることを確認する**

```bash
python3 -c "import json; json.load(open('.claude/settings.json')); print('OK')"
# → OK
```

---

### Task 4: performance-analyzer.md を作成する

**Files:**

- Create: `.claude/agents/performance-analyzer.md`

**Step 1: ファイルを作成する**

````markdown
---
name: performance-analyzer
description: >
  Next.js 16 バンドルサイズ・パフォーマンス解析エージェント。
  新しいページ・コンポーネント追加後、ビルドサイズ増大が懸念される場合に使用。
  First Load JS サイズ・静的/動的判定・ルート別サイズを分析してレポートを出力する。
tools:
  - Bash
  - Read
  - Glob
model: haiku
---

You are a Next.js 16 build performance specialist for the Myrrh Rental Space project.

## Workflow

1. Run `bun run build` and capture the full output
2. Parse route table (sizes, First Load JS, static/dynamic status)
3. Identify routes that exceed thresholds
4. Report with specific optimization suggestions

## Build command

```bash
export PATH="$HOME/.bun/bin:$PATH"
export SKIP_ENV_VALIDATION=true
cd "$CLAUDE_PROJECT_DIR"
bun run build 2>&1
```
````

## Thresholds

| Metric                 | OK       | Warning    | Critical |
| ---------------------- | -------- | ---------- | -------- |
| First Load JS (shared) | < 100 kB | 100–150 kB | > 150 kB |
| Individual route size  | < 50 kB  | 50–100 kB  | > 100 kB |

## Analysis focus areas

- Routes marked as `ƒ` (dynamic) that could be `○` (static)
- Unusually large route bundles — check for missing code splitting
- Shared JS growing over time — check for large dependencies added to layout

## Output format

```
## Performance Analysis

### Build Summary
- Total routes: N (static: N, dynamic: N)
- Shared First Load JS: X kB [OK/WARNING/CRITICAL]

### Issues (if any)
- `/admin/path` — First Load JS: X kB — reason → suggestion

### Passed Checks
- Shared JS within threshold
- No unexpectedly dynamic routes
```

Report only high-confidence findings. If everything looks good, say so clearly.

```

---

### Task 5: CLAUDE.md を更新する

**Files:**
- Modify: `CLAUDE.md`

**Step 1: 「手動スキル」セクションに commit-commands を追記する**

現在:
```

### 手動スキル

`/superpowers:brainstorm`, `/superpowers:write-plan`, `/superpowers:execute-plan`, `/superpowers:using-git-worktrees`, `/frontend-design`, `/parallax-section`, `/prisma-migration`, `/create-admin-page`, `/create-server-action`

```

変更後:
```

### 手動スキル

`/superpowers:brainstorm`, `/superpowers:write-plan`, `/superpowers:execute-plan`, `/superpowers:using-git-worktrees`, `/frontend-design`, `/parallax-section`, `/prisma-migration`, `/create-admin-page`, `/create-server-action`, `/commit-commands:commit`, `/commit-commands:commit-push-pr`

````

---

### Task 6: 全体検証とコミット

**Step 1: フックスクリプトの統合テスト**

```bash
# block-dangerous-bash.sh — ブロック確認
echo '{"tool_input":{"command":"rm -rf node_modules"}}' | bash .claude/hooks/block-dangerous-bash.sh || echo "correctly blocked (exit $?)"
echo '{"tool_input":{"command":"git reset --hard HEAD~1"}}' | bash .claude/hooks/block-dangerous-bash.sh || echo "correctly blocked (exit $?)"

# block-dangerous-bash.sh — 通過確認
echo '{"tool_input":{"command":"ls -la"}}' | bash .claude/hooks/block-dangerous-bash.sh && echo "correctly passed"
echo '{"tool_input":{"command":"git status"}}' | bash .claude/hooks/block-dangerous-bash.sh && echo "correctly passed"

# settings.json — JSON バリデーション
python3 -c "import json; json.load(open('.claude/settings.json')); print('settings.json: valid')"
````

**Step 2: コミット**

```bash
git add .claude/hooks/block-dangerous-bash.sh
git add .claude/hooks/notification.sh
git add .claude/agents/performance-analyzer.md
git add .claude/settings.json
git add CLAUDE.md
git commit -m "feat(claude): add dangerous-bash block hook, notification, performance-analyzer agent"
```

---

## 完了チェックリスト

- [ ] `block-dangerous-bash.sh`: `rm -rf` が exit 2 でブロックされる
- [ ] `block-dangerous-bash.sh`: `git status` が exit 0 で通過する
- [ ] `notification.sh`: Windows バルーン通知が表示される
- [ ] `settings.json`: JSON valid、Bash matcher と Notification が追加されている
- [ ] `performance-analyzer.md`: agent として `.claude/agents/` に存在する
- [ ] `CLAUDE.md`: 手動スキルに `/commit-commands:commit` が記載されている
