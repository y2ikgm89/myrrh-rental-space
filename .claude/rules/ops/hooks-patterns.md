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

- **`terminalSequence`** — `additionalContext` 等の universal field。`/dev/tty` 書き込みの安全代替。OSC `0`/`1`/`2`/`9`/`99`/`777` + BEL のみ allowlist。**Notification hook で採用済**（下記 §Notification hook 公式 terminalSequence パターン）
- **`effort`** — common input field（tool-use context 内）。`level: "low" | "medium" | "high" | "xhigh" | "max"`
- **`CLAUDE_EFFORT`** env — Bash + hook commands 内で現在の effort level を参照
- **`CLAUDE_ENV_FILE`** env — `SessionStart` / `Setup` / `CwdChanged` / `FileChanged` hooks の persistent environment

`effort` / `CLAUDE_EFFORT` / `CLAUDE_ENV_FILE` は現状プロジェクト未使用。採用時は本セクションを更新する。

## Notification hook 公式 terminalSequence パターン

公式 (`code.claude.com/docs/en/hooks#notification`):

> Hooks run without a controlling terminal, so writing escape sequences directly to `/dev/tty` fails. Instead, return the escape sequence in the `terminalSequence` field and Claude Code emits it for you through its own terminal write path. This is race-free, works inside tmux and GNU screen, and works on Windows where there is no `/dev/tty`.

### 採用パターン（subprocess spawn なし / cross-platform）

```bash
#!/usr/bin/env bash
set -euo pipefail
INPUT=$(cat)
TITLE="Claude Code"
BODY=$(printf '%s' "$INPUT" | jq -r '.message // "Needs your attention"')

# OSC 9 (Windows Terminal / iTerm2 / ConEmu / WezTerm) + OSC 777 (urxvt / Ghostty / Warp) + BEL
SEQ=$(printf '\033]9;%s: %s\007\033]777;notify;%s;%s\007\007' "$TITLE" "$BODY" "$TITLE" "$BODY")

jq -nc --arg seq "$SEQ" '{terminalSequence: $seq}'
```

### Notification の matcher（公式 notification_type）

| matcher 値             | 発火条件                                |
| ---------------------- | --------------------------------------- |
| `permission_prompt`    | tool permission を user に確認するとき  |
| `idle_prompt`          | user input を待つ idle 状態に入ったとき |
| `auth_success`         | 認証成功時                              |
| `elicitation_dialog`   | MCP elicitation dialog 表示時           |
| `elicitation_complete` | elicitation 完了時                      |
| `elicitation_response` | elicitation 応答時                      |

本プロジェクトは `permission_prompt|idle_prompt` のみ採用（`auth_success` / `elicitation_*` は不要のため除外し process spawn 削減）。

### 禁止パターン

- **PowerShell / osascript / notify-send で subprocess spawn**（旧仕様）— hook 起動毎の process 起動コスト + race condition + platform 限定。`terminalSequence` で公式 cross-platform 経路に統一
- **`/dev/tty` 直接書き込み** — hook は controlling terminal なしで実行されるため fail（公式仕様）
- **`OSC 8` (hyperlink) / `OSC 52` (clipboard write) / `OSC 1337`** — 公式 security allowlist 外で reject される

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

## Hook command 形式（Exec form + 明示インタプリタが公式正規）

Claude Code 公式（`code.claude.com/docs/en/hooks#exec-form-vs-shell-form`）の Windows 制約:

> On Windows, exec form requires `command` to resolve to a real executable such as a `.exe`. `.cmd` / `.bat` / `.sh` shims are not executables and cannot be spawned without a shell.

つまり Windows では `.sh` を `command` に直接置くと `CreateProcess` が **`EFTYPE: inappropriate file type or format, uv_spawn`** で fail する。公式正規パターンは **`command: "bash"` + `args: ["<path>"]`** でインタプリタを明示する:

```json
// ✅ OK: 公式正規パターン（cross-platform、Windows/macOS/Linux 同一動作）
{
  "type": "command",
  "command": "bash",
  "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/foo.sh"]
}

// ❌ NG: Windows で EFTYPE エラー（.sh を直接 spawn 不可）
{
  "type": "command",
  "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/foo.sh",
  "args": []
}

// ❌ NG: Shell form（旧仕様、quoting fragile）
{
  "type": "command",
  "command": "bash \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/foo.sh"
}
```

**`command: "bash" + args` パターンの利点**:

1. **`bash` は Windows の Git Bash / WSL / Linux / macOS で同名 binary として常時利用可能** — `CreateProcess` / `posix_spawn` 両環境で実行可能
2. **`args` 配列で argument boundaries が明確** — special character pass-through、shell tokenization なし
3. **`${CLAUDE_PROJECT_DIR}` placeholder を Claude Code が直接 replace** — bash variable expansion とは別 layer、quoting issue ゼロ
4. **shebang `#!/usr/bin/env bash` は bash 内部で解釈** — bash が `.sh` を読み込む経路で POSIX 仕様準拠

**他のインタプリタ採用パターン**（公式 example 通り、cross-platform 動作保証）:

```json
// Node script — node.exe は Windows でも .exe binary
{ "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/format.js"] }

// Python script
{ "command": "python3", "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/foo.py"] }

// Bun script
{ "command": "bun", "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/foo.ts"] }
```

**禁止**:

- `command` に `.sh` / `.cmd` / `.bat` を直接書く（Windows で EFTYPE）
- Shell form (`bash "$CLAUDE_PROJECT_DIR/..."`) への復活（quoting fragile）

**監査 grep**:

