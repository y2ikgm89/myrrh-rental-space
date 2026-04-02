# CLAUDE.md

> Myrrh Rental Space — レンタルスペース予約管理システム

## 🔴 必須（違反禁止）

### 禁止

- **型アサーション（`as`）禁止** → `type-safety.md`
- **`'use cache'` 関数での直接 prisma 呼び出し禁止** → `safeFetch` + `toPlainObject`/`toPlainArray` 必須 → `server-actions.md`
- **後方互換性ハック禁止** → 不要コード完全削除
- **検証なしの完了報告禁止** → 作業中 `bun run type-check`、完了前 `bun run validate`、コミット前 `bun run validate && bun run build`
- **曖昧な要件の推測実装禁止** → `AskUserQuestion`で確認
- **ハードコードカラー禁止** → テーマ変数使用 → `tailwind-patterns.md`
- **公開フォームの不統一禁止** → 間隔 `space-y-6`/`Stack gap="lg"`、エラー `<div role="alert">` + border スタイル
- **ソフトデリート `where` 漏れ禁止** → `deletedAt` を持つ全モデル（Reservation, Event 等）の `findUnique`/`findFirst`/`findMany`/`update` に `deletedAt: null`（`restore*Command` 除く）。リレーション経由のクエリも親モデルの `deletedAt: null` フィルタ必須（例: `where: { eventId, event: { deletedAt: null } }`）→ `gotchas.md`
- **公開 Server Action のレート制限省略禁止** → 全公開 mutation に `checkActionRateLimit(formSubmitRateLimiter)`、公開 query に `publicQueryRateLimiter` → `server-actions.md`
- **純 CSS コンポーネントへの `"use client"` 禁止** → state/effect/browser API のないコンポーネントは Server Component（Tailwind はビルド時 CSS 生成）→ `gotchas.md` §レスポンシブ標準

---

## 🟡 ワークフロー

> **セッション継続時**: `docs/plans/README.md` を確認

```
要件確認 → 調査 → 設計 → 計画 → 実装(TDD) → 検証 → レビュー → 完了
```

- **計画作成**: `brainstorming` → `writing-plans`（`docs/plans/YYYY-MM-DD-*.md`）
- **計画実行**: `subagent-driven-development`（推奨）または `executing-plans`
- **完了時**: `verification-before-completion` → `finishing-a-development-branch`

スキル（`.claude/skills/`）・エージェント（`.claude/agents/`）・MCP（`.mcp.json`）は自動検出。

スキル使い分け（`.claude/skills/` 自動検出、一覧は `/help` 参照）:

- **新リソース追加**: `/create-admin-page` → `/create-server-action` → `/prisma-migration`
- **公開ページ追加**: `/create-page-content` → `/create-section-type`（新セクション時）
- **設定拡張**: `/add-settings-field`
- **Lexical 拡張**: `/lexical-node` / `/lexical-plugin` / `/lexical-toolbar`
- **品質監査**: `/cache-audit` / `/integration-audit` / `/audit-settings-sections`
- **UI デザイン**: `/frontend-design`（公開ページ）/ `/parallax-section`（スクロール演出）
- **トラブルシューティング**: `/stripe-debug` / `/google-calendar-debug` / `/turbopack-hmr`

---

## 🟢 プロジェクト情報

### アーキテクチャ

Multiple Root Layouts: `(admin)/` と `(public)/` で CSS・認証・レイアウトを完全分離。遷移はフルページリロード。
レスポンシブ: Fluid-first（`clamp()`）+ Container Queries（カードグリッド）。Viewport breakpoints はマクロレイアウト切替のみ。

```
src/app/(admin)/admin/(dashboard)/   管理画面（admin.css, Better Auth）
src/app/(public)/                    公開ページ（Page + Section で管理、Page-First Architecture）
src/shared/lib/sections/             セクションレジストリ・定義・field ヘルパー
src/shared/domain/                   ドメイン層（commands + admin-queries + public-queries）
src/shared/                          共有（CSS変数非依存）
generated/prisma/                    Prisma Client（.gitignore対象、deps stageで再生成）
__tests__/unit/                      単体テスト（lib/hooks/components/shared/api/queries/architecture/db/domain）
__tests__/integration/               統合テスト（actions/admin, actions/public, api）
```

### 技術スタック

