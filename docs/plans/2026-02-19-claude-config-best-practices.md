# .claude/ 公式ベストプラクティス準拠 実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** `.claude/` ディレクトリを Claude Code 公式ドキュメント（hooks/sub-agents/skills）の推奨パターンに完全準拠させる

**Architecture:** hook の project/local 分割・`$CLAUDE_PROJECT_DIR` 使用・legacy `commands/` 削除・skill/agent フロントマター修正の 9 タスク構成。設定ファイルのみの変更でアプリコードへの影響なし。

**Tech Stack:** Claude Code hooks (bash), YAML frontmatter, JSON settings

**参照設計書:** `docs/plans/2026-02-19-claude-config-best-practices-design.md`

---

### Task 1: `.claude/settings.json` 新規作成（プロジェクト共有フック）

**背景:** 公式ドキュメントより「プロジェクト共有フックは `.claude/settings.json` に定義し git 管理する」。現状は `settings.local.json` に定義されており非共有。

**Files:**

- Create: `.claude/settings.json`

**Step 1: ファイルを作成**

```json
{
  "enableAllProjectMcpServers": true,
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/prettier-format.sh",
            "statusMessage": "Formatting...",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

**Step 2: 確認**

```bash
cat .claude/settings.json
```

期待: 上記 JSON が出力される

---

### Task 2: `settings.local.json` から hooks / enableAllProjectMcpServers を削除

**背景:** Task 1 で共有設定に移動したため、`settings.local.json` から重複項目を削除する。`permissions`（allow/deny）は個人用のため `settings.local.json` に残す。

**Files:**

- Modify: `.claude/settings.local.json`

**Step 1: ファイルを以下の内容に書き換え**

`enableAllProjectMcpServers` と `hooks` セクションを削除し、`permissions` のみ残す:

```json
{
  "permissions": {
    "allow": [
      "Read",
      "Write",
      "Edit",
      "Glob",
      "Grep",
      "LS",
      "WebSearch",
      "WebFetch",
      "Task",
      "TodoWrite",
      "NotebookEdit",
      "Bash",
      "Bash(rm -rf .next)",
      "Bash(rm -rf node_modules)",
      "Bash(rmdir /s /q .next)",
      "Bash(rmdir /s /q node_modules)",
      "Skill",
      "mcp__*",
      "mcp__context7__resolve-library-id",
      "mcp__context7__query-docs",
      "mcp__codex__codex",
      "mcp__codex__codex-reply",
      "mcp__ide__getDiagnostics",
      "mcp__plugin_serena_serena__get_current_config",
      "mcp__plugin_serena_serena__activate_project",
      "mcp__plugin_serena_serena__check_onboarding_performed",
      "mcp__plugin_serena_serena__onboarding",
      "mcp__plugin_serena_serena__initial_instructions",
      "mcp__plugin_serena_serena__read_file",
      "mcp__plugin_serena_serena__create_text_file",
      "mcp__plugin_serena_serena__list_dir",
      "mcp__plugin_serena_serena__find_file",
      "mcp__plugin_serena_serena__replace_content",
      "mcp__plugin_serena_serena__get_symbols_overview",
      "mcp__plugin_serena_serena__find_symbol",
      "mcp__plugin_serena_serena__find_referencing_symbols",
      "mcp__plugin_serena_serena__replace_symbol_body",
      "mcp__plugin_serena_serena__insert_after_symbol",
      "mcp__plugin_serena_serena__insert_before_symbol",
      "mcp__plugin_serena_serena__rename_symbol",
      "mcp__plugin_serena_serena__search_for_pattern",
      "mcp__plugin_serena_serena__execute_shell_command",
      "mcp__plugin_serena_serena__write_memory",
      "mcp__plugin_serena_serena__read_memory",
      "mcp__plugin_serena_serena__list_memories",
      "mcp__plugin_serena_serena__edit_memory",
      "mcp__plugin_serena_serena__delete_memory",
      "mcp__plugin_serena_serena__switch_modes",
      "mcp__plugin_serena_serena__think_about_collected_information",
      "mcp__plugin_serena_serena__think_about_task_adherence",
      "mcp__plugin_serena_serena__think_about_whether_you_are_done",
      "mcp__plugin_serena_serena__prepare_for_new_conversation",
      "mcp__plugin_playwright_playwright__browser_navigate",
      "mcp__plugin_playwright_playwright__browser_snapshot",
      "mcp__plugin_playwright_playwright__browser_click",
      "mcp__plugin_playwright_playwright__browser_type",
      "mcp__plugin_playwright_playwright__browser_fill_form",
      "mcp__plugin_playwright_playwright__browser_take_screenshot",
      "mcp__plugin_playwright_playwright__browser_console_messages",
      "mcp__plugin_playwright_playwright__browser_close",
      "mcp__plugin_playwright_playwright__browser_wait_for",
      "mcp__plugin_playwright_playwright__browser_evaluate",
      "mcp__plugin_playwright_playwright__browser_handle_dialog",
      "mcp__plugin_playwright_playwright__browser_press_key",
      "mcp__plugin_playwright_playwright__browser_run_code",
      "mcp__plugin_playwright_playwright__browser_install",
      "mcp__plugin_playwright_playwright__browser_hover",
      "mcp__plugin_playwright_playwright__browser_resize",
      "mcp__plugin_playwright_playwright__browser_tabs",
      "mcp__plugin_playwright_playwright__browser_select_option",
      "mcp__plugin_playwright_playwright__browser_drag",
      "mcp__plugin_playwright_playwright__browser_navigate_back",
      "mcp__plugin_playwright_playwright__browser_network_requests",
      "mcp__plugin_playwright_playwright__browser_file_upload"
    ],
    "deny": [
      "Bash(rm -rf:*)",
      "Bash(rm -r:*)",
      "Bash(sudo:*)",
      "Bash(chmod:*)",
      "Bash(format:*)",
      "Bash(del /s:*)",
      "Bash(del /q:*)",
      "Bash(rd /s:*)",
      "Bash(rmdir /s:*)",
      "Read(./.env)",
      "Read(./.env.*)",
      "Write(.env)",
      "Write(.env.local)",
      "Write(.env.*)",
      "Edit(.env)",
      "Edit(.env.local)",
      "Edit(.env.*)"
    ]
  }
}
```

**Step 2: 確認**

```bash
cat .claude/settings.local.json | python -m json.tool
```

期待: JSON パースエラーなし、`hooks` キーと `enableAllProjectMcpServers` キーが存在しない

---

### Task 3: `prettier-format.sh` のハードコードパス修正

**背景:** 公式ドキュメント「Use `$CLAUDE_PROJECT_DIR` to reference hook scripts relative to the project root」。現状のハードコードパスは PC 移行で壊れる。

**Files:**

- Modify: `.claude/hooks/prettier-format.sh`

**Step 1: スクリプトを書き換え**

```bash
#!/usr/bin/env bash
# PostToolUse hook: Run Prettier on edited/written files
# Receives tool event JSON on stdin

