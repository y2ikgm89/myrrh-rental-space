# CLAUDE.md

> Myrrh Rental Space — レンタルスペース予約管理システム

## コマンド

```bash
bun dev                                       # 開発サーバー
bun run validate                              # type-check → lint
bun run validate && bun run build             # 完全検証（コミット前必須）
bun run build:skip-env                        # env未設定時ビルド
bun run test                                  # 全テスト（サブディレクトリ別分離実行）
bun run test:unit                             # Unit テストのみ
bun run test:integration                      # Integration テストのみ
bunx --bun prisma migrate dev --name <name>   # マイグレーション
bun prisma/seed.ts                            # Seed
bun run e2e                                   # E2E テスト（Playwright）
```

> **フック**: Prettier + ESLint --fix + schema-guard + pattern-guard（PostToolUse）、危険コマンド防止 + ファイル保護（PreToolUse）、型チェック（Stop）、日付注入（UserPromptSubmit）
> **プラグイン**: `autofix-bot`（lint/型エラー自動修正）
> **保護**: `.env*`, `bun.lock`, `prisma/migrations/*.sql` 編集不可（PreToolUse）
> **デプロイ**: Google Cloud Run（`Dockerfile` + `cloudbuild.yaml`）— Vercel 不使用

## アーキテクチャ

Multiple Root Layouts: `(admin)/` と `(public)/` で CSS・認証・レイアウトを完全分離。遷移はフルページリロード。
管理 write 系は `executeAdminMutationResult`（認証・権限・監査ログ一括処理）。API Route のみ `checkPermission()` 直接使用。

→ `.claude/rules/project-structure.md`（ディレクトリ・エイリアス・境界ルール）
→ `.claude/rules/frontend/project-design-config.md`（Editorial Magazine テーマ）

## 技術スタック（非自明な注意点のみ）

| 技術         | 注意点                                                                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Next.js 16   | `'use cache'` + `updateTag`（Server Actions）/ `revalidateTag`（2引数）。PPR: Suspense 内 async SC は `await connection()` 必須                         |
| React 19.2   | Compiler 1.0 自動メモ化（`useCallback`/`useMemo`/`memo` 不要）、`use()`、`useEffectEvent`（deps 除外）                                                  |
| TypeScript 6 | `erasableSyntaxOnly`（enum 禁止）、`verbatimModuleSyntax`                                                                                               |
| Prisma 7     | `createAppPrismaClient` で `$extends` 集約、enum は `@generated/prisma/*`                                                                               |
| Tailwind 4.2 | CSS-first `@theme`、セマンティックトークン必須                                                                                                          |
| Better Auth  | 管理/顧客セッション分離（`adminAuth`/`customerAuth`）、RBAC、`generateId: "uuid"` 必須                                                                  |
| Lexical 0.43 | NodeState API（`$config` + `createState`）。カスタムノード 50、複合階層 12。新規追加は `lexical-node` / `lexical-plugin` / `lexical-toolbar` スキル使用 |
| nuqs 2.8     | URL クエリ状態管理（パーサーマップ `@/shared/lib/nuqs`）。`useQueryStates({ shallow: false })` で RSC 再レンダリング発火                                |

---

## 禁止（違反禁止）

### コーディング

`.claude/rules/` が `paths:` フロントマターで自動ロード。以下はルール未ロード時も適用される普遍ルール:

- **型アサーション（`as`）禁止** — 型ガード・`satisfies`・Zod `safeParse` を使う
- **`useCallback`/`useMemo`/`memo` 禁止** — React Compiler 1.0 が自動メモ化（例外: `useSyncExternalStore` の subscribe 等 → `react-patterns.md`）
- **後方互換性ハック禁止** — 不要コードは完全削除
- **ハードコードカラー禁止** — セマンティックトークン必須（例外: `global-error.tsx`）
- **className テンプレートリテラル禁止** — `cn()` 使用（`@/shared/lib/cn`）
- **認証済みフローに Turnstile 禁止** — マイページ（`verifyCustomerSession` 済み）の mutation に Turnstile は冗長。Turnstile は未認証公開フォームのみ

### プロセス

- **検証なしの完了報告禁止** → 作業中 `bun run type-check`、完了前 `bun run validate`、コミット前 `bun run validate && bun run build`
- **「公式ベストプラクティス準拠」主張前の context7 検証省略禁止** → Radix / RHF / Next.js / React などの外部ライブラリ挙動を「公式推奨」と主張する前に `mcp__context7__query-docs` で一次資料を確認する
- **一括修正後の残存チェック省略禁止** → grep/Grep で違反パターンの残存ゼロを確認してから完了報告
- **アーキテクチャ境界修正後の全量確認省略禁止** → `Grep "from \"@/shared/db/prisma\"" src/app/` で app 層の Prisma 直 import 残存ゼロを確認（`calendar-sync` の `$queryRaw` のみ例外）
- **曖昧な要件の推測実装禁止** → `AskUserQuestion`で確認
- **データ取得ルートの loading.tsx/error.tsx 省略禁止** → DB フェッチする全公開ルートにスケルトン loading + error boundary 必須

