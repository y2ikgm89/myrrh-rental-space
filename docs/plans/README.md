# 実装計画履歴

## 完了した計画

### 025-homepage-settings-to-pages.md (2026-01-15)

ホームページ設定のページ管理への移動

**実装内容**:
- ホームページセクション管理を「設定 > ホームページタブ」から「ページ管理」に移動
- ページ一覧に仮想「ホームページ」行を追加（先頭表示）
- 設定タブを10→9タブに削減
- 既存コンポーネント（HomepageTab, SectionEditor）を100%再利用

**新規ファイル**:
- `src/app/(admin)/admin/(dashboard)/pages/homepage/edit/page.tsx` - 編集画面

**変更ファイル**:
- `src/lib/validations/page.ts` - SYSTEM_PAGE_SLUGSに'homepage'追加
- `src/app/(admin)/admin/(dashboard)/pages/page.tsx` - 仮想行追加
- `src/app/(admin)/admin/(dashboard)/settings/_components/SettingsTabs.tsx` - タブ削除
- `src/app/(admin)/admin/(dashboard)/settings/_components/tabs/index.ts` - export削除
- `src/actions/admin/homepage-settings.ts` - revalidatePath更新
- `src/actions/admin/page.ts` - SYSTEM_PAGE_SLUGS使用に統一

**マイグレーション**: 不要

---

### 024-bun-test-framework.md (2026-01-14)

Bun 1.3.6テストフレームワーク導入

**実装内容**:
- Bun ネイティブテストランナー(`bun:test`)による包括的テスト環境
- Prisma Client モック（外部ライブラリ不使用）
- Better Auth セッションモック
- Next.js API モック（headers, redirect, revalidatePath）
- カスタムアサーション（ActionResult型対応）
- 121テスト、379 expect() calls、150ms実行

**新規ファイル**:
- `__tests__/setup.ts` - グローバルセットアップ
- `__tests__/mocks/` - prisma.ts, auth.ts, next.ts, index.ts
- `__tests__/fixtures/` - users.ts, reservations.ts, index.ts
- `__tests__/helpers/` - session-mock.ts, assertions.ts, index.ts
- `__tests__/unit/lib/permissions.test.ts` - 権限管理テスト
- `__tests__/unit/lib/validations/reservation.test.ts` - 予約バリデーションテスト
- `__tests__/unit/lib/reservation-utils.test.ts` - 予約重複チェックテスト
- `__tests__/unit/types/server-actions.test.ts` - Server Actions HOFテスト

**変更ファイル**:
- `bunfig.toml` - テスト設定追加
- `package.json` - テストスクリプト追加

**マイグレーション**: 不要

---

### 023-grapesjs-removal-homepage-settings.md (2026-01-14)

GrapesJS完全廃止 + ホームページセクション設定機能

**実装内容**:
- GrapesJSビジュアルエディターの完全削除（パッケージ、スキーマ、コード、ドキュメント）
- Blog/News/PageエディターをLexicalに統一
- ホームページセクション設定: CTA、Blog、News、FAQの4セクション
- FAQセクション: 専用モデル（HomepageFaq/HomepageFaqItem）、ドラッグ＆ドロップ並び替え
- 管理画面: 設定ページに「ホームページ」タブ追加
- 公開ページ: 設定ベースのセクション表示

**新規ファイル**:
- `src/actions/admin/homepage-settings.ts` - Server Actions
- `src/app/.../settings/_components/tabs/HomepageTab.tsx` - 管理画面タブ
- `src/components/site/sections/BlogSection.tsx` - ブログセクション
- `src/components/site/sections/NewsSection.tsx` - お知らせセクション
- `src/components/site/sections/FAQSection.tsx` - FAQセクション

**削除ファイル**:
- `src/components/admin/editor/grapesjs/` - GrapesJSエディター全体
- `src/actions/admin/grapes-page.ts`, `src/lib/grapesjs-renderer.ts`
- `src/app/(admin)/.../grapes-pages/`, `src/app/(public)/g/`
- GrapesJS関連docs（016, 017, 018, 020）

