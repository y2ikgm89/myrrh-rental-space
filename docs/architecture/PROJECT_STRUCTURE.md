# プロジェクト構造

> **Note**: このドキュメントにはプロジェクトのディレクトリ構成とファイル命名規則が記載されています。最終更新: **2026-01-19**

---

## アーキテクチャ概要

**Next.js コロケーションパターン** (Plan 050)

App Router のルートグループ配下に `_shared/` ディレクトリを配置し、
関連コードをページ近くに配置するNext.js公式推奨パターン。

### 分離ルール

| カテゴリ | 配置先 | 理由 |
|---------|--------|------|
| **管理画面専用** | `src/app/(admin)/admin/(dashboard)/_shared/` | 管理UIコードをページ近くに配置 |
| **公開ページ専用** | `src/app/(public)/_shared/` | 公開サイトコードをページ近くに配置 |
| **真に共有が必要** | `src/shared/` | DB接続、認証、暗号化など |

### パスエイリアス

```json
{
  "@/*": "./src/*",
  "@/admin/*": "./src/app/(admin)/admin/(dashboard)/_shared/*",
  "@/public/*": "./src/app/(public)/_shared/*",
  "@/shared/*": "./src/shared/*"
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
│   ├── shared/              # 共有ライブラリ（@/shared/*）
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
│   │   │   ├── constants/   # 定数・設定
│   │   │   ├── env/         # 環境変数バリデーション
│   │   │   └── validations/ # 共有バリデーション
│   │   ├── types/           # 共有型定義
│   │   ├── hooks/           # 共有フック
│   │   └── contexts/        # 共有コンテキスト
│   │
│   └── app/                 # Next.js App Router
│       ├── layout.tsx       # ルートレイアウト
│       ├── globals.css      # グローバルスタイル（Tailwind 4設定含む）
│       ├── favicon.ico
│       ├── sitemap.ts       # 動的サイトマップ生成
│       ├── robots.ts        # robots.txt 生成
│       │
│       ├── (public)/        # 公開ページグループ
│       │   ├── layout.tsx
│       │   ├── page.tsx     # ホームページ
│       │   ├── _shared/     # 公開ページ専用コード（@/public/*）
│       │   │   ├── actions/     # 公開用 Server Actions
│       │   │   ├── components/  # 公開専用コンポーネント（tailwind-variants ベース）
│       │   │   │   ├── ui/          # カスタム UI コンポーネント
│       │   │   │   ├── layouts/     # Header, Footer, MobileMenu
│       │   │   │   ├── sections/    # Hero, PostSection, NewsSection, FAQSection
│       │   │   │   ├── sidebar/     # 投稿サイドバー
│       │   │   │   ├── a11y/        # アクセシビリティ
│       │   │   │   ├── analytics/   # アナリティクス
│       │   │   │   └── seo/         # SEO
│       │   │   ├── emails/      # React Emailテンプレート
│       │   │   ├── lib/         # 公開専用ライブラリ
│       │   │   └── types/       # 公開専用型定義
│       │   ├── about/
│       │   ├── contact/
│       │   ├── reservation/
│       │   ├── spaces/
│       │   ├── news/
│       │   ├── posts/
│       │   └── ...
│       │
│       ├── (admin)/admin/   # 管理画面（Route Group）
│       │   ├── (auth)/      # 認証関連ページ
│       │   │   ├── login/
│       │   │   └── setup/
│       │   └── (dashboard)/ # ダッシュボード
│       │       ├── layout.tsx
│       │       ├── page.tsx     # ダッシュボードトップ
│       │       ├── _shared/     # 管理画面専用コード（@/admin/*）
│       │       │   ├── actions/     # 管理用 Server Actions
│       │       │   ├── components/  # 管理専用コンポーネント（shadcn/ui ベース）
│       │       │   │   ├── ui/          # shadcn/ui コンポーネント
│       │       │   │   ├── editor/      # Lexicalエディタ
│       │       │   │   ├── media-picker/ # メディア選択UI
│       │       │   │   └── table/       # テーブル関連（BaseFilters等）
│       │       │   ├── contexts/    # 管理画面用Context
│       │       │   ├── hooks/       # 管理画面用Hooks
│       │       │   ├── lib/         # 管理専用ライブラリ
│       │       │   └── types/       # 管理専用型定義
│       │       ├── _components/ # ダッシュボード共通コンポーネント
│       │       ├── spaces/
│       │       ├── reservations/
│       │       ├── customers/
│       │       ├── posts/
│       │       ├── news/
│       │       ├── pages/
│       │       ├── settings/
│       │       ├── staff/
│       │       └── ...
│       │
│       └── api/             # API Routes
│           ├── auth/
│           ├── cron/
│           ├── webhooks/
│           └── ...
│
├── __tests__/               # テストファイル
│   ├── unit/                # ユニットテスト
│   └── integration/         # 統合テスト
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
    ├── templates/
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

| パス | エイリアス | 役割 |
|------|------------|------|
| `src/app/` | `@/*` | Next.js App Router のページとルート |
| `src/app/(admin)/admin/(dashboard)/_shared/` | `@/admin/*` | 管理画面専用（components, actions, hooks, contexts, lib, types） |
| `src/app/(public)/_shared/` | `@/public/*` | 公開ページ専用（components, actions, emails, lib, types） |
| `src/shared/` | `@/shared/*` | 共有（prisma, auth, utils, email, storage, constants, env） |

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
| `/posts`, `/posts/[slug]` | ISR | `revalidate: 300` | 5分ごとに再生成 |

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

- **2026-01-19**: Next.js コロケーションパターン (Plan 050) に対応
  - `src/admin/`, `src/public/` を `src/app/` 配下の `_shared/` に移動
  - パスエイリアス更新（新しい配置先を反映）
  - ディレクトリ構成図を全面改訂
  - テストディレクトリ構造を追加
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
