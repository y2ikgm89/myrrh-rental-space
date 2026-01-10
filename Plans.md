# Plans.md - 実装計画

> **ステータス凡例**
>
> - `DONE` 完了 / `WIP` 作業中 / `TODO` 未着手 / `BLOCKED` ブロック中
> - ✅ 完了 / ⏳ 一部完了・要対応 / ○ 未着手

---

## 進捗サマリー


| #   | フェーズ      | 状態     | 進捗   |
| --- | ----------- | ------ | ---- |
| 1   | 基盤構築      | `DONE` | 100% |
| 2   | 公開ページ    | `DONE` | 100% |
| 3   | 管理画面      | `DONE` | 100% |
| 4   | 統合機能      | `DONE` | 100% |
| 5   | デザイン強化   | `WIP`  | 60%  |
| 6   | デプロイ      | `WIP`  | 80%  |
| 7   | リリース前準備 | `DONE` | 100% |


---

## フェーズ1: 基盤構築 `DONE`

### 1.1 プロジェクトセットアップ `DONE`

- ✅ Next.js 16 + TypeScript 5.9 + Tailwind CSS 4
- ✅ Bun 1.3 ランタイム
- ✅ ESLint + Prettier

### 1.2 開発環境構築 `DONE`

- ✅ Docker Compose（PostgreSQL 16）
- ✅ 環境変数分離（.env.local / .env.production）

### 1.3 Prisma スキーマ `DONE`

- ✅ Prisma 7 + PostgreSQL Adapter
- ✅ 全テーブル定義（Users, Spaces, Reservations, Customers, etc.）
- ✅ マイグレーション実行

### 1.4 認証システム `DONE`

- ✅ Auth.js 5 (NextAuth v5)
- ✅ Prisma Adapter + JWT セッション
- ✅ RBAC（ADMIN/USER）
- ✅ ログインページ UI

### 1.5 基本レイアウト `DONE`

- ✅ ルートレイアウト + NuqsAdapter
- ✅ ヘッダー/フッター（DB 連携）
- ✅ 管理画面/公開ページ用レイアウト

### 1.6 UI 基盤 `DONE`

- ✅ 管理画面: shadcn/ui + CVA
- ✅ 公開ページ: tailwind-variants + カスタム
- ✅ nuqs（URL State 管理）

---

## フェーズ2: 公開ページ `DONE`

### 2.1 ホームページ `DONE`

- ✅ Hero セクション
- ✅ SpaceList セクション（Prisma 連携）
- ✅ CTA セクション

### 2.2 スペース詳細 `DONE`

- ✅ 動的ルーティング（`/spaces/[id]`）
- ✅ スペース情報表示
- ✅ 画像ギャラリー（モーダル + キーボード操作）
- ✅ 予約 CTA（sticky サイドバー）
- ✅ SEO メタデータ動的生成

### 2.3 予約ページ `DONE`

- ✅ カレンダー UI
- ✅ 時間枠選択
- ✅ 2段階フォーム（日時 → 顧客情報）
- ✅ Zod バリデーション
- ✅ 予約重複チェック（トランザクション）
- ✅ 顧客自動作成/更新
- ✅ Turnstile 統合
- ✅ 確認メール送信

### 2.4 お問い合わせ `DONE`

- ✅ フォーム実装
- ✅ Zod + Server Action
- ✅ メール送信（Resend）
- ✅ Turnstile 統合

### 2.5 お知らせ `DONE`

- ✅ 一覧表示（nuqs ページネーション）
- ✅ 詳細表示（`/news/[id]`）

### 2.6 ブログ `DONE`

- ✅ 一覧表示（検索・フィルター・ページネーション）
- ✅ 詳細表示（`/blog/[slug]`）
- ✅ カテゴリ/タグフィルタ
- ✅ SEO 最適化

### 2.7 その他 `DONE`

