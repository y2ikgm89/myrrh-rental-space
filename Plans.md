# Plans.md - 実装計画

> このファイルは開発タスクを管理します。
>
> **ステータス**: `TODO` | `WIP` | `DONE` | `BLOCKED`

---

## フェーズ1: 基盤構築 `DONE`

### 1.1 プロジェクトセットアップ `DONE`

- [x] Next.js + TypeScript + Tailwind CSS セットアップ
- [x] Bun ランタイム設定
- [x] 必要なパッケージのインストール
- [x] ESLint + Prettier 設定

### 1.2 開発環境構築 `DONE`

- [x] Docker Compose 設定 `[feature:infra]`
  - [x] docker-compose.yml 作成（PostgreSQL 16）
  - [x] .env.local テンプレート作成
  - [x] README に起動手順を追記
- [x] 環境変数の分離
  - [x] .env.local（開発: Docker PostgreSQL）
  - [x] .env.production（本番: Supabase Cloud）→ 本番デプロイ時に作成
  - [x] .env.example 作成

### 1.3 Prisma スキーマ設計 `DONE`

- [x] データベース接続設定（Prisma 7 + pg adapter）
- [x] Prisma スキーマ定義 `[feature:tdd]`
  - [x] Users テーブル（Auth.js統合）
  - [x] Spaces テーブル
  - [x] Reservations テーブル
  - [x] Inquiries テーブル
  - [x] News テーブル
  - [x] BlogPosts/Categories/Tags テーブル
  - [x] Settings テーブル
  - [x] Pages テーブル
  - [x] Customers テーブル
  - [x] NavigationItems/SocialLinks テーブル
- [x] Prisma Client 生成
- [x] マイグレーション実行（Docker起動後） `cc:完了` (2026-01-07)
- [ ] シードデータ投入

### 1.4 認証システム実装 `DONE`

- [x] Auth.js 5 設定（next-auth@beta）
- [x] Prisma Adapter 設定
- [x] JWT セッション管理
- [x] 型定義拡張（next-auth.d.ts）
- [x] proxy.ts（管理画面保護 - Next.js 16 推奨）
- [x] API Route（/api/auth/[...nextauth]）
- [x] RBAC 実装（Role: ADMIN/USER）
- [x] ログインページ UI（フェーズ1.5で実装）

### 1.5 基本レイアウト作成 `DONE`

- [x] ルートレイアウト
- [x] ヘッダーコンポーネント（DB 連携）
- [x] フッターコンポーネント（DB 連携）
- [x] 管理画面レイアウト
- [x] 公開ページ用レイアウト（(public) route group）
- [x] ログインページ UI

---

## フェーズ1.6: UI 基盤整備（完全分離アーキテクチャ） `cc:完了` (2026-01-07)

### アーキテクチャ方針

**管理画面と公開ページは完全に別物。UIは完全分離、ロジック/データは共有。**

```
src/
├── app/
│   ├── (public)/             # 公開ページルーティング
│   ├── admin/                # 管理画面ルーティング
│   └── api/                  # API Routes（共有）
│
├── components/
│   ├── admin/                # 管理画面 UI（完全独立）
│   │   ├── ui/               # shadcn/ui
│   │   ├── layouts/          # AdminSidebar 等
│   │   └── forms/            # LoginForm 等
│   └── site/                 # 公開ページ UI（完全独立）
│       ├── ui/               # カスタム (tv ベース)
│       ├── layouts/          # Header, Footer
│       └── sections/         # Hero, SpaceList 等
│
├── actions/                  # Server Actions（共有）
├── lib/                      # ユーティリティ（共有）
│   ├── prisma.ts
│   ├── auth.ts
│   └── utils.ts              # cn 関数
└── types/                    # 型定義（共有）
```

### 技術スタック（2026年最新・後方互換なし）

| 領域 | 技術 | パターン |
|------|------|----------|
| データ取得 | Server Components | async コンポーネントで直接 Prisma |
| データ変更 | Server Actions | `'use server'` + revalidatePath |
| 認証 | Auth.js 5 | proxy.ts + `auth()` |
| SEO | Metadata API | `generateMetadata` + `sitemap.ts` |
| フォーム | React 19 | `useActionState` + `useFormStatus` |
| バリデーション | Zod 4 | Server/Client 共通スキーマ |

### UI ライブラリ構成

| 領域 | UI ライブラリ | バリアント管理 | スタイリング |
|------|-------------|---------------|-------------|
| 管理画面 | shadcn/ui | CVA（shadcn 内蔵） | clsx + tailwind-merge |
| 公開ページ | カスタム | tailwind-variants | clsx + tailwind-merge |

> **Note**: shadcn/ui は内部で CVA (class-variance-authority) を使用。
> 管理画面に tailwind-variants は不要（CVA と機能が重複）。

### 1.6.1 共通ユーティリティ `cc:完了`

- [x] パッケージインストール
  - [x] 共通: `clsx`, `tailwind-merge`
  - [x] 公開ページ用: `tailwind-variants`
  - [x] shadcn/ui 依存: `@radix-ui/react-slot`, `class-variance-authority`
- [x] `src/lib/utils.ts` 作成（cn 関数: clsx + tailwind-merge）

### 1.6.2 管理画面 UI 基盤（shadcn/ui + CVA） `cc:完了`

- [x] ディレクトリ構造作成（`src/components/admin/`）
- [x] shadcn/ui 初期化（出力先: `@/components/admin/ui`）
  - CVA は shadcn/ui に内蔵されるため追加インストール不要
- [x] 基本コンポーネント追加（Button, Input, Card）
- [x] globals.css に CSS 変数追加（テーマ用）
- [ ] 既存管理画面のリファクタ（フェーズ3で実施）
  - [ ] `admin/layout.tsx` → shadcn 使用
  - [ ] `admin/login/login-form.tsx` → shadcn 使用

