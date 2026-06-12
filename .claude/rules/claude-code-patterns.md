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
- [ ] rule: `paths:` glob は rule の**実関心範囲**に絞る（over-broad glob は無関係 file へ rule 全文を注入し context を浪費 → `/audit-claude-config` の `injection-cost.ts` で計測）。例: React component 限定 rule に `src/**/*.ts`（純ロジック）を含めない / auth rule に `src/shared/**` 全体を含めない。狭小化前に concept-grep で「rule を必要とする実在 file」を全網羅できるか coverage 検証する（guidance 喪失防止）。cross-cutting（型アサーション・コード品質等）は `src/**/*.{ts,tsx}` が正当。**ただし `src/**/\*.{ts,tsx}` を使う rule は 1 ファイル 100 行以内必須\*\*（超過時は narrow-path detail file に分割）— 現状 20 ファイル・2270 行超の injection が auto-compact を加速する根本原因（2026-06-12 実測）。詳細例・grep コマンドを narrow-path sub-file へ移動し本体は概要のみに保つ
- [ ] skill: SKILL.md 500 行未満、`description` + `when_to_use` 合算 1,536 文字以下、reference は `reference/*.md` 分割
- [ ] agent: 公式 frontmatter フィールドのみ、独自フィールド禁止
- [ ] agent `memory: project` 宣言時は `.claude/agent-memory/<name>/` 実体を必ず作成
- [ ] 新カテゴリはドメイン分類に統合検討、メタ分類禁止

自動 drift 監査は `/audit-claude-config` skill で実行可能。

## 本プロジェクト固有 harness gotchas（最重要のみ）

- **`revise-claude-md` はセッション終了直前** — プロジェクトレベルのプロンプトキャッシュ層、中途変更で以降全ターンの cache が破壊
- **スキルは必ず Skill ツール経由（Agent ツール不可）** — `plugin:name` / `ns:name` 形式も同様
- **MCP ツールはセッション開始前に確定** — 途中変更で MCP プレフィックスが変わりキャッシュ破壊
- **`/model` スイッチでキャッシュ全失効** — セッション中のモデル切替は全コンテキストのキャッシュキーをリセットし、以降全ターンでキャッシュミスが発生する（各モデルは独自のキャッシュキーを持つ、公式 costs docs 実証済）。使用モデルはセッション開始時に固定し、切り替える必要がある場合は `/clear` 後に新セッションで行う
- **新規 hook スクリプトは exec form 必須** — MINGW64 で `chmod` deny のため `{"command": "bash", "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/script.sh"]}` 形式（Shell form 禁止、詳細は `ops/hooks-patterns.md` §Hook command 形式）
- **`bash -c` 診断スクリプトは末尾 `exit 0` 必須** — `[ -f ... ] && echo ...` で締めると、最終反復で file 不在時に `[` が exit 1 を返し、`&&` 短絡で last command exit code が 1 となりスクリプト全体が exit 1。並列 tool call all-or-nothing semantics で同 message の他 tool call が **silent cancel** される（実例: 2026-05-27 audit Phase 1 で `find -maxdepth 1 -type d` の最終 dir `zod-patterns/` に対応する top-level `zod-patterns.md` 不在で 5 件の WebFetch が巻き添えキャンセル）。診断系 `bash -c` は末尾 `exit 0` か全 `&&` を `|| true` で締める
- **path-scoped rule auto-load は context 大量消費** — `.claude/rules/frontend/*.md` は該当ファイル Read 時に system-reminder で一括注入し compaction まで context を占有（公式 context-window 仕様）。glob が広い × rule が大きいほど無関係な編集で恒常的に token を浪費するため、glob は実関心範囲に絞る（→ §チェックリスト + `injection-cost.ts`）。大規模 plan は context 予算を立て、worktree + rules path Read が多数なら chunk 分割 + session 跨ぎ handoff 判断
- **Implementer subagent thrashing 後は controller 直接続行が canonical** — 再 dispatch は同じ rule 再注入で再 thrashing。controller は rules 読み込み済 + worktree path キャッシュ効くため efficient
- **Read 直後 parallel Edit batch は途中で race** — 1 turn で N file Read → 同 turn で N+ Edit parallel は最初の 1-2 件のみ成功。安全策: Edit を sequential、または `replace_all: true` で 1 Edit にまとめる
- **Subagent report は git で独立検証必須** — `git log --oneline -N` + `git show --stat HEAD` で実在確認、報告捏造を検出
- **Implementation subagent に haiku 禁止** — Bash/Edit 呼び出し省略 + 成功報告捏造リスク、sonnet 以上
- **lefthook 2.x は `core.hooksPath` 設定済みで `prepare` を exit 1 で失敗** — `bunx lefthook install --reset-hooks-path` で local 設定 unset + 再 install
- **Goal hook 条件が両カバー選択肢を含むなら AskUserQuestion スキップして即実装** — どちらでも goal 満たすので確認冗長
- **Playwright MCP HMR キャッシュ罠** — Edit/Write 直後の `browser_navigate` は古い bundle キャッシュ、`browser_evaluate("() => window.location.reload()")` で強制 reload
- **Playwright UI 検証で作成した dev DB データは検証後に削除** — テキスト選択 → コメント追加等の実フロー検証は dev DB にレコード（コメント/予約/スレッド等）を実際に作る。検証後に `bun -e` の Prisma 直接アクセス（→ §管理画面ログイン URL の config-object 形式）で削除し dev DB を汚さない。未保存の editor state（マーク等）は保存しなければ DB 不変だが、Server Action 経由の作成は即永続化される点に注意
- **hover/focus 依存 UI の Playwright 計測は pointer 位置に汚染される** — `browser_click` 後はマウスがその要素上に残り `group-hover` が発火したまま。`opacity-0 group-hover:opacity-100` 等の既定非表示を計測するときは先に `browser_hover` で対象外（ツールバー等）へ移動してから `getComputedStyle().opacity` を読む。キーボード経路（`focus-visible`）は実 `Tab` キーで検証する
- **`bun -e` Prisma 直接アクセス canonical** — `@/shared/db/prisma` は `server-only` で blocked、`new PrismaClient({ adapter: new PrismaPg({ connectionString }) })` の config-object 形式で直接 instantiate（`scripts/generate-login-url.ts` 参照）
- **handoff memo 完遂時は同セッションで削除 + `MEMORY.md` index 除去** — 残ると次セッション「未完了」と誤読
- **管理画面ログイン URL は `bun scripts/generate-login-url.ts`** — dev (`NODE_ENV === "development"`) は proxy.ts が Gate bypass + `/admin/login` に SUPER_ADMIN ワンクリックボタン
- **並列プリミティブ選択は `.claude/rules/parallel-orchestration.md` が SSoT** — main / fork / named-subagent / background / worktree隔離 / agent-team / Workflow の選択マトリクス。要点: ① `/fork`（v2.1.161 既定有効）は同一コンテキスト side task に安い（親キャッシュ共有）、`CLAUDE_CODE_FORK_SUBAGENT=1` グローバル化は逆効果で非設定 ② background subagent（`background:true`/Ctrl+B/`claude agents`）は持続的並列の選択肢 ③ agent-teams は experimental につき不採用 ④ `Workflow` tool（ハーネス提供・公式 docs 外）は多次元監査/レビューの決定論的 fan-out で opt-in（常時 ON にしない）
