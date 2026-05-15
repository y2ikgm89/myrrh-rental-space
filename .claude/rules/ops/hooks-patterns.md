---
paths:
  - .claude/hooks/**
  - .claude/settings.json
  - .claude/settings.local.json
---

# Claude Code Hooks パターンルール

> 出典: `code.claude.com/docs/en/hooks`（v2.1.141+）および `.../hooks-guide`
> プロジェクト hooks の実装 SSoT。編集時に自動ロードされる。

## 公式イベント一覧（v2.1.141+ 30 events）

プロジェクトで実使用 → 詳細セクション参照。未使用 → 公式 docs 参照。新規 hook 追加時は本表を canonical 比較対象とする。

| カテゴリ                 | プロジェクト使用中                   | プロジェクト未使用（公式参照）                                                                      |
| ------------------------ | ------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Session lifecycle        | `SessionStart`                       | `Setup` / `SessionEnd`                                                                              |
| Per-turn                 | `UserPromptSubmit` / `Stop`          | `UserPromptExpansion` / `StopFailure`                                                               |
| Tool execution           | `PreToolUse` / `PostToolUse`         | `PostToolUseFailure` / `PostToolBatch` / `PermissionRequest` / `PermissionDenied`                   |
| Agent/Task               | `PostToolUse matcher: Agent`（代替） | `SubagentStart` / `SubagentStop` / `TaskCreated` / `TaskCompleted` / `TeammateIdle`                 |
| File/Config/Compact      | —                                    | `FileChanged` / `ConfigChange` / `CwdChanged` / `InstructionsLoaded` / `PreCompact` / `PostCompact` |
| Notification/Elicitation | `Notification`                       | `Elicitation` / `ElicitationResult`                                                                 |
| Worktree                 | —                                    | `WorktreeCreate` / `WorktreeRemove`                                                                 |

**新規追加判断**: 未使用 events の採用は context cost と便益のトレードオフを記述したうえで `.claude/settings.json` に書く。`InstructionsLoaded` は path-scoped rule の debug 用途で有用候補（実装した場合は `additionalContext` 不可・ログ専用）。

## Handler types（5 種類）

| type       | 用途                               | プロジェクト使用  |
| ---------- | ---------------------------------- | ----------------- |
| `command`  | shell command（stdin/stdout 経由） | ✅ 全 hook で使用 |
| `http`     | HTTP POST request                  | ❌                |
| `mcp_tool` | MCP server tool call               | ❌                |
| `prompt`   | Claude model evaluation            | ❌                |
| `agent`    | Subagent with tool access          | ❌                |

`command` 以外は MCP / 外部システム連携時のみ。詳細は公式 docs。

## 新 fields / env (v2.1.141+)

- **`terminalSequence`** — `additionalContext` 等の universal field。`/dev/tty` 書き込みの安全代替。OSC `0`/`1`/`2`/`9`/`99`/`777` + BEL のみ allowlist
- **`effort`** — common input field（tool-use context 内）。`level: "low" | "medium" | "high" | "xhigh" | "max"`
- **`CLAUDE_EFFORT`** env — Bash + hook commands 内で現在の effort level を参照
- **`CLAUDE_ENV_FILE`** env — `SessionStart` / `Setup` / `CwdChanged` / `FileChanged` hooks の persistent environment

これらは現状プロジェクト未使用。採用時は本セクションを更新する。

## イベント → stdout 流入の可否（最重要）

| イベント                                                    | stdout → Claude context                                 | 情報を Claude に届ける正規ルート                                          |
| ----------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------- |
| `SessionStart` / `UserPromptSubmit` / `UserPromptExpansion` | ✅ 直接流れる                                           | 単に stdout に書く（exit 0）                                              |
| `PreToolUse`                                                | ❌ 流れない（exit 2 + stderr で block 時のみ feedback） | `hookSpecificOutput.permissionDecisionReason` JSON                        |
| `PostToolUse` / `PostToolUseFailure`                        | ❌ 流れない                                             | `hookSpecificOutput.additionalContext` JSON                               |
| `SubagentStop` / `Stop` / `Notification`                    | ❌ 流れない                                             | context 注入不可。情報提示したい場合は `PostToolUse matcher: Task` に移設 |

**落とし穴**: `echo "warning"` を `PostToolUse` hook で出しても Claude は読まない。transcript view に一行残るだけ。必ず JSON 出力に切替える。

## Exit code セマンティクス

| Code   | 意味               | 挙動                                                               |
| ------ | ------------------ | ------------------------------------------------------------------ |
| `0`    | 成功               | stdout を JSON パース（対応イベントのみ）。action 続行             |
| `2`    | Blocking           | stdout 無視、stderr → エラーメッセージ。block 可能イベントのみ有効 |
| その他 | 非 Blocking エラー | stderr 先頭行のみ表示、action 続行                                 |

**block 可能イベント (exit 2 で action 阻止)**: `PreToolUse` / `PermissionRequest` / `UserPromptSubmit` / `UserPromptExpansion` / `Stop` / `SubagentStop` / `TeammateIdle` / `TaskCreated` / `TaskCompleted` / `ConfigChange` / `PreCompact` / `PostToolBatch` / `Elicitation` / `ElicitationResult` / `WorktreeCreate`

**block 不可イベント**（既に発生済み・進行中）: `PostToolUse` / `PostToolUseFailure` / `StopFailure` / `PostCompact` / `Notification` / `SubagentStart` / `SessionStart` / `Setup` / `SessionEnd` / `CwdChanged` / `FileChanged` / `WorktreeRemove` / `InstructionsLoaded`

**禁止**: exit 2 + JSON stdout の混在。Claude は exit 2 のとき stdout を無視する。

## hookSpecificOutput.additionalContext パターン（bash + jq）

```bash
#!/usr/bin/env bash
set -euo pipefail
: "${CLAUDE_PROJECT_DIR:=$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

INPUT=$(cat)
# ... ロジック ...

if [ -n "${CONTEXT:-}" ]; then
  jq -n --arg ctx "$CONTEXT" '{
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: $ctx
    }
  }'
fi
exit 0
```

`hookEventName` はイベント名と一致必須。typo すると silent ignore。

## 非同期実行: async / asyncRewake

| フラグ                | 用途                                                                           | 例                      |
| --------------------- | ------------------------------------------------------------------------------ | ----------------------- |
| `"async": true`       | 非ブロッキング実行。結果は取得しない（fire-and-forget）                        | prettier / eslint fix   |
| `"asyncRewake": true` | 非ブロッキング実行。**exit 2 のときだけ** Claude を wake up して stderr を注入 | Stop hook の type-check |

**asyncRewake の無限ループ対策**: `Stop` hook で `asyncRewake: true` + exit 2 は Claude を再活動させるため、再度 Stop 時に hook が再発火する。必ず `stop_hook_active` フィールドを見て 2 回目以降は exit 0 で終了させる:

```bash
STOP_HOOK_ACTIVE=$(printf '%s' "$INPUT" | jq -r '.stop_hook_active // false')
if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
  exit 0  # wake chain を断つ
fi
```

## `if` フィールドで発火を絞る（v2.1.85+）

permission rule 構文で tool 引数まで評価。process spawn 削減に使う。

```json
{
  "matcher": "Bash",
  "hooks": [
    { "type": "command", "if": "Bash(mv *)", "command": "..." },
    { "type": "command", "if": "Bash(rm *)", "command": "..." },
    {
      "type": "command",
      "if": "Bash(bunx --bun prisma migrate *)",
      "command": "..."
    }
  ]
}
```

- **OR 条件は複数 handler で表現**: `if: "A|B"` は不可、同じ command を別 handler に並べる（公式: identical commands は自動 dedupe）
- **`if` は tool events のみ有効**: `PreToolUse` / `PostToolUse` / `PostToolUseFailure` / `PermissionRequest`

## SessionStart `source` 分岐パターン

`compact` 時は context 圧縮で失われた state を再注入するのが公式推奨。

```bash
SOURCE=$(printf '%s' "$INPUT" | jq -r '.source // "startup"')
if [ "$SOURCE" = "compact" ]; then
  echo "Branch: $(git rev-parse --abbrev-ref HEAD)"
  git log --oneline -5 | sed 's/^/  /'
  echo "Uncommitted: $(git status --short | wc -l) files"
fi
```

matcher で分離する方法もあるが、単一スクリプト内で分岐した方が保守しやすい。

## SubagentStop の代替: PostToolUse matcher `Agent`

`SubagentStop` は stdout が context に届かない。subagent 完了後に git snapshot 等を注入したい場合は **`PostToolUse` の `matcher: "Agent"`** に移設する。`Agent` tool（Claude Code v2.1.63 で `Task` から rename。alias は残るが新規記述は `Agent` に統一）は subagent dispatch に使われるため、完了タイミングと一致する。

```json
{
  "matcher": "Agent",
  "hooks": [
    { "type": "command", "command": "...post-subagent-git-snapshot.sh" }
  ]
}
```

## Windows (MINGW64) 固有の注意

- `$CLAUDE_PROJECT_DIR` には Windows 形式のパス（`G:\workspace\...`）が入る。bash hook では `cd "$CLAUDE_PROJECT_DIR"` で問題なく扱えるが、正規表現マッチでは MINGW 形式（`/g/workspace/...`）に正規化が必要（`block-dangerous-bash.sh` 参照）
- `set -euo pipefail` + `$CLAUDE_PROJECT_DIR` 直接参照は unset 時に unbound variable で fail する。手動テストや fallback 対応のため `: "${CLAUDE_PROJECT_DIR:=$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"` を先頭に置く
- `jq` は GnuWin32 / MSYS2 経由で必須（欠落時 silent fail を避けるため `command -v jq` で確認）
- `PYTHONUTF8=1` を `.claude/settings.json` env に設定済み（CP932 ロケール問題の恒久対策。Hookify plugin の json 読み込み対策含む）

## 設定ファイル配置と優先順位

| 場所                          | スコープ         | 共有可否      |
| ----------------------------- | ---------------- | ------------- |
| `.claude/settings.json`       | プロジェクト全体 | ✅ git commit |
| `.claude/settings.local.json` | 個人ローカル     | ❌ gitignore  |
| `~/.claude/settings.json`     | 全プロジェクト   | ❌ マシン固有 |

本プロジェクトは `.claude/settings.json` を SSoT とし、permissions の実値トークン等のみ `.local.json` に置く。

## 手動テスト手順

```bash
# UserPromptSubmit hook の JSON 検証
echo '{}' | bash .claude/hooks/inject-current-date.sh | jq .

# Stop hook の stop_hook_active guard 検証
echo '{"stop_hook_active":true}' | bash .claude/hooks/type-check-on-stop.sh
echo "EXIT=$?"  # 0 期待

# PostToolUse hook の Bash if フィルタ効果確認（mv/rm/git mv 以外では発火しない）
echo "plain echo should not trigger detect-empty-route-dirs"

# 設定 JSON validation
python3 -c "import json; json.load(open('.claude/settings.json', encoding='utf-8'))"

# 全 hook の syntax チェック
bash -n .claude/hooks/*.sh
```

## よくある誤り（検出 grep）

```bash
# PostToolUse hook で stdout を echo している（silent に無視される）
grep -lE '^echo ' .claude/hooks/*.sh | while read f; do
  grep -q 'PostToolUse\|SubagentStop' "$f" && echo "⚠️ $f: stdout は context に届かない"
done

# Stop hook に stop_hook_active guard がない
grep -L 'stop_hook_active' .claude/hooks/type-check-on-stop.sh && echo "⚠️ guard 欠落"

# additionalContext の hookEventName typo
grep -rE 'hookEventName.*:' .claude/hooks/ | grep -vE '(UserPromptSubmit|PostToolUse|PreToolUse|SessionStart)'
```

## State 注入 hook の sync 規律

- **`session-start.sh` 等の project state 注入 hook は plan format 変更と sync 必須** — `PLANS_DIR` パス + status marker grep pattern (`> **In Progress:` / `> **Snapshot:` + `> **Completed:`) は CLAUDE.md handoff memory spec に追従。drift 検出: `echo '{}' | bash .claude/hooks/session-start.sh` で「進行中の計画 (なし)」が出るが実態存在するなら pattern drift の silent bug（PLANS_DIR / grep / 両方）。実例: 2026-05-13 で `docs/plans` (不在) vs 実態 `docs/superpowers/plans/` + 旧 `^**ステータス**:` pattern を修正

## 関連ドキュメント

- 公式: `code.claude.com/docs/en/hooks` / `.../hooks-guide`
- プロジェクト: `.claude/settings.json`（SSoT）、各 `.claude/hooks/*.sh`
- 公式仕様 drift 検出: `/audit-claude-config` SKILL（`.claude/skills/audit-claude-config/`）— 手動 invoke のみ、context 常時消費ゼロ
- ADR: 不要（公式仕様に準拠するのみ、プロジェクト独自厳格化なし）
