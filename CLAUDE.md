# CLAUDE.md

> Myrrh Rental Space — レンタルスペース予約管理システム

## コマンド

```bash
bun dev                                       # 開発サーバー
bun run validate                              # type-check → lint
bun run validate && bun run build             # 完全検証（コミット前必須）
bun run build:skip-env                        # env未設定時ビルド
bun run test                                  # 全テスト（40バッチ分離実行）
bun run test:unit                             # Unit テストのみ
bun run test:integration                      # Integration テストのみ
bunx --bun prisma migrate dev --name <name>   # マイグレーション
bun prisma/seed.ts                            # Seed
bun run e2e                                   # E2E テスト（Playwright）
```

> **フック**: Prettier + ESLint --fix + 境界チェック + 型エイリアスガード等（PostToolUse 10本 + PreToolUse/Stop/SessionStart 等 計17本）
> **保護**: `.env*`, `bun.lock`, `prisma/migrations/*.sql` 編集不可（PreToolUse）
> **デプロイ**: Google Cloud Run（`Dockerfile` + `cloudbuild.yaml`）— Vercel 不使用

## アーキテクチャ

Multiple Root Layouts: `(admin)/` と `(public)/` で CSS・認証・レイアウトを完全分離。遷移はフルページリロード。

```
src/app/(admin)/admin/(dashboard)/   管理画面（admin.css, Better Auth）
src/app/(public)/                    公開ページ（Page-First Architecture, Editorial Magazine）
src/shared/domain/                   ドメイン層（commands + admin/public/customer-queries）
src/shared/lib/admin-auth.ts         管理者認証（email/password, RBAC）
src/shared/lib/customer-auth.ts      顧客認証（Google/LINE, マイページ）
src/shared/lib/sections/             セクションレジストリ・定義
generated/prisma/                    Prisma Client（.gitignore対象）
__tests__/                           unit/ + integration/（40バッチ分離実行）
```

公開ページ: Editorial Magazine（Kinfolk/Cereal）— シャープエッジ、serif/sans 対比、bronze accent ≤10% → `project-design-config.md`
レスポンシブ: Fluid-first（`clamp()`）+ Container Queries。Viewport breakpoints はマクロレイアウト切替のみ。

## 技術スタック（非自明な注意点のみ）

| 技術         | 注意点                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Next.js 16   | `'use cache'` + `updateTag`（Server Actions）/ `revalidateTag`（2引数）。PPR: Suspense 内 async SC は `await connection()` 必須 |
| React 19     | Compiler 1.0 自動メモ化（`useCallback`/`useMemo`/`memo` 不要）、`use()`                                                         |
| TypeScript 6 | `erasableSyntaxOnly`（enum 禁止）、`verbatimModuleSyntax`                                                                       |
| Prisma 7     | `createAppPrismaClient` で `$extends` 集約、enum は `@generated/prisma/*`                                                       |
| Tailwind 4   | CSS-first `@theme`、セマンティックトークン必須                                                                                  |
| Better Auth  | 管理/顧客セッション分離（`adminAuth`/`customerAuth`）、RBAC、`generateId: "uuid"` 必須                                          |

### 管理画面 UI コンポーネント

`@/admin/components/ui` から barrel import。主要コンポーネント:

- `ToggleGroup` / `ToggleGroupItem` — セグメント選択（生 radio ボタンの代替。Radix ToggleGroup ベース）
- `SelectionBox` — カード型 radio（大きな選択肢向け）
- `Accordion` / `AccordionItem` / `AccordionTrigger` / `AccordionContent` — 折りたたみ（設定カテゴリ整理等）

---

## 禁止（違反禁止）

### 型・コード品質

- **管理画面で生 HTML `<input type="radio">` 禁止** → `ToggleGroup`（少数選択）または `SelectionBox`（カード型選択）を使用 → `admin-ui-patterns.md`
- **型アサーション（`as`）禁止** → `type-safety.md`
- **ゼロ値型エイリアス禁止** → `export type Foo = Bar`（フィールド追加なし）は禁止。元の型を直接使用
- **className テンプレートリテラル禁止** → `cn()` 使用必須（`@/shared/lib/cn`）。例外: layout.tsx のフォント変数
- **純 CSS コンポーネントへの `"use client"` 禁止** → state/effect/browser API がなければ Server Component
- **後方互換性ハック禁止** → 不要コード完全削除
- **`@/shared/lib/utils` への新規 import 禁止** → `form-data.ts`（FormData ヘルパー）/ `slug.ts`（generateSlug）を直接使用