```bash
# .sh / .cmd / .bat を command に直接書いている entry を検出
python3 -c "
import json
d = json.load(open('.claude/settings.json', encoding='utf-8'))
for sec, entries in d['hooks'].items():
  for entry in entries:
    for h in entry['hooks']:
      cmd = h.get('command', '')
      if cmd.endswith(('.sh', '.cmd', '.bat')):
        print(f'EFTYPE risk: {sec} - {cmd}')
"
```

## Windows (MINGW64) 固有の注意

- **`${CLAUDE_PROJECT_DIR}` placeholder** には Windows 形式のパス（`G:\workspace\...`）が exec form 経由で expand される。bash hook では `cd "$CLAUDE_PROJECT_DIR"` で問題なく扱えるが、正規表現マッチでは MINGW 形式（`/g/workspace/...`）に正規化が必要（`block-dangerous-bash.sh` 参照）
- **`set -euo pipefail` + `$CLAUDE_PROJECT_DIR` 直接参照は unset 時に unbound variable で fail**。手動テスト（`echo '{}' | bash hook.sh`）や fallback 対応のため `: "${CLAUDE_PROJECT_DIR:=$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"` を先頭に置く。**全 hook 統一適用済**（2026-05-15 監査）
- **`jq` は GnuWin32 / MSYS2 経由で必須**（欠落時 silent fail を避けるため `command -v jq` で確認）
- **`PYTHONUTF8=1`** を `.claude/settings.json` env に設定済み（CP932 ロケール問題の恒久対策。Hookify plugin の json 読み込み対策含む）
- **新規 hook 作成手順**（chmod / executable bit 不要 — bash 経由起動のため）:
  1. `.claude/hooks/<name>.sh` を `#!/usr/bin/env bash` shebang で作成
  2. `set -euo pipefail` + `: "${CLAUDE_PROJECT_DIR:=$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"` fallback を冒頭に
  3. `.claude/settings.json` に **`command: "bash"` + `args: ["${CLAUDE_PROJECT_DIR}/.claude/hooks/<name>.sh"]`** で登録（公式正規パターン）
  4. `echo '{...}' | bash .claude/hooks/<name>.sh` で手動 smoke test
  5. `python3 -c "import json; json.load(open('.claude/settings.json', encoding='utf-8'))"` で JSON validation

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

## Edit drift 予防（PostToolUse 自動整形の対象選定）

PostToolUse の自動 format hook（`prettier-format.sh` / `eslint-fix.sh` 等）は Edit/Write 直後にファイル内容を書き換えるため、**直後の Edit で `old_string` が drift する Edit エラーの主因**。Markdown 系は特にインラインコード周辺の空白詰め・bold/italic の正規化で頻発する。

### Markdown / YAML を除外する設計

```bash
# .claude/hooks/prettier-format.sh
[[ "$FILE_PATH" =~ \.(ts|tsx|js|jsx|css|json)$ ]] || exit 0
#                                              ^^^^^ md / yaml / yml は含めない
```

**フォールバック**: lefthook `pre-commit:prettier-fix` job（`lefthook.yml`）が staged Markdown / YAML を commit 時に一括整形する設計。Edit エラー予防とコード品質の両立。

### 対象選定の判断基準

| 拡張子           | PostToolUse 自動整形 | pre-commit 整形 | 根拠                                                                            |
| ---------------- | -------------------- | --------------- | ------------------------------------------------------------------------------- |
| `.ts` / `.tsx`   | ✅ 有                | ✅              | Edit 後の構文 fix が必須（trailing comma 等）、drift リスクは型エラーで早期検出 |
| `.js` / `.jsx`   | ✅ 有                | ✅              | 同上                                                                            |
| `.json`          | ✅ 有                | ✅              | 機械可読性、drift リスク低い                                                    |
| `.css`           | ✅ 有                | ✅              | 機械可読性                                                                      |
| `.md`            | ❌ **除外**          | ✅              | インラインコード周辺空白詰めで Edit drift 頻発                                  |
| `.yml` / `.yaml` | ❌ **除外**          | ✅              | quote 形式変更で drift                                                          |

**禁止**: PostToolUse `prettier-format.sh` の正規表現に `md` / `yml` / `yaml` を復活させる（Edit drift 再発）。

### Edit エラー発生時の対処（運用 fallback）

1. **`String to replace not found`**: 直前に PostToolUse hook が走った可能性 → Read で実体再確認 → 再 Edit
2. **2 回連続失敗**: Write で全面書き換えに切替（Edit より高コストだがコスト的に合理的）
3. **`File has not been read yet`**: 同一会話内で初 Read が必須（Edit ツール仕様）
4. **`security_reminder_hook.py` false positive**: 同内容を `Write` で書き出すと bypass 可能（hook は Edit に強反応、Write はスルー傾向）

## State 注入 hook の sync 規律

- **`session-start.sh` 等の project state 注入 hook は plan format 変更と sync 必須** — `PLANS_DIR` パス + status marker grep pattern (`> **In Progress:` / `> **Snapshot:` + `> **Completed:`) は CLAUDE.md handoff memory spec に追従。drift 検出: `echo '{}' | bash .claude/hooks/session-start.sh` で「進行中の計画 (なし)」が出るが実態存在するなら pattern drift の silent bug（PLANS_DIR / grep / 両方）。実例: 2026-05-13 で `docs/plans` (不在) vs 実態 `docs/superpowers/plans/` + 旧 `^**ステータス**:` pattern を修正

## 関連ドキュメント

- 公式: `code.claude.com/docs/en/hooks` / `.../hooks-guide`
- プロジェクト: `.claude/settings.json`（SSoT）、各 `.claude/hooks/*.sh`
- 公式仕様 drift 検出: `/audit-claude-config` SKILL（`.claude/skills/audit-claude-config/`）— 手動 invoke のみ、context 常時消費ゼロ
- ADR: 不要（公式仕様に準拠するのみ、プロジェクト独自厳格化なし）
