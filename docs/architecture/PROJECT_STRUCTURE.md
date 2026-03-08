# プロジェクト構造

最終更新: 2026-03-08

## ルート

```text
myrrh-rental-space/
├── generated/
│   └── prisma/               # Prisma generated client (src の外)
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── src/
│   ├── app/
│   │   ├── (public)/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx
│   │   │   ├── [...segments]/page.tsx
│   │   │   ├── posts/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── [...segments]/page.tsx
│   │   │   │   ├── preview/[slug]/page.tsx
│   │   │   │   └── _components/
│   │   │   ├── news/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── [slug]/page.tsx
│   │   │   │   ├── preview/[slug]/page.tsx
│   │   │   │   └── _components/
│   │   │   └── _shared/
│   │   │       ├── components/
│   │   │       ├── data/
│   │   │       ├── hooks/
│   │   │       └── lib/
│   │   ├── (admin)/
│   │   │   ├── layout.tsx
│   │   │   └── admin/(dashboard)/
│   │   │       ├── _shared/
│   │   │       └── ...
│   │   ├── api/
│   │   ├── sitemap.ts
│   │   └── robots.ts
│   ├── proxy.ts
│   └── shared/
│       ├── db/
│       │   ├── better-auth-adapter.ts
│       │   ├── enums.ts
│       │   ├── prisma.ts
│       │   └── ...
│       ├── domain/
│       │   ├── domain-error.ts
│       │   ├── audit-log/
│       │   │   └── queries.ts
│       │   ├── block-template/
│       │   │   ├── commands.ts
│       │   │   ├── queries.ts
│       │   │   └── types.ts
│       │   ├── coupons/
│       │   │   ├── commands.ts
│       │   │   ├── queries.ts
│       │   │   └── types.ts
│       │   ├── customers/
│       │   │   ├── commands.ts
│       │   │   ├── queries.ts
│       │   │   └── types.ts
│       │   ├── dashboard/
│       │   │   └── queries.ts
│       │   ├── faq/
│       │   │   ├── commands.ts
│       │   │   ├── queries.ts
│       │   │   └── types.ts
│       │   ├── instagram/
│       │   │   ├── commands.ts
│       │   │   ├── queries.ts
│       │   │   └── types.ts
│       │   ├── inquiries/
│       │   │   ├── commands.ts
│       │   │   ├── queries.ts
│       │   │   └── types.ts
│       │   ├── locations/
│       │   │   ├── commands.ts
│       │   │   ├── queries.ts
│       │   │   └── types.ts
│       │   ├── news/
│       │   │   ├── admin-queries.ts
│       │   │   ├── commands.ts
│       │   │   ├── queries.ts
│       │   │   └── types.ts
│       │   ├── posts/
│       │   │   ├── admin-queries.ts
│       │   │   ├── commands.ts
│       │   │   ├── queries.ts
│       │   │   ├── routing.ts
│       │   │   └── types.ts
│       │   ├── staff-invitations/
│       │   │   ├── commands.ts
│       │   │   ├── queries.ts
│       │   │   └── types.ts
│       │   ├── settings/
│       │   │   ├── admin-queries.ts
│       │   │   ├── api-key-commands.ts
│       │   │   ├── api-key-helpers.ts
│       │   │   ├── api-key-queries.ts
│       │   │   ├── announcement-bar.ts
│       │   │   ├── commands.ts
│       │   │   ├── queries.ts
│       │   │   ├── robots-txt.ts
│       │   │   └── types.ts
│       │   ├── navigation/
│       │   │   ├── commands.ts
│       │   │   └── queries.ts
│       │   ├── pages/
│       │   ├── sections/
│       │   ├── news/
│       │   ├── post-comments/
│       │   │   ├── commands.ts
│       │   │   ├── queries.ts
│       │   │   └── types.ts
│       │   ├── space-categories/
│       │   │   ├── commands.ts
│       │   │   └── queries.ts
│       │   ├── terms/
│       │   │   ├── admin-queries.ts
│       │   │   ├── commands.ts
│       │   │   └── queries.ts
│       │   └── users/
│       │       ├── commands.ts
│       │       ├── queries.ts
│       │       └── types.ts
│       ├── lib/
│       ├── types/
│       └── contexts/
└── __tests__/
```

## 役割

### `generated/prisma/*`

