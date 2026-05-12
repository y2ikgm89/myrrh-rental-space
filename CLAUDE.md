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
技術スタックの実バージョン: `package.json` + `bun.lock` (SSoT)、コア依存の列挙は [AGENTS.md](AGENTS.md#tech-stack)。

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
- **Cloud Run probe endpoint (`/api/live` / `/api/health`) は `proxy.ts` rate-limit 除外必須** — probe IP `unknown` 合算で 429 → コンテナ kill 連鎖の silent bug（→ `ops/deployment-patterns.md`）
- **管理画面向け preview は第 3 root layout `(preview)/`**— `ManagedPageSections` を `_shared/components/pages/` に抽出。URL 生成は `@/shared/lib/preview-routes` SSoT 経由
- **Next.js 16 Server Action / RSC は `react-server` condition** — `react.createContext` 未定義 + `react-dom/server` は明示的 throw（`'react-dom/server is not supported in React Server Components'`）。Lexical 等 React/DOM 依存処理は **client (browser) で完結** させ、Server Action は事前 render 済み `contentHtml` を input で受け取る設計に統一（→ `frontend/lexical/conventions.md` §28 / `prisma-patterns/lexical-storage.md`）

### Validation / Domain

- **`executeAdminMutationResult` の監査ログは fire-and-forget 必須** — 実行順序契約 `execute → await afterSuccess → fireAndForget(logAction)` を破ると cache invalidation スキップ regression（→ `server-actions/implementation.md`）
- **外部 API 統合は SSoT ヘルパー経由必須** — `sendEmail()` / `withGoogleApiRetry()` / `withInstagramApiRetry()` / `validateTurnstile()` / `uploadFile()` / `deleteFile()`。直接 SDK 呼び出しは接続テスト / OAuth 初期化のみ例外
- **配列 uniqueness は Zod スキーマ層で契約** — UI 層の Set dedup 禁止（→ `zod-patterns/array-uniqueness.md`）
- **管理ユーザー操作（招待・作成・ロール変更・削除）は階層制御の 2 層防御** — UI `getInvitableRoles(actorRole)` + domain command `canInviteRole()` / `canModifyUser()` の `DomainError("FORBIDDEN")`
- **ドメインコマンドの actor 引数は `{ id: string; role: Role }` オブジェクト** — 単独 `actorUserId: string` 禁止
- **GCal outbound sync は attendees 空 + description マーカー + fireAndForget**（→ `ical-patterns.md`）— description 1 行目に `予約ID:` / `イベントID:` マーカーで inbound ループ防止
- **Turnstile 配置基準** — 未認証公開フォーム必須、認証済みでも予約・決済等の高リスク操作は許容、参照系は不要
- **datetime-local 入力は `formatDateTimeLocalInJst` / `parseDateTimeLocalAsJst`（`@/shared/lib/date-format`）経由必須** — `new Date(localStr)` / `format(d, "yyyy-MM-dd'T'HH:mm")` は tz 依存で 9 時間ずれる silent bug。schema は `z.string().datetime({ local: true })`、command 層で UTC 変換（→ `ssot-singletons.md` §日時フォーマット）
- **Section schema の canonical は `definitions/<type>/schema.ts`** — `validations/section.ts` の同名 export はレガシー重複で drift 済み。全 schema は `safeParse({})` 成立必須（required field に必ず `.default()`）— `createTypedConfigGetterFromSchema` の fallback 契約（→ `ssot-singletons.md` §Section schema 重複）
- **`PortableTextSpan[]` / `PortableTextBlock[]` の JSX truthy gate 禁止** — 空配列 `[]` も truthy。`{config.field && ...}` ではなく `{config.field.length > 0 && ...}` で gate。sectionLabel default 値（"Events" 等）と outer OR 判定の組み合わせで「ラベル単独残り」silent bug を起こす（→ `frontend/sections.md` §sectionLabel 単独 render 禁止）

詳細（datetime-local / Mutually exclusive boolean / 配列 uniqueness 等）: `zod-patterns/validation-schemas.md` / `implementation-patterns.md`

### UI / UX（プロジェクト全体に適用される最重要のみ）

> 個別パターンは path-scoped rule で自動ロード — `frontend/accessibility/*` / `tailwind-patterns/*` / `frontend/admin-ui/*` / `frontend/project-design-config.md`

- **全 interactive 要素は WCAG 2.5.5 Enhanced (AAA) 準拠 44×44 CSS px 必須** — Button 全 size で `min-h-11` 以上、checkbox/radio は wrapper で 44px ヒットエリア確保
- **カードグリッドは Container Queries、マクロレイアウトは viewport breakpoint** — `@container` + `@md:grid-cols-2 @3xl:grid-cols-3`。管理 dashboard は named container `@container/main`
- **arbitrary sizing は @theme token で参照** — `--hero-min-height(-lg|-xl)` / `--modal-max-height` / `--prose-narrow|medium` 等。3 回以上使用で @theme 昇格
- **ハードコードカラー禁止 / `text-[10px]` 禁止 / 画像 overlay 12px 以上** — セマンティックトークン + WCAG 文字サイズ最小値（→ `frontend/accessibility/touch-text.md` / `images-text.md`）
- **DB フェッチ公開ルートは `loading.tsx` + `error.tsx` 必須**
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
> - Subagent dispatch → `.claude/skills/subagent-dispatch-template/SKILL.md`

### 検証

- **作業中**: `bun run type-check` / **完了前**: `bun run validate` / **コミット前**: `bun run validate && bun run build`
- **完遂判定は `test:unit` + `test:integration` 両走必須** — unit pass のみで「完了」宣言は危険、Phase 0 rename / migration drift 等で integration fixture が drift しがち（実例: 2026-05-10 で navigation / homepage-settings fixture が unit pass + integration 22 fail）
- **依存パッチ/マイナー更新後は validate 必須** — eslint-plugin-react-hooks 等のパッチで新ルール追加 = 実質破壊的変更
- **テスト実行ポリシー** — ローカルは関連 1〜数ファイルのみ `bun test <path>`。CI で `test:unit` + `test:integration` + E2E をフル実行。`test:unit` / `test:integration` は per-directory バッチ（`bun test __tests__/unit` 簡略化は `mock.module` 干渉で偽陽性）
- **大規模監査の前提** — `bun run validate` exit 0 なら compiler/linter 基準クリーン

詳細: `.claude/rules/test-quality.md` / `.claude/rules/bun-patterns.md`

### Subagent 規律（要点）

- **Implementer dispatch は `subagent-dispatch-template` SKILL 経由**— git 全面禁止 / import alias 3 系統 / plan deviation policy / 完了報告フォーマット
- **implementer は sonnet 以上**（haiku 禁止、report 捏造リスク）
- **完了報告後は独立検証**: `git log --oneline` + `git show --stat HEAD`
- **密結合タスクは 1 implementer にバンドル**
- **handoff memo の "pre-existing fail" 主張は実 test で再現確認してから信じる** — 別セッションで解決済みのことがある（memo 駆動で深追い禁止）

---

## ワークフロー

`要件確認 → 調査 → 設計 → 計画 → 実装(TDD) → 検証 → レビュー → 完了`

- **計画作成**: `brainstorming` → `writing-plans`（specs: `docs/superpowers/specs/`、plans: `docs/superpowers/plans/`）。意図明確時は Q&A スキップ可
- **計画実行**: `subagent-driven-development`（推奨）または `executing-plans`
- **完了時**: `verification-before-completion` → `finishing-a-development-branch`
- **セッション跨ぎ大規模 plan は handoff memory 必須** — `~/.claude/projects/<slug>/memory/project_<phase>-handoff.md` に ①plan 場所 ②worktree 場所 ③commit SHA ④残 chunk ⑤次セッション起動コマンド ⑥**関連だが Phase 対象外の WIP（未コミット rule docs / 未追跡 migration 等）の有無**の 6 点セット + `MEMORY.md` 一行 index。完了マーカーは `> **Snapshot: YYYY-MM-DD**` + `> **Completed: YYYY-MM-DD**` 併記。次セッション開始時は handoff memo に頼らず `git status --short` + `bunx --bun prisma migrate status` で独立検証

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
