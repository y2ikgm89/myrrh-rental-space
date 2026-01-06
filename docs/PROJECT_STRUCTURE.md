# プロジェクト構造

> **Note**: このドキュメントにはプロジェクトのディレクトリ構成とファイル命名規則が記載されています。技術スタックの詳細については、[`AGENTS.md`](../AGENTS.md)を参照してください。

---

## ディレクトリ構成（予定）

```
myrrh-rental-space/
├── .next/                    # Next.jsビルド出力
├── .env.local               # ローカル環境変数（gitignore）
├── .env.example             # 環境変数テンプレート
├── .gitignore
├── bun.lockb                # Bunロックファイル
├── package.json
├── tsconfig.json
├── next.config.js
├── tailwind.config.ts
├── postcss.config.js
├── Dockerfile               # Cloud Run用
├── .dockerignore
├── prisma/
│   ├── schema.prisma        # Prismaスキーマ
│   └── migrations/          # マイグレーションファイル
├── src/
│   ├── app/                 # Next.js App Router
│   │   ├── layout.tsx       # ルートレイアウト
│   │   ├── page.tsx         # ホームページ
│   │   ├── globals.css      # グローバルスタイル
│   │   ├── (public)/        # 公開ページグループ
│   │   │   ├── reservation/
│   │   │   ├── contact/
│   │   │   ├── spaces/
│   │   │   │   └── [id]/
│   │   │   ├── privacy/
│   │   │   ├── news/
│   │   │   └── blog/            # ブログページ
│   │   │       ├── page.tsx     # ブログ一覧
│   │   │       ├── [slug]/
│   │   │       │   └── page.tsx # ブログ詳細
│   │   │       ├── category/
│   │   │       │   └── [slug]/
│   │   │       │       └── page.tsx # カテゴリページ
│   │   │       └── tag/
│   │   │           └── [slug]/
│   │   │               └── page.tsx # タグページ
│   │   ├── (admin)/         # 管理画面グループ
│   │   │   ├── admin/
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── page.tsx        # ダッシュボード
│   │   │   │   ├── reservations/
│   │   │   │   ├── spaces/
│   │   │   │   ├── inquiries/
│   │   │   │   ├── news/
│   │   │   │   ├── blog/         # ブログ管理
│   │   │   │   │   ├── page.tsx  # ブログ記事一覧
│   │   │   │   │   ├── new/
│   │   │   │   │   │   └── page.tsx # ブログ記事作成
│   │   │   │   │   ├── [id]/
│   │   │   │   │   │   └── page.tsx # ブログ記事編集
│   │   │   │   │   ├── categories/
│   │   │   │   │   │   └── page.tsx # カテゴリ管理
│   │   │   │   │   └── tags/
│   │   │   │   │       └── page.tsx # タグ管理
│   │   │   │   ├── settings/     # サイト設定
│   │   │   │   │   ├── page.tsx  # 設定画面メイン（タブナビゲーション）
│   │   │   │   │   ├── basic/
│   │   │   │   │   │   └── page.tsx # 基本情報タブ
│   │   │   │   │   ├── contact/
│   │   │   │   │   │   └── page.tsx # 連絡先情報タブ
│   │   │   │   │   ├── email/
│   │   │   │   │   │   └── page.tsx # メール設定タブ
│   │   │   │   │   ├── seo/
│   │   │   │   │   │   └── page.tsx # SEO設定タブ
│   │   │   │   │   ├── reservation/
│   │   │   │   │   │   └── page.tsx # 予約設定タブ
│   │   │   │   │   ├── notification/
│   │   │   │   │   │   └── page.tsx # 通知設定タブ
│   │   │   │   │   └── other/
│   │   │   │   │       └── page.tsx # その他タブ
│   │   │   │   ├── pages/        # ページ管理
│   │   │   │   │   ├── page.tsx  # ページ一覧
│   │   │   │   │   ├── [slug]/
│   │   │   │   │   │   └── page.tsx # ページ編集
│   │   │   │   │   └── new/
│   │   │   │   │       └── page.tsx # 新規ページ作成
│   │   │   │   ├── customers/   # 顧客管理
│   │   │   │   │   ├── page.tsx  # 顧客一覧（Server Componentで直接データ取得）
│   │   │   │   │   └── [id]/
│   │   │   │   │       └── page.tsx # 顧客詳細（Server Componentで直接データ取得）
│   │   │   │   └── users/
│   │   │   └── api/
│   │   │       └── auth/
│   │   │           └── [...nextauth]/
│   │   └── api/             # API Routes
│   ├── components/          # 共通コンポーネント
│   │   ├── ui/              # 基本UIコンポーネント
│   │   ├── public/          # 公開ページ用コンポーネント
│   │   │   ├── Hero.tsx
│   │   │   ├── SpaceCard.tsx
│   │   │   ├── ReservationForm.tsx
│   │   │   ├── BlogCard.tsx      # ブログ記事カード
│   │   │   ├── BlogContent.tsx   # ブログ記事コンテンツ表示
│   │   │   ├── BlogHeader.tsx    # ブログ記事ヘッダー
│   │   │   ├── RelatedPosts.tsx  # 関連記事
│   │   │   └── BlogSidebar.tsx   # ブログサイドバー
│   │   ├── admin/           # 管理画面用コンポーネント
│   │   │   ├── Dashboard.tsx
│   │   │   ├── ReservationList.tsx
│   │   │   ├── SpaceForm.tsx          # スペース追加・編集フォーム
│   │   │   ├── SpaceImageUpload.tsx   # 画像アップロードコンポーネント
│   │   │   ├── SpaceFacilitiesEditor.tsx  # 設備情報編集コンポーネント
│   │   │   ├── BusinessHoursEditor.tsx   # 営業時間編集コンポーネント
│   │   │   ├── SpaceList.tsx          # スペース一覧コンポーネント
│   │   │   ├── NavigationEditor.tsx   # ナビゲーション編集メインコンポーネント
│   │   │   ├── SettingsTabs.tsx       # 設定画面タブナビゲーション
│   │   │   ├── BasicSettingsForm.tsx # 基本情報設定フォーム
│   │   │   ├── ContactSettingsForm.tsx # 連絡先情報設定フォーム
│   │   │   ├── EmailSettingsForm.tsx  # メール設定フォーム
│   │   │   ├── SeoSettingsForm.tsx   # SEO設定フォーム
│   │   │   ├── ReservationSettingsForm.tsx # 予約設定フォーム
│   │   │   ├── NotificationSettingsForm.tsx # 通知設定フォーム
│   │   │   ├── OtherSettingsForm.tsx # その他設定フォーム
│   │   │   ├── PageList.tsx          # ページ一覧コンポーネント
│   │   │   ├── PageEditor.tsx        # ページ編集コンポーネント
│   │   │   ├── PageForm.tsx          # ページフォーム
│   │   │   ├── CustomerList.tsx      # 顧客一覧コンポーネント
│   │   │   ├── CustomerDetail.tsx    # 顧客詳細コンポーネント
│   │   │   ├── CustomerForm.tsx      # 顧客フォーム
│   │   │   └── CustomerReservations.tsx # 顧客予約履歴コンポーネント
│   │   │   ├── HeaderMenuEditor.tsx   # ヘッダーメニュー編集コンポーネント
│   │   │   ├── FooterMenuEditor.tsx   # フッターメニュー編集コンポーネント
│   │   │   ├── SocialLinksEditor.tsx  # SNSアイコン編集コンポーネント
│   │   │   ├── MenuItemForm.tsx       # メニュー項目フォームコンポーネント
│   │   │   ├── DragDropMenuList.tsx   # ドラッグ&ドロップ対応メニュー一覧
│   │   │   ├── BlogPostList.tsx       # ブログ記事一覧コンポーネント
│   │   │   ├── BlogPostForm.tsx       # ブログ記事追加・編集フォーム
│   │   │   ├── BlogEditor.tsx         # Tiptapエディタコンポーネント
│   │   │   ├── BlogImageUpload.tsx    # ブログ画像アップロードコンポーネント
│   │   │   ├── CategoryList.tsx       # カテゴリ一覧コンポーネント
│   │   │   ├── CategoryForm.tsx       # カテゴリ追加・編集フォーム
│   │   │   ├── TagList.tsx            # タグ一覧コンポーネント
│   │   │   └── TagForm.tsx            # タグ追加・編集フォーム
│   │   │   └── tiptap/                # Tiptap UIコンポーネント
│   │   │       ├── Toolbar.tsx        # エディタツールバー
│   │   │       ├── CustomHeadingButton.tsx
│   │   │       ├── CustomTextButton.tsx
│   │   │       └── ...                # その他のTiptap UIコンポーネント
│   │   └── layout/          # レイアウトコンポーネント
│   │       ├── Header.tsx             # データベースからメニューを取得して動的表示
│   │       ├── Footer.tsx             # データベースからメニューとSNSアイコンを取得して動的表示
│   │       └── AdminSidebar.tsx
│   ├── lib/                 # ユーティリティ・ライブラリ
│   │   ├── prisma.ts        # Prisma Client
│   │   ├── auth.ts          # Auth.js設定
│   │   ├── supabase.ts      # Supabase Client
│   │   ├── validations/     # Zodスキーマ
│   │   │   ├── reservation.ts
│   │   │   ├── inquiry.ts
│   │   │   ├── space.ts            # スペース作成・更新用バリデーションスキーマ
│   │   │   ├── navigation.ts      # ナビゲーション・SNSアイコン用バリデーションスキーマ
│   │   │   ├── blog.ts             # ブログ記事・カテゴリ・タグ用バリデーションスキーマ
│   │   │   ├── settings.ts        # サイト設定用バリデーションスキーマ
│   │   │   ├── page.ts            # ページ管理用バリデーションスキーマ
│   │   │   └── customer.ts        # 顧客管理用バリデーションスキーマ
│   │   └── utils.ts         # 汎用ユーティリティ
│   ├── hooks/               # カスタムフック
│   │   ├── useReservations.ts
│   │   └── useAuth.ts
│   ├── types/               # TypeScript型定義
│   │   ├── reservation.ts
│   │   ├── space.ts
│   │   ├── user.ts
│   │   ├── navigation.ts   # ナビゲーション・SNSアイコン用型定義
│   │   ├── blog.ts         # ブログ記事・カテゴリ・タグ用型定義
│   │   ├── settings.ts     # サイト設定用型定義
│   │   ├── page.ts         # ページ管理用型定義
│   │   └── customer.ts     # 顧客管理用型定義
│   └── actions/             # Server Actions
│       ├── reservation.ts
│       ├── inquiry.ts
│       └── admin/
│           ├── spaces.ts           # スペース管理用Server Actions
│           │                        # - createSpace: スペース作成
│           │                        # - updateSpace: スペース更新
│           │                        # - deleteSpace: スペース削除
│           │                        # - uploadSpaceImages: 画像アップロード
│           │                        # - toggleSpacePublish: 公開フラグ切り替え
│           ├── navigation.ts       # ナビゲーション管理用Server Actions
│           │                        # - createNavigationItem: メニュー項目作成
│           │                        # - updateNavigationItem: メニュー項目更新
│           │                        # - deleteNavigationItem: メニュー項目削除
│           │                        # - reorderNavigationItems: メニュー項目の順序変更
│           │                        # - createSocialLink: SNSアイコン作成
│           │                        # - updateSocialLink: SNSアイコン更新
│           │                        # - deleteSocialLink: SNSアイコン削除
│           │                        # - updateSiteSettings: サイト設定更新（非推奨、削除予定）
│           ├── settings.ts         # サイト設定用Server Actions
│           │                        # - getSettings: 設定取得
│           │                        # - updateBasicSettings: 基本情報更新
│           │                        # - updateContactSettings: 連絡先情報更新
│           │                        # - updateEmailSettings: メール設定更新
│           │                        # - updateSeoSettings: SEO設定更新
│           │                        # - updateReservationSettings: 予約設定更新
│           │                        # - updateNotificationSettings: 通知設定更新
│           │                        # - updateOtherSettings: その他設定更新
│           ├── pages.ts            # ページ管理用Server Actions
│           │                        # - getPages: ページ一覧取得
│           │                        # - getPageBySlug: ページ取得（スラッグ指定）
│           │                        # - createPage: ページ作成
│           │                        # - updatePage: ページ更新
│           │                        # - deletePage: ページ削除
│           │                        # - togglePagePublish: 公開フラグ切り替え
│           ├── customers.ts        # 顧客管理用Server Actions
│           │                        # - getCustomerById: 顧客取得（ID指定）
│           │                        # - getCustomerByEmail: 顧客取得（メールアドレス指定）
│           │                        # - createCustomer: 顧客作成
│           │                        # - updateCustomer: 顧客更新
│           │                        # - deleteCustomer: 顧客削除（論理削除）
│           │                        # - getCustomerReservations: 顧客予約履歴取得
│           │                        # - recalculateCustomerStats: 顧客統計情報再計算
│           ├── blog.ts              # ブログ管理用Server Actions
│           │                        # - createBlogPost: ブログ記事作成
│           │                        # - updateBlogPost: ブログ記事更新
│           │                        # - deleteBlogPost: ブログ記事削除
│           │                        # - getBlogPost: ブログ記事取得
│           │                        # - getBlogPosts: ブログ記事一覧取得
│           │                        # - createBlogCategory: カテゴリ作成
│           │                        # - updateBlogCategory: カテゴリ更新
│           │                        # - deleteBlogCategory: カテゴリ削除
│           │                        # - createBlogTag: タグ作成
│           │                        # - updateBlogTag: タグ更新
│           │                        # - deleteBlogTag: タグ削除
│           │                        # - incrementViewCount: 閲覧数カウント
│           └── reservations.ts
├── public/                  # 静的ファイル
│   ├── images/
│   └── favicon.ico
├── tests/                   # テストファイル
│   ├── unit/
│   └── e2e/
├── docs/                    # ドキュメント
│   ├── PROJECT_STRUCTURE.md
│   └── API.md
├── AGENTS.md                # プロジェクト仕様書
└── README.md
```

