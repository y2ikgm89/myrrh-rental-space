---
paths:
  - src/app/**
  - src/shared/**
---

# プロジェクト構造

> Multiple Root Layouts アーキテクチャ（Next.js 16 推奨パターン）

## ディレクトリ構成

```
src/app/
├── (admin)/admin/(dashboard)/   # 管理画面（URL: /admin/...）
│   ├── layout.tsx               # Admin Root Layout (html/body)
│   └── _shared/                 # 共有コンポーネント・アクション・lib
└── (public)/                    # 公開ページ（Page-First Architecture）
    ├── layout.tsx               # Public Root Layout (html/body, LenisProvider, MobileNav)
    ├── _shared/
    │   ├── actions/             # 公開フォーム Server Actions（認証不要、Turnstile保護）
    │   ├── hooks/               # usePublicForm 等
    │   ├── components/
    │   │   ├── design-system/   # Primitives 10（直接 import のみ・barrel 禁止）
    │   │   ├── layouts/         # site-header, site-footer, page-hero, site-cta, breadcrumb, mobile-nav
    │   │   ├── ui/              # image-gallery, filter-bar, share-buttons, step-indicator, section-label, turnstile-widget
    │   │   └── animations/      # scroll-reveal, fade-in, split-text, parallax-layer, parallax-image, magnetic-button
    │   └── data/                # Server データ関数（business, turnstile）
    ├── _components/homepage/    # ホームページ専用コンポーネント
    ├── reservation/             # 予約ページ（3ステップウィザード）
    └── spaces/[slug]/           # スペース詳細（Page-First）

src/shared/                      # 両方で共有（CSS変数非依存）
  ├── lib/sections/              # セクションレジストリ・定義（17種）・field ヘルパー
  ├── domain/locations/          # Location クエリ (public-queries.ts)
  └── domain/spaces/             # 公開スペースクエリ (public-queries.ts)
prisma/                          # schema.prisma, migrations/, seed.ts
```

## 重要パス

| パス                                                 | 用途                                                 |
| ---------------------------------------------------- | ---------------------------------------------------- |
| `src/app/(admin)/_styles/admin.css`                  | 管理画面専用テーマ                                   |
| `src/app/(public)/_styles/public.css`                | 公開ページテーマ（Luxury White × Bronze）            |
| `src/shared/db/create-app-prisma-client.ts`          | Prisma `$extends` の単一実装・`AppPrismaClient` 型   |
| `src/shared/lib/errors/logger-core.ts`               | 構造化ログ（seed / `server-only` 外モジュール用）    |
| `src/shared/lib/email/`                              | メール送信                                           |
| `src/shared/lib/calendar-sync/`                      | カレンダー同期                                       |
| `src/shared/lib/pricing/`                            | 料金計算                                             |
| `src/shared/domain/settings/queries/`                | 設定クエリ（site/organization/notification/display） |
| `src/shared/domain/settings/integration-commands.ts` | Stripe/GCal/iCal コマンド                            |
| `src/shared/lib/validations/section-defaults.ts`     | セクション defaults/getters/parsers/getSafeConfig    |
| `src/shared/lib/validations/section-metadata.ts`     | セクション labels/icons/categories                   |
| `src/shared/lib/validations/enums/`                  | 型ガード（guards）+ ヘルパー（helpers）              |

## インポートエイリアス

`@/*`（`src/*`）, `@/admin/*`, `@/public/*`, `@/shared/*`, `@generated/*`

## アーキテクチャ境界

- **管理画面パスの二重構造**: `src/app/(admin)/admin/(dashboard)/...` → URL `/admin/...`
- **公開 ↔ 管理の遷移はフルページリロード**（異なる Root Layout）
- 管理画面専用実装は `@/admin/*`、公開画面専用は `@/public/*` に閉じる
- `src/shared/` は CSS 変数に依存しない共通ロジックのみ
- barrel export 禁止（例外: Lexical 内部の `plugins/index.ts`, `nodes/index.ts`）