set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null || echo "")

[ -z "$FILE_PATH" ] && exit 0

# Only format source files (skip generated, lock files, etc.)
[[ "$FILE_PATH" =~ \.(ts|tsx|js|jsx|css|json|md)$ ]] || exit 0
[[ "$FILE_PATH" =~ (node_modules|\.next|bun\.lockb|\.generated\.) ]] && exit 0

# Run Prettier from project root (hooks run with Claude Code's environment)
cd "$CLAUDE_PROJECT_DIR" || exit 0

bunx --bun prettier --write "$FILE_PATH" --log-level=silent 2>/dev/null || true

exit 0
```

**Step 2: 確認（スクリプトを実際に読んで `G:/` が含まれないことを確認）**

```bash
grep -n "G:/" .claude/hooks/prettier-format.sh
```

期待: 出力なし（ハードコードパスが削除されている）

---

### Task 4: `commands/` ディレクトリを削除

**背景:** 公式ドキュメント「Custom slash commands have been merged into skills. Skills take precedence over commands.」3 ファイルすべて `skills/` に上位版あり。

**Files:**

- Delete: `.claude/commands/lexical-node.md`
- Delete: `.claude/commands/lexical-plugin.md`
- Delete: `.claude/commands/lexical-toolbar.md`

**Step 1: 削除**

```bash
rm -rf .claude/commands/
```

**Step 2: 確認**

```bash
ls .claude/commands/ 2>&1
```

期待: `No such file or directory`

---

### Task 5: `.claude/plans/` 空ディレクトリを削除

**背景:** 空ディレクトリ。公式 Claude Code の機能ではない。`docs/plans/` と混同を招く。

**Files:**

- Delete: `.claude/plans/` (空ディレクトリ)

**Step 1: 削除**

```bash
rmdir .claude/plans/
```

**Step 2: 確認**

```bash
ls .claude/plans/ 2>&1
```

期待: `No such file or directory`

---

### Task 6: `.gitignore` に `agent-memory-local/` を追加

**背景:** 公式ドキュメント「`memory: local` scope: `.claude/agent-memory-local/<name>/` — project-specific but should not be checked into version control」。現状は gitignore 未登録。

**Files:**

- Modify: `.gitignore`

**Step 1: Claude Code セクションに追記**

現在の `.gitignore` の Claude Code セクション（行 72-73）:

```
# Claude Code local files
.claude/logs/
.claude/state/
.claude/memory/
```

以下を追加:

```
.claude/agent-memory-local/
```

**Step 2: 確認**

```bash
git check-ignore -v .claude/agent-memory-local/verification/MEMORY.md
```

期待: `.gitignore:NN:.claude/agent-memory-local/  .claude/agent-memory-local/verification/MEMORY.md`

---

### Task 7: `prisma-migration` スキル — `disable-model-invocation: true` 追加

**背景:** このスキルはユーザーが明示的に `/prisma-migration` で起動するワークフロー。Claude が自動的に呼び出すべきではない（マイグレーション実行は副作用あり）。

**Files:**

- Modify: `.claude/skills/prisma-migration/SKILL.md`

**Step 1: フロントマターに `disable-model-invocation: true` を追加**

現在のフロントマター:

```yaml
---
name: prisma-migration
description: >
  Generate and run a Prisma migration after schema changes. ...