**マイグレーション**: `bunx prisma db push` または `bunx prisma migrate dev --name remove_grapesjs_add_homepage_settings`

---

### 022-type-safety-hof-migration.md (2026-01-13)

型安全性向上 + HOFパターン統一

**実装内容**:
- AuditUser型導入: `as never` アサーション30箇所以上を排除
- withPermission HOF移行: 13ファイルの手動認証パターンを統一
- checkReadPermissionヘルパー: 読み取り専用アクション用軽量パターン
- React 19対応: forwardRef廃止、FC型廃止

**変更ファイル**:
- `src/lib/audit.ts` - AuditUser型、isSuccessResult型ガード
- `src/types/server-actions.ts` - AuditUser再エクスポート
- `src/actions/admin/*.ts` - 12ファイルをwithPermission HOFに移行
- `src/components/site/ui/Checkbox.tsx` - forwardRef → ref as props
- `src/contexts/aria-live-context.tsx` - FC → 関数宣言

**マイグレーション**: 不要

---

### 021-seo-accessibility-optimization.md (2026-01-13)

SEO/アクセシビリティ最適化（メタデータ・JSON-LD・WCAG 2.1 AA準拠）

**実装内容**:
- SEOメタデータファクトリ: Settings DBから動的生成、canonical URL対応
- JSON-LD構造化データ: WebSite/Article/NewsArticle、XSSサニタイズ強化
- アクセシビリティ基盤: SkipLink、ARIAライブリージョン、prefers-reduced-motion
- CSS改善: WCAG AA準拠コントラスト比（4.5:1以上）

**新規ファイル**:
- `src/lib/seo/` - metadata-factory.ts, json-ld-config.ts, index.ts
- `src/lib/a11y/` - skip-link.ts, motion-utils.ts, aria-live.ts, index.ts
- `src/contexts/` - aria-live-context.tsx, index.ts
- `src/components/a11y/` - SkipLink.tsx, AriaLiveRegion.tsx, index.ts

**変更ファイル**:
- `src/components/seo/JsonLd.tsx` - NewsArticleJsonLd追加、XSSサニタイズ強化
- `src/app/(public)/page.tsx` - generateMetadata + WebSiteJsonLd追加
- `src/app/(public)/blog/[slug]/page.tsx` - ArticleJsonLd追加
- `src/app/(public)/news/[id]/page.tsx` - NewsArticleJsonLd追加
- `src/app/globals.css` - コントラスト比改善 + prefers-reduced-motion
- `src/app/(public)/layout.tsx` - SkipLink, AriaLiveProvider, AriaLiveRegion追加

**マイグレーション**: 不要

---

### 021-permission-management-system.md (2026-01-13)

権限管理システム（RBAC + 監査ログ + レートリミット）

**実装内容**:
- 5階層ロールシステム: SUPER_ADMIN, ADMIN, EDITOR, VIEWER, USER
- 権限ライブラリ: コードベースRBAC（ROLE_PERMISSIONS定義）
- 監査ログ: 書き込み操作 + セキュリティイベント自動記録
- レートリミット: ログイン試行制限（5回/15分）
- 管理UI: 権限マトリクス、監査ログ一覧、ロール管理強化

**新規ファイル**:
- `src/lib/permissions.ts` - 権限定義・チェック関数
- `src/lib/audit.ts` - 監査ログライブラリ
- `src/lib/rate-limit.ts` - レートリミットライブラリ
- `src/actions/admin/audit-log.ts` - 監査ログServer Actions
- `src/app/(admin)/admin/(dashboard)/audit-logs/` - 監査ログページ
- `src/app/(admin)/admin/(dashboard)/settings/permissions/` - 権限マトリクスページ

**変更ファイル**:
- `prisma/schema.prisma` - Role enum拡張、Permission/RolePermission/AuditLog/LoginAttemptモデル追加
- `src/types/server-actions.ts` - withPermission/withRole HOF追加
- `src/actions/admin/user.ts` - 権限ベース認可に移行
- `src/app/(admin)/admin/(dashboard)/users/` - 新ロールシステム対応UI

