# プロジェクト構造

> **Note**: このドキュメントにはプロジェクトのディレクトリ構成とファイル命名規則が記載されています。最終更新: **2026-01-17**

---

## アーキテクチャ概要

**管理/公開/共有 完全分離アーキテクチャ** (Plan 042)

管理画面と公開ページのコンポーネント・ライブラリを完全に分離し、
顧客ごとのカスタマイズとAIによる変更影響把握を容易にする設計。

### 分離ルール

| カテゴリ | 配置先 | 理由 |
|---------|--------|------|
| **管理画面専用** | `src/admin/` | 管理UIは独立してカスタマイズ |
| **公開ページ専用** | `src/public/` | サイトデザインは独立してカスタマイズ |
| **真に共有が必要** | `src/shared/` | DB接続、認証、暗号化など |

### パスエイリアス

```json
{
  "@/admin/*": "src/admin/*",
  "@/public/*": "src/public/*",
  "@/shared/*": "src/shared/*"
}
```

---

## ディレクトリ構成

```
myrrh-rental-space/
├── .next/                    # Next.jsビルド出力
├── .env.local               # ローカル環境変数（gitignore）
├── .env.example             # 環境変数テンプレート
├── .gitignore
├── bun.lock                 # Bunロックファイル（テキスト形式、JSONC）
├── package.json
├── tsconfig.json
├── next.config.ts           # Next.js設定（TypeScript形式）
├── Dockerfile               # Cloud Run用
├── .dockerignore
├── cloudbuild.yaml          # Google Cloud Build設定
├── prisma/
│   ├── schema.prisma        # Prismaスキーマ
│   ├── seed.ts              # シードデータ
│   └── migrations/          # マイグレーションファイル
│
├── src/
│   ├── proxy.ts             # Next.js 16 Proxy（認証・認可）
│   │
│   ├── admin/               # 管理画面専用
│   │   ├── actions/         # 管理用 Server Actions
│   │   │   ├── blog.ts
│   │   │   ├── customer.ts
│   │   │   ├── dashboard.ts
│   │   │   ├── export.ts
│   │   │   ├── homepage-settings.ts
│   │   │   ├── inquiry.ts
│   │   │   ├── navigation.ts
│   │   │   ├── news.ts
│   │   │   ├── page.ts
│   │   │   ├── reservation.ts
│   │   │   ├── settings.ts
│   │   │   ├── space.ts
│   │   │   ├── terms.ts
│   │   │   ├── upload.ts
│   │   │   └── user.ts
│   │   ├── components/      # 管理専用コンポーネント（shadcn/ui ベース）
│   │   │   ├── ui/          # shadcn/ui コンポーネント
│   │   │   │   ├── button.tsx
│   │   │   │   ├── input.tsx
│   │   │   │   ├── card.tsx
│   │   │   │   ├── table.tsx
│   │   │   │   └── ...
│   │   │   ├── editor/      # Lexicalエディタ
│   │   │   │   ├── lexical/
│   │   │   │   ├── inline/
│   │   │   │   └── shared/
│   │   │   ├── media-picker/ # メディア選択UI
│   │   │   └── status-badges.tsx
│   │   ├── contexts/        # 管理画面用Context
│   │   │   └── admin-layout-context.tsx
│   │   ├── hooks/           # 管理画面用Hooks
│   │   │   ├── use-media-picker.tsx
│   │   │   └── use-calendar-state.ts
│   │   ├── lib/             # 管理専用ライブラリ
│   │   │   ├── permissions.ts
│   │   │   ├── audit.ts
│   │   │   ├── stripe.ts
│   │   │   ├── google-calendar.ts
│   │   │   ├── calendar-sync.ts
│   │   │   ├── ical.ts
│   │   │   ├── validations/
│   │   │   ├── settings/
│   │   │   ├── api-keys/
│   │   │   ├── calendar/
│   │   │   └── errors/
│   │   └── types/           # 管理専用型定義
│   │       ├── server-actions.ts
│   │       ├── admin-layout.ts
│   │       ├── api-keys.ts
│   │       ├── editor-panel.ts
│   │       └── media-picker.ts
│   │
│   ├── public/              # 公開ページ専用
│   │   ├── actions/         # 公開用 Server Actions
│   │   │   ├── contact.ts
│   │   │   ├── reservation.ts
│   │   │   ├── blog-comment.ts
│   │   │   ├── sidebar.ts
│   │   │   └── terms.ts
│   │   ├── components/      # 公開専用コンポーネント（tailwind-variants ベース）
│   │   │   ├── ui/          # カスタム UI コンポーネント
│   │   │   │   ├── Button.tsx
│   │   │   │   ├── Input.tsx
│   │   │   │   ├── Card.tsx
│   │   │   │   └── ...
│   │   │   ├── layouts/     # 公開ページレイアウト
│   │   │   │   ├── Header.tsx
│   │   │   │   ├── Footer.tsx
│   │   │   │   └── MobileMenu.tsx
│   │   │   ├── sections/    # ページセクション
│   │   │   │   ├── Hero.tsx
│   │   │   │   ├── BlogSection.tsx
│   │   │   │   ├── NewsSection.tsx
│   │   │   │   └── FAQSection.tsx
│   │   │   ├── sidebar/     # サイドバー
│   │   │   ├── a11y/        # アクセシビリティ
│   │   │   ├── analytics/   # アナリティクス
│   │   │   ├── seo/         # SEO
│   │   │   └── Turnstile.tsx
│   │   ├── emails/          # React Emailテンプレート
│   │   │   ├── reservation-confirmation.tsx
│   │   │   └── ...
│   │   ├── lib/             # 公開専用ライブラリ
│   │   │   ├── blog-queries.ts
│   │   │   ├── page-metadata.ts
│   │   │   ├── layout-settings.ts
│   │   │   ├── reservation-utils.ts
│   │   │   ├── seo/
│   │   │   ├── a11y/
│   │   │   ├── nuqs/
│   │   │   └── analytics/
│   │   └── types/           # 公開専用型定義
│   │
│   ├── shared/              # 共有ライブラリ
│   │   ├── generated/       # 自動生成ファイル
│   │   │   └── prisma/      # Prisma Client
│   │   ├── lib/             # 共有ユーティリティ
│   │   │   ├── prisma.ts    # Prisma Client
│   │   │   ├── auth.ts      # Better Auth設定
│   │   │   ├── auth-client.ts
│   │   │   ├── crypto.ts    # 暗号化
│   │   │   ├── utils.ts     # 汎用ユーティリティ
│   │   │   ├── email.ts     # メール設定
│   │   │   ├── email-service.ts # Resendサービス
│   │   │   ├── supabase.ts  # Supabase Client
│   │   │   ├── storage.ts   # Supabase Storage
│   │   │   ├── turnstile.ts # Turnstile検証
│   │   │   ├── rate-limit.ts
│   │   │   ├── action-helpers.ts
│   │   │   └── json-validators.ts
│   │   └── types/           # 共有型定義
│   │       ├── prisma.ts    # Prisma WhereInput型
│   │       └── better-auth.d.ts
│   │
│   └── app/                 # Next.js App Router
│       ├── layout.tsx       # ルートレイアウト
│       ├── globals.css      # グローバルスタイル（Tailwind 4設定含む）
│       ├── favicon.ico
│       ├── sitemap.ts       # 動的サイトマップ生成
│       ├── robots.ts        # robots.txt 生成
│       ├── (public)/        # 公開ページグループ
│       │   ├── layout.tsx
│       │   ├── page.tsx     # ホームページ
│       │   ├── about/
│       │   ├── contact/
│       │   ├── reservation/
│       │   ├── spaces/
│       │   ├── news/
│       │   ├── blog/
│       │   └── ...
│       ├── (admin)/admin/   # 管理画面（Route Group）
│       │   ├── layout.tsx
│       │   ├── page.tsx     # ダッシュボード
│       │   ├── (dashboard)/
│       │   │   ├── spaces/
│       │   │   ├── reservations/
│       │   │   ├── customers/
│       │   │   ├── blog/
│       │   │   ├── news/
│       │   │   ├── pages/
│       │   │   ├── settings/
│       │   │   ├── users/
│       │   │   └── ...
│       │   └── login/
│       └── api/             # API Routes
│           ├── auth/
│           ├── cron/
│           ├── webhooks/
│           └── ...
│
├── public/                  # 静的ファイル
│   └── images/
│
└── docs/                    # ドキュメント
    ├── README.md
    ├── architecture/
    ├── guides/
    ├── operations/
    ├── requirements/
    ├── security/
    └── plans/
```