---
```

変更後:

```yaml
---
name: prisma-migration
description: >
  Generate and run a Prisma migration after schema changes. Analyzes what
  changed in schema.prisma, suggests a migration name, runs the migration,
  and regenerates the Prisma client. Use after editing prisma/schema.prisma.
argument-hint: "[migration-name]"
disable-model-invocation: true
---
```

**Step 2: 確認**

```bash
head -10 .claude/skills/prisma-migration/SKILL.md
```

期待: `disable-model-invocation: true` が含まれる

---

### Task 8: `ui-ux-pro-max` スキル — `disable-model-invocation: true` 追加

**背景:** このスキルは Python スクリプト (`scripts/search.py`) を実行するツール。引数付きのユーザー起動が前提で、Claude の自動呼び出しは不適切。

**Files:**

- Modify: `.claude/skills/ui-ux-pro-max/SKILL.md`

**Step 1: フロントマターに `disable-model-invocation: true` を追加**

現在のフロントマター:

```yaml
---
name: ui-ux-pro-max
description: "UI/UX design intelligence. ..."
---
```

変更後（`description` の後に追加）:

```yaml
---
name: ui-ux-pro-max
description: "UI/UX design intelligence. 50 styles, 21 palettes, 50 font pairings, 20 charts, 8 stacks (React, Next.js, Vue, Svelte, SwiftUI, React Native, Flutter, Tailwind). Actions: plan, build, create, design, implement, review, fix, improve, optimize, enhance, refactor, check UI/UX code. Projects: website, landing page, dashboard, admin panel, e-commerce, SaaS, portfolio, blog, mobile app, .html, .tsx, .vue, .svelte. Elements: button, modal, navbar, sidebar, card, table, form, chart. Styles: glassmorphism, claymorphism, minimalism, brutalism, neumorphism, bento grid, dark mode, responsive, skeuomorphism, flat design. Topics: color palette, accessibility, animation, layout, typography, font pairing, spacing, hover, shadow, gradient."
argument-hint: "<keyword> --domain <domain> --stack nextjs"
disable-model-invocation: true
---
```

**Step 2: 確認**

```bash
head -8 .claude/skills/ui-ux-pro-max/SKILL.md
```

期待: `disable-model-invocation: true` が含まれる

---

### Task 9: `security-reviewer` エージェント — `memory: project` 追加

**背景:** セキュリティレビューは繰り返し実施される。プロジェクト固有のセキュリティパターン（例：`withPermission` HOF の使用状況、Instagram OAuth の CSRF 検証箇所）を蓄積することでレビュー精度が向上する。

**Files:**

- Modify: `.claude/agents/security-reviewer.md`

**Step 1: フロントマターに `memory: project` を追加**

現在のフロントマター末尾:

```yaml
tools:
  - Read
  - Grep
  - Glob
model: sonnet
```

変更後:

```yaml
tools:
  - Read
  - Grep
  - Glob
model: sonnet
memory: project
```

**Step 2: 確認**

```bash
head -15 .claude/agents/security-reviewer.md
```

期待: `memory: project` が含まれる

---

### Task 10: git ステータス確認とコミット

**Step 1: 変更内容を確認**

```bash
git status .claude/ .gitignore
```

期待:

- `.claude/settings.json` — new file
- `.claude/settings.local.json` — modified
- `.claude/hooks/prettier-format.sh` — modified
- `.claude/commands/` — deleted (3 files)
- `.claude/skills/prisma-migration/SKILL.md` — modified
- `.claude/skills/ui-ux-pro-max/SKILL.md` — modified
- `.claude/agents/security-reviewer.md` — modified
- `.gitignore` — modified

**Step 2: diff で変更内容を最終確認**

```bash
git diff .claude/hooks/prettier-format.sh .claude/settings.local.json .gitignore
```

**Step 3: コミット**

```bash
git add .claude/settings.json \
        .claude/settings.local.json \
        .claude/hooks/prettier-format.sh \
        .claude/skills/prisma-migration/SKILL.md \
        .claude/skills/ui-ux-pro-max/SKILL.md \
        .claude/agents/security-reviewer.md \
        .gitignore
git rm -r .claude/commands/
git commit -m "chore(claude): align .claude/ with official best practices

- Move Prettier hook to .claude/settings.json (project-shared)
- Fix prettier-format.sh: use \$CLAUDE_PROJECT_DIR instead of hardcoded path
- Add statusMessage and timeout to Prettier hook
- Remove .claude/commands/ (merged into skills/ per official docs)
- Remove .claude/plans/ (empty, non-official directory)
- Add .claude/agent-memory-local/ to .gitignore (memory: local scope)
- Add disable-model-invocation: true to prisma-migration and ui-ux-pro-max skills
- Add memory: project to security-reviewer agent"
```

**Step 4: コミット確認**

```bash
git log --oneline -3
```

期待: 最新コミットに上記メッセージが表示される
