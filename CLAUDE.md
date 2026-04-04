# CLAUDE.md

> Myrrh Rental Space — レンタルスペース予約管理システム

## 🔴 必須（違反禁止）

### 禁止

- **型アサーション（`as`）禁止** → `type-safety.md`
- **`'use cache'` 関数での直接 prisma 呼び出し禁止** → `safeFetch` + `toPlainObject`/`toPlainArray` 必須 → `server-actions.md`
- **後方互換性ハック禁止** → 不要コード完全削除
- **検証なしの完了報告禁止** → 作業中 `bun run type-check`、完了前 `bun run validate`、コミット前 `bun run validate && bun run build`
- **曖昧な要件の推測実装禁止** → `AskUserQuestion`で確認
- **ハードコードカラー禁止** → Tailwind クラス・インラインスタイル両方対象（`style={{ color: "oklch(...)" }}` も違反）。例外: `global-error.tsx`（CSS変数不使用制約）→ `tailwind-patterns.md`
- **公開フォームの不統一禁止** → 間隔 `space-y-6`、エラー `<div role="alert">` + border スタイル
- **ソフトデリート `where` 漏れ禁止** → `deletedAt` を持つ全モデル（Reservation, Event 等）の `findUnique`/`findFirst`/`findMany`/`update` に `deletedAt: null`（`restore*Command` 除く）。リレーション経由のクエリも親モデルの `deletedAt: null` フィルタ必須（例: `where: { eventId, event: { deletedAt: null } }`）→ `gotchas.md`
- **公開 Server Action のレート制限省略禁止** → 全公開 mutation に `checkActionRateLimit(formSubmitRateLimiter)`、公開 query に `publicQueryRateLimiter` → `server-actions.md`
- **公開 Server Action の ID 引数バリデーション省略禁止** → `z.string().uuid()` で検証してから command に渡す
- **純 CSS コンポーネントへの `"use client"` 禁止** → state/effect/browser API のないコンポーネントは Server Component（Tailwind はビルド時 CSS 生成）→ `gotchas.md` §レスポンシブ標準
- **className テンプレートリテラル禁止** → 条件分岐・変数結合・関数呼び出し含む全パターンで `cn()` 使用必須。import は `@/shared/lib/cn`（全ファイル共通）。例外: layout.tsx のフォント変数のみ（`${font.variable}`）

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
公開ページ: Editorial Magazine（Kinfolk/Cereal）— シャープエッジ、serif/sans 対比、bronze accent ≤15%、editorial ボタン（シャープエッジ + bronze hover） → `project-design-config.md`
レスポンシブ: Fluid-first（`clamp()`）+ Container Queries（カードグリッド）。Viewport breakpoints はマクロレイアウト切替のみ。

```
src/app/(admin)/admin/(dashboard)/   管理画面（admin.css, Better Auth）
src/app/(public)/                    公開ページ（Page + Section で管理、Page-First Architecture）
src/shared/lib/sections/             セクションレジストリ・定義・field ヘルパー
src/shared/domain/                   ドメイン層（commands + admin-queries + public-queries + customer-queries）
src/shared/                          共有（CSS変数非依存）
generated/prisma/                    Prisma Client（.gitignore対象、deps stageで再生成）
__tests__/unit/                      単体テスト（lib/hooks/components/shared/api/queries/architecture/db/domain）
__tests__/integration/               統合テスト（actions/admin, actions/public, api）
```

### 技術スタック

| 技術         | Ver    | 注意点                                                                                        |
| ------------ | ------ | --------------------------------------------------------------------------------------------- |
| Next.js      | 16.2.2 | `'use cache'`, `updateTag`, PPR (`cacheComponents: true`)                                     |
| React        | 19.2.4 | Compiler 1.0 (`react-compiler-runtime` 必須), `use()`, `useEffectEvent`                       |
| TypeScript   | 6.0.2  | `target: es2025`, `erasableSyntaxOnly`, `verbatimModuleSyntax`                                |
| Prisma       | 7.6.0  | WASM, `createAppPrismaClient` で `$extends` 集約、enum/型は `@generated/prisma/*` 直接 import |
| Tailwind CSS | 4.2.2  | CSS-first, `@theme`, セマンティックトークン必須, Container Queries コア統合                   |
| Tabler Icons | 3.41   | `@tabler/icons-react`, `Icon` プレフィックス, 型: `TablerIcon`                                |
| Zod          | 4.3.6  | `{ error: }` パラメータ                                                                       |
| Better Auth  | 1.5.6  | RBAC, Google/LINE OAuth, accountLinking, CUSTOMER ロール                                      |
| Stripe       | 22     | Checkout Session, Webhook（`payment_status` チェック必須）、`accounts.retrieve(null)`         |
| Bun          | 1.3.11 | テストランナー (`bun:test`), `bunx --bun`                                                     |
| FullCalendar | 6.1    | `@fullcalendar/react`, 月/週/リスト切替、`'use client'` 必須                                  |
| nuqs         | 2.8.9  | URL 状態管理、パーサーマップ Server/Client 共有必須、`shallow: false` で RSC 再実行           |

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

`.claude/rules/` に `paths:` フロントマターで条件付き自動ロード。各ルールの詳細はファイル内に記載。