### Server Actions・キャッシュ

- **Suspense 内 async SC の `connection()` 省略禁止** → PPR は Suspense 境界ごとに動的判定。layout の `headers()` は伝播しない → `admin-ui-patterns.md`
- **`@/shared/lib/auth` / `@/shared/lib/auth-client` import 禁止** → 削除済み。管理側は `admin-auth` / `admin-auth-client`、顧客側は `customer-auth` / `customer-auth-client` を使用
- **`'use cache'` 関数での直接 prisma 呼び出し禁止** → `safeFetch` + `toPlainObject`/`toPlainArray` 必須 → `server-actions.md`
- **公開 Server Action のレート制限省略禁止** → 全公開 mutation に `checkActionRateLimit(formSubmitRateLimiter)` → `server-actions.md`
- **公開 Server Action の Turnstile 省略禁止** → 全公開 write mutation に `validateTurnstile` 必須（認証済みユーザー含む、マイページから呼ぶ共有アクションも対象）
- **公開 Server Action の ID 引数バリデーション省略禁止** → `z.string().uuid()` で検証
- **キャッシュ無効化漏れ禁止** → 顧客統計が変わる操作は `CUSTOMERS` + `customers.detail(id)` 必須。アカウント削除は関連全タグ無効化 → `gotchas.md` §Cron / Webhook
- **ソフトデリート `where` 漏れ禁止** → 全クエリに `deletedAt: null`、リレーション経由も親ガード必須 → `gotchas.md` §ドメイン・予約
- **`verifyAdminSession` の非管理者リダイレクト先を `/admin/login` にすること禁止** → `/` にリダイレクト。`/admin/login` は Admin Gate で 404 になるか無限ループの原因 → `gotchas.md` §Admin Gate
- **Prisma update で optional フィールドに `value || null` 禁止** → `undefined` は Prisma がフィールドをスキップ、`null` は DB を NULL に設定。既存値を保持したい場合はフィールドを update データに含めない（`if (value !== undefined) { data.field = value }` パターン）→ `prisma-patterns.md`

### 公開ページ UI

- **公開ページのカード背景に `bg-surface` 禁止** → `border border-border` のみ。例外: Design System Primitive 内部、Hero/Footer/SectionWrapper のレイアウト要素、Lightbox オーバーレイコントロール、loading スケルトン
- **ブラウザネイティブ `confirm()`/`alert()` 禁止** → Radix Dialog + インライン `role="alert"` エラー表示を使用
- **ハードコードカラー禁止** → Tailwind クラス・インラインスタイル両方対象。例外: `global-error.tsx` → `tailwind-patterns.md`
- **公開フォームの不統一禁止** → 間隔 `space-y-6`、エラー `<div role="alert">` + border スタイル
- **公開ページで Design System Primitive 迂回禁止** → `ImageFrame`/`Section`/`PageLayout`/`Button` を使用
- **公開ページのセクション背景色交互配置禁止** → 全セクション `bg-background` 統一 → `project-design-config.md`

### プロセス

- **検証なしの完了報告禁止** → 作業中 `bun run type-check`、完了前 `bun run validate`、コミット前 `bun run validate && bun run build`
- **一括修正後の残存チェック省略禁止** → grep/Grep で違反パターンの残存ゼロを確認してから完了報告
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
- **完了時**: `verification-before-completion` → `finishing-a-development-branch`

## ルールとレビュー

`.claude/rules/`（28ファイル）が `paths:` フロントマターで条件付き自動ロード。最重要は `gotchas.md`。
レビューエージェントの指摘は `gotchas.md` と照合して検証する（`revalidateTag` 第2引数や Turbopack チャンク重複は誤報されやすい）。

## 設計判断