**マイグレーション**: `bunx prisma db push` 済み

---

### 020-blog-news-grapesjs-migration.md (2026-01-13)

Blog/News GrapesJS移行 + ステータスEnum化 + バージョン管理

**実装内容**:
- DBスキーマ: `BlogPostStatus`/`NewsStatus` enum、`projectData` JSON、Versionモデル追加
- Server Actions: GrapesJS対応、publish/unpublish分離、バージョン自動作成
- エディター: `BlogInlineEditor`/`NewsInlineEditor`をGrapesJS統合
- 公開ページ: 全クエリを`status: PUBLISHED`に変更

**変更ファイル**:
- `prisma/schema.prisma` - enum、Versionモデル
- `src/actions/admin/blog.ts`, `news.ts` - Server Actions
- `src/app/(admin)/admin/(dashboard)/blog/_components/BlogInlineEditor.tsx` - GrapesJS
- `src/app/(admin)/admin/(dashboard)/news/_components/NewsInlineEditor.tsx` - GrapesJS
- `src/components/admin/editor/inline/EditorHeader.tsx` - publishActions
- 公開ページ/クエリ: status enum使用

**マイグレーション**: `bunx prisma migrate dev --name blog_news_grapesjs_migration`

---

### 019-admin-ui-ux-integration.md (2026-01-13)

Admin UI/UX統合（レスポンシブ対応・ダッシュボード改善）

**実装内容**:
- レスポンシブ対応: サイドバー折りたたみ、モバイルオーバーレイ、TopBar追加
- AdminLayoutContext: サイドバー状態管理（expanded/collapsed/hidden）
- GenericSidePanel: 汎用サイドパネル設計（タブ対応、型安全ジェネリクス）
- ダッシュボードグラフ: Recharts導入、直近30日予約数・売上推移

**新規ファイル**:
- `src/types/admin-layout.ts` - レスポンシブレイアウト型
- `src/contexts/admin-layout-context.tsx` - サイドバー状態Context
- `src/app/(admin)/admin/(dashboard)/_components/ResponsiveSidebar.tsx` - レスポンシブサイドバー
- `src/app/(admin)/admin/(dashboard)/_components/TopBar.tsx` - モバイルヘッダー
- `src/types/editor-panel.ts` - 汎用パネル型
- `src/components/admin/editor/shared/GenericSidePanel.tsx` - 統合サイドパネル
- `src/app/(admin)/admin/(dashboard)/_components/charts/ReservationChart.tsx` - 予約・売上グラフ

**変更ファイル**:
- `src/app/(admin)/admin/(dashboard)/layout.tsx` - レスポンシブレイアウト
- `src/actions/admin/dashboard.ts` - getReservationChartData()追加
- `src/app/(admin)/admin/(dashboard)/page.tsx` - グラフセクション追加

**マイグレーション**: 不要

---

### 018-grapesjs-database-integration.md (2026-01-13)

GrapesJSデータベース連携機能

**実装内容**:
- GrapesPageモデル: ページデータ（title, slug, content, projectData）永続化
- GrapesPageVersionモデル: バージョン履歴（公開時に自動作成）
- ステータス管理: DRAFT/PUBLISHED/ARCHIVED、論理削除（isActive）
- SEO対応: metaDescription, metaKeywords, OGP設定
- Server Actions: CRUD、公開/非公開、バージョン復元、バックアップ/インポート/エクスポート
- 管理画面UI: 一覧、作成ダイアログ、GrapesJSエディター統合、バージョン履歴
- 公開ページ: `/g/[slug]` ルートでGrapesPageコンテンツ表示