- Prisma generator の出力先
- lint / type-check の主対象から外す
- アプリからの直接 import は `src/shared/db/*` に限定する

### `src/shared/db/*`

- Prisma facade
- enum / generated type の再公開
- Prisma singleton と Decimal 変換の境界
- Better Auth 向け DB adapter の境界
- `index.ts` / `client.ts` / `models/*` の互換 shim は置かない

### `src/shared/domain/*`

- 業務ロジックと read model の置き場
- UI 層や route 層は domain を経由してデータ取得する
- app 層が参照する型の正本も `types.ts` に置き、generated Prisma model を UI へ漏らさない
- 現在の公開側 source of truth:
- `settings/queries.ts`
  - `settings/announcement-bar.ts`
  - `settings/admin-queries.ts`
  - `settings/api-key-commands.ts`
  - `settings/api-key-helpers.ts`
  - `settings/api-key-queries.ts`
  - `settings/commands.ts`
  - `dashboard/queries.ts`
  - `audit-log/queries.ts`
  - `block-template/queries.ts`
  - `block-template/commands.ts`
  - `coupons/queries.ts`
  - `coupons/commands.ts`
  - `coupons/types.ts`
  - `customers/queries.ts`
  - `customers/commands.ts`
  - `customers/types.ts`
  - `inquiries/queries.ts`
  - `inquiries/commands.ts`
  - `inquiries/types.ts`
  - `locations/queries.ts`
  - `locations/commands.ts`
  - `locations/types.ts`
  - `staff-invitations/queries.ts`
  - `staff-invitations/commands.ts`
  - `staff-invitations/types.ts`
  - `settings/types.ts`
  - `settings/robots-txt.ts`
  - `navigation/queries.ts`
  - `navigation/commands.ts`
  - `pages/queries.ts`
  - `post-comments/queries.ts`
  - `post-comments/commands.ts`
  - `post-comments/types.ts`
  - `sections/queries.ts`
  - `posts/admin-queries.ts`
  - `posts/commands.ts`
  - `posts/queries.ts`
  - `posts/routing.ts`
  - `posts/types.ts`
  - `news/queries.ts`
  - `space-categories/queries.ts`
  - `space-categories/commands.ts`
  - `terms/admin-queries.ts`
  - `terms/commands.ts`
  - `terms/queries.ts`
  - `users/queries.ts`
  - `users/commands.ts`
  - `users/types.ts`

### `src/shared/lib/*`

- infra / framework integration
- auth, env, constants, logger, validation, analytics, external API client
- domain に置くべきでない横断ユーティリティだけを置く
- DB client は直接 import せず、必要な adapter は `src/shared/db/*` 経由で受け取る

### `src/app/(public)/_shared/*`

- 公開 UI 専用の component / hook / presentational helper
- `actions/` は置かない。公開データ取得の source of truth は `src/shared/domain/*`
- `lib/` は framework integration / external API adapter / presentational helper のみを置き、DB query は持たない

### `src/app/(admin)/admin/(dashboard)/_shared/*`