- **pricing/coupon ロジック**: `@/shared/lib/pricing/` に関数ベースで分離済み。Strategy/DI パターン不要（単一実装のため YAGNI）
- **email モジュール**: `email/client.ts`（Resend クライアント）+ `email/send.ts`（共通送信）+ `email/*.ts`（テンプレート別）
- **Suspense fallback**: `<head>`/JSON-LD/Analytics は `fallback={null}`（非視覚要素）。Header はスケルトン必須
- **顧客解決ロジック**: `resolveOrCreateCustomer`（`@/shared/domain/reservations/resolve-customer`）は Shopify 型3段階ロジック。リンク済み顧客のデータ保護・userId 不可侵・P2002 フォールバック付き
- **顧客マージ**: `mergeCustomerCommand`（`@/shared/domain/customers/commands`）で Reservation/Inquiry/SpaceReview/EventRegistration の customerId を一括移管 + source 削除。統計再計算付き
- **Better Auth セッション分離**: `adminAuth`（`cookiePrefix: "admin-auth"`）と `customerAuth`（`cookiePrefix: "customer-auth"`、`basePath: "/api/customer-auth"`）で管理者と顧客のセッションを完全分離。API ルートも `/api/auth/` と `/api/customer-auth/` に分離
- **パスワードリセット**: `/forgot-password`・`/reset-password` は `(public)` ルートグループだが `adminAuthClient` を使用（顧客はソーシャルログインのみでパスワードなし）。Admin Gate の外でアクセス可能にするため `(admin)` には置かない
- **Better Auth User 型**: `$Infer` は module augmentation で上書き不可。`AdminUser` / `CustomerUser` 型 = `Omit<Session["user"], "role"> & { role: Role }` + `isValidRole()` ランタイム検証が必須パターン
- **通知システム**: `AdminNotification` モデル（全管理者共有、個人宛なし）。`fireAndForget(createNotificationCommand(...))` で既存アクションの `afterSuccess` から生成。TopBar ベルアイコン + `/admin/notifications` 一覧ページ
- **法的文書管理**: プライバシーポリシー含む全法的文書は Terms システム（`/admin/terms`）で一元管理。`/privacy` は `/terms/privacy-policy` への永続リダイレクト。独立ページ（Section ベース）は作らない
- **Google Maps Embed API**: 公式 Embed API（API key 必須、無料）。Settings に暗号化保存、公開ページで復号して iframe に埋め込み。非公式 URL（`pb=`, `output=embed`）禁止
- **Instagram フィード連携**: Graph API + OAuth / 手動トークン。`@/shared/lib/instagram/`（API クライアント）+ `@/shared/domain/instagram/`（ドメイン層）+ 2つの cron（フィード同期 + トークンリフレッシュ）

## SSOT 定数・シングルトン

| 定数/変数                    | 場所                         | 用途                                                                                                              |
| ---------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `DASHBOARD_ROLES`            | `@/shared/lib/admin-auth`    | ダッシュボードアクセス可能ロール。`verifyAdminSession`・ログインページで共有                                      |
| `adminAuth`                  | `@/shared/lib/admin-auth`    | 管理者用 Better Auth インスタンス（email/password、`cookiePrefix: "admin-auth"`）                                 |
| `customerAuth`               | `@/shared/lib/customer-auth` | 顧客用 Better Auth インスタンス（Google/LINE、`cookiePrefix: "customer-auth"`、`basePath: "/api/customer-auth"`） |
| `prisma`                     | `@/shared/db/prisma`         | `$extends` 済み Prisma クライアント（アプリ全般）                                                                 |
| `basePrisma`                 | `@/shared/db/prisma`         | 拡張前 Prisma クライアント（Better Auth アダプター専用）                                                          |
| `CACHE_TAGS` / `getCacheTag` | `@/shared/lib/constants`     | キャッシュタグ定数（マジックストリング禁止）                                                                      |
| `CACHE_LIFE`                 | `@/shared/lib/constants`     | キャッシュライフ定数（`cacheLife` プリセット）                                                                    |
| `NOTIFICATION_TYPE`          | `enums/helpers`              | 管理通知タイプ定数（DB VARCHAR 管理、`isValidNotificationType` 型ガード付き）                                     |