- ✅ プライバシーポリシー（`/privacy`）
- ✅ 利用規約（`/terms`）

---

## フェーズ3: 管理画面 `DONE`

### 3.1 ダッシュボード `DONE`

- ✅ レイアウト・スケルトン
- ✅ LoginTokenGenerator
- ✅ 統計表示（予約数・売上・お問い合わせ・スペース）
- ✅ 本日の予約一覧
- ✅ 最近の予約一覧
- ✅ 最近のお問い合わせ一覧

### 3.2 予約管理 `DONE`

- ✅ 一覧表示（フィルタ/ソート/検索）
- ✅ 予約詳細・編集
- ✅ ステータス管理（確認/キャンセル）
- ✅ ステータス変更時メール送信
- ⏳ カレンダービュー → 将来対応

### 3.3 スペース管理 `DONE`

- ✅ 一覧表示（フィルタ/検索/ページネーション）
- ✅ 追加/編集フォーム（react-hook-form + zod）
- ✅ 公開/非公開切り替え
- ✅ 料金設定
- ✅ 画像アップロード（Supabase Storage）

### 3.4 お問い合わせ管理 `DONE`

- ✅ 一覧表示（フィルタ/検索/ページネーション）
- ✅ ステータス管理（NEW/IN_PROGRESS/RESOLVED/CLOSED）
- ✅ 詳細表示・メール返信リンク
- ✅ 削除機能

### 3.5 お知らせ管理 `DONE`

- ✅ CRUD 機能
- ✅ 公開日時設定
- ✅ 公開/非公開切り替え

### 3.6 ブログ管理 `DONE`

- ✅ 記事 CRUD
- ✅ カテゴリ管理
- ✅ タグ管理（カンマ区切り入力）
- ✅ SEO 設定（メタディスクリプション、OGP）
- ✅ 画像アップロード（Supabase Storage）
- ✅ Tiptap リッチテキストエディタ

### 3.7 顧客管理 `DONE`

- ✅ 一覧表示（フィルタ/検索/ページネーション）
- ✅ 詳細表示（基本情報・統計情報）
- ✅ 予約履歴（最新20件）
- ✅ ステータス管理（NEW/REGULAR/VIP/INACTIVE/BLACKLIST）
- ✅ アクティブ状態切り替え
- ✅ メモ機能

### 3.8 ナビゲーション管理 `DONE`

- ✅ ヘッダーメニュー編集
- ✅ フッターメニュー編集
- ✅ SNS リンク管理

### 3.9 サイト設定 `DONE`

- ✅ 基本情報設定
- ✅ 連絡先情報設定（拡張：郵便番号、都道府県、市区町村等）
- ✅ 事業者情報設定（会社名、代表者名、事業形態、業種、設立日、登録番号等）
- ✅ 営業時間設定（曜日別営業時間、定休日、特別休業日、休業日お知らせ）
- ✅ メール設定
- ✅ SEO 設定
- ✅ 予約設定
- ✅ 通知設定
- ✅ メンテナンス設定
- ✅ 公開ページへの自動反映（Footer、お問い合わせページ）

### 3.10 ユーザー管理 `DONE`

- ✅ 管理者 CRUD（bcrypt パスワードハッシュ）
- ✅ 権限管理（ADMIN/USER ロール）
- ✅ 一覧表示（フィルタ/検索/ページネーション）
- ✅ 詳細表示（統計情報含む）
- ✅ 編集・削除機能

---

## フェーズ4: 統合機能 `DONE`

### 4.1 メール送信（Resend）`DONE`

- ✅ Resendクライアント設定
- ✅ React Emailテンプレート
- ✅ 予約確認メール
- ✅ 予約キャンセル通知
- ✅ お問い合わせ受信確認
- ✅ 管理者通知メール

### 4.2 ファイルアップロード（Supabase Storage）`DONE`