**新規ファイル**:
- `src/lib/validations/grapes-page.ts` - Zodスキーマ、型定義
- `src/actions/admin/grapes-page.ts` - Server Actions（全CRUD、バージョン、バックアップ）
- `src/app/(admin)/admin/(dashboard)/grapes-pages/page.tsx` - 一覧ページ
- `src/app/(admin)/admin/(dashboard)/grapes-pages/[id]/edit/page.tsx` - 編集ページ
- `src/app/(admin)/admin/(dashboard)/grapes-pages/_components/` - コンポーネント一式
  - `CreateGrapesPageDialog.tsx` - 新規作成ダイアログ
  - `GrapesPageActions.tsx` - 操作メニュー
  - `GrapesPageEditor.tsx` - エディターUI
  - `GrapesPageSidePanel.tsx` - SEO/OGP設定パネル
  - `GrapesPageVersionHistory.tsx` - バージョン履歴
  - `index.ts` - エクスポート
- `src/app/(public)/g/[slug]/page.tsx` - 公開表示ページ

**変更ファイル**:
- `prisma/schema.prisma` - GrapesPageStatus enum, GrapesPage, GrapesPageVersion モデル追加

**マイグレーション**: `bunx prisma migrate dev --name add_grapes_page` が必要

---

### 017-grapesjs-custom-blocks.md (2026-01-13)

GrapesJSカスタムブロック拡張（レンタルスペース専用）

**実装内容**:
- HeroSection: フルワイドヒーロー（背景画像/グラデーション、CTAボタン）
- ReservationForm: 予約フォームプレースホルダー（公開時に実コンポーネント置換）
- FeatureGrid: 機能紹介グリッド（2-4カラム、アイコン+タイトル+説明）
- TestimonialSlider: お客様の声スライダー（静的/動的データソース選択）
- ContactSection: お問い合わせセクション（2カラム、連絡先+フォーム）
- 新規ブロックカテゴリ「レンタルスペース」追加
- CSS変数対応（テーマカスタマイズ）
- GrapesJSレンダラー（プレースホルダー置換ユーティリティ）

**新規ファイル**:
- `src/components/admin/editor/grapesjs/blocks/hero-section.ts`
- `src/components/admin/editor/grapesjs/blocks/reservation-form.ts`
- `src/components/admin/editor/grapesjs/blocks/feature-grid.ts`
- `src/components/admin/editor/grapesjs/blocks/testimonial-slider.ts`
- `src/components/admin/editor/grapesjs/blocks/contact-section.ts`
- `src/lib/grapesjs-renderer.ts`

**変更ファイル**:
- `src/components/admin/editor/grapesjs/config/editor-config.ts` - rentalカテゴリ追加
- `src/components/admin/editor/grapesjs/blocks/index.ts` - 新ブロック登録
- `public/admin/grapesjs-canvas.css` - ブロックスタイル追加

**マイグレーション**: 不要

---

### 016-grapesjs-visual-editor.md (2026-01-13)

GrapesJSビジュアルエディター環境構築

**実装内容**:
- GrapesJS本体と公式React統合のインストール（@grapesjs/react v2.0.0）
- TypeScript型定義の作成
- Next.js 16クライアントサイド対応（SSR回避）
- カスタムブロック登録（Callout, FAQ, PostListWidget, Button, Divider）
- プラグイン動的インポート（コード分割）
- エディターテーマとキャンバススタイル

**新規ファイル**:
- `src/components/admin/editor/grapesjs/` - エディターコンポーネント一式
- `public/admin/grapesjs-canvas.css` - キャンバス内スタイル

**変更ファイル**:
- `package.json` - GrapesJS関連パッケージ追加

**マイグレーション**: 不要

---

### 015-code-quality-refactoring.md (2026-01-12)

コード品質リファクタリング

**実装内容**:
- Server Actionヘルパー統一（Turnstile検証、Zodエラー抽出）
- React 19フック作成（useFormSubmission、useFormPending）
- Admin UI CVA→TV統一（button、badge、label、dropdown-menu）
- Server Actionsリファクタリング（contact、reservation、blog-comment）
- class-variance-authorityパッケージ削除

**新規ファイル**:
- `src/lib/action-helpers.ts` - Server Actionヘルパー関数
- `src/hooks/use-form-submission.ts` - React 19フォームフック