### 1.6.3 公開ページ UI 基盤（tailwind-variants + カスタム） `cc:完了`

- [x] ディレクトリ構造作成（`src/components/site/`）
- [x] 公開ページ用カスタムコンポーネント（tv でバリアント定義）
  - [x] `site/ui/Button.tsx`
  - [x] `site/ui/Input.tsx`
  - [x] `site/ui/Card.tsx`
  - [x] `site/ui/Container.tsx`
- [x] 既存レイアウトの移動
  - [x] `layouts/Header.tsx` → `site/layouts/Header.tsx`
  - [x] `layouts/Footer.tsx` → `site/layouts/Footer.tsx`

---

## フェーズ2: 公開ページ `TODO`

### 2.1 ホームページ `cc:TODO`

- [ ] 基本レイアウト
- [ ] ヒーローセクション
- [ ] スペース一覧表示
- [ ] CTA セクション

### 2.2 スペース詳細ページ `TODO`

- [ ] 動的ルーティング設定
- [ ] スペース情報表示
- [ ] 画像ギャラリー
- [ ] 予約ボタン

### 2.3 予約ページ `TODO`

- [ ] カレンダー UI
- [ ] 時間枠選択
- [ ] 予約フォーム
- [ ] Zod バリデーション
- [ ] Turnstile 統合
- [ ] 確認メール送信

### 2.4 お問い合わせページ `TODO`

- [ ] フォーム実装
- [ ] バリデーション
- [ ] Turnstile 統合
- [ ] メール送信

### 2.5 お知らせページ `TODO`

- [ ] 一覧表示
- [ ] 詳細表示
- [ ] ページネーション

### 2.6 ブログページ `TODO`

- [ ] 一覧表示
- [ ] 詳細表示
- [ ] カテゴリ/タグフィルタ
- [ ] 検索機能
- [ ] SEO 最適化

### 2.7 その他ページ `TODO`

- [ ] プライバシーポリシー
- [ ] 利用規約

---

## フェーズ3: 管理画面 `TODO`

### 3.1 ダッシュボード `TODO`

- [ ] 統計表示
- [ ] 最近の予約一覧
- [ ] 最近のお問い合わせ一覧

### 3.2 予約管理 `TODO`

- [ ] 一覧表示（フィルタ/ソート/検索）
- [ ] 予約詳細・編集
- [ ] ステータス管理
- [ ] カレンダービュー

### 3.3 スペース管理 `TODO`

- [ ] 一覧表示
- [ ] 追加/編集フォーム
- [ ] 画像アップロード
- [ ] 公開/非公開切り替え

### 3.4 お問い合わせ管理 `TODO`

- [ ] 一覧表示
- [ ] ステータス管理
- [ ] 返信機能

### 3.5 お知らせ管理 `TODO`

- [ ] CRUD 機能
- [ ] 公開日時設定

### 3.6 ブログ管理 `TODO`

- [ ] 記事 CRUD
- [ ] カテゴリ管理
- [ ] タグ管理
- [ ] Tiptap エディタ統合
- [ ] SEO 設定

### 3.7 顧客管理 `TODO`

- [ ] 一覧表示
- [ ] 詳細表示
- [ ] 予約履歴表示

### 3.8 ナビゲーション管理 `TODO`

- [ ] ヘッダーメニュー編集
- [ ] フッターメニュー編集
- [ ] SNS リンク管理

### 3.9 サイト設定 `TODO`

- [ ] 基本情報設定
- [ ] メール設定
- [ ] SEO 設定
- [ ] 予約設定

### 3.10 ユーザー管理 `TODO`

- [ ] 管理者 CRUD
- [ ] 権限管理

---

## フェーズ4: デザイン強化 `TODO`

### 4.1 3D/2D ビジュアル `TODO`

- [ ] Three.js / Pixi.js 統合
- [ ] ホームページビジュアル

### 4.2 アニメーション `TODO`

- [ ] GSAP / Motion 統合
- [ ] ページ遷移アニメーション
- [ ] インタラクション

### 4.3 UI/UX 改善 `TODO`

- [ ] レスポンシブ最適化
- [ ] アクセシビリティ向上

---

## フェーズ5: デプロイ・最適化 `TODO`

### 5.1 Cloud Run デプロイ `TODO`

- [ ] Dockerfile 作成
- [ ] デプロイ設定
- [ ] 環境変数設定

### 5.2 パフォーマンス最適化 `TODO`

- [ ] 画像最適化
- [ ] バンドルサイズ最適化
- [ ] キャッシュ戦略

### 5.3 セキュリティ監査 `TODO`

- [ ] セキュリティヘッダー
- [ ] 脆弱性スキャン

---

## 次のアクション

**現在のフォーカス**: フェーズ2.1 - ホームページ

1. 「Docker を起動してマイグレーションして」→ DB 構築
2. 「ホームページを作って」→ ヒーロー/スペース一覧/CTA
3. 「スペース詳細を作って」→ スペース詳細ページ

---

## 更新履歴

- **2026-01-07**: 初版作成、プロジェクトセットアップ完了
- **2026-01-07**: フェーズ1.2 追加（Docker 開発環境構築）、番号再割り当て
- **2026-01-07**: フェーズ1.3-1.5 完了（Prisma 7 推奨パターン: `@/generated/prisma/client`）
- **2026-01-07**: Docker + Prisma マイグレーション完了、フェーズ2.1 着手
- **2026-01-07**: フェーズ1.6 追加（UI 基盤整備: 管理画面/公開ページ完全分離構成）
- **2026-01-07**: UI ライブラリ構成を訂正（管理画面: shadcn/ui + CVA、公開ページ: tailwind-variants）