- ✅ Supabaseクライアント設定
- ✅ ストレージサービス（アップロード/削除）
- ✅ スペース画像アップロード
- ✅ ブログ画像アップロード
- ✅ サイト画像（ロゴ・ファビコン・OGP）
- ✅ 画像アップロードコンポーネント

### 4.3 セキュリティ強化 `DONE`

- ✅ パスワードハッシュ（bcrypt）
- ✅ Cloudflare Turnstile（予約・お問い合わせ）
- ✅ 環境変数による切り替え
- ⏳ レート制限 → 将来対応

---

## フェーズ5: デザイン強化 `TODO`

### 5.1 3D/2D ビジュアル `TODO`

- ○ Three.js / Pixi.js 統合
- ○ ホームページビジュアル

### 5.2 アニメーション `TODO`

- ○ GSAP / Motion 統合
- ○ ページ遷移
- ○ インタラクション

### 5.3 UI/UX 改善 `TODO`

- ○ レスポンシブ最適化
- ○ アクセシビリティ向上

### 5.4 管理画面設定タブ化 `DONE`

> 詳細: [docs/plans/settings-tab-refactoring.md](./docs/plans/settings-tab-refactoring.md)

設定画面を6タブ構成にリファクタリングし、使いやすさと拡張性を向上。

| タブ | 含むセクション | 将来の拡張 |
|-----|--------------|-----------|
| 一般 | 基本情報、連絡先 | テーマ設定、多言語 |
| 事業者 | 事業者情報、営業時間 | 複数店舗対応 |
| SEO | SEO設定 | GA4詳細、広告タグ |
| メール | メール設定、通知設定 | テンプレート編集、配信ログ |
| 予約 | 予約設定 | 決済設定、料金ルール |
| システム | メンテナンス | セキュリティ、バックアップ |

**実装完了**:
- ✅ shadcn/ui Tabs コンポーネント追加（Radix UI）
- ✅ 各セクションをコンポーネント分離（9ファイル）
- ✅ タブコンポーネント作成（6ファイル）
- ✅ nuqs でURL状態管理（`?tab=booking`）
- ✅ モバイル対応（スクロールタブ）
- ✅ page.tsx: 773行 → 110行（85%削減）

### 5.5 HTMLサニタイザー改善 `DONE`

> 詳細: SSR対応のisomorphic-dompurifyへ移行

**背景**:
- 従来のDOMPurifyはブラウザDOM依存でSSR時にサニタイズ不可
- SafeHtml.tsxでSSR時に未サニタイズHTMLを返す脆弱性があった

**変更内容**:

| 項目 | 変更前 | 変更後 |
|------|--------|--------|
| ライブラリ | dompurify | isomorphic-dompurify |
| SSRサニタイズ | ❌ スキップ | ✅ 対応 |
| コンポーネント | Client Component | Server Component |
| 脆弱性ウィンドウ | 数百ms〜数秒 | 0ms |

**実装**:
- ✅ パッケージ変更（dompurify → isomorphic-dompurify）
- ✅ SafeHtml.tsx を Server Component 化
- ✅ SSRチェックロジック削除（不要に）
- ✅ useMemo削除（Server Componentでは不要）

### 5.6 Analytics統合 `DONE`

> Google Analytics、GTM、Bing Webmaster Tools、Google Search Consoleの統合

**実装内容**:

| 機能 | 説明 |
|------|------|
| 設定画面 | SEOタブに3カード構成で統合（メタ情報/Analytics/検索エンジン検証） |
| トラッキング | GA4/GTMの排他選択、ID入力で自動スクリプト埋め込み |
| 検証メタタグ | GSC、Bingの検証タグをhead内に自動出力 |
| ダッシュボード | GA Data APIで基本統計（PV、UU、人気ページTop5）表示 |

**Prismaスキーマ追加フィールド**:
```prisma
analyticsType           String?   // "ga4" | "gtm" | null
googleTagManagerId      String?   // GTM-XXXXXXX
bingWebmasterToolsId    String?   // Bing検証タグ
gaPropertyId            String?   // GA4プロパティID（Data API用）
```