**変更ファイル**:
- `src/components/admin/ui/button.tsx` - CVA→TV
- `src/components/admin/ui/badge.tsx` - CVA→TV
- `src/components/admin/ui/label.tsx` - 簡略化
- `src/components/admin/ui/dropdown-menu.tsx` - CVA→TV
- `src/actions/contact.ts` - ヘルパー使用
- `src/actions/reservation.ts` - ヘルパー使用
- `src/actions/blog-comment.ts` - ヘルパー使用

**マイグレーション**: 不要

---

### 014-reservation-calendar.md (2026-01-11)

予約管理カレンダービュー機能

**実装内容**:
- 月/週/日の3ビュー切り替え
- ステータス変更（カレンダー上でクリック→ダイアログ）
- スペース表示モード（統一表示・フィルター・分割）
- ステータスフィルター
- URL状態管理（view/date/space/status）
- Clean Architecture: Domain Layer分離

**新規ファイル**:
- `src/lib/calendar/calendar-types.ts` - 型定義
- `src/lib/calendar/calendar-domain.ts` - ドメインロジック
- `src/app/(admin)/admin/reservations/_components/calendar/` - カレンダーコンポーネント一式
- `src/app/(admin)/admin/reservations/calendar/page.tsx` - カレンダーページ

**変更ファイル**:
- `src/actions/admin/reservation.ts` - `getReservationsForCalendar()`, `getSpacesForCalendar()` 追加
- `src/app/(admin)/admin/reservations/page.tsx` - カレンダー表示リンク追加

**マイグレーション**: 不要（スキーマ変更なし）

---

### 013-google-calendar-integration.md (2026-01-11)

Google Calendar連携機能（Phase 1-4 全完了）

**Phase 1: 基本連携**:
- サービスアカウント連携: 共有カレンダーへの予約自動登録
- OAuth連携（オプション）: 管理者個人カレンダーへの登録
- iCal生成: RFC 5545準拠の.icsファイル
- Add to Calendarリンク: Google/Outlook/Apple対応
- 予約作成時の自動同期、キャンセル時のイベント削除

**Phase 2: ステータス変更同期**:
- CONFIRMED時にカレンダーイベント更新（または新規作成）
- CANCELLED時にカレンダーイベント削除

**Phase 3: iCalフィード**:
- トークンベースiCalフィード配信API
- 外部カレンダー（TimeTree等）からの購読

**Phase 4: 双方向同期**:
- ポーリング方式: 1〜60分間隔で変更チェック
- Webhook方式: Google Calendar Push Notifications
- 両方使用可能（推奨）
- 手動同期ボタン
- イベント削除→予約キャンセル、時間変更→予約更新

**新規ファイル**:
- `src/lib/google-calendar.ts` - Google Calendar APIクライアント
- `src/lib/calendar-sync.ts` - 予約同期サービス
- `src/lib/ical.ts` - iCal生成・Add to Calendarリンク
- `src/app/(admin)/admin/settings/_components/sections/GoogleCalendarSection.tsx` - 設定UI
- `src/app/(admin)/admin/settings/_components/sections/ICalFeedSection.tsx` - iCalフィードUI
- `src/app/(admin)/admin/settings/_components/sections/TwoWaySyncSection.tsx` - 双方向同期UI
- `src/app/api/cron/calendar-sync/route.ts` - ポーリングCron API
- `src/app/api/webhooks/google-calendar/route.ts` - Webhook受信API
- `src/app/api/ical/[token]/route.ts` - iCalフィード配信API
- `vercel.json` - Vercel Cron設定

**変更ファイル**:
- `prisma/schema.prisma` - Reservation/Settingsにカレンダー関連フィールド追加
- `src/lib/auth.ts` - Googleプロバイダー追加
- `src/actions/admin/settings.ts` - Google Calendar設定Server Actions
- `src/actions/reservation.ts` - カレンダー同期呼び出し追加
- `src/lib/email-service.ts` - iCal添付・カレンダーリンク追加
- `src/emails/reservation-confirmation.tsx` - カレンダーリンクセクション追加

**環境変数**:
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - OAuth用
- `CRON_SECRET` - ポーリングAPI認証（本番必須）
- `NEXT_PUBLIC_APP_URL` - Webhook URL生成用

