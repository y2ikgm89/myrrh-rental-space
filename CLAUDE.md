# CLAUDE.md

> Myrrh Rental Space — レンタルスペース予約管理システム / Cloud Run デプロイ（`Dockerfile` + `cloudbuild.yaml`）
> 詳細は path-scoped rule (`.claude/rules/**/*.md`) で auto-load。技術スタック実バージョン SSoT: [`package.json`](package.json) + [`bun.lock`](bun.lock)、機能列挙は [`AGENTS.md`](AGENTS.md#tech-stack)。

<!-- 公式 (code.claude.com/docs/en/memory) 準拠: 200 行未満 / 詳細はすべて path-scoped rule auto-load。barrel index 禁止 / 独自分類禁止 / `paths:` なし常時 load rule 禁止 -->

## コマンド

```bash
bun dev                                       # 開発サーバー（Turbopack、手動管理）
bun run validate                              # 作業中 type-check + lint
bun run validate && bun run build             # コミット前必須
bun run test:unit / test:integration / e2e    # per-directory バッチ
bunx --bun prisma migrate dev --name <name>   # マイグレーション
bun run db:seed                               # Seed
bun outdated && bun update                    # 依存更新（メジャーは upgrade-deps SKILL 経由、後 validate 必須）
```

保護ファイル（PreToolUse hook で deny）: `.env*` / `bun.lock` / `prisma/migrations/*.sql`

## アーキテクチャ

Multiple Root Layouts: `(admin)/` `(public)/` で CSS・認証・レイアウト完全分離（遷移はフルページリロード）。preview は本番同等 UI/UX 提供のため `(public)/preview/{posts,news,pages}/` 配下で `(public)` root layout を共有（Next.js 公式 Multiple Root Layouts ガイドライン「完全に異なる UI/experience」用途と整合）。
管理 write 系は `executeAdminMutationResult`（認証・権限・監査ログ一括処理）。API Route のみ `checkPermission()` 直接。
公開コンテンツ: `/posts` `/news` `/spaces` `/events` `/faq`、RSS `/feed.xml`。

詳細: `.claude/rules/project-structure.md` / `.claude/rules/frontend/project-design-config.md`。

## クリティカルルール（CLAUDE.md には禁止の宣言のみ、詳細は rule auto-load）

### 型・コード品質

- **型アサーション `as` 禁止** — 型ガード・`satisfies`・Zod `safeParse`（例外 6 種類は `type-safety/assertion-bans.md`）
- **`useCallback`/`useMemo`/`memo` 禁止** — React Compiler 1.0 自動メモ化（`react/compiler/auto-memo.md`）
- **ハードコードカラー / `text-[10px]` / className テンプレートリテラル禁止** — `cn()` + semantic token（`tailwind-patterns/theme-tokens.md`）
- **ステータス・公開状態ラベルのハードコード禁止** — `enums/helpers.ts` の `*_STATUS_LABELS` / `PUBLISH_LABELS`

### アーキテクチャ境界

- **app 層からの Prisma 直 import 禁止** — domain/lib 経由、enum/型は `enums/prisma-types` ゲートウェイ（`architecture-boundaries.test.ts`）
- **`"use server"` ファイルは async 関数のみ export 可** — 型・定数は `<file>-types.ts` に退避（`server-actions/export-contract.md`）
- **内部 helper は `import "server-only"`、Server Action endpoint は `"use server"` を使い分け**（`server-only-patterns.md`）
- **server-only 定数を Client Component から import 禁止** — client-safe ファイルに分離
- **Cloud Run probe (`/api/live` `/api/health`) は proxy.ts rate-limit 除外必須**（`ops/deployment-patterns.md`）
- **管理画面 preview は `(public)/preview/{posts,news,pages}/` 配下で `(public)` root layout 共有** — 本番同等 chrome (site-header / footer / mobile-nav / analytics) 継承、admin auth は `verifyAdminSession()` 明示。URL 生成は `@/shared/lib/preview-routes` SSoT
- **Next.js 16 Server Action / RSC は `react-server` condition** — Lexical 等 DOM 依存は client 完結、Server Action は事前 render 済 contentHtml を受け取る（`frontend/lexical/conventions.md`）
- **scripts/seed/db:\* は Bun runtime + `bunx --bun prisma` 必須** — `node:*` / `dotenv` / `.mjs` 新規禁止（`bun-patterns.md`）
- **Serena MCP は LSP symbol query 専用** — Read/Edit/Grep/Glob は Claude Code native、`write_memory` は user 明示要求時のみ

### Validation / Domain

- **`executeAdminMutationResult` 監査ログは fire-and-forget 契約** — `execute → await afterSuccess → fireAndForget(logAction)`（`server-actions/implementation/admin-actions.md`）
- **管理画面 form は conform `useActionState` + `executeConformMutation` canonical** — React Hook Form 廃止、Server Action は `(prev, formData) => SubmissionResult` signature（`frontend/admin-ui/forms.md` / `frontend/admin-ui/dialogs.md` / `frontend/admin-inline-editor-patterns.md`）
- **外部 API 統合は SSoT ヘルパー経由必須** — `sendEmail()` / `withGoogleApiRetry()` / `withInstagramApiRetry()` / `validateTurnstile()` / `uploadFile()` / `deleteFile()`
- **配列 uniqueness は Zod スキーマ層で契約** — UI 層の Set dedup 禁止（`zod-patterns/array-uniqueness.md`）
- **管理ユーザー階層制御は 2 層防御** — UI `getInvitableRoles()` + domain `canInviteRole()` / `canModifyUser()`
- **ドメインコマンドの actor 引数は `{ id; role }` オブジェクト** — 単独 `actorUserId: string` 禁止
- **GCal outbound sync は attendees 空 + description marker + fireAndForget**（`ical-patterns.md`）
- **Turnstile** — 未認証公開フォーム必須、認証済みでも高リスク操作は許容、参照系は不要
- **datetime-local は `formatDateTimeLocalInJst` / `parseDateTimeLocalAsJst`** — `new Date(localStr)` は tz 依存で 9h ずれる silent bug
- **Section schema canonical は `definitions/<type>/schema.ts`** — `safeParse({})` 成立必須（required field に `.default()`、`ssot-singletons.md`）
- **`PortableTextSpan[]` / `PortableTextBlock[]` の JSX truthy gate 禁止** — `.length > 0` で gate（空配列も truthy）

### UI / UX

- **全 interactive 要素は WCAG 2.5.5 AAA 44×44 CSS px**（Button 全 size で `min-h-11`、checkbox/radio は wrapper）
- **カードグリッドは Container Queries、マクロは viewport breakpoint** — `@md:grid-cols-2 @3xl:grid-cols-3`
- **arbitrary sizing は @theme token 経由** — `--hero-min-height` 等、3 回以上で @theme 昇格
- **画像 overlay は solid scrim 必須** — alpha scrim は axe-core `bgGradient` incomplete → production violation 昇格
- **DB フェッチ公開ルートは `loading.tsx` + `error.tsx` 必須 / spinner-only 禁止** — `Skeleton` 経由、admin は `FormLoading` / `EditorLoading` / `DetailLoading` SSoT
- **Multiple Root Layouts で `app/not-found.tsx` 禁止** — `app/global-not-found.tsx` + `experimental.globalNotFound: true`
- **公開サインインは Better Auth Client API `signIn.email({ callbackURL })`** — Server Action 経由禁止（Router Cache 未更新の silent bug）
- **Section schema 拡張は `_shared/{buttons,image,layout}.ts` factory 経由** — 独自 inline schema 禁止

## プロセス

詳細は path-scoped rule auto-load: `research-audit.md` / `implementation-patterns.md` / `git-migration.md` / `ops/ci-workflow.md` / `test-quality.md` / `bun-patterns.md`。

### 検証

- **作業中**: `bun run type-check` / **完了前**: `bun run validate` / **コミット前**: `bun run validate && bun run build`
- **完遂判定は `test:unit` + `test:integration` 両走必須**
- ローカルは関連ファイルのみ `bun test <path>`、フルは `bun run test:unit` / `test:integration`（`scripts/run-tests.ts` per-file isolation）
- E2E は 2 層分離: `e2e/smoke/*` は毎 push required、広域 `e2e/{public,authenticated,a11y}/` は PR `e2e` label opt-in

### Subagent / Worktree

- **Implementer dispatch は `subagent-dispatch-template` SKILL 経由**、implementer は sonnet 以上（haiku 禁止）、完了報告は git で独立検証
- **Worktree は公式 `claude --worktree <name>`** — `.claude/worktrees/<name>/` + `.worktreeinclude` で gitignored copy、終了時 changes なしで自動 cleanup。Subagent 隔離は `isolation: worktree`

### ワークフロー

`要件確認 → 調査 → 設計 → 計画 → 実装(TDD) → 検証 → レビュー → 完了`

- 計画: `brainstorming` → `writing-plans`（specs/plans: `docs/superpowers/`）。意図明確時は Q&A スキップ
- 実行: `subagent-driven-development` / `executing-plans`
- 完了: `verification-before-completion` → `finishing-a-development-branch`

### `/clear` トリガー（kitchen sink session 対策）

公式 best-practices §Avoid common failure patterns "The kitchen sink session" 対策。下記いずれかに該当したら `/clear` 推奨を user に明示する（自動実行はしない）:

- **タスク完遂 + 次が無関係トピック** — 直前の topic と次の prompt が異なる domain（auth / UI / migration / docs 等）
- **同じ問題で 2 回以上修正失敗** — context が失敗 approach で汚染、specific prompt で再 start
- **auto-compaction が同セッションで 2 回以上発火** — `PreCompact` hook が signal を注入
- **statusline `ctx %` が 80% 超 + 残タスクあり** — context budget 不足、続行で performance 劣化
- **subagent dispatch 2 件連続 thrash** — controller も rule auto-load で重い、別セッション推奨

## 自動完遂ポリシー

タスク完了点で、ユーザー確認なしで commit → push → PR → **auto-merge 予約** まで自動進行し**即次タスクに移る**。CI watch で blocking しない（GitHub 側が CI pass + branch protection 満たした時点で自動 squash merge する）。「進めて」等の明示承認は **不要**。下記 gate のいずれか fail で停止。

| Gate        | 内容                                                                        | fail 時                  |
| ----------- | --------------------------------------------------------------------------- | ------------------------ |
| 1. branch   | main 直編集なら `<type>/<topic>` 切替                                       | 自動切替                 |
| 2. 例外     | 下記停止例外 scan                                                           | 停止                     |
| 3. 検証     | `bun run validate && bun run build` exit 0                                  | 停止                     |
| 4. commit   | 明示ファイル指定 + Conventional Commits + Co-Authored-By                    | 停止                     |
| 5. push     | `git push -u origin <branch>`（lefthook pre-push）                          | 停止                     |
| 6. PR       | `gh pr create --base main` Summary + Test plan                              | 停止                     |
| 7. auto-mrg | `gh pr merge --auto --squash --delete-branch` で予約 → 即次タスク           | 停止                     |
| 8. CI fail  | GitHub 通知 or 次セッション開始時に検出（auto-merge は CI fail なら停まる） | root cause fix → 再 push |
| 9. sync     | 次セッション開始 or 明示 `git pull --ff-only`、gone branch は `/clean_gone` | 停止                     |

### PR 粒度（業界 consensus: Google eng-practices / Atlassian / SmartBear / GitHub / Conventional Commits）

**1 PR = 1 logical change**。行数 soft limit **300 行 / 10 file**（超過は分割検討、`CL size` 業界目安 200-400 LOC）。

| ケース                                                                     | 粒度                                                                        |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 単独 fix / 単独 feat                                                       | 1 PR                                                                        |
| **fix-of-fix 連鎖**（同 file の続き fix、まだ open + 未 merge）            | **同 branch に追加 commit + push**（新 PR 作成しない、auto-merge 予約継続） |
| 関連 component の同 motivation 修正（例: spaces + events 両方の price UI） | 1 PR                                                                        |
| 独立 topic 並列（別 domain / 別 concern）                                  | 別 PR                                                                       |
| schema / auth / payment / >300 行 / >10 file / 停止例外該当                | 必ず別 PR（rollback 単位、レビュー集中）                                    |

### 停止例外

- breaking schema (`DROP COLUMN` / 型 narrowing / required 化 / table rename)
- `.env*` 編集 / 新規 env 変数 / `bun.lock` 予期せぬ変更
- 10 file 超 / 1000 行超 / `prisma/migrations/*.sql` 含む大規模（PR 粒度 hard limit）
- 当該タスクと無関係な untracked / modified（並行作業）
- destructive (`reset --hard` / `migrate reset` / `--no-verify` / hook bypass)
- 機密情報混入疑い / test fail / 過去 60 分で PR 3 件以上自動 merge（暴走 detect）
- ユーザーが調査・相談・brainstorming 継続中（実装明示指示なし）

### override

「コミットしないで」「自動で進めないで」「step by step」「PR 作らないで」等の明示指示で停止。

### 事故防止 infra

- **lefthook**: pre-commit (eslint --fix + prettier + `check-protected-files.sh`) / pre-push (type-check + `architecture-boundaries.test.ts`) / commit-msg (`check-commit-msg.sh` Conventional Commits 強制)
- **`block-dangerous-bash.sh`**: `git push --force` / `rm -rf` / `chmod` を deny
- **GitHub branch protection**: main 直 push 禁止 + required checks
- **Stop hook `type-check-on-stop.sh`**: 背景型チェックで silent regression 検出

## SSoT / Claude Code 公式準拠

- 主要 SSoT singleton: `.claude/rules/ssot-singletons.md`（src/prisma 編集時 auto-load）
- 監査例外: `.claude/rules/audit-exceptions.md`
- `.claude/` 配下は 5 層構造（Memory / Rules / Subagents / Skills / Hooks）のみ — `claude-code-patterns.md`（`.claude/**` 編集時 auto-load）
- 全 rule docs は path-scoped frontmatter 必須（常時 load 禁止）
- md スタイル: CommonMark 0.31.2 + GFM + markdownlint → `markdown-style.md`
- バージョン値・「最終更新: YYYY-MM-DD」マーカー・`.archive/` ・`docs/reference/` 再導入禁止
