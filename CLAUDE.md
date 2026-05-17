# CLAUDE.md

> Myrrh Rental Space — レンタルスペース予約管理システム
> デプロイ: Google Cloud Run（`Dockerfile` + `cloudbuild.yaml`）— Vercel 不使用

<!-- 公式ガイド (code.claude.com/docs/en/memory) 準拠: 200 行未満 / プロセス・実装パターンは path-scoped rule (.claude/rules/**) で auto-load / 手順 skill は .claude/skills/<name>/SKILL.md -->

## コマンド

```bash
# 初回: bun install → bunx --bun prisma migrate dev → bun run db:seed
bun dev                                       # 開発サーバー（Turbopack）
bun run validate                              # type-check → lint（作業中）
bun run validate && bun run build             # 完全検証（コミット前必須）
bun run build:skip-env                        # env 未設定時ビルド
bun run test:unit / test:integration / test:all / e2e  # per-directory バッチ、簡略化禁止
PLAYWRIGHT_VISUAL=1 bunx playwright test --project=chromium-visual [--update-snapshots]
bunx --bun prisma migrate dev --name <name>   # マイグレーション
bun run db:seed                               # Seed
bun run analyze / lhci                        # bundle 解析 / Lighthouse CI
bun outdated && bun update                    # 依存更新（メジャー更新は upgrade-deps SKILL 経由、実行後 validate 必須）
```

保護ファイル（PreToolUse hook で編集拒否）: `.env*` / `bun.lock` / `prisma/migrations/*.sql`

## アーキテクチャ

Multiple Root Layouts: `(admin)/` と `(public)/` で CSS・認証・レイアウトを完全分離（遷移はフルページリロード）。
第 3 root layout `(preview)/` は管理画面向けプレビュー専用（`ManagedPageSections` を共有）。
管理 write 系は `executeAdminMutationResult`（認証・権限・監査ログ一括処理）。API Route のみ `checkPermission()` 直接使用。
公開コンテンツ: `/posts`（ブログ）・`/news`・`/spaces`・`/events`・`/faq`。RSS: `/feed.xml`。

詳細: `.claude/rules/project-structure.md` / `.claude/rules/frontend/project-design-config.md`（path-scoped で auto-load）。
技術スタックの実バージョン SSoT: [`package.json`](package.json) + [`bun.lock`](bun.lock)。採用機能の列挙は [`AGENTS.md`](AGENTS.md#tech-stack)。

---

## クリティカルルール

> 詳細・参照実装・例外は path-scoped rules（`.claude/rules/**/*.md`）で自動ロード。

### 型・コード品質

- **型アサーション（`as`）禁止** — 型ガード・`satisfies`・Zod `safeParse` を使う（→ `type-safety.md`）
- **`useCallback`/`useMemo`/`memo` 禁止** — React Compiler 1.0 が自動メモ化（→ `react/compiler.md`）
- **ハードコードカラー禁止** — セマンティックトークン必須（→ `tailwind-patterns/theme-tokens.md`）
- **`className` テンプレートリテラル・文字列内改行禁止** — `cn()`（`@/shared/lib/cn`）使用
- **ステータス・公開状態ラベルのハードコード禁止** — `enums/helpers.ts` の `*_STATUS_LABELS` / `PUBLISH_LABELS` / `AUDIT_ACTION_LABELS` 参照

### アーキテクチャ境界

- **app 層からの Prisma 直 import 禁止** — domain/lib 経由のみ。Prisma enum / 名前空間は `enums/prisma-types` ゲートウェイ経由（`architecture-boundaries.test.ts` で検出）
- **`"use server"` ファイルは async 関数のみ export 可** — 型・定数 export 含め禁止。型は `<file>-types.ts` に退避
- **内部 helper には `import "server-only"` を、Server Action endpoint には `"use server"` を使い分け** — 認証なし helper を `"use server"` 公開すると Cache-layer DoS の security 経路
- **server-only 定数を Client Component から import 禁止** — client-safe ファイルに分離（`admin-roles.ts` / `admin-resources.ts`）
- **server-only / Node-only SDK 統合は `import "server-only"` 必須** — `ical-generator` / `resend` / `googleapis` / `stripe` 等（→ `server-only-patterns.md`）
- **`scripts/**`/`prisma/seed.ts`/`package.json` `db:\*`は Bun runtime native +`bunx --bun prisma`必須** —`Bun.file`/`Bun.write`/`Bun.spawnSync`/`Bun.Glob` 採用、`node:fs`/`node:child_process`/`dotenv`/`prisma`直接呼び出し（Node shebang で`.env` auto-load 不発の silent bug）禁止。`.ts` 拡張子直接実行（`.mjs` 新規作成禁止）、`@types/bun`+ tsconfig`types: ["node", "bun"]`（→ `bun-patterns.md`）
- **Cloud Run probe endpoint (`/api/live` / `/api/health`) は `proxy.ts` rate-limit 除外必須** — probe IP `unknown` 合算で 429 → コンテナ kill 連鎖の silent bug（→ `ops/deployment-patterns.md`）
- **管理画面向け preview は第 3 root layout `(preview)/`**— `ManagedPageSections` を `_shared/components/pages/` に抽出。URL 生成は `@/shared/lib/preview-routes` SSoT 経由
- **Next.js 16 Server Action / RSC は `react-server` condition** — `react.createContext` 未定義 + `react-dom/server` は明示的 throw（`'react-dom/server is not supported in React Server Components'`）。Lexical 等 React/DOM 依存処理は **client (browser) で完結** させ、Server Action は事前 render 済み `contentHtml` を input で受け取る設計に統一（→ `frontend/lexical/conventions.md` §28 / `prisma-patterns/lexical-storage.md`）
- **Serena MCP は LSP-backed symbol query 専用** — `find_symbol` / `find_referencing_symbols` / `get_symbols_overview` / `rename_symbol` のみ使い、Read / Edit / Grep / Glob は Claude Code native を canonical 経路として維持（`.claude/rules/**` path-scoped auto-load 設計の互換性確保）。`write_memory` は user 明示要求時のみ、`.claude/rules/**` SSoT との二重化を回避（→ `ops/serena-patterns.md` / SSoT: `.serena/project.yml`）

### Validation / Domain

- **`executeAdminMutationResult` の監査ログは fire-and-forget 必須** — 実行順序契約 `execute → await afterSuccess → fireAndForget(logAction)` を破ると cache invalidation スキップ regression（→ `server-actions/implementation.md`）
- **管理画面 form は conform `useActionState` + `executeConformMutation` canonical** — Phase 1 Task 4-8 全完了 (settings sections 17/17 + Dialog 内 form + 大型 page 遷移 form 全 7 PR、Phase 1 全体完了)。Server Action は `(prev, formData) => SubmissionResult` signature、id 必要時は `bind` 部分適用、`executeConformMutation` SSoT helper (`@/shared/lib/forms/conform-action`) 経由で `executeAdminMutationResult` を呼ぶ。**Page 遷移 form の成功時遷移は server-side `redirect(toAppRoute(...))`** — client `router.push` 不要、created id 取得 → server redirect で詳細ページへ (Task 8.4-8.7 canonical)。動的配列は ① **`form.insert/remove/reorder` + `getFieldList()` + `getFieldset()`** (Zod schema 駆動、Task 8.6 LocationForm canonical で dnd-kit + `form.reorder({ name, from, to })` 確立) または ② **`useState<{key, ...}[]>` + 安定 key + hidden input append + schema preprocess** (Task 8.7 SpaceEditForm canonical、imageUrls `string[]` / facilities `JSON[]` の MediaPicker / IconPickerField 連携時、`crypto.randomUUID()` key で React reconciliation + dnd-kit 整合) のいずれかを採用。**In-place schema preprocess** で canonical schema を object literal (test) と FormData transit (conform) 両対応にする (Task 8.6 LocationForm 確立、Task 8.7 で SpaceEditForm canonical schema に水平展開、backward compat 維持)。**conform fields の sub-component 流用は type SSoT** (`Required<{[K in keyof z.input<typeof schema>]: FieldMetadata<...>}>`、Task 8.5 EventForm 確立)。**Pass-through JSON state** は hidden input `JSON.stringify` transit + schema `z.preprocess(JSON.parse, ...)` (UI 編集なし複雑 nested object、Task 8.6 で確立)。**PortableTextSpan[] は hidden input + `JSON.stringify` transit (Pattern B)** + schema 内で `z.string().transform(JSON.parse).pipe(...)` で server-side parse (`useInputControl` bridge より simple、contenteditable cursor 問題回避、Task 8.1-8.2 で確立)。**Lexical contentJson + contentHtml は hidden input + React Compiler 自動メモ化派生計算** (`useMemo` / `flushSync` 不要、batching 問題回避、Task 8.3 TermsForm で確立、Task 8.7 SpaceEditForm で水平展開)。**5+ tab の大型 form は monolithic 単一 file** (Task 8.6/8.7 canonical、1100-1800 行規模、tab 分割 + prop drilling より maintainable、React Compiler が中規模 component のメモ化を自動処理)。`useFormAction` (RHF) / `standardSchemaResolver` / `react-hook-form` 新規利用禁止 (Phase 1 残存は inline editor side-panel / auto-section-form のみ、別 phase で `package.json` から削除予定)。conform Zod 4 integration は `@conform-to/zod/v4` 専用 subpath (root は Zod v3 用で非互換)。**参照実装**: settings sections 17/17 完了 (PR #61-87)、Dialog 内 PoC (PR #64) / AdminDetailLayout 編集ページ dual-impl (PR #68) / Dialog Variant A mount-on-open + bind 部分適用 (PR #88 taxonomy managers / PR #90 AnnouncementBar `BarFormDialog` + PortableTextSpan[] Pattern B + datetime-local / PR #91 NavigationDialog `NavigationFormDialog` + `SocialLinkFormDialog` + parent-child Select)、Page 遷移 form conform 化 (PR #92 TermsForm + Lexical contentJson/contentHtml 派生計算 + Switch 5 件 / PR #94 ReservationForm + Edit mode discriminator + nested customerData + cross-field refine / PR #95 EventForm + 子 4 component conform fields type SSoT + interdependent state parent 集約 / PR #96 LocationForm + Meo 1127 行 + in-place preprocess + form.reorder + JSON pass-through / PR #98 SpaceEditForm + 5 tab monolithic 1700 行 + useState array transit + dnd-kit + Lexical 派生計算)（→ `frontend/admin-ui/forms.md` §Server Actions の認証パターン (conform canonical) / `frontend/admin-ui/dialogs.md` §canonical pattern Variant A）
- **外部 API 統合は SSoT ヘルパー経由必須** — `sendEmail()` / `withGoogleApiRetry()` / `withInstagramApiRetry()` / `validateTurnstile()` / `uploadFile()` / `deleteFile()`。直接 SDK 呼び出しは接続テスト / OAuth 初期化のみ例外
- **配列 uniqueness は Zod スキーマ層で契約** — UI 層の Set dedup 禁止（→ `zod-patterns/array-uniqueness.md`）
- **管理ユーザー操作（招待・作成・ロール変更・削除）は階層制御の 2 層防御** — UI `getInvitableRoles(actorRole)` + domain command `canInviteRole()` / `canModifyUser()` の `DomainError("FORBIDDEN")`
- **ドメインコマンドの actor 引数は `{ id: string; role: Role }` オブジェクト** — 単独 `actorUserId: string` 禁止
- **GCal outbound sync は attendees 空 + description マーカー + fireAndForget**（→ `ical-patterns.md`）— description 1 行目に `予約ID:` / `イベントID:` マーカーで inbound ループ防止
- **Turnstile 配置基準** — 未認証公開フォーム必須、認証済みでも予約・決済等の高リスク操作は許容、参照系は不要
- **datetime-local 入力は `formatDateTimeLocalInJst` / `parseDateTimeLocalAsJst`（`@/shared/lib/date-format`）経由必須** — `new Date(localStr)` / `format(d, "yyyy-MM-dd'T'HH:mm")` は tz 依存で 9 時間ずれる silent bug。schema は `z.string().datetime({ local: true })`、command 層で UTC 変換（→ `ssot-singletons.md` §日時フォーマット）
- **Section schema の canonical は `definitions/<type>/schema.ts`** — `validations/section.ts` の同名 export はレガシー重複で drift 済み。全 schema は `safeParse({})` 成立必須（required field に必ず `.default()`）— `createTypedConfigGetterFromSchema` の fallback 契約（→ `ssot-singletons.md` §Section schema 重複）
- **`PortableTextSpan[]` / `PortableTextBlock[]` の JSX truthy gate 禁止** — 空配列 `[]` も truthy。`.length > 0` で gate（→ `frontend/sections.md` §sectionLabel 単独 render 禁止）

### UI / UX（プロジェクト全体に適用される最重要のみ）

> 個別パターンは path-scoped rule で自動ロード — `frontend/accessibility/*` / `tailwind-patterns/*` / `frontend/admin-ui/*` / `frontend/project-design-config.md`

- **全 interactive 要素は WCAG 2.5.5 Enhanced (AAA) 準拠 44×44 CSS px 必須** — Button 全 size で `min-h-11` 以上、checkbox/radio は wrapper で 44px ヒットエリア確保
- **カードグリッドは Container Queries、マクロレイアウトは viewport breakpoint** — `@container` + `@md:grid-cols-2 @3xl:grid-cols-3`。管理 dashboard は named container `@container/main`
- **arbitrary sizing は @theme token で参照** — `--hero-min-height(-lg|-xl)` / `--modal-max-height` / `--prose-narrow|medium` 等。3 回以上使用で @theme 昇格
- **ハードコードカラー禁止 / `text-[10px]` 禁止 / 画像 overlay 12px 以上 + axe-core 検証対象は solid scrim 必須** — alpha scrim は parent walk で `bgGradient` incomplete → production violation 昇格 silent bug（→ `frontend/accessibility/touch-text.md` / `images-text.md`）
- **DB フェッチ公開ルートは `loading.tsx` + `error.tsx` 必須**
- **`loading.tsx` は実 UI レイアウト反映必須 / spinner-only 禁止** — `Skeleton` primitive 経由（`@/public/components/design-system/skeleton` / `@/admin/components/ui`）、admin form/editor/detail は `FormLoading` / `EditorLoading` / `DetailLoading` SSoT を 1 行 re-export（→ `frontend/loading-skeleton.md`）
- **Multiple Root Layouts で `app/not-found.tsx` 禁止** — `app/global-not-found.tsx` + `experimental.globalNotFound: true`
- **公開サインインは Better Auth Client API `signIn.email({ callbackURL })`** — Server Action 経由は Router Cache 未更新の silent bug
- **`*_GRID_COLS_MAP` は全て Container Queries variants** — viewport breakpoint (`md:`/`lg:`) 復活禁止
- **Section schema 拡張は shared factory 経由必須** — buttons / image / layout 系は `_shared/{buttons,image,layout}.ts` の factory（`createButtonsArraySchema` / `createImageGroupSchema` / `sectionLayoutSchema`）を再利用、独自 inline schema は SSoT 違反（→ `ssot-singletons.md` §管理画面 セクション編集）

---

## プロセス（要点）

> 詳細は path-scoped rule で自動ロード:
>
> - 調査・監査・公式準拠 verification → `.claude/rules/research-audit.md`（agents/skills 編集時）
> - 実装パターン → `.claude/rules/implementation-patterns.md`（domain/actions/prisma 編集時）
> - Git / Migration → `.claude/rules/git-migration.md`（migrations/workflows 編集時）
> - **CI ワークフロー → `.claude/rules/ops/ci-workflow.md`（+ `ci-workflow/{job-strategy,testing-perf,debug}.md` sub-rules）（`.github/workflows/**`/`package.json`/`scripts/run-tests.ts` 編集時）\*\*
> - Subagent dispatch → `.claude/skills/subagent-dispatch-template/SKILL.md`

### 検証

- **作業中**: `bun run type-check` / **完了前**: `bun run validate` / **コミット前**: `bun run validate && bun run build`
- **完遂判定は `test:unit` + `test:integration` 両走必須** — unit pass のみで「完了」宣言は危険、Phase 0 rename / migration drift 等で integration fixture が drift しがち
- **依存パッチ/マイナー更新後は validate 必須** — eslint-plugin-react-hooks 等のパッチで新ルール追加 = 実質破壊的変更
- **テスト実行ポリシー** — ローカルは関連 1〜数ファイルのみ `bun test <path>`。フル実行は `bun run test:unit` / `test:integration`（`scripts/run-tests.ts` 経由 per-file isolation runner）。E2E は 2 層分離: `e2e/smoke/*.smoke.spec.ts` (chromium-smoke project) は毎 push で `smoke-e2e` job が required 実行、広域 E2E (`e2e/{public,authenticated,a11y}/`) は PR `e2e` label opt-in（→ `test-quality/e2e.md` §Smoke vs 広域 E2E の責務分離 + `ops/ci-workflow/job-strategy.md` §Required vs Opt-in job 分離）。`bun test __tests__/unit` の親ディレクトリ指定は `mock.module` 干渉で偽陽性のため禁止
- **E2E spec の defensive skip 禁止** — `test.skip(true, "データがありません")` パターンは「実テストとして機能していない」signal。seed 拡充で解消するか unit/integration に降格（→ `test-quality/e2e.md` §広域 E2E の defensive skip 禁止）
- **大規模監査の前提** — `bun run validate` exit 0 なら compiler/linter 基準クリーン

詳細: `.claude/rules/test-quality.md` / `.claude/rules/bun-patterns.md`

### Subagent 規律（要点）

- **Implementer dispatch は `subagent-dispatch-template` SKILL 経由**— git 全面禁止 / import alias 3 系統 / plan deviation policy / 完了報告フォーマット
- **implementer は sonnet 以上**（haiku 禁止、report 捏造リスク）
- **完了報告後は独立検証**: `git log --oneline` + `git show --stat HEAD`
- **密結合タスクは 1 implementer にバンドル**
- **handoff memo の "pre-existing fail" 主張は実 test で再現確認してから信じる** — 別セッションで解決済みのことがある（memo 駆動で深追い禁止）

### Worktree 規律（要点）

- **公式 `claude --worktree <name>` が canonical 経路** — `.claude/worktrees/<name>/` に作成、`.worktreeinclude` で gitignored を自動 copy、終了時 changes なしで自動 cleanup（→ `.claude/rules/git-migration.md` §Worktree）
- **Subagent 隔離は `isolation: worktree` frontmatter or `Agent` tool option** — 公式 sub-agent 仕様、temporary worktree + 変更なしで自動 cleanup。手動 bootstrap 不要
- **`worktree.baseRef: "head"` / `cleanupPeriodDays: 14`** — `.claude/settings.json` に設定済み。local HEAD（未 push WIP 含む）ベース + 孤児 14 日掃除
- **手動 bootstrap は legacy fallback のみ** — `bash .claude/skills/worktree-bootstrap/scripts/bootstrap.sh <branch>` / cleanup は `cleanup.sh <branch> [--force]`。dev server を main で常駐維持 / IDE 直接 open 等の例外用途

---

## ワークフロー

`要件確認 → 調査 → 設計 → 計画 → 実装(TDD) → 検証 → レビュー → 完了`

- **計画作成**: `brainstorming` → `writing-plans`（specs: `docs/superpowers/specs/`、plans: `docs/superpowers/plans/`）。意図明確時は Q&A スキップ可
- **計画実行**: `subagent-driven-development`（推奨）または `executing-plans`
- **完了時**: `verification-before-completion` → `finishing-a-development-branch`
- **セッション跨ぎ大規模 plan は handoff memory 必須** — `~/.claude/projects/<slug>/memory/project_<phase>-handoff.md` に ①plan 場所 ②worktree 場所 ③commit SHA ④残 chunk ⑤次セッション起動コマンド ⑥**関連だが Phase 対象外の WIP（未コミット rule docs / 未追跡 migration 等）の有無**の 6 点セット + `MEMORY.md` 一行 index。完了マーカーは `> **Snapshot: YYYY-MM-DD**` + `> **Completed: YYYY-MM-DD**` 併記。次セッション開始時は handoff memo に頼らず `git status --short` + `bunx --bun prisma migrate status` で独立検証

---

## 自動完遂ポリシー（事故防止 多層 gate）

タスクが論理的完了点に達した時点で、ユーザー確認なしで commit → push → PR → CI → squash merge → ローカル sync まで完遂する。default が自動進行であり、「進めて」「OK」等の明示承認は **不要**。事故防止のため下記 9 gate を順次通過、いずれか fail で停止してユーザー報告。

### 完遂トリガー（全て満たす場合のみ自動進行）

- 直前ターンで実装 / 修正 / refactor タスクが論理的完了点に到達
- `git status --short` で当該タスク起因の未 commit 変更が存在
- 「途中保存」「コミットしないで」「step by step で」等の明示中断指示がない
- 下記「停止例外」のいずれにも該当しない
- 質問のみ / 調査のみ / planning のみ / 単一 file の typo 修正のみのターンは completion ではない（自動進行対象外）

### 自動進行 9 gate

| Gate             | 内容                                                                                                             | fail 時                                    |
| ---------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 1. branch        | `main` 直編集なら新 feature branch (`<type>/<topic>`) を切ってから再着手                                         | 自動切替（gate なし）                      |
| 2. 例外          | 下記「停止例外」のいずれかに該当しないか scan                                                                    | 停止 → ユーザー確認                        |
| 3. 検証          | `bun run validate && bun run build` exit 0                                                                       | 停止 → 原因究明                            |
| 4. commit        | 明示ファイル指定で `git add` → Conventional Commits + Co-Authored-By trailer（lefthook pre-commit + commit-msg） | 停止 → hook 出力確認                       |
| 5. push          | `git push -u origin <branch>`（lefthook pre-push: type-check + arch-boundaries）                                 | 停止 → hook 出力確認                       |
| 6. PR            | `gh pr create --base main --title <70 字以内> --body <Summary + Test plan>`                                      | 停止 → エラー報告                          |
| 7. CI            | `gh pr checks --watch --interval 30` で required check 全 pass 待ち                                              | root cause fix → 再 push → 再 watch を反復 |
| 8. merge         | `gh pr merge --squash --delete-branch`                                                                           | 停止 → エラー報告                          |
| 9. ローカル sync | `git checkout main && git pull --ff-only`、gone branch あれば `/commit-commands:clean_gone`                      | 停止 → 競合は手動解決                      |

### 停止例外（自動進行を中止しユーザー確認）

- `prisma/schema.prisma` の breaking change（`DROP COLUMN` / 型 narrowing / 既存列の required 化 / table rename）
- `.env*` 編集 / 新規環境変数の追加 / 既存 env 値の変更
- `bun.lock` の予期せぬ変更（`package.json` 同時更新でない場合）
- 10 file 超 / 1000 行超 / `prisma/migrations/*.sql` を含む大規模変更（段階 commit 分割を提案）
- `git status` に当該タスクと無関係な untracked / modified file（並行作業の signal — 責務分離判断）
- destructive 操作（`git reset --hard` / `prisma migrate reset` / branch delete / `--no-verify` / hook bypass / required job skip / branch protection bypass）
- 機密情報（API key / token / credential / Stripe / OAuth secret）の混入疑い
- 単独 / バッチ test fail を伴う変更（`bun run test:unit` / `test:integration` の事前確認は実装ターンで完了している前提）
- 過去 60 分以内に PR を 3 件以上自動 merge 済み（暴走 detect → cool down、ユーザー判断）
- ユーザーが調査・相談・brainstorming を継続中（直前メッセージが質問 / 議論で「実装してください」が明示されていない）

### override

- 「コミットしないで」「自動で進めないで」「step by step」「PR 作らないで」等の明示指示があるターンは停止
- 一時的に停止したい場合: 「次の commit は手動でやりたい」と 1 行宣言すれば以降そのセッションは停止
- 明示承認（「進めて」「OK」「マージまで」）は **不要** — default が自動進行

### 事故防止 infra（既存）

- **lefthook** — pre-commit (eslint --fix + prettier + `scripts/check-protected-files.sh`) / pre-push (`bun run type-check` + `architecture-boundaries.test.ts`) / commit-msg (`scripts/check-commit-msg.sh` で Conventional Commits 強制)
- **`block-dangerous-bash.sh`** — `git push --force` / `rm -rf` / `chmod` を Bash tool 経路で deny
- **GitHub branch protection** — `main` 直接 push 禁止 + required checks 設定（前提）
- **Stop hook `type-check-on-stop.sh`** — 背景型チェックで silent regression 検出
- **完遂報告は最終 1 メッセージ** — PR URL + merge SHA + 解消した root cause を簡潔に列挙

---

## SSoT

主要 SSoT singleton 一覧は `.claude/rules/ssot-singletons.md`（src/prisma 編集時に path-scoped auto-load）。
監査例外（誤検出回避）は `.claude/rules/audit-exceptions.md`（agents/skills 編集時に auto-load）。

---

## Claude Code 公式準拠の原則

`.claude/` 配下は Claude Code 公式仕様 (`code.claude.com/docs/en/{memory,sub-agents,skills,settings,hooks}`) に厳守準拠する:

- **path-scoped rule + skill + memory + agent + hook の 5 層構造のみ**を使用
- **独自分類の新設禁止** — barrel index / process barrel / gotchas メタ分類 / ADR system 等は撤回済み（再導入禁止）
- **常時ロード rule（`paths:` なし）はゼロ維持** — 全 rule docs は path-scoped frontmatter 必須
- 詳細・撤回済みパターン・正しい構造化方針は `.claude/rules/claude-code-patterns.md`（`.claude/**` 編集時に auto-load）

---

## md ドキュメント規律

`*.md` 編集時に詳細は path-scoped rule で auto-load:

- **記述スタイル**（CommonMark 0.31.2 + GFM + markdownlint 主要ルール）→ `.claude/rules/markdown-style.md`
- **Frontmatter スキーマ**（Memory / Rule / Subagent / Skill / Hook の 5 層）→ `.claude/rules/claude-code-patterns.md` §公式が定義する 5 層

要点（drift 防止の最重要のみ、詳細は rule 参照）:

- バージョン値・「最終更新: YYYY-MM-DD」マーカー・`.archive/` ディレクトリ・`docs/reference/` 再導入禁止
- `docs/how-to/` はインフラ・デプロイ手順のみ（実装手順は rule docs / skills に集約）