**新規ファイル**:
| ファイル | 用途 |
|---------|------|
| `src/lib/analytics/config.ts` | 設定取得ヘルパー |
| `src/lib/analytics/ga-data-api.ts` | GA Data APIクライアント |
| `src/components/analytics/AnalyticsProvider.tsx` | GA4/GTMスクリプト出力 |
| `src/app/admin/_components/AnalyticsCard.tsx` | ダッシュボード統計カード |

**変更ファイル**:
- `prisma/schema.prisma` - 新規フィールド追加
- `src/actions/admin/settings.ts` - スキーマ/型/アクション拡張
- `src/app/admin/settings/_components/sections/SeoSection.tsx` - 3カード構成に拡張
- `src/app/(public)/layout.tsx` - AnalyticsProvider追加
- `src/app/layout.tsx` - 検証メタタグ出力
- `src/app/admin/page.tsx` - AnalyticsCard追加

**使用パッケージ**:
- `@next/third-parties` - Next.js公式GA4/GTMコンポーネント
- `@google-analytics/data` - GA Data API v1クライアント

---

## フェーズ6: デプロイ `WIP`

### 6.1 Cloud Run デプロイ `DONE`

- ✅ Dockerfile 作成（Bun + マルチステージビルド）
- ✅ .dockerignore 設定
- ✅ cloudbuild.yaml（Cloud Build 設定）
- ✅ 環境変数設定（.env.example 更新）
- ✅ ヘルスチェックエンドポイント（/api/health）

### 6.2 パフォーマンス最適化 `DONE`

- ✅ next.config.ts 本番最適化
- ✅ standalone 出力モード
- ✅ 画像最適化設定（AVIF/WebP）
- ✅ パッケージインポート最適化
- ○ バンドルサイズ分析 → 必要に応じて

### 6.3 セキュリティ監査 `DONE`

- ✅ セキュリティヘッダー設定（HSTS, X-Frame-Options, CSP等）
- ✅ X-Powered-By ヘッダー削除
- ○ 脆弱性スキャン → デプロイ後に実施

### 6.4 ビルド検証 `DONE`

- ✅ TypeScript型チェック通過
- ✅ プロダクションビルド成功（Next.js 16.1.1 Turbopack）
- ✅ 静的ページ生成確認（sitemap.xml, robots.txt）
- ✅ 全38ルート正常生成

### 6.5 本番デプロイ `TODO`

- ○ GCPプロジェクト設定
- ○ Secret Manager シークレット登録
- ○ Cloud Build 実行
- ○ 動作確認・ヘルスチェック

---

## フェーズ7: リリース前準備 `DONE`

> **目的**: リリース品質を担保するための必須機能・SEO・UX改善

### 7.1 エラーハンドリング `DONE` 🔴高優先度

ユーザー体験向上のためのエラーページ実装。

| ファイル | 用途 | 実装内容 |
|---------|------|---------|
| `src/app/global-error.tsx` | ルートエラー | html/body含む完全なエラーページ |
| `src/app/error.tsx` | グローバルエラー | サーバーエラー時のフォールバックUI |
| `src/app/not-found.tsx` | 404ページ | 存在しないページへのアクセス時 |
| `src/app/loading.tsx` | ローディング | ページ遷移時のスピナー |
| `src/app/(public)/error.tsx` | 公開ページエラー | Header/Footer維持 |
| `src/app/(public)/not-found.tsx` | 公開ページ404 | Header/Footer維持 |
| `src/app/(public)/loading.tsx` | 公開ページローディング | コンテンツエリアのみ |
| `src/app/admin/error.tsx` | 管理画面エラー | サイドバー維持、開発環境詳細表示 |
| `src/app/admin/not-found.tsx` | 管理画面404 | 管理画面専用デザイン |
| `src/app/admin/loading.tsx` | 管理画面ローディング | スケルトンUI |

