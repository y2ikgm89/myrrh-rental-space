---
description: Claude Code 公式仕様 5 層構造と本プロジェクト固有 harness gotchas
paths:
  - .claude/**
---

# Claude Code Patterns

`.claude/` 配下は公式仕様 (`code.claude.com/docs/en/{memory,sub-agents,skills,settings,hooks}`) のみで構成する。独自機能の新設禁止。

## 公式 5 層 / frontmatter

| 層        | 公式パス                                                   | 必須 frontmatter                         |
| --------- | ---------------------------------------------------------- | ---------------------------------------- |
| Memory    | `CLAUDE.md` / `~/.claude/projects/<slug>/memory/MEMORY.md` | なし (plain markdown)                    |
| Rules     | `.claude/rules/**/*.md`                                    | `description` 任意 + **`paths:` 必須**   |
| Subagents | `.claude/agents/<name>.md`                                 | `name` `description` のみ必須            |
| Skills    | `.claude/skills/<name>/SKILL.md`                           | `description` 推奨 (合算 1,536 文字上限) |
| Hooks     | `.claude/settings.json` の `hooks` + `.claude/hooks/*.sh`  | n/a                                      |

詳細フィールド表は公式 docs を SSoT とする (URL 上記)。

## skill content lifecycle

- skill invoke 後、SKILL.md content は session 全体に残る（recurring token cost）
- auto-compaction で 5000 token/skill 維持、合計 25000 token budget
- → SKILL.md 500 行未満を維持、reference は別ファイル
- `disable-model-invocation: true` Skill は Skill tool 経由不可、`user-invocable: true` 併用で `/skill-name` 起動経路を確保 (本プロジェクトでは 7 SKILL: audit-claude-config / create-section-type / debug-cloud-run / debug-google-calendar / debug-instagram / debug-stripe / debug-turbopack)

## 撤回済み独自パターン (再導入禁止)

| パターン                     | 撤回理由               | 公式代替                          |
| ---------------------------- | ---------------------- | --------------------------------- |
| barrel index (TOC のみ rule) | context 浪費           | 子 rule の path-scoped auto-load  |
| process barrel               | 公式は常時ロード最小限 | path-scoped + skill 統合          |
| gotchas メタ分類             | ドメイン rule と重複   | ドメイン rule 末尾の `## Gotchas` |
| ADR system                   | 公式機能ではない       | path-scoped rule 本文 + git log   |
| `docs/plans/` 二重構造       | 運用区別困難           | `docs/superpowers/plans/` 単一    |

## チェックリスト (新規作成時)

- [ ] rule: `paths:` frontmatter 必須（常時ロード禁止）
- [ ] rule: `paths:` glob が実在ファイルにマッチ（dir 移動・rename で stale 化 → `/audit-claude-config` の `check-stale-paths.ts` で検出）
- [ ] skill: SKILL.md 500 行未満、`description` + `when_to_use` 合算 1,536 文字以下、reference は `reference/*.md` 分割
- [ ] agent: 公式 frontmatter フィールドのみ、独自フィールド禁止
- [ ] agent `memory: project` 宣言時は `.claude/agent-memory/<name>/` 実体を必ず作成
- [ ] 新カテゴリはドメイン分類に統合検討、メタ分類禁止

自動 drift 監査は `/audit-claude-config` skill で実行可能。

## 本プロジェクト固有 harness gotchas（最重要のみ）

- **`revise-claude-md` はセッション終了直前** — プロジェクトレベルのプロンプトキャッシュ層、中途変更で以降全ターンの cache が破壊
- **スキルは必ず Skill ツール経由（Agent ツール不可）** — `plugin:name` / `ns:name` 形式も同様
- **MCP ツールはセッション開始前に確定** — 途中変更で MCP プレフィックスが変わりキャッシュ破壊
- **新規 hook スクリプトは exec form 必須** — MINGW64 で `chmod` deny のため `{"command": "bash", "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/script.sh"]}` 形式（Shell form 禁止、詳細は `ops/hooks-patterns.md` §Hook command 形式）
- **`bash -c` 診断スクリプトは末尾 `exit 0` 必須** — `[ -f ... ] && echo ...` で締めると、最終反復で file 不在時に `[` が exit 1 を返し、`&&` 短絡で last command exit code が 1 となりスクリプト全体が exit 1。並列 tool call all-or-nothing semantics で同 message の他 tool call が **silent cancel** される（実例: 2026-05-27 audit Phase 1 で `find -maxdepth 1 -type d` の最終 dir `zod-patterns/` に対応する top-level `zod-patterns.md` 不在で 5 件の WebFetch が巻き添えキャンセル）。診断系 `bash -c` は末尾 `exit 0` か全 `&&` を `|| true` で締める
- **path-scoped rule auto-load は context 大量消費** — `.claude/rules/frontend/*.md` は該当ファイル Read 時に system-reminder で一括注入。大規模 plan は context 予算を立て、worktree + rules path Read が多数なら chunk 分割 + session 跨ぎ handoff 判断
- **Implementer subagent thrashing 後は controller 直接続行が canonical** — 再 dispatch は同じ rule 再注入で再 thrashing。controller は rules 読み込み済 + worktree path キャッシュ効くため efficient
- **Read 直後 parallel Edit batch は途中で race** — 1 turn で N file Read → 同 turn で N+ Edit parallel は最初の 1-2 件のみ成功。安全策: Edit を sequential、または `replace_all: true` で 1 Edit にまとめる
- **Subagent report は git で独立検証必須** — `git log --oneline -N` + `git show --stat HEAD` で実在確認、報告捏造を検出
- **Implementation subagent に haiku 禁止** — Bash/Edit 呼び出し省略 + 成功報告捏造リスク、sonnet 以上
- **lefthook 2.x は `core.hooksPath` 設定済みで `prepare` を exit 1 で失敗** — `bunx lefthook install --reset-hooks-path` で local 設定 unset + 再 install
- **Goal hook 条件が両カバー選択肢を含むなら AskUserQuestion スキップして即実装** — どちらでも goal 満たすので確認冗長
- **Playwright MCP HMR キャッシュ罠** — Edit/Write 直後の `browser_navigate` は古い bundle キャッシュ、`browser_evaluate("() => window.location.reload()")` で強制 reload
- **`bun -e` Prisma 直接アクセス canonical** — `@/shared/db/prisma` は `server-only` で blocked、`new PrismaClient({ adapter: new PrismaPg({ connectionString }) })` の config-object 形式で直接 instantiate（`scripts/generate-login-url.ts` 参照）
- **handoff memo 完遂時は同セッションで削除 + `MEMORY.md` index 除去** — 残ると次セッション「未完了」と誤読
- **管理画面ログイン URL は `bun scripts/generate-login-url.ts`** — dev (`NODE_ENV === "development"`) は proxy.ts が Gate bypass + `/admin/login` に SUPER_ADMIN ワンクリックボタン