---

## 主要ファイルの役割

### 設定ファイル

| ファイル | 役割 |
|---------|------|
| `package.json` | 依存関係とスクリプト |
| `tsconfig.json` | TypeScript設定（パスエイリアス含む） |
| `next.config.ts` | Next.js設定（TypeScript形式、React Compiler有効） |
| `prisma/schema.prisma` | データベーススキーマ定義 |
| `components.json` | shadcn/ui設定（`@/admin/components/ui`） |
| `cloudbuild.yaml` | Google Cloud Build設定 |
| `Dockerfile` | Cloud Run用コンテナ定義 |

### Next.js 16固有の設定

- **`src/proxy.ts`**: Next.js 16では`middleware.ts`が`proxy.ts`にリネーム、関数名も`middleware`から`proxy`に変更
- **`src/app/globals.css`**: Tailwind CSS 4の設定を含む（`@theme`ディレクティブ等）
- **React Compiler**: `next.config.ts`で`reactCompiler: true`を設定し、自動メモ化を有効化

### アプリケーションコード

| パス | 役割 |
|------|------|
| `src/app/` | Next.js App Router のページとルート |
| `src/admin/` | 管理画面専用（components, actions, hooks, contexts, lib, types） |
| `src/public/` | 公開ページ専用（components, actions, emails, lib, types） |
| `src/shared/` | 共有（prisma, auth, utils, email, storage, generated/prisma） |