- ✅ global-error.tsx（ルートレベルエラー）
- ✅ error.tsx / not-found.tsx / loading.tsx（グローバル）
- ✅ 公開ページ用エラーページ
- ✅ 管理画面用エラーページ

### 7.2 SEO完全対応 `DONE` 🔴高優先度

検索エンジン最適化の完成。

| 機能 | 実装ファイル | 対象 |
|------|---------|------|
| sitemap.xml | `src/app/sitemap.ts` | スペース、ブログ、ニュース、静的ページ |
| robots.txt | `src/app/robots.ts` | クローラー制御、AIボット制限 |
| JSON-LD | `src/components/seo/JsonLd.tsx` | LocalBusiness, Product, Article, FAQ, Breadcrumb |

- ✅ sitemap.xml（動的生成 - スペース/ブログ/ニュース含む）
- ✅ robots.txt（動的生成、AIボット制限含む）
- ✅ JSON-LD構造化データコンポーネント
  - ✅ LocalBusinessJsonLd（会社情報）
  - ✅ ProductJsonLd（スペース詳細）
  - ✅ ArticleJsonLd（ブログ記事）
  - ✅ FAQPageJsonLd（FAQページ）
  - ✅ BreadcrumbJsonLd（パンくず）
  - ✅ WebSiteJsonLd（サイト全体）
- ✅ スペース詳細ページにJSON-LD適用

### 7.3 静的ページ補完 `DONE` 🟡中優先度

ビジネスに必要な静的コンテンツページ。

| ページ | パス | 内容 |
|-------|------|------|
| About | `/about` | 企業/サービス紹介、ミッション、会社概要 |
| FAQ | `/faq` | よくある質問（5カテゴリ、アコーディオンUI） |

- ✅ Aboutページ（`/about`）- 設定から会社情報を動的表示
- ✅ FAQページ（`/faq`）- アコーディオンUI、JSON-LD付き
- ✅ Section / SectionTitle UIコンポーネント追加

### 7.4 シード拡張 `DONE` 🟡中優先度

開発・デモ用の初期データ生成。

```bash
# 実行コマンド
bun prisma/seed.ts --admin <email> <password> [name]  # 管理者のみ
bun prisma/seed.ts --demo                              # デモデータのみ
bun prisma/seed.ts --all <email> <password> [name]     # 全て生成
```

- ✅ サンプルスペースデータ（3件）
- ✅ サンプルニュースデータ（5件、1件は非公開）
- ✅ サンプルブログカテゴリ（3件）・記事（3件）
- ✅ サンプル設定データ
- ✅ 既存データスキップ機能

### 7.5 データエクスポート `DONE` 🟡中優先度

管理画面からのデータ出力機能。

| 対象 | Server Action | 形式 |
|------|---------|------|
| 予約データ | `exportReservations` | CSV（BOM付きUTF-8） |
| 顧客データ | `exportCustomers` | CSV（BOM付きUTF-8） |
| お問い合わせ | `exportInquiries` | CSV（BOM付きUTF-8） |

- ✅ 予約データCSVエクスポート
- ✅ 顧客データCSVエクスポート
- ✅ お問い合わせCSVエクスポート
- ✅ 期間指定フィルター対応
- ✅ ExportButtonコンポーネント

---

## 環境変数設定

### 必須

```env
DATABASE_URL=
AUTH_SECRET=
```

### メール送信（Resend）

```env
RESEND_API_KEY=
EMAIL_FROM=noreply@example.com
EMAIL_FROM_NAME=Myrrh Rental Space
```

### ファイルアップロード（Supabase）

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

### スパム対策（Turnstile）

```env
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
```

### Google Analytics Data API（オプション）

```env
# サービスアカウントのJSONクレデンシャル（文字列化）
GOOGLE_APPLICATION_CREDENTIALS_JSON={"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}
```