## 主要ファイルの役割

### 設定ファイル
- `package.json`: 依存関係とスクリプト
- `tsconfig.json`: TypeScript設定
- `next.config.js`: Next.js設定（画像最適化、環境変数等）
  - **Note**: 本プロジェクトはTurbopackのみを使用する。Webpackフォールバックは行わない。詳細は [`docs/TURBOPACK_REQUIREMENTS.md`](./TURBOPACK_REQUIREMENTS.md) を参照
- `tailwind.config.ts`: Tailwind CSS設定
- `prisma/schema.prisma`: データベーススキーマ定義

### アプリケーションコード
- `src/app/`: Next.js App Routerのページとルート
- `src/components/`: 再利用可能なReactコンポーネント
- `src/lib/`: ライブラリ初期化とユーティリティ
- `src/actions/`: Server Actions（サーバーサイドロジック）
- `src/types/`: TypeScript型定義

### デプロイ関連
- `Dockerfile`: Cloud Run用コンテナ定義
- `.env.example`: 環境変数のテンプレート

---

## レンダリング戦略

各ページのレンダリング戦略を以下に定義します：

### 公開ページ

- **`/` (ホームページ)**: SSG + ISR
  - `revalidate: 3600` (1時間ごとに再生成)
  - 静的コンテンツとスペース一覧を事前生成
  - 管理画面での更新時に`revalidatePath('/')`で即座に再生成