**デプロイ時**: `bunx prisma migrate dev --name add_google_calendar_integration` が必要

---

### 012-nextjs-best-practices.md (2026-01-11)

Next.js公式ベストプラクティス準拠改善

**実装内容**:
- adminをRoute Group `(admin)/admin/` に変更（URLは `/admin/...` のまま）
- cache() APIでverifySession/verifyAdminSessionをメモ化（DALパターン）
- withAuth HOFを直接auth()呼び出しに変更（Server Actions用）

**変更ファイル**:
- `src/app/(admin)/admin/` - 新しいRoute Group（移動）
- `src/lib/auth.ts` - verifySession, verifyAdminSession追加
- `src/types/server-actions.ts` - withAuth HOF改善

---

### 011-server-client-separation.md (2026-01-11)

D&DページのServer/Client Component分離

**実装内容**:
- Next.js公式ベストプラクティスに準拠したServer/Client分離
- blog/categories: page.tsx(506行)をServer Component(8行)+Client Component(379行)に分離
- settings/navigation: page.tsx(1068行)をServer Component(23行)+Client Component(780行)に分離
- 共通DragHandleコンポーネント活用（重複削除）

**新規ファイル**:
- `src/app/admin/blog/categories/_components/CategoryManager.tsx`
- `src/app/admin/settings/navigation/_components/NavigationManager.tsx`

**変更ファイル**:
- `src/app/admin/blog/categories/page.tsx` - Server Component化
- `src/app/admin/settings/navigation/page.tsx` - Server Component化

---

### 010-withauth-badge-improvements.md (2026-01-11)

withAuth HOF完全移行 + Badge variant意味的整合

**実装内容**:
- 全Server Actions mutation関数（69関数）をwithAuth HOFに移行
- Badge variantの意味的整合（Inquiry/Customer/Publishステータス色修正）
- CustomerDetail.tsxの重複コード削除
- announcement-bar.tsの認証パターン統一（auth()→withAuth）

**変更ファイル**:
- 11個のServer Actionsファイル（blog, settings, api-keys, navigation, space, user, news, customer, reservation, inquiry, announcement-bar）
- `src/components/admin/status-badges.tsx` - variant修正
- `src/app/admin/customers/[id]/_components/CustomerDetail.tsx` - 重複削除

---

### 009-delayed-improvements.md (2026-01-11)

延期されていたコード改善タスクの実装

**実装内容**:
- StatusBadge共通化: 5つの重複コンポーネントを `status-badges.tsx` に統一
- withAuth HOF: Server Actions用の認証ラッパー関数を追加
- 命名規則統一: 5ファイルをkebab-caseからPascalCaseにリネーム
- 重複コード削除: Turnstile.tsxの重複verifyTurnstileToken関数削除

**新規ファイル**:
- `src/components/admin/status-badges.tsx`

**変更ファイル**:
- `src/types/server-actions.ts` - withAuth HOF追加
- 各テーブル/詳細コンポーネント - StatusBadgeインポート更新
- 各ページ - リネームファイルのインポート更新

**削除ファイル**:
- 5つの重複StatusBadge.tsx

**リネームファイル**:
- `login-form.tsx` → `LoginForm.tsx`
- `user-form.tsx` → `UserForm.tsx`
- `user-actions.tsx` → `UserActions.tsx`
- `image-upload.tsx` → `ImageUpload.tsx`
- `turnstile.tsx` → `Turnstile.tsx`

---

### 008-api-keys-management.md (2026-01-11)

外部サービスAPIキー管理機能

**実装内容**:
- 管理画面からResend/Turnstile/Google MapsのAPIキー設定
- AES-256-GCM暗号化による安全な保存
- マスク表示（例: `re_1234...7890`）
- 各サービスの接続テスト機能
- 汎用APIキー管理（任意のサービス用JSON形式）
- 設定画面に「APIキー」タブ追加

