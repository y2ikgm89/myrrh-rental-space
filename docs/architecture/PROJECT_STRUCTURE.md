# プロジェクト構造

> **Note**: このドキュメントにはプロジェクトのディレクトリ構成とファイル命名規則が記載されています。最終更新: **2026-01-10**

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
├── src/
│   ├── proxy.ts             # Next.js 16 Proxy（認証・認可）
│   ├── app/                 # Next.js App Router
│   │   ├── layout.tsx       # ルートレイアウト
│   │   ├── globals.css      # グローバルスタイル（Tailwind 4設定含む）
│   │   ├── favicon.ico
│   │   ├── sitemap.ts       # 動的サイトマップ生成
│   │   ├── robots.ts        # robots.txt 生成
│   │   ├── loading.tsx      # ルートローディング
│   │   ├── not-found.tsx    # 404ページ
│   │   ├── global-error.tsx # グローバルエラーハンドラー
│   │   ├── (public)/        # 公開ページグループ
│   │   │   ├── layout.tsx   # 公開ページレイアウト
│   │   │   ├── page.tsx     # ホームページ
│   │   │   ├── loading.tsx
│   │   │   ├── error.tsx
│   │   │   ├── not-found.tsx
│   │   │   ├── about/
│   │   │   │   └── page.tsx
│   │   │   ├── faq/
│   │   │   │   └── page.tsx
│   │   │   ├── contact/
│   │   │   │   ├── page.tsx
│   │   │   │   └── _components/
│   │   │   ├── reservation/
│   │   │   │   ├── page.tsx
│   │   │   │   └── _components/
│   │   │   ├── spaces/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx
│   │   │   │       └── _components/
│   │   │   ├── news/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx
│   │   │   │       └── _components/
│   │   │   ├── blog/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [slug]/
│   │   │   │       └── page.tsx
│   │   │   ├── privacy/
│   │   │   │   └── page.tsx
│   │   │   └── terms/
│   │   │       └── page.tsx
│   │   ├── admin/           # 管理画面
│   │   │   ├── layout.tsx   # 管理画面レイアウト（サイドバー含む）
│   │   │   ├── page.tsx     # ダッシュボード
│   │   │   ├── loading.tsx
│   │   │   ├── error.tsx
│   │   │   ├── not-found.tsx
│   │   │   ├── _components/ # 管理画面共通コンポーネント
│   │   │   │   ├── AnalyticsCard.tsx
│   │   │   │   └── LogoutButton.tsx
│   │   │   ├── login/
│   │   │   │   ├── page.tsx
│   │   │   │   └── login-form.tsx
│   │   │   ├── spaces/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── new/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── [id]/
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   ├── edit/
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   └── _components/
│   │   │   │   └── _components/
│   │   │   ├── reservations/
│   │   │   │   ├── page.tsx
│   │   │   │   └── _components/
│   │   │   ├── customers/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── [id]/
│   │   │   │   │   └── page.tsx
│   │   │   │   └── _components/
│   │   │   ├── inquiries/
│   │   │   │   ├── page.tsx
│   │   │   │   └── _components/
│   │   │   ├── news/
│   │   │   │   ├── page.tsx
│   │   │   │   └── _components/
│   │   │   ├── blog/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── new/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── [id]/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── comments/
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   └── _components/
│   │   │   │   └── _components/
│   │   │   ├── pages/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── [slug]/
│   │   │   │   │   └── page.tsx
│   │   │   │   └── _components/
│   │   │   ├── settings/
│   │   │   │   ├── page.tsx  # タブベースの設定画面
│   │   │   │   └── _components/
│   │   │   │       ├── sections/  # タブセクション
│   │   │   │       └── tabs/      # タブコンポーネント
│   │   │   └── users/
│   │   │       ├── page.tsx
│   │   │       └── _components/
│   │   └── api/             # API Routes
│   │       └── health/
│   │           └── route.ts
│   ├── components/          # コンポーネント（完全分離アーキテクチャ）
│   │   │
│   │   │   # 【重要】管理画面と公開ページは完全に別物
│   │   │   # - UI コンポーネントは一切共有しない
│   │   │   # - 共有するのはロジック（actions/, lib/, types/）のみ
│   │   │
│   │   ├── admin/           # 管理画面専用（shadcn/ui ベース）
│   │   │   ├── ui/          # shadcn/ui コンポーネント
│   │   │   │   ├── button.tsx
│   │   │   │   ├── input.tsx
│   │   │   │   ├── card.tsx
│   │   │   │   ├── table.tsx
│   │   │   │   ├── badge.tsx
│   │   │   │   ├── dialog.tsx
│   │   │   │   ├── checkbox.tsx
│   │   │   │   ├── dropdown-menu.tsx
│   │   │   │   ├── label.tsx
│   │   │   │   ├── textarea.tsx
│   │   │   │   └── index.ts     # 一括export
│   │   │   ├── editor/      # Tiptapエディタ
│   │   │   │   ├── RichTextEditor.tsx
│   │   │   │   ├── EditorToolbar.tsx
│   │   │   │   ├── EditorContent.tsx
│   │   │   │   ├── ImageUploadDialog.tsx
│   │   │   │   ├── VideoDialog.tsx
│   │   │   │   └── index.ts
│   │   │   ├── image-upload.tsx
│   │   │   └── ExportButton.tsx
│   │   │
│   │   ├── site/            # 公開ページ専用（tailwind-variants ベース）
│   │   │   ├── ui/          # カスタム UI コンポーネント（tv で定義）
│   │   │   │   ├── Button.tsx
│   │   │   │   ├── Input.tsx
│   │   │   │   ├── Card.tsx
│   │   │   │   ├── Section.tsx
│   │   │   │   ├── SectionTitle.tsx
│   │   │   │   ├── Checkbox.tsx
│   │   │   │   └── index.ts
│   │   │   ├── layouts/     # 公開ページレイアウト
│   │   │   │   ├── Header.tsx         # DB からメニュー取得
│   │   │   │   └── Footer.tsx         # DB からメニュー/SNS 取得（実装はlayouts/Footer.tsx）
│   │   │   ├── sections/    # ページセクション
│   │   │   │   └── Hero.tsx
│   │   │   ├── BlogContentRenderer.tsx
│   │   │   ├── PostListWidgetRenderer.tsx
│   │   │   └── SafeHtml.tsx
│   │   │
│   │   ├── layouts/         # 共通レイアウト
│   │   │   ├── Header.tsx   # ルートヘッダー
│   │   │   ├── Footer.tsx   # ルートフッター
│   │   │   └── MobileMenu.tsx
│   │   │
│   │   ├── analytics/       # アナリティクス
│   │   │   └── GoogleAnalytics.tsx
│   │   │
│   │   ├── seo/             # SEOコンポーネント
│   │   │   └── JsonLd.tsx
│   │   │
│   │   └── turnstile.tsx    # Cloudflare Turnstile
│   │
│   ├── actions/             # Server Actions
│   │   ├── contact.ts
│   │   ├── reservation.ts
│   │   ├── blog-comment.ts
│   │   └── admin/
│   │       ├── blog.ts
│   │       ├── blog-comment.ts
│   │       ├── customer.ts
│   │       ├── dashboard.ts
│   │       ├── export.ts
│   │       ├── homepage-hero.ts
│   │       ├── inquiry.ts
│   │       ├── navigation.ts
│   │       ├── news.ts
│   │       ├── page.ts
│   │       ├── reservation.ts
│   │       ├── space.ts
│   │       ├── upload.ts
│   │       └── user.ts
│   │
│   ├── lib/                 # ユーティリティ・ライブラリ
│   │   ├── prisma.ts        # Prisma Client（Driver Adapters使用）
│   │   ├── auth.ts          # Auth.js設定
│   │   ├── supabase.ts      # Supabase Client
│   │   ├── storage.ts       # Supabase Storage
│   │   ├── email.ts         # メール設定
│   │   ├── email-service.ts # Resendメールサービス
│   │   ├── turnstile.ts     # Turnstile検証
│   │   ├── crypto.ts        # 暗号化ユーティリティ
│   │   ├── stripe.ts        # Stripe設定
│   │   ├── blog-queries.ts  # ブログクエリヘルパー
│   │   ├── utils.ts         # 汎用ユーティリティ（cn関数等）
│   │   ├── validations/     # Zodスキーマ
│   │   │   ├── auth.ts
│   │   │   ├── contact.ts
│   │   │   ├── comment.ts
│   │   │   ├── page.ts
│   │   │   ├── reservation.ts
│   │   │   ├── search-params.ts
│   │   │   ├── space.ts
│   │   │   └── stripe.ts
│   │   ├── nuqs/            # URL State Management
│   │   │   ├── index.ts
│   │   │   ├── parsers.ts
│   │   │   └── search-params.ts
│   │   └── analytics/       # アナリティクス
│   │       ├── config.ts
│   │       └── ga-data-api.ts
│   │
│   ├── emails/              # React Emailテンプレート
│   │   └── ...
│   │
│   ├── generated/           # 自動生成ファイル
│   │   └── prisma/
│   │       └── client/      # Prisma Client（カスタム出力パス）
│   │
│   └── types/               # TypeScript型定義
│       └── ...
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
    ├── plans/
    └── issues/