- **`/spaces/[id]` (スペース詳細)**: ISR
  - `revalidate: 60` (60秒ごとに再生成)
  - `generateStaticParams`で主要スペースを事前生成
  - 管理画面での更新時に`revalidatePath('/spaces/[id]')`で即座に再生成

- **`/reservation` (予約ページ)**: SSR
  - 動的コンテンツ（リアルタイム空き状況）
  - 認証不要だが、セッション情報が必要な場合あり

- **`/contact` (お問い合わせ)**: SSG
  - 静的コンテンツのみ

- **`/privacy` (プライバシーポリシー)**: SSG
  - 静的コンテンツのみ

- **`/news` (お知らせ一覧)**: ISR
  - `revalidate: 300` (5分ごとに再生成)
  - ページネーション対応（URLクエリパラメータ管理: [`NUQS_REQUIREMENTS.md`](./NUQS_REQUIREMENTS.md)を参照）

- **`/news/[id]` (お知らせ詳細)**: ISR
  - `revalidate: 300` (5分ごとに再生成)

- **`/blog` (ブログ一覧)**: ISR
  - `revalidate: 300` (5分ごとに再生成)
  - ページネーション対応（URLクエリパラメータ管理: [`NUQS_REQUIREMENTS.md`](./NUQS_REQUIREMENTS.md)を参照）
  - カテゴリ・タグフィルタ対応（URLクエリパラメータ管理: [`NUQS_REQUIREMENTS.md`](./NUQS_REQUIREMENTS.md)を参照）

