---
description: Gotchas — Import Alias / shadcn/ui / Route Handler (PPR) / Claude Code 設定
paths:
  - src/**
  - .claude/**
  - tsconfig.json
---

# Gotchas — Claude Code / Import Alias / shadcn / Route Handler

## Import Alias

- **内部モジュールの `import { X as Y }` 禁止** — 名前衝突は namespace import（`import * as settingsCommands from "..."`）で解決。`settingsCommands.updateTaxSettings()` のように呼び出す
- **許容される alias**: 第三者ライブラリの primitive リネームのみ（`Command as CommandPrimitive`、`Toaster as SonnerToaster`）
- **パススルーラッパー関数禁止** — 何も追加しない `async function X() { return XQuery(); }` は削除。直接 import して使う
- **barrel export の不要な型リネーム禁止** — `export type { FooInput as Foo }` は消費者がいない場合は削除。元の名前でそのまま export する
- **`utils.ts` は非推奨 re-export barrel** — FormData ヘルパーは `@/shared/lib/form-data`、`generateSlug` は `@/shared/lib/slug` が正本。`utils.ts` に新規 import・新関数追加禁止。`cn` は `@/shared/lib/cn`、日付フォーマットは `@/shared/lib/date-format`、`withRetry` は `@/shared/lib/action-helpers`

## shadcn/ui コンポーネント

- **`import * as React from "react"` 禁止** — shadcn/ui 再生成時に混入する。`import type { ComponentProps } from "react"` 等の個別 import に変換。`React.ComponentProps` → `ComponentProps`、`React.HTMLAttributes` → `HTMLAttributes`
- **`<SelectItem value="">` 禁止** — Radix UI Select は空文字列をプレースホルダー表示用に予約しており、`value=""` はランタイムエラー。nullable 選択にはセンチネル値パターンを使用: `const NONE_VALUE = "__none__"` → `<SelectItem value={NONE_VALUE}>なし</SelectItem>` → `onValueChange` で `value === NONE_VALUE ? null : value` にマップ

## Route Handler（PPR 環境）

- **Route Handler の catch ブロックに `unstable_rethrow(error)` 必須** — PPR (`cacheComponents: true`) 環境では Route Handler GET のプリレンダリング時に `request.headers` アクセスで bail out エラーがスローされる。catch で握り潰すと `logError` が ERROR 出力しビルドログにノイズ。`unstable_rethrow(error)` を catch 先頭に配置して Next.js 内部エラーを再スロー

- **`export const dynamic = 'force-dynamic'` は PPR 環境で使用不可** — `cacheComponents: true` と Route Segment Config は非互換（ビルドエラー）。公式: 「全ページがデフォルトで動的のため不要」

## Claude Code 設定

- **Serena memory の正式名は rule ファイルが定める名前を使う** — 公開デザイン方針は `.claude/rules/frontend/design-system-memory.md` が正式名 `design-system` を定義している。過去の類似名（`design-system-public-pages` 等）の stale memory が残っていても参照しない（旧テーマ・旧スケールが混入する）。`read_memory("design-system")` が未存在なら `write_memory` で新規作成し、`.claude/rules/frontend/project-design-config.md` を初期値とする
- **機能削除・大規模リネーム時は `.claude/rules/**/_.md`+`AGENTS.md`+`.codex/rules/\*\*/_.md`+`**tests**/**/\*.ts`+`.serena/memories/**/_.md`を必ず grep** — コード・seed を消しても、rule docs / unit・integration テスト / Serena memory が古い関数名・列名・slug・旧ライブラリ名を「必須」として参照し続けると、次セッションで誤情報として自動ロードされ、pre-existing test failure として CI を継続的に汚す（実例:`/journal`廃止後`SYSTEM_PAGES`テストが`"journal"`を期待したまま残存、Supabase→R2 移行後`.serena/memories/project_overview.md`に旧 stack が残存して次セッション誤ロード）。大規模除去の canonical grep は`grep -rln "<keyword>" src/ prisma/ .github/ .claude/ .codex/ .serena/ AGENTS.md CLAUDE.md docs/ Dockerfile cloudbuild.yaml .env_`— 実装・設定・自動ロード系を一括カバー
- **`revise-claude-md` はセッション終了直前に呼ぶ** — CLAUDE.md はプロジェクトレベルのプロンプトキャッシュ層。セッション中に変更するとそれ以降のターンのキャッシュがすべて破壊される
- **スキルは必ず Skill ツールで呼ぶ（Task ツール不可）** — `plugin:name` や `ns:name` 形式のスキルも同様。Task ツールの `subagent_type` に指定すると `Agent type not found` エラー。CLAUDE.md スキルテーブルで `（Task）` 注釈のないものは全て Skill ツール呼び出し
- **subagent-driven-development の密結合タスクは 1 implementer にバンドル** — 複数タスクが互いに型依存しており中間状態で `type-check` が broken になる場合（例: 旧 API 削除 → 新 UI 追加 → 新ルート作成 → 旧ルート削除）、個別 dispatch せず単一 implementer に全タスクを渡す。plan の commit 分割は維持したまま N コミット作成することで spec 遵守とクリーン状態復帰を両立できる。spec reviewer は bundle 全体を 1 回でレビュー
- **plan の schema 前提は実行時に検証** — `writing-plans` で作成した plan が「この列にマイグレーション」「この列を select に追加」等の指示を含む場合、実行前に必ず `grep -A20 "^model <Model>" prisma/schema.prisma` で現行スキーマと照合する。plan 作成時点で存在した列が削除されている / 存在しない列を前提にすることがある（例: `AdminNotification.linkUrl` を前提にしたが実態は `notification-helpers.ts` の render-time 算出だった）。implementer は前提の齟齬を発見したら BLOCKED ではなく justified deviation として報告してよい
- **MCP ツールはセッション開始前に確定させる** — セッション途中で `.mcp.json` を変更したり MCP サーバーを追加・削除するとツール定義のプレフィックスが変わりキャッシュが破壊される
- **新規 hook スクリプトは `bash` 明示呼び出し** — MINGW64 で `chmod` が Bash deny されるため、`settings.json` の `command` は `bash "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/script.sh"` 形式で記述する
- **hook スクリプトの `grep` + `pipefail` 罠** — `set -euo pipefail` 下で `var=$(cmd | grep pattern | head -1)` は grep 不一致（exit 1）でスクリプトが無音終了・stderr なし。根本解決: `if ! cmd | grep -qE 'pattern'; then exit 0; fi`（`if` 条件式内は `set -e` 対象外が Bash 仕様）
- **lefthook の YAML `run:` block に `"` を含めると実行時 shell syntax error** — lefthook は `sh -c "..."` wrapper で hook を起動するため、YAML literal block scalar (`run: |`) / single-line double-quoted / single-quoted いずれの形式でも内部 `"` が外側 sh -c の閉じ quote と衝突する。対処: 外部 `scripts/*.sh` に抽出して `run: bash scripts/x.sh` で呼び出す。参照実装: `scripts/check-protected-files.sh` / `scripts/check-commit-msg.sh`
- **lefthook 2.x は `core.hooksPath` 設定済みで `prepare` を exit 1 で失敗させる** — `bun install` / `bun update` 後に `postinstall`→`prepare`→`lefthook install` が走り、local `core.hooksPath` が設定されていると `Error: core.hooksPath is set locally` で失敗する（1.x の silent no-op から仕様変更）。**推奨対処**: `bunx lefthook install --reset-hooks-path` で local 設定を unset + 再インストール（設定値が git デフォルトの `.git/hooks` 相当なら動作差異ゼロ）。`--force` は設定を残したまま強制上書きするため根本解決にならない。`git config --local --get core.hooksPath; echo $?` で現状確認（exit 1 = 未設定）
- **Subagent report は必ず独立検証する** — implementer の「commit SHA: xxx」「EXIT: 0」報告を鵜呑みにせず、次タスク dispatch 前に `git log --oneline -N` + `git show --stat HEAD` で実在確認する。報告内容と git state の乖離は稀だが発生する（特に安価なモデルを implementer に使った場合）。乖離検出時は同じタスクをより上位モデルで再 dispatch
- **Implementation サブエージェントに haiku を使わない** — ファイル編集 + commit を伴うタスクで haiku モデルは Bash/Edit ツール呼び出しを省略し成功報告を捏造することがある。`Agent` tool の `model: "haiku"` オプションは read-only 調査（Explore 等）のみで使用し、implementer には sonnet 以上を指定する
- **Explore subagent のファイル名 hallucination** — Explore エージェントは調査結果に実在しないファイルパス（例: `color-swatch-picker.tsx` / `day-view.tsx` 等、それらしいが存在しないパス）を混ぜることがある。大量の発見を報告してきた場合は `Glob` / `Read` で実在確認してから対処する。特に「さらに徹底調査」指示後の報告は hallucination 率が上がる傾向
- **監査 subagent の grep ベース報告は実体検証が必須** — code-quality reviewer 等が grep ヒット数や hallucination で違反を報告することがある。実例: (1) `((calculatedPrice / hourlyPrice) * 10) / 10` のような算術式が JSX IIFE `{(() => ...)()}` パターンとして偽陽性検出される、(2) `select.tsx` の `required` マーク欠落と報告されたが既に実装済み、(3) `Prisma` 値 import 5 ファイルと報告されたが実態は全て `import type`（`verbatimModuleSyntax` で完全 erase）。**ground truth は `bun run lint` exit 0 + Read による source 直接確認**。grep カウントだけで修正に着手しない
- **WebFetch 業界調査 subagent は取得成否を ground truth に固定** — Airbnb / Booking.com / Spacemarket / Hotels.com / Aesop / Cereal Magazine 等は bot ブロック（403）または SPA で初期 HTML が空になり実装パターンが取得不能。subagent に「業界標準は X」と結論させる場合、dispatch プロンプトで ① 取得成功サイトのみを ground truth にする ② アクセス不可サイトは「アクセス不可」と明記してスキップ ③ NN/g / Baymard / Material / Polaris 等の公式ガイドは WebFetch で本文確認してから引用、を明示する。複数ソース収束を最終判断材料にし、1 サイトの観測から業界論を展開させない
- **agent report の「既に完了済み」「変更不要」主張は git diff で逆検証必須** — implementer は「ADR は既に Accepted 状態」「ファイルは既に存在」等を報告するが、同じ report 内の numstat で該当ファイルの 1 行変更が実際に発生していることがある（2026-04-22 B.5-1 dispatch で ADR 0017 の `Proposed → Accepted` 1 行変更を「既に Accepted」と誤報告、`docs/guides/admin/style-library.md` 新規作成を「既に存在」と誤報告）。典型的に**実装は正しく、report 文言のみが不正確**（実害なし）だが、commit 前に `git diff --stat <file>` + `git diff <file>` で実態確認を必ず挟む。「変更不要」主張 + numstat 非ゼロの組み合わせを検出したら実態を優先して記録する
- **path-scoped rule auto-load は context を大量消費する** — `.claude/rules/frontend/*.md` 等は該当パス配下のファイルを Read したタイミングで system-reminder として一括注入される（1 ファイル数百〜数千行 × 複数が同時）。大規模 plan 実行前に context 予算を立て、worktree + rules path の Read が多数見込まれる場合は **第一 Read より前に chunk 分割 + session 跨ぎ handoff の判断** を controller 側で行う。途中注入で中盤枯渇すると implementer dispatch 直前に force-terminate せざるを得ない silent bug（2026-04-22 Section Architecture Phase B.4 で実発生）
- **1-commit BREAKING plan 実行時は implementer に commit 禁止 + controller 最終統合** — `docs/superpowers/plans/` の phase 分割が「1 commit で完結」を指定している場合、subagent-driven-development デフォルト（implementer が commit）は plan spec 違反。dispatch プロンプトに 🚫 `git add / commit` を明記し、controller 側で全 chunk 完了後に 1 commit でまとめる。chunk 間の中間状態で type-check broken は許容（bundle scope のため）
- **lefthook commit-msg hook は Conventional Commits 準拠型のみ許容** — `refactor|feat|fix|perf|test|docs|chore|ci|style|build|revert` のみ、`wip` / `partial` / `merge` 等は拒否（exit 1 で commit 失敗）。中間 commit でも「最終 squash 前提」の場合は `refactor(scope): ... (Phase X.Y partial)` のように type を正規化する。canonical regex は `scripts/check-commit-msg.sh`。`git commit -m "wip(sections): ..."` は lefthook commit-msg hook で拒否される silent bug（2026-04-22 Section Architecture Phase B.4 partial commit で実発生）
- **`PostToolUse:Agent` hook の git snapshot は main worktree のみを表示** — worktree 作業中に subagent 完了後、hook 出力の「uncommitted」欄は main worktree 基準で subagent 成果が見えない。controller は必ず worktree 内で `git status --short` + `git diff --stat HEAD` を直接実行して独立検証する。hook snapshot を信用して「変更なし」と誤判定すると、subagent 成果を「消えた」と勘違いして同じ task を再 dispatch する事故につながる（2026-04-22 Section Architecture Phase B.4 の C1-C4 implementer 完了後に実観測）
