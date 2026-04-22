# Myrrh Rental Space

## Purpose
レンタルスペース予約管理システム。公開ページ（顧客向け）と管理画面（オーナー向け）の2つの Root Layout で構成。デプロイは Google Cloud Run（Dockerfile + cloudbuild.yaml）。

## Tech Stack
実バージョンは `package.json` + `bun.lock` が SSoT。以下は major.minor 単位。

- Next.js 16.2, React 19.2, TypeScript 6.0
- Bun 1.3 (runtime & package manager、`packageManager: bun@1.3.12` pinned)
- Prisma 7.7 / PostgreSQL（Cloudflare R2 に画像ストレージ移行済み、Supabase は撤去済）
- Better Auth 1.6 (adminAuth / customerAuth 分離、generateId: "uuid")
- Tailwind CSS 4.2 (CSS-first @theme、セマンティックトークン必須)
- Zod 4.3, nuqs 2.8, Lexical 0.43 (NodeState API)
- GSAP + Lenis (アニメーション、公開ページのみ)

## Structure
- `src/app/(admin)/admin/(dashboard)/` - 管理画面 Root Layout (URL: /admin/...)
- `src/app/(public)/` - 公開ページ Root Layout (Page-First Architecture)
- `src/shared/` - 共有コード (CSS 変数非依存、Prisma 集約 / domain logic / 外部 SDK SSoT)
- `prisma/` - schema.prisma, migrations/, seed.ts

## Aliases
- `@/admin/*`, `@/public/*`, `@/shared/*`, `@generated/*`

## Key Patterns
- Server Components 優先、Server Actions
- React Compiler 1.0 有効 (自動メモ化、`useCallback` / `useMemo` / `memo` 禁止 — 例外は `useSyncExternalStore` subscribe 等)
- `as` 型アサーション禁止 (型ガード / `satisfies` / Zod `safeParse` を使う)
- ハードコードカラー禁止 (セマンティックトークン必須、例外は global-error.tsx)
- OKLCH 形式カラー
- Multiple Root Layouts (公開 / 管理画面完全分離、遷移はフルページリロード)
- 管理 write 系は `executeAdminMutationResult`（認証 / 権限 / 監査ログ一括処理）
- Cloudflare R2 ストレージ（`@/shared/lib/r2/*` が SSoT、旧 Supabase 依存は全撤去済）

## 重要な制約
- 配列 uniqueness はスキーマ層で契約（Zod `.refine()`）
- `<input type="datetime-local">` は Zod `.datetime({ local: true })` 必須
- 公開フォーム送信 Server Action は `formSubmitRateLimiter` + Turnstile 必須
- 外部 API は SSoT ヘルパー経由必須（`sendEmail()` / `withGoogleApiRetry()` / `validateTurnstile()` / R2 `uploadFile()`）