- **`/blog/[slug]` (ブログ詳細)**: ISR
  - `revalidate: 300` (5分ごとに再生成)
  - `generateStaticParams`で主要記事を事前生成

- **`/blog/category/[slug]` (カテゴリページ)**: ISR
  - `revalidate: 300` (5分ごとに再生成)

- **`/blog/tag/[slug]` (タグページ)**: ISR
  - `revalidate: 300` (5分ごとに再生成)

### 管理画面

- **`/admin/*`**: SSR
  - すべての管理画面ページは認証必須
  - 動的コンテンツ（データベースから取得）
  - Middlewareで認証チェック

---

## キャッシュ戦略

詳細は [`CACHING_STRATEGY.md`](./CACHING_STRATEGY.md) を参照してください。

### Next.js 16 Cache API

- **Server Components**: デフォルトで自動キャッシュ
- **`unstable_cache`**: 関数結果のキャッシュ（タグベースの無効化に対応）
- **`unstable_noStore`**: 動的データのキャッシュ無効化
- **`fetch()`のキャッシュオプション**: 
  - `cache: 'force-cache'`（デフォルト）: 静的データ
  - `cache: 'no-store'`: 動的データ
  - `next: { revalidate: <seconds> }`: ISR
- **Route Handlers**: `export const revalidate = <seconds>`でキャッシュ制御