---

## レンダリング戦略

各ページのレンダリング戦略を以下に定義します：

### 公開ページ

| ページ | 戦略 | 設定 | 備考 |
|--------|------|------|------|
| `/` (ホームページ) | ISR | `revalidate: 3600` | 1時間ごとに再生成 |
| `/spaces/[id]` | ISR | `revalidate: 60` | 60秒ごとに再生成 |
| `/reservation` | SSR | 動的 | リアルタイム空き状況 |
| `/contact` | SSG | 静的 | フォームはClient Component |
| `/privacy`, `/terms` | SSG | 静的 | 静的コンテンツ |
| `/news`, `/news/[id]` | ISR | `revalidate: 300` | 5分ごとに再生成 |
| `/blog`, `/blog/[slug]` | ISR | `revalidate: 300` | 5分ごとに再生成 |

### 管理画面

- **`/admin/*`**: すべてSSR、認証必須
- `proxy.ts`で認証チェック

---

## キャッシュ戦略

詳細は [`CACHING.md`](./CACHING.md) を参照してください。

### キャッシュ階層

| レベル | 用途 | API |
|--------|------|-----|
| L1: 静的 | プライバシーポリシー等 | `revalidate: false` |
| L2: ISR | ブログ、お知らせ | `'use cache'` + `cacheLife('hours')` |
| L3: タグベース | 一覧データ | `'use cache'` + `cacheLife` + `cacheTag` |
| L4: 動的 | 予約、管理画面 | `<Suspense>` |
| L5: 非決定的 | Date.now(), Math.random() | `connection()` |

### キャッシュ無効化

- **パスベース**: `revalidatePath()`
- **タグベース**: `revalidateTag('tag', { expire: 0 })`（即時無効化）
- **stale-while-revalidate**: `revalidateTag('tag', 'max')`

---

## Server Components vs Client Components

### Server Components（デフォルト）

- レイアウト、データ表示コンポーネント
- データベースから直接データ取得
- `async`コンポーネントでawait使用可能

### Client Components（`'use client'`必須）

- フォーム入力、状態管理
- アニメーション（GSAP、Motion、Three.js、Pixi.js）
- ブラウザAPI使用（localStorage、window等）

---

## ファイル命名規則

| 種類 | 規則 | 例 |
|------|------|-----|
| Reactコンポーネント | PascalCase | `SpaceCard.tsx` |
| ページコンポーネント | `page.tsx` | `app/spaces/page.tsx` |
| レイアウト | `layout.tsx` | `app/admin/layout.tsx` |
| Server Actions | kebab-case | `admin/space.ts` |
| ユーティリティ | kebab-case | `email-service.ts` |
| 型定義 | kebab-case | `reservation.ts` |
| プライベートフォルダ | `_components/` | `app/admin/_components/` |

---

## インポート順序

```typescript
// 1. React/Next.js
import { useState } from 'react'
import { NextRequest } from 'next/server'

// 2. サードパーティライブラリ
import { z } from 'zod'
import { PrismaClient } from '@/shared/generated/prisma/client'

// 3. 内部モジュール（@/エイリアス）
import { prisma } from '@/shared/lib/prisma'
import { Button } from '@/admin/components/ui'

// 4. 相対インポート
import { formatDate } from './utils'

// 5. 型のみのインポート
import type { Reservation } from '@/shared/types/prisma'
```

---

## 更新履歴

- **2026-01-17**: 管理/公開/共有 完全分離アーキテクチャ (Plan 042) に対応
  - `src/admin/`, `src/public/`, `src/shared/` 構造に全面改訂
  - パスエイリアス説明追加
  - 旧構造（`src/components/`, `src/lib/`, `src/types/`等）を削除
- **2026-01-10**: 実際のプロジェクト構造と照合して全面改訂
  - `next.config.ts`（TypeScript形式）に修正
  - `proxy.ts`の説明追加
  - Tailwind CSS 4対応（globals.css内設定）
- **2026-01-08**: キャッシング戦略の最新APIを反映

---

## 参考資料

- [Next.js 16 Documentation](https://nextjs.org/docs)
- [Next.js App Router Best Practices](https://nextjs.org/docs/app/building-your-application/routing)
- [React Server Components](https://react.dev/reference/rsc/server-components)