> **注意**: GA Data APIを使用してダッシュボードに統計を表示する場合のみ必要。
> サービスアカウントにGA4プロパティへの「閲覧者」権限を付与する必要あり。

---

## 次のアクション

**現在のフォーカス**: フェーズ6 - 本番デプロイ実行


| 優先度 | タスク | コマンド例 | 状態 |
| --- | --- | --- | --- |
| ~~1~~ | ~~エラーページ実装~~ | - | ✅完了 |
| ~~2~~ | ~~SEO対応~~ | - | ✅完了 |
| ~~3~~ | ~~JSON-LD構造化データ~~ | - | ✅完了 |
| ~~4~~ | ~~About/FAQページ~~ | - | ✅完了 |
| ~~5~~ | ~~シード拡張~~ | - | ✅完了 |
| ~~6~~ | ~~CSVエクスポート~~ | - | ✅完了 |
| ~~7~~ | ~~ビルド検証~~ | `bun run build` | ✅完了 |
| 🔴1 | 本番デプロイ実行 | 「Cloud Runにデプロイして」 | 次 |
| 2 | デザイン強化 | 「アニメーションを追加して」 | TODO |

### デプロイ手順

```bash
# 1. GCP プロジェクトの設定
gcloud config set project YOUR_PROJECT_ID

# 2. Secret Manager にシークレットを登録
gcloud secrets create DATABASE_URL --data-file=-
gcloud secrets create NEXTAUTH_SECRET --data-file=-
# ... 他のシークレットも同様に

# 3. Cloud Build でビルド＆デプロイ
gcloud builds submit --config=cloudbuild.yaml

# 4. ドメイン設定（オプション）
gcloud run domain-mappings create --service=myrrh-rental-space --domain=your-domain.com
```


---

## 更新履歴


| 日付         | 内容                          |
| ---------- | --------------------------- |
| 2026-01-07 | 初版作成、フェーズ1 完了               |
| 2026-01-07 | UI 基盤整備、nuqs 導入完了           |
| 2026-01-08 | フェーズ2 公開ページ完了               |
| 2026-01-08 | Plans.md フォーマット統一           |
| 2026-01-09 | 予約管理・スペース管理完了               |
| 2026-01-09 | お問い合わせ・お知らせ・ブログ管理完了         |
| 2026-01-09 | 顧客・ナビゲーション・サイト設定管理完了       |
| 2026-01-09 | ユーザー管理・ダッシュボード統計完了、フェーズ3完了 |
| 2026-01-09 | メール送信・ファイルアップロード・Turnstile完了、フェーズ4完了 |
| 2026-01-09 | Cloud Run デプロイ設定・セキュリティヘッダー・最適化完了、フェーズ6 60% |
| 2026-01-09 | 管理画面設定拡張（事業者情報・営業時間）、公開ページ自動反映 |
| 2026-01-09 | フェーズ7（リリース前準備）計画追加：エラーページ、SEO、静的ページ、エクスポート |
| 2026-01-09 | フェーズ7完了：エラーハンドリング、SEO（sitemap/robots/JSON-LD）、About/FAQ、シード拡張、CSVエクスポート |
| 2026-01-09 | ビルド検証完了（型チェック・プロダクションビルド成功）、フェーズ6 80% |
| 2026-01-09 | 設定画面タブ化リファクタリング完了（6タブ構成、nuqs URL状態管理、773→110行） |
| 2026-01-09 | Tiptapリッチテキストエディタ導入完了（ブログ記事編集、SafeHtml表示、詳細ページ作成） |
| 2026-01-09 | HTMLサニタイザー改善：isomorphic-dompurifyへ移行、SafeHtmlをServer Component化、SSR脆弱性解消 |
| 2026-01-09 | Analytics統合完了：GA4/GTM/GSC/Bing対応、設定画面3カード構成、ダッシュボード統計表示 |