### データベースクエリキャッシュ

- Prismaクエリは`unstable_cache`でラップしてキャッシュ
- 頻繁にアクセスされるデータ（ナビゲーションメニュー、設定）はISRでキャッシュ
- リアルタイム性が重要なデータ（予約状況）は`unstable_noStore()`でキャッシュしない

### 画像キャッシュ

- Supabase Storageから取得した画像はNext.js Image Componentで最適化
- CDN経由で配信（Supabase CDN）
- WebP形式への自動変換

### キャッシュ無効化

- **パスベース**: `revalidatePath()`で特定のパスを無効化
  - スペース更新: `revalidatePath('/spaces/[id]')`, `revalidatePath('/spaces')`
  - ナビゲーション更新: `revalidatePath('/')`
  - お知らせ更新: `revalidatePath('/news')`
- **タグベース**: `revalidateTag()`でタグに関連するすべてのキャッシュを無効化
  - 例: `revalidateTag('spaces-list')`
- **その他**: 
  - `updateTag()`: タグのタイムスタンプを更新
  - `refresh()`: 現在のページのキャッシュを更新

---

## Server Components vs Client Components

### Server Components（デフォルト）

以下のコンポーネントはServer Componentsとして実装：

- **レイアウトコンポーネント**:
  - `src/components/layout/Header.tsx` - データベースからメニュー取得
  - `src/components/layout/Footer.tsx` - データベースからメニュー・SNSアイコン取得

- **公開ページコンポーネント**:
  - `src/components/public/SpaceCard.tsx` - スペース情報表示
  - `src/components/public/Hero.tsx` - 静的コンテンツ

- **管理画面コンポーネント**:
  - `src/components/admin/SpaceList.tsx` - データ一覧表示
  - `src/components/admin/Dashboard.tsx` - 統計情報表示

### Client Components（`'use client'`が必要）

以下のコンポーネントはClient Componentsとして実装：

- **インタラクティブ要素**:
  - `src/components/public/ReservationForm.tsx` - フォーム入力、状態管理
  - `src/components/admin/SpaceForm.tsx` - フォーム入力、画像アップロード
  - `src/components/admin/NavigationEditor.tsx` - ドラッグ&ドロップ

- **アニメーション**:
  - Three.js/Pixi.jsを使用するコンポーネント
  - GSAP/Framer Motionを使用するコンポーネント

- **ブラウザAPI使用**:
  - localStorageを使用するコンポーネント
  - windowオブジェクトにアクセスするコンポーネント

### Server Componentsの利点

- **SEO**: サーバーサイドでレンダリングされるため、検索エンジンがコンテンツを認識
- **パフォーマンス**: クライアント側のJavaScriptバンドルサイズが削減
- **セキュリティ**: 機密情報をクライアントに送信しない
- **データベースアクセス**: 直接データベースにアクセス可能（API経由不要）

---

## 追加ディレクトリ構造

### `src/middleware.ts`
- 認証・認可ミドルウェア
- ルート保護
- リダイレクト処理

### `src/config/`
- アプリケーション設定ファイル
- 環境変数のバリデーション
- 定数定義

### `src/constants/`
- アプリケーション定数
- 列挙型定義
- 設定値

### インポート順序の例

```typescript
// 1. React/Next.js
import { useState } from 'react'
import { NextRequest } from 'next/server'

// 2. サードパーティライブラリ
import { z } from 'zod'
import { PrismaClient } from '@prisma/client'

// 3. 内部モジュール（@/エイリアス）
import { prisma } from '@/lib/prisma'
import { Button } from '@/components/ui/button'

// 4. 相対インポート
import { formatDate } from './utils'

// 5. 型のみのインポート
import type { Reservation } from '@/types/reservation'
```

---

## 参考資料

### プロジェクトドキュメント

- [`AGENTS.md`](../AGENTS.md) - プロジェクト全体の仕様書
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) - システムアーキテクチャ
- [`FEATURE_REQUIREMENTS.md`](./FEATURE_REQUIREMENTS.md) - 機能要件
- [`API.md`](./API.md) - API仕様

### 外部リソース

- [Next.js 16 Documentation](https://nextjs.org/docs)
- [Next.js App Router Best Practices](https://nextjs.org/docs/app/building-your-application/routing)
- [React Server Components](https://react.dev/reference/rsc/server-components)
- [Next.js Caching](https://nextjs.org/docs/app/building-your-application/caching)