**新規ファイル**:
- `src/types/api-keys.ts` - 型定義
- `src/lib/validations/api-keys.ts` - Zodスキーマ
- `src/lib/api-keys/` - サービスヘルパー（helpers/resend/turnstile/google-maps）
- `src/actions/admin/api-keys.ts` - Server Actions（認証付き）
- `src/app/admin/settings/_components/sections/ResendSection.tsx`
- `src/app/admin/settings/_components/sections/TurnstileSection.tsx`
- `src/app/admin/settings/_components/sections/GoogleMapsSection.tsx`
- `src/app/admin/settings/_components/sections/CustomApiKeysSection.tsx`
- `src/app/admin/settings/_components/tabs/ApiKeysTab.tsx`
- `src/app/admin/settings/_components/shared/StatusBanner.tsx`

**変更ファイル**:
- `prisma/schema.prisma` - APIキー関連フィールド追加
- `src/app/admin/settings/_components/SettingsTabs.tsx` - APIキータブ追加

**デプロイ時**: `bunx prisma migrate dev --name add_api_keys_management` が必要

---

### 007-announcement-bar-design-styles.md (2026-01-11)

お知らせバー デザインスタイルプリセット機能

**実装内容**:
- 5種類のデザインスタイル追加（solid/gradient/outlined/glass/minimal）
- サイト全体で統一されたスタイル設定
- 管理画面にリアルタイムプレビュー機能
- 無効値のフォールバック処理

**変更ファイル**:
- `prisma/schema.prisma` - announcementBarDesignStyleフィールド追加
- `src/actions/admin/settings.ts` - デザインスタイル設定の取得・更新
- `src/app/admin/settings/_components/sections/AnnouncementBarCarouselSection.tsx` - UI追加
- `src/components/site/AnnouncementBarCarousel.tsx` - スタイルクラス実装
- `src/components/site/AnnouncementBarWrapper.tsx` - バリデーション追加

**デプロイ時**: `bunx prisma migrate dev --name add_announcement_bar_design_style` が必要

---

### 006-announcement-bar-and-news-editor.md (2026-01-11)

お知らせバー機能 + お知らせ管理tiptap統合

**実装内容**:
- お知らせ管理にtiptapリッチテキストエディター導入（画像・YouTube対応）
- AnnouncementBar機能の新規実装（サイト上部バナー）
- 3種類のタイプ（info/warning/promo）、カスタム色、表示期間指定
- セキュリティ: Server Actions認証、XSS対策（DOMPurify）

**新規ファイル**:
- `src/actions/admin/announcement-bar.ts` - Server Actions
- `src/app/admin/settings/announcement-bar/page.tsx` - 管理画面
- `src/components/site/AnnouncementBar.tsx` - 表示コンポーネント
- `src/components/site/AnnouncementBarWrapper.tsx` - Server Component ラッパー
- `docs/requirements/announcement.md` - 要件定義

**変更ファイル**:
- `prisma/schema.prisma` - AnnouncementBarモデル追加
- `src/app/admin/news/_components/NewsForm.tsx` - tiptap統合
- `src/app/(public)/news/[id]/_components/NewsContent.tsx` - iframe対応
- `src/app/(public)/layout.tsx` - AnnouncementBarWrapper追加

**デプロイ時**: `bunx prisma migrate dev --name add_announcement_bar` が必要

---

### 005-actionresult-complete-migration.md (2026-01-10)

ActionResult完全移行 - 全Server Actions統一

**実装内容**:
- BusinessHoursSection.tsx の unsafe cast（`as string[]`、`as BusinessHours`）を`??`に置換
- 全管理画面Server Actions（11ファイル）をActionResult<T>型に統一
- `defaultBusinessHours: unknown | null` → `BusinessHours | null`型修正
- フォームコンポーネント（SpaceForm, BlogForm, NewsForm）の戻り値アクセス修正