- 管理画面 UI と action adapter
- `admin-action.ts` を薄い write adapter の共通入口にする
- action から Prisma を直接読まず、domain command / query を呼ぶ
- `settings/google-calendar.ts` と `ical-tokens.ts` も thin adapter 化済みで、Google Calendar 設定・Webhook 状態・双方向同期設定・iCal トークン/フィード設定は `src/shared/domain/settings/*` を正本にする
- `api-keys/queries.ts` と `api-keys/mutations.ts` は admin adapter としてのみ残し、Resend / Turnstile / Google Maps / Cloudflare / Google OAuth / custom API key は `src/shared/domain/settings/api-key-queries.ts` と `src/shared/domain/settings/api-key-commands.ts` を正本にする
- `dashboard.ts` と `audit-log.ts` は read adapter としてのみ残し、集計/一覧 query は `src/shared/domain/dashboard/*` と `src/shared/domain/audit-log/*` を正本にする
- `block-template.ts` は block template の read/write adapter としてのみ残し、一覧・詳細・削除は `src/shared/domain/block-template/*` を正本にする
- `coupon.ts` と `customer.ts` は read/write adapter としてのみ残し、一覧・詳細・状態変更は `src/shared/domain/coupons/*` と `src/shared/domain/customers/*` を正本にする
- `faq.ts` は admin adapter としてのみ残し、カテゴリ/項目の一覧・編集・公開状態・並び替えは `src/shared/domain/faq/*` を正本にする
- `instagram.ts` は admin adapter としてのみ残し、接続設定・手動投稿・トークン読取は `src/shared/domain/instagram/*` を正本にする
- `inquiry.ts` と `space-category.ts` は admin adapter としてのみ残し、一覧・詳細・状態遷移は `src/shared/domain/inquiries/*` と `src/shared/domain/space-categories/*` を正本にする
- `location.ts` は admin adapter としてのみ残し、一覧・詳細・公開状態・削除は `src/shared/domain/locations/*` を正本にする
- `post-comment.ts` は admin adapter としてのみ残し、管理コメント一覧・統計・削除復元は `src/shared/domain/post-comments/*` を正本にする
- `news.ts` は admin adapter としてのみ残し、お知らせ一覧・詳細・publish/versioning は `src/shared/domain/news/*` を正本にする
- `post/queries.ts` と `post/mutations.ts` は admin adapter としてのみ残し、投稿一覧・詳細・publish/versioning・taxonomy 管理は `src/shared/domain/posts/*` を正本にする
- `page.ts`, `page-section.ts`, `homepage-settings.ts` は admin adapter としてのみ残し、固定ページ一覧・system page bootstrap・homepage/page section 編集は `src/shared/domain/pages/*` と `src/shared/domain/sections/*` を正本にする
- `space.ts` は admin adapter としてのみ残し、一覧・詳細・公開状態・削除は `src/shared/domain/spaces/*` を正本にする
- `reservation/queries.ts`, `reservation/mutations.ts`, `reservation/admin.ts` は admin adapter としてのみ残し、一覧・詳細・管理作成更新・状態変更は `src/shared/domain/reservations/*` を正本にする
- `media.ts` は admin adapter としてのみ残し、一覧・upload/update/delete は `src/shared/domain/media/*` を正本にする
- `editor-comment.ts` は admin adapter としてのみ残し、comment thread の一覧・詳細・作成更新削除は `src/shared/domain/editor-comments/*` を正本にする
- `staff-invitation.ts` と `user.ts` は admin adapter としてのみ残し、招待フロー・スタッフ一覧・credential account 更新は `src/shared/domain/staff-invitations/*` と `src/shared/domain/users/*` を正本にする
- `terms/queries.ts` と `terms/mutations.ts` は admin adapter としてのみ残し、規約一覧・詳細・同意履歴・状態遷移は `src/shared/domain/terms/*` を正本にする
- `app/api/*`, `sitemap.ts`, `shared/lib/bootstrap.ts`, `shared/lib/calendar-sync.ts`, `shared/lib/google-calendar/*`, `shared/lib/reservation/*`, `shared/lib/slug-validation.ts`, `shared/lib/analytics/config.ts` も DB 直参照を持たず、`src/shared/domain/*` を呼ぶ thin entrypoint / adapter にする

## パスエイリアス

```json
{
  "@/*": "./src/*",
  "@generated/*": "./generated/*",
  "@/admin/*": "./src/app/(admin)/admin/(dashboard)/_shared/*",
  "@/public/*": "./src/app/(public)/_shared/*",
  "@/shared/*": "./src/shared/*"
}
```

## ルーティング構造

### 公開

- `/` ホーム
- `/(system pages)` 固定ページ
- `/posts` 投稿一覧
- `/posts/[...segments]` 投稿詳細
- `/posts/preview/[slug]` 投稿 preview
- `/news` お知らせ一覧
- `/news/[slug]` お知らせ詳細
- `/news/preview/[slug]` お知らせ preview
- `/[...segments]` custom page / root-level post fallback

### 管理

- `/admin/login` signed gate + sign in
- `/admin/*` dashboard

## 命名ルール

- Component: `PascalCase.tsx`
- Utility / validation: `kebab-case.ts`
- Domain query: `queries.ts`
- Domain routing helper: `routing.ts`
- ルートファイル: `page.tsx`, `layout.tsx`, `route.ts`

## 変更時の判断基準

- UI の責務なら route group 側へ置く
- 業務ルールや query なら `src/shared/domain`
- 外部サービスや framework integration なら `src/shared/lib`
- Prisma generated 由来の型や client は `src/shared/db`