| 技術         | Ver    | 注意点                                                                                        |
| ------------ | ------ | --------------------------------------------------------------------------------------------- |
| Next.js      | 16.2.1 | `'use cache'`, `updateTag`, PPR (`cacheComponents: true`)                                     |
| React        | 19.2.4 | Compiler 1.0 (`react-compiler-runtime` 必須), `use()`, `useEffectEvent`                       |
| TypeScript   | 6.0.2  | `target: es2025`, `erasableSyntaxOnly`, `verbatimModuleSyntax`                                |
| Prisma       | 7.6.0  | WASM, `createAppPrismaClient` で `$extends` 集約、enum/型は `@generated/prisma/*` 直接 import |
| Tailwind CSS | 4.2.2  | CSS-first, `@theme`, セマンティックトークン必須, Container Queries コア統合                   |
| Tabler Icons | 3.41   | `@tabler/icons-react`, `Icon` プレフィックス, 型: `TablerIcon`                                |
| Zod          | 4.3.6  | `{ error: }` パラメータ                                                                       |
| Better Auth  | 1.5.6  | RBAC, Google/LINE OAuth, accountLinking, CUSTOMER ロール                                      |
| Stripe       | 21     | Checkout Session, Webhook（`payment_status` チェック必須）                                    |
| Bun          | 1.3.11 | テストランナー (`bun:test`), `bunx --bun`                                                     |
| FullCalendar | 6.1    | `@fullcalendar/react`, 月/週/リスト切替、`'use client'` 必須                                  |

### コマンド

```bash
bun dev                                       # 開発サーバー
bun run validate                              # type-check → lint
bun run validate && bun run build             # 完全検証
bun run build:skip-env                        # env未設定時ビルド（SKIP_ENV_VALIDATION=true）
bun run test                                  # 全テスト（35バッチ分離実行: mock.module 干渉回避）
bun run test:unit                             # Unit テストのみ
bun run test:integration                      # Integration テストのみ
bun test __tests__/unit/domain/reviews        # 特定ドメインのみ
bun run test:coverage:check                   # カバレッジ計測 + 閾値チェック（90%）
bunx --bun prisma migrate dev --name <name>   # マイグレーション
bun prisma/seed.ts                            # Seed（createAppPrismaClient 適用）
bun run e2e                                   # E2E テスト（Playwright）
bun scripts/generate-login-url.ts             # Admin Gate ログインURL生成
```

> **フック**: Prettier + ESLint --fix（PostToolUse）/ schema-change-guard / type-check-on-stop
> **保護**: `.env*`, `bun.lock`, `prisma/migrations/*.sql` 編集不可（PreToolUse）
> **デプロイ**: Google Cloud Run（`Dockerfile` + `cloudbuild.yaml`）— Vercel 不使用

### コーディング規約

`.claude/rules/` に `paths:` フロントマターで条件付き自動ロード:

| ルール                      | 内容                                                                              |
| --------------------------- | --------------------------------------------------------------------------------- |
| `gotchas.md`                | 落とし穴集（最重要 — ソフトデリート・キャッシュ・テストモック・レスポンシブ標準） |
| `server-actions.md`         | `'use cache'` / `updateTag` / `executeAdminMutationResult` / レート制限           |
| `type-safety.md`            | `as` 禁止・`satisfies`・型ガード・`noUncheckedIndexedAccess`                      |
| `bun-patterns.md`           | テスト: `mock.module` 順序・純粋モジュールモック禁止・`mock.calls` 禁止           |
| `prisma-patterns.md`        | Decimal 自動変換・JSON パース・`toPlainObject`・Lexical JSON Primary              |
| `auth-patterns.md`          | Better Auth・`executeAdminMutationResult`・セッション取得パターン                 |
| `error-handling.md`         | `logError`・`safeFetch`・`MutationResult`・DomainError                            |
| `zod-patterns.md`           | Zod 4 `{ error: }`・`z.enum(PrismaEnum)`・`nativeEnum` 禁止                       |
| `test-quality.md`           | テスト分類・ドメインコマンドテストパターン・Playwright E2E                        |
| `react-patterns.md`         | `useWatch` 推奨・IIFE in JSX 禁止・component-in-hook 禁止                         |
| `resend-patterns.md`        | React Email テンプレート・`fireAndForget` メール送信パターン                      |
| `nuqs-patterns.md`          | URL state 管理・`parseAsStringLiteral`・Server/Client 共有パーサー                |
| `api-routes.md`             | Route Handler 認証順序・`unstable_rethrow`・CRON 認証・CSV Export 参照実装        |
| `implementation-quality.md` | 形骸化実装禁止・過剰抽象化禁止・デッドコード禁止                                  |
| `project-structure.md`      | ディレクトリ構成・インポートエイリアス・アーキテクチャ境界                        |
| `server-only-patterns.md`   | Data Access Layer・`server-only` 必須ファイル一覧・追加不要ファイル               |

**`ops/` サブディレクトリ**（デプロイ関連ファイル編集時に自動ロード）:

| ルール                   | 内容                                            |
| ------------------------ | ----------------------------------------------- |
| `deployment-patterns.md` | Dockerfile・cloudbuild.yaml・Cloud Run デプロイ |

**`frontend/` サブディレクトリ**（公開ページ・管理画面 UI 編集時に自動ロード）:

| ルール                            | 内容                                                          |
| --------------------------------- | ------------------------------------------------------------- |
| `accessibility.md`                | WCAG 2.2 AA・セマンティック HTML・`prefers-reduced-motion`    |
| `admin-ui-patterns.md`            | タブ UI・テーブルレスポンシブ・ActionDropdown・設定セクション |
| `admin-inline-editor-patterns.md` | Lexical インラインエディタ・PostEditor・コンテンツタイプ      |
| `anti-ai-design.md`               | 汎用 AI デザイン禁止・セルフレビュー質問6問                   |
| `design-system-memory.md`         | Serena memory デザイン記憶プロトコル                          |
| `gsap-patterns.md`                | GSAP + ScrollTrigger・`useGSAP`・matchMedia reduced-motion    |
| `lexical-patterns.md`             | Lexical 0.41 / NodeState・カスタムノード・プラグイン          |
| `project-design-config.md`        | ブランド固有デザイン値・カラートークン・タイポグラフィ        |
| `seo-patterns.md`                 | メタデータ・JSON-LD・OGP・robots・sitemap                     |
| `ui-ux-patterns.md`               | ui-ux-pro-max / frontend-design スキル使用ガイド              |

### キーファイル

| パス                                                   | 内容                                                                           |
| ------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `src/shared/db/prisma.ts`                              | `prisma` インスタンス（`$extends` 適用済み）。型/enum は `@generated/prisma/*` |
| `src/shared/lib/auth.ts`                               | Better Auth 設定・セッション検証                                               |
| `src/shared/lib/constants/cache.ts`                    | `CACHE_TAGS`（粒度別）, `CACHE_LIFE`, `getCacheTag`                            |
| `src/shared/lib/sections/registry.ts`                  | セクションレジストリ（18定義、field ヘルパー）                                 |
| `src/app/(admin)/.../_shared/lib/admin-action.ts`      | `executeAdminMutationResult`                                                   |
| `src/proxy.ts`                                         | Admin Gate + Rate Limit（Next.js 16 proxy）                                    |
| `src/app/(public)/_shared/components/design-system/`   | Primitives 11（SC: Container/Stack/Heading 等, CC: Button/Dialog）             |
| `src/app/(admin)/.../_shared/components/table/`        | BaseFilters, SortableColumnHeader, Pagination                                  |
| `src/app/(admin)/.../_shared/components/DetailLoading` | 詳細/編集サブルート用 loading.tsx スケルトン                                   |
| `src/shared/domain/events/`                            | イベント管理（commands/admin-queries/public-queries/registration）             |
| `src/shared/lib/calendar-sync/event-inbound.ts`        | Google Calendar → Event 取り込み（syncToken 差分同期）                         |

### セキュリティ多層防御

- **公開フォーム**: Rate Limit (`formSubmitRateLimiter`) + Turnstile + Zod
- **公開クエリ**: Rate Limit (`publicQueryRateLimiter`) + Zod
- **マイページ**: Rate Limit (`formSubmitRateLimiter`) + `getSession` + `getCustomerByUserId` + Zod
- **管理 Actions**: `executeAdminMutationResult`（認証・権限・監査ログ一括） + Zod
- **API Routes**: `checkPermission`（**認証を最初に実行**）→ Zod、管理ログインは `proxy.ts`（Admin Gate）
- **CSV エクスポート**: `escapeCsvField` で数式インジェクション対策（`=+\-@\t\r` 先頭ガード）

### エージェント（`.claude/agents/` 自動検出、19種）

**使い方パターン**:

- **コード変更後**: `project-reviewer`（総合）、変更内容に応じて `security-reviewer` / `react-compiler-reviewer` / `accessibility-reviewer` を追加
- **ドメイン整合性**: `event-flow-reviewer` / `reservation-flow-reviewer` / `cache-strategy-reviewer` を並列起動
- **構造検証**: `route-structure-reviewer`（ルーティング）/ `db-migration-reviewer`（マイグレーション）
- **検証・ビルド**: `verification`（type-check / lint / build を隔離実行）
- **テスト生成**: `test-writer`（bun:test）/ `e2e-test-writer`（Playwright）/ `test-runner`（失敗診断）
- **プロジェクト全体監査**: 上記を8つ並列起動して一貫性チェック（実証済み）