**変更ファイル（14ファイル）**:
- `src/actions/admin/user.ts` - ActionResult移行
- `src/actions/admin/navigation.ts` - ActionResult移行
- `src/actions/admin/space.ts` - ActionResult移行
- `src/actions/admin/reservation.ts` - ActionResult移行
- `src/actions/admin/blog.ts` - ActionResult移行
- `src/actions/admin/customer.ts` - ActionResult移行
- `src/actions/admin/inquiry.ts` - ActionResult移行
- `src/actions/admin/news.ts` - ActionResult移行
- `src/actions/admin/settings.ts` - ActionResult移行 + defaultBusinessHours型修正
- `src/app/admin/settings/_components/BusinessHoursSection.tsx` - unsafe cast排除
- `src/app/admin/spaces/_components/SpaceForm.tsx` - result.data.id参照
- `src/app/admin/blog/_components/BlogForm.tsx` - result.data.id参照
- `src/app/admin/news/_components/NewsForm.tsx` - result.data.id参照

---

### 004-type-safety-improvement.md (2026-01-10)

型安全性向上 - ベストプラクティス準拠

**実装内容**:
- JSONフィールドのZodバリデーション関数（`as`キャスト排除）
- Prisma WhereInput型エイリアス（`Record<string, unknown>`排除）
- 共通Server Actions型（ActionResult<T>）

**新規ファイル**:
- `src/types/server-actions.ts` - 共通ActionResult型
- `src/types/prisma.ts` - WhereInput型エイリアス
- `src/types/index.ts` - 集約re-export
- `src/lib/json-validators.ts` - Zodバリデーション関数

**変更ファイル**: 11ファイル（actions, pages）

---

### 003-reservation-terms-agreement.md (2026-01-10)

予約フォーム規約同意機能

**実装内容**:
- 予約フォームに規約同意チェックボックスを追加
- 同意日時（termsAgreedAt）をDBに記録
- 管理画面から有効/無効・文言・対象規約を設定可能

**新規ファイル**:
- `src/components/site/ui/Checkbox.tsx`
- `src/app/admin/settings/_components/sections/TermsAgreementSection.tsx`

**変更ファイル**:
- `prisma/schema.prisma` - Reservation/Settings にフィールド追加
- `src/actions/admin/settings.ts` - 設定取得/更新関数追加
- `src/lib/validations/reservation.ts` - 規約同意スキーマ追加
- `src/actions/reservation.ts` - 規約同意対応
- `src/app/(public)/reservation/page.tsx` - 設定取得
- `src/app/(public)/reservation/_components/ReservationForm.tsx` - UI追加

**デプロイ時**: `bunx prisma migrate dev --name add_terms_agreement` が必要

---

### 002-stripe-payment-settings.md (2026-01-10)

Stripe決済設定 + 画像アップロード統合

**実装内容**:
- 画像アップロード: EditorToolbar.tsx に ImageUploadDialog を統合
- Stripe設定: 決済タブ追加、APIキー暗号化保存、接続テスト機能
- セキュリティ: AES-256-GCM暗号化、XSS対策、ブラウザ拡張対策

**新規ファイル**:
- `src/lib/crypto.ts`
- `src/lib/stripe.ts`
- `src/lib/validations/stripe.ts`
- `src/app/admin/settings/_components/sections/StripeSection.tsx`
- `src/app/admin/settings/_components/tabs/PaymentTab.tsx`

---

### 001-architecture-improvements.md (2026-01-10)

アーキテクチャのベストプラクティス準拠改善

**実装内容**:
- tsconfig.json: target を ES2017 → ES2022 に更新
- globals.css: フォント変数の修正（--font-sans を正しく参照）
- prisma.ts: PostgreSQL Pool の接続設定強化
- layout.tsx: dynamic 設定のコメント明確化

**精査結果**: 総合スコア 4.2/5

---

### settings-tab-refactoring.md (2026-01-09)

設定画面のタブリファクタリング

**実装内容**:
- page.tsx を 773行 → 110行 に削減
- 6タブ構成（一般・事業者・SEO・メール・予約・システム）
- nuqs による URL 状態管理

---

### tiptap-integration.md (2026-01-09)

TipTap エディタの統合

**実装内容**:
- RichTextEditor コンポーネント作成
- EditorToolbar / EditorContent 分離
- BlogForm への統合

---

## 進行中の計画

なし

---

## 未着手の計画

なし