```

## 主要ファイルの役割

### 設定ファイル

| ファイル | 役割 |
|---------|------|
| `package.json` | 依存関係とスクリプト |
| `tsconfig.json` | TypeScript設定 |
| `next.config.ts` | Next.js設定（TypeScript形式、React Compiler有効） |
| `prisma/schema.prisma` | データベーススキーマ定義 |
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
| `src/components/admin/` | 管理画面専用（shadcn/ui ベース） |
| `src/components/site/` | 公開ページ専用（tailwind-variants ベース） |
| `src/components/layouts/` | ルートレベル共通レイアウト |
| `src/actions/` | Server Actions |
| `src/lib/` | ユーティリティ・ライブラリ |
| `src/generated/` | 自動生成ファイル（Prisma Client） |
| `src/emails/` | React Emailテンプレート |

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
import { PrismaClient } from '@/generated/prisma/client'

// 3. 内部モジュール（@/エイリアス）
import { prisma } from '@/lib/prisma'
import { Button } from '@/components/admin/ui'

// 4. 相対インポート
import { formatDate } from './utils'

// 5. 型のみのインポート
import type { Reservation } from '@/types/reservation'
```

---

## 更新履歴

- **2026-01-10**: 実際のプロジェクト構造と照合して全面改訂
  - `next.config.ts`（TypeScript形式）に修正
  - `proxy.ts`の説明追加
  - Tailwind CSS 4対応（globals.css内設定）
  - 実際のディレクトリ構造に更新
  - 不要なディレクトリ（hooks/, config/, constants/）を削除
- **2026-01-08**: キャッシング戦略の最新APIを反映

---

## 参考資料

- [Next.js 16 Documentation](https://nextjs.org/docs)
- [Next.js App Router Best Practices](https://nextjs.org/docs/app/building-your-application/routing)
- [React Server Components](https://react.dev/reference/rsc/server-components)