---

## ワークフロー

> **セッション継続時**: `docs/plans/README.md` を確認

```
要件確認 → 調査 → 設計 → 計画 → 実装(TDD) → 検証 → レビュー → 完了
```

- **計画作成**: `brainstorming` → `writing-plans`（`docs/plans/YYYY-MM-DD-*.md`）
- **計画実行**: `subagent-driven-development`（推奨）または `executing-plans`
- **Worktree 作成前**: main の `git status --short | wc -l` + `ls prisma/migrations/ | tail -1` で未コミット migration の有無を確認。ドリフトがあれば先に WIP snapshot commit（→ `gotchas.md` §Worktree）
- **Subagent 実行規律**: implementer は sonnet 以上（haiku 禁止、report 捏造リスク）/ 完了報告後は `git log --oneline` + `git show --stat HEAD` で独立検証 / 密結合タスクは 1 implementer にバンドル
- **完了時**: `verification-before-completion` → `finishing-a-development-branch`

## スキル（ドメイン固有）

| カテゴリ      | スキル                                                                                          | 用途                                     |
| ------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Lexical       | `lexical-node` / `lexical-plugin` / `lexical-toolbar` / `lexical-audit`                         | ノード・プラグイン・ツールバー追加、監査 |
| 管理画面      | `create-admin-page` / `create-server-action` / `add-settings-field` / `audit-settings-sections` | CRUD・アクション・設定スキャフォールド   |
| 公開ページ    | `create-page-content` / `create-section-type` / `parallax-section` / `frontend-design`          | ページ・セクション・UI 生成              |
| DB/キャッシュ | `prisma-migration` / `cache-audit` / `split-action-file` / `ssot-audit`                         | マイグレーション・キャッシュ・分割・SSOT |
| デバッグ      | `google-calendar-debug` / `instagram-debug` / `stripe-debug` / `turbopack-hmr`                  | 外部連携・HMR 診断                       |
| 依存関係      | `upgrade-deps`                                                                                  | パッケージアップグレード                 |
| 品質          | `integration-audit` / `ui-ux-pro-max`                                                           | 連携監査・UI/UX DB検索                   |

## ルールとレビュー

`.claude/rules/` が `paths:` フロントマターで条件付き自動ロード。最重要は `gotchas.md`。
レビューエージェントの指摘は `gotchas.md` と照合して検証する（`revalidateTag` 第2引数や Turbopack チャンク重複は誤報されやすい）。
包括的監査には専門サブエージェントを並列起動:

- **コード品質**: project-reviewer, react-compiler-reviewer, lexical-reviewer
- **キャッシュ/構造**: cache-strategy-reviewer, route-structure-reviewer, large-file-detector
- **セキュリティ/認証**: security-reviewer, rate-limit-reviewer
- **ドメイン**: event-flow-reviewer, reservation-flow-reviewer
- **UI/UX**: animation-cleanup-reviewer, editorial-consistency-reviewer, accessibility-reviewer
- **テスト**: test-writer, e2e-test-writer, test-runner
- **DB**: db-migration-reviewer

## 設計判断

- **セッション分離**: `adminAuth`/`customerAuth` 完全分離（→ `auth-patterns.md`）
- **パスワードリセット**: `(public)` に配置、`adminAuthClient` 使用（Admin Gate 外アクセス）
- **通知**: `AdminNotification`（全管理者共有）。`fireAndForget` + `afterSuccess`
- **法的文書**: Terms システム一元管理。`/privacy` → `/terms/privacy-policy` リダイレクト

## SSOT 定数・シングルトン

| 定数/変数                    | 場所                         | 用途                                                                                                              |
| ---------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `DASHBOARD_ROLES`            | `@/shared/lib/admin-auth`    | ダッシュボードアクセス可能ロール。`verifyAdminSession`・ログインページで共有                                      |
| `adminAuth`                  | `@/shared/lib/admin-auth`    | 管理者用 Better Auth インスタンス（email/password、`cookiePrefix: "admin-auth"`）                                 |
| `customerAuth`               | `@/shared/lib/customer-auth` | 顧客用 Better Auth インスタンス（Google/LINE、`cookiePrefix: "customer-auth"`、`basePath: "/api/customer-auth"`） |
| `prisma`                     | `@/shared/db/prisma`         | `$extends` 済み Prisma クライアント（アプリ全般）                                                                 |
| `basePrisma`                 | `@/shared/db/prisma`         | 拡張前 Prisma クライアント（Better Auth アダプター専用）                                                          |
| `CACHE_TAGS` / `getCacheTag` | `@/shared/lib/constants`     | 粒度別キャッシュタグ定数（`CACHE_TAGS.SETTINGS` 廃止 → 個別タグ使用）                                             |
| `CACHE_LIFE`                 | `@/shared/lib/constants`     | キャッシュライフ定数（`cacheLife` プリセット）                                                                    |
| `NOTIFICATION_TYPE`          | `enums/helpers`              | 管理通知タイプ定数（DB VARCHAR 管理、`isValidNotificationType` 型ガード付き）                                     |