**ルート**（`src/**` 編集時）: `gotchas.md`(最重要), `server-actions.md`, `type-safety.md`, `bun-patterns.md`, `prisma-patterns.md`, `auth-patterns.md`, `error-handling.md`, `zod-patterns.md`, `test-quality.md`, `react-patterns.md`, `resend-patterns.md`, `nuqs-patterns.md`, `api-routes.md`, `implementation-quality.md`, `project-structure.md`, `server-only-patterns.md`, `tailwind-patterns.md`

**`frontend/`**（公開・管理 UI 編集時）: `accessibility.md`, `admin-ui-patterns.md`, `admin-inline-editor-patterns.md`, `anti-ai-design.md`, `design-system-memory.md`, `gsap-patterns.md`, `lexical-patterns.md`, `project-design-config.md`, `seo-patterns.md`, `ui-ux-patterns.md`

**`ops/`**（デプロイ関連編集時）: `deployment-patterns.md`

### キーファイル

| パス                                                   | 内容                                                                                                                                                  |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/db/prisma.ts`                              | `prisma` インスタンス（`$extends` 適用済み）。型/enum は `@generated/prisma/*`                                                                        |
| `src/shared/lib/auth.ts`                               | Better Auth 設定・セッション検証                                                                                                                      |
| `src/shared/lib/constants/cache.ts`                    | `CACHE_TAGS`（粒度別）, `CACHE_LIFE`, `getCacheTag`                                                                                                   |
| `src/shared/lib/sections/registry.ts`                  | セクションレジストリ（22定義: 標準17 + homepage-\*5、field ヘルパー）                                                                                 |
| `src/app/(admin)/.../_shared/lib/admin-action.ts`      | `executeAdminMutationResult`                                                                                                                          |
| `src/proxy.ts`                                         | Admin Gate + Rate Limit（Next.js 16 proxy）                                                                                                           |
| `src/app/(public)/_shared/components/design-system/`   | Primitives 15（SC: Container/Stack/Heading/Section/Divider/EditorialCard/PageLayout/Badge/Prose/ImageFrame/Input/Select/Textarea, CC: Button/Dialog） |
| `src/app/(admin)/.../_shared/components/table/`        | BaseFilters, SortableColumnHeader, Pagination                                                                                                         |
| `src/app/(admin)/.../_shared/components/DetailLoading` | 詳細/編集サブルート用 loading.tsx スケルトン                                                                                                          |
| `src/shared/domain/events/`                            | イベント管理（commands/admin-queries/public-queries/registration）                                                                                    |
| `src/shared/lib/calendar-sync/event-inbound.ts`        | Google Calendar → Event 取り込み（syncToken 差分同期）                                                                                                |
| `src/app/(public)/_shared/lib/search-params.ts`        | 公開ページ nuqs パーサーマップ（Server/Client 共有、全パーサー export 必須）                                                                          |
| `src/app/(public)/journal/`                            | news+posts 統合フィード（タブ切替）                                                                                                                   |
| `src/app/(public)/_components/homepage/`               | ホームページ5セクション DB 駆動（`getHomepageSections()` → `homepage-*` 型マッピング、DB 未登録時は defaultProps fallback）                           |

### セキュリティ多層防御

- **公開フォーム**: Rate Limit (`formSubmitRateLimiter`) + Turnstile + Zod
- **公開クエリ**: Rate Limit (`publicQueryRateLimiter`) + Zod
- **マイページ**: Rate Limit (`formSubmitRateLimiter`) + `getSession` + `getCustomerByUserId` + Zod
- **管理 Actions**: `executeAdminMutationResult`（認証・権限・監査ログ一括） + Zod
- **API Routes**: `checkPermission`（**認証を最初に実行**）→ Zod、管理ログインは `proxy.ts`（Admin Gate）
- **CSV エクスポート**: `escapeCsvField` で数式インジェクション対策（`=+\-@\t\r` 先頭ガード）

### キャッシュ無効化の統一

- イベント状態変更（publish/cancel）: `invalidateEventCaches` + `eventRegistrations.list` の両方を無効化
- 予約状態変更: 3点セット必須（`RESERVATIONS` + `detail(id)` + `calendar()`）→ `gotchas.md`

### エージェント（`.claude/agents/` 自動検出、20種）

> **注意**: レビューエージェントの指摘は `gotchas.md` と照合して検証する。特に `revalidateTag` 第2引数（Next.js 16 で必須）や Turbopack チャンク重複（既知制約）は誤報されやすい

**使い方パターン**:

- **コード変更後**: `project-reviewer`（総合）、変更内容に応じて `security-reviewer` / `react-compiler-reviewer` / `accessibility-reviewer` を追加
- **デザイン変更後**: `editorial-consistency-reviewer`（hover/tracking/font-weight/Button の editorial トーン統一チェック）
- **ドメイン整合性**: `event-flow-reviewer` / `reservation-flow-reviewer` / `cache-strategy-reviewer` を並列起動
- **構造検証**: `route-structure-reviewer`（ルーティング）/ `db-migration-reviewer`（マイグレーション）
- **検証・ビルド**: `verification`（type-check / lint / build を隔離実行）
- **テスト生成**: `test-writer`（bun:test）/ `e2e-test-writer`（Playwright）/ `test-runner`（失敗診断）
- **プロジェクト全体監査**: 上記を8つ並列起動して一貫性チェック（実証済み）
