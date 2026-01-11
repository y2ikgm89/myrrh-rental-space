# 実装計画履歴

## 完了した計画

### 013-google-calendar-integration.md (2026-01-11)

Google Calendar連携機能（Phase 1）

**実装内容**:
- サービスアカウント連携: 共有カレンダーへの予約自動登録
- OAuth連携（オプション）: 管理者個人カレンダーへの登録
- iCal生成: RFC 5545準拠の.icsファイル
- Add to Calendarリンク: Google/Outlook/Apple対応
- 予約作成時の自動同期、キャンセル時のイベント削除

**新規ファイル**:
- `src/lib/google-calendar.ts` - Google Calendar APIクライアント
- `src/lib/calendar-sync.ts` - 予約同期サービス
- `src/lib/ical.ts` - iCal生成・Add to Calendarリンク
- `src/app/(admin)/admin/settings/_components/sections/GoogleCalendarSection.tsx` - 設定UI

**変更ファイル**:
- `prisma/schema.prisma` - Reservation/Settingsにカレンダー関連フィールド追加
- `src/lib/auth.ts` - Googleプロバイダー追加
- `src/actions/admin/settings.ts` - Google Calendar設定Server Actions
- `src/actions/reservation.ts` - カレンダー同期呼び出し追加
- `src/lib/email-service.ts` - iCal添付・カレンダーリンク追加
- `src/emails/reservation-confirmation.tsx` - カレンダーリンクセクション追加

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
- `docs/requirements/ANNOUNCEMENT_BAR_REQUIREMENTS.md` - 要件定義

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
