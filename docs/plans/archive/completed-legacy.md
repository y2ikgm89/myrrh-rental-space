# 完了済み計画アーカイブ（連番形式 + 2026-02-07 以前）

> このファイルは [`docs/plans/README.md`](../README.md) から分離した過去完了プランの履歴です。
> 連番形式（`001-*` ～ `080-*`）と日付形式の 2026-02-07 以前を含みます。
> アクティブな計画と直近完了は親 README.md を参照してください。

> **圧縮済み**: 2026-04-23 に詳細を git history に委譲。
> 各 plan の実装詳細・変更ファイル・Step 単位の履歴は git log で確認:
>
> ```bash
> git log --all --diff-filter=A -- docs/plans/<plan-name>.md
> git log --all --diff-filter=D -- docs/plans/<plan-name>.md
> git log -p docs/plans/archive/completed-legacy.md | less
> ```

---

### 080 - プロジェクト最適化スコア改善 (2026-02-07) ✅

PWA（manifest + icons）、Web Vitals → GA4 送信（GDPR 対応）、WCAG AA コントラスト検証を実装。

### 079 - Citation/MEO 総合強化 (2026-02-06) ✅

@graph JSON-LD パターンで LocalBusiness + WebSite 統合構造化データを実装し、NAP 一貫性・Google Maps/口コミリンク・施設属性アイコン・MEO スコア 13 項目化を実施。

### 078 - 全セクション型 v3 実装 + [slug] ルート復元 (2026-02-04) ✅

残り 12 セクション型の公開コンポーネントを作成して SectionRenderer を全 17 type 対応に統一し、[slug] 動的ページルートを復元。

### 077 - ホームページ DB 連携 (2026-02-04) ✅

v3 ホームページを静的ダミーデータから DB 駆動に移行し、HomepageSectionRenderer で SectionType → v3 コンポーネントを出し分け。

### 076 - カスタムページURL統一 (2026-01-29) ✅

`/p/[slug]` プレフィックスを廃止して `/[slug]` に統一し、専用ページは RESERVED_SLUGS でコード管理。

### 075 - 公開/管理画面CSS完全分離 (2026-01-28) ✅

Next.js 16 Multiple Root Layouts パターンで `(admin)/` と `(public)/` の CSS・レイアウトを完全分離し、Tailwind 4 `@theme` を admin.css / public.css に独立。

### 074 - 管理画面UI/UX改善 (2026-01-28) ✅

Trust Blue パレットでミニマル統一デザインに刷新し、WCAG 準拠タッチターゲット（44px）・モバイル最適化・全共通コンポーネントのトランジション追加を実施。

### 073 - カテゴリー・タグUI統一化 (2026-01-26) ✅

投稿カテゴリー・タグ管理に共通フック（use-taxonomy-filters）・SortableTableHead・TaxonomyEditor を作成して nuqs 対応と UI/UX を他の管理画面と統一。

### 072 - カテゴリ・タグSEO設定機能 (2026-01-26) ✅

Prisma で PostCategory / PostTag に SEO フィールドを追加し、カテゴリ・タグ専用編集ページと公開ページメタデータを整備。

### 070 - Instagram連携機能 + 管理画面UI統一 (2026-01-25) ✅

Instagram OAuth + 手動トークン両対応の設定 UI・oEmbed Lexical ノード・公開ページセクション・トークン自動更新 Cron を実装し、既存ラジオボタンを SelectionBox に統一。

### 069 - Lexical テキスト変換機能 (2026-01-25) ✅

Lexical エディタに lowercase / uppercase / capitalize のテキストケース変換プラグインをスラッシュコマンドとツールバードロップダウンで追加。

### 068 - Lexical X（Twitter）埋め込み機能 (2026-01-25) ✅

Lexical に X（Twitter）投稿の静的 iframe 埋め込みノード（XNode / XPlugin）を追加し、全 URL 形式対応と XSS 防止を実装。

### 067 - Lexical コメント機能 InlineEditor統合 (2026-01-25) ✅

Lexical コメント機能を Blog / News / Page の InlineEditor に統合し、排他的パネル管理フック（useEditorPanels）でサイドパネルの開閉を一元管理。

### 066 - スペース・ニュースのスラッグ対応 (2026-01-23) ✅

Space / News の公開 URL を UUID から人間可読スラッグ（`/spaces/meeting-room-a` 等）に変更し、Prisma スキーマ・Server Actions・リンク生成箇所を一括更新。

### 065 - Cache-Control + Cloudflareキャッシュパージ (2026-01-23) ✅

Next.js PPR + Cloudflare CDN 連携で `s-maxage=3600` Cache-Control を設定し、全公開コンテンツ Server Actions にパージ呼び出しを追加（帯域幅 95% 削減目標）。

### 064 - 割引・クーポンシステム Phase 1 (2026-01-22) ✅

Prisma に Coupon モデルを追加し、長時間割引・汎用クーポンコード・手動割引の料金計算ロジック（pricing.ts）と管理 UI・公開ページ統合を実装。

### 063 - プロジェクト品質改善 (2026-01-22) ✅

本番必須環境変数の強制バリデーション、共有ライブラリ依存の修正、Resend / Google Calendar / Stripe のモック基盤構築を実施。

### 060 - CI/CD品質改善 (2026-01-21) ✅

Dependabot 設定・CSP セキュリティヘッダー 8 種・テストカバレッジ有効化（Codecov 連携）・TypeDoc API ドキュメント設定を追加。

### 059 - Unified Editor SidePanel (2026-01-21) ✅

管理画面コンテンツ編集 UI をプラグイン型 ContentTypeConfig アーキテクチャに統一し、UnifiedSidePanel と再利用可能フィールドコンポーネント群を作成。

### 058 - Performance Optimization (2026-01-20) ✅

公開 Server Actions に `'use cache'` + `cacheLife` を追加し、メール送信を `fireAndForget` 非ブロッキング実行に移行してレスポンスを最適化。

### 057 - Project Improvement Plan (2026-01-20) ✅

ENCRYPTION_KEY 本番必須化・API レート制限・GCal Webhook トークン検証（Phase 1）、`fireAndForget` パターン統一（Phase 2）、settings.ts / NavigationManager / AnnouncementBarManager の大規模ファイル分割（Phase 3）を実施。

### Code Quality Improvement - Type Safety Phase 4 (2026-01-20) ✅

`BLOCK_TYPES` const 配列 + `isBlockType()` 型ガードで ToolbarPlugin の `as BlockType` を置換し、`z.nativeEnum(Role)` 適用で型アサーションを累計 84 → 57 箇所（-32%）削減。

### Code Quality Improvement - Type Safety Phase 3 (2026-01-20) ✅

`keysOf` / `filterTruthy` / `parseEnumAttribute` ユーティリティを作成し、`Object.keys() as Type[]` / `.filter(Boolean) as T[]` / DOM 属性 as キャストを型安全パターンに置換（84 → 61 箇所）。

### Code Quality Improvement - Utility Extraction Phase 2 (2026-01-20) ✅

`.toISOString().split('T')[0]` を `toDateString()` に、`.split(',')[0]` を `extractFirstFromCommaList()` に統一して 10 ファイルを更新。

### Code Quality Improvement - Utility Extraction Phase 1 (2026-01-20) ✅

`normalizeError()` / `toDateString()` / `safeArrayAccess()` ユーティリティを新規作成し、コードベース全体の重複エラーハンドリング・日付変換パターンを統一。

### 055-admin-ui-ux-unification.md (2026-01-19) ✅

EmptyState（10 テーブル）・LoadingState（16 ページ）・日付/金額フォーマット・エラー表示・StatusBanner を統一し、相対インポートをパスエイリアスに一括移行。

### Test Infrastructure & Coverage Improvement (2026-01-19) ✅

Zod 4 + @hookform/resolvers 互換修正・モック基盤改善・E2E 除外設定を行い、Public Actions 統合テスト 4 ファイル（+54 テスト）を追加して計 924 テスト通過。

### 054-filter-form-unification.md (2026-01-19) ✅

BaseFilters を全フィルターに展開し `useFormAction` フックを作成して、5 フィルター + 3 フォームをパターン統一（コード削減 ~550 行、デバウンスバグ修正）。

### 053-admin-code-cleanup.md (2026-01-19) ✅

PublishSwitch 共通化・NewsFilters デバウンスバグ修正・BaseFilters 基底コンポーネント・SidePanelShell を作成して管理画面の重複コードを整理。

### 052-hardcode-config-centralization.md (2026-01-19) ✅

`@t3-oss/env-nextjs` で環境変数バリデーション基盤を整備し、SITE_DEFAULTS / SESSION_CONFIG / PAGINATION_DEFAULTS / URL helpers を定数ファイルに集約（URL フォールバック 18 箇所を統一ヘルパーに移行）。

### 051-header-logo-branding.md (2026-01-19) ✅

Prisma にロゴ表示設定フィールド（useHeaderLogo / useFooterLogo / footerLogoUrl）を追加し、公開ページヘッダー・フッター・管理画面 TopBar に DB 連動ブランディングを統合。

### 050-colocation-refactor.md (2026-01-19) ✅

`src/admin/` と `src/public/` を App Router 配下の `(admin)/_shared/` / `(public)/_shared/` に移動し、Next.js 公式コロケーションパターンに準拠した構造に統合。

### 049-type-safety-improvements.md (2026-01-19) ✅

BusinessHours 型・FormData 型安全ヘルパー・Set-based O(1) 型ガード 15 個を作成し、JSON フィールド / FormData / `as Enum` アサーションを安全なパターンに置換。

### 048-staff-invitation-flow.md (2026-01-19) ✅

管理者直接パスワード設定方式を廃止し、招待メール → /admin/setup/[token] でスタッフ自身がパスワード設定するセキュアな招待フローに移行。

### 046-customer-creation.md (2026-01-18) ✅

管理画面の顧客管理に新規顧客作成機能（/admin/customers/new + CustomerForm）を追加し、電話予約時の事前登録を可能に。

### 045-admin-reservation-creation.md (2026-01-18) ✅

管理者が手動予約入力できる新規予約ページ（顧客検索・TimeSlotSelector・料金計算・GCal/iCal 同期）を実装。

### 044-space-management-tab-integration.md (2026-01-18) ✅

スペース・場所・カテゴリー管理の 3 独立ページを 1 ページ 3 タブに統合し、サイドバー項目を 16 → 14 に削減。

### 043-space-location-category.md (2026-01-18) ✅

Prisma に Location / SpaceCategory モデルを追加し、スペースに場所・用途カテゴリーの 2 分類軸と管理 CRUD UI・公開ページ表示を実装。

### 042-complete-separation-architecture.md (2026-01-18) ✅

`src/admin/` / `src/public/` / `src/shared/` の 3 ディレクトリ構造に完全分離し、admin → public 相互参照ゼロ・ユーティリティ関数の重複解消を達成。

### 041-admin-cleanup-refactoring.md (2026-01-17) ✅

サイドバー拡充・廃止コンポーネント削除・命名規則統一・6 テーブルの Server Component 化（TanStack Table 削除）・孤立設定セクションのタブ統合を実施。

### 040-system-features-tab-integration.md (2026-01-17) ✅

ナビゲーション・お知らせバー管理をサイト設定に 5 タブ統合し、旧ページをリダイレクト化してシステム管理ページをシンプル化。

### 039-settings-category-tabs.md (2026-01-17) ✅

設定カテゴリー各ページに nuqs + Radix UI Tabs による URL 状態同期タブ UI（site 3 / business 3 / notify 3 / api 4 / system 3 タブ）を追加。

### 038-settings-page-restructure.md (2026-01-17) ✅

10 タブ設定ページを iOS 設定風カテゴリカード方式（site / business / notify / api / system の 5 カテゴリ）に再構築。

### 037-blog-sidebar.md (2026-01-17) ✅

ブログページに検索・新着・人気・カテゴリー・タグの 5 ウィジェットサイドバーを追加し、サイト設定・ページ単位での表示制御を実装。

### 036-test-coverage-full.md (2026-01-17) ✅

Bun Test + Playwright E2E を導入し、Unit/Integration 約 50 ファイルと E2E 195 テスト（auth/reservation/spaces/blog/users）を追加して GitHub Actions CI を整備。

### 035-performance-optimization.md (2026-01-16) ✅

DB コネクションプール調整・ダッシュボード集計の `$queryRaw` 最適化・公開ページ先頭 2 画像への priority 追加でパフォーマンスを改善。

### 034-react-compiler-memoization-cleanup.md (2026-01-16) ✅

React Compiler 対応で `useCallback`（50 → 12 ファイル）・`useMemo`（4 → 2 ファイル）を削除し、Lexical / useEffect 依存など正当なケースのみ保持。

### 033-media-picker-integration.md (2026-01-16) ✅

画像設定 UI を URL 直接入力からメディアライブラリダイアログ（ライブラリ選択 + URL 入力 + アップロード 3 タブ）に移行し、5 箇所のフォームに統合。

### 031-terms-agreement-management.md (2026-01-16) ✅

Prisma に Terms / TermsVersion / TermsAgreement モデルを追加し、スペース別利用規約のバージョン管理・スクロール検出付き同意ダイアログ・RBAC 権限を実装。

### 032-enum-type-guards.md (2026-01-16) ✅

中央集権型ガードモジュール（enums.ts）を作成して Prisma enum の `as ReservationStatus` 等の型アサーションを全削除し、JSON フィールドへの実行時バリデーションを追加。

### 031-media-type-assertion-removal.md (2026-01-16) ✅

Zod スキーマで Prisma 生成 enum を直接 re-export し `isValidMediaType` / `isValidMediaUsage` 型ガードを追加することで、`as MediaType` / `as MediaUsage` を全 4 箇所で排除。

### 030-media-management.md (2026-01-16) ✅

Prisma に Media モデル・MediaType / MediaUsage enum を追加し、Supabase Storage 連携・グリッド/リストビュー管理 UI・Lexical MediaLibraryPlugin を実装。

### 029-type-errors-fix.md (2026-01-16) ✅

`isSystemPage` Prisma マイグレーション適用・`canDeletePage` の同期関数エラー修正・`generateMetadata` 内クエリへの `'use cache'` 追加でビルドエラーを解消。

### 028-prisma-decimal-serialization-fix.md (2026-01-16) ✅

SpaceListSection で Prisma Decimal 型が Client Component に渡せない問題を `SerializedSpace` 型 + `.toNumber()` 変換で修正。

### 027-nuqs-best-practices.md (2026-01-16) ✅

Pagination に `history: 'push'`・検索入力に `throttleMs: 500` を追加し、管理画面パーサー集約と `createLoader` パターンに統一。

### 026-remove-as-const-assertions.md (2026-01-16) ✅

`as const` 削除・`getSessionUser` 型ガード・`getRoleFromSession` ヘルパー・URLSearchParams バリデーション・JSON config 型ガード 7 関数追加で 50+ ファイルの型アサーションを大幅削減（Phase 1–3）。

### 025-homepage-settings-to-pages.md (2026-01-15) ✅

ホームページセクション管理を「設定 > ホームページタブ」からページ管理に移動し、設定タブを 10 → 9 に削減。

### 024-bun-test-framework.md (2026-01-14) ✅

Bun ネイティブテストランナーで Prisma / Better Auth / Next.js モック基盤を構築し、121 テスト（379 expect）150ms 実行の初期テスト環境を整備。

### 023-grapesjs-removal-homepage-settings.md (2026-01-14) ✅

GrapesJS ビジュアルエディターを完全削除して Lexical に統一し、CTA / Blog / News / FAQ の 4 セクション型ホームページ設定を管理画面に新設。

### 022-type-safety-hof-migration.md (2026-01-13) ✅

AuditUser 型で `as never` アサーション 30+ 箇所を排除し、13 ファイルの手動認証パターンを `withPermission` HOF に統一、React 19 の `forwardRef` 廃止対応を実施。

### 021-seo-accessibility-optimization.md (2026-01-13) ✅

Settings DB 連動メタデータファクトリ・WebSite / Article JSON-LD・SkipLink / ARIA ライブリージョン・WCAG AA コントラスト比改善（4.5:1 以上）を実装。

### 021-permission-management-system.md (2026-01-13) ✅

5 階層 RBAC（SUPER_ADMIN / ADMIN / EDITOR / VIEWER / USER）・コードベース権限ライブラリ・監査ログ・ログイン試行レートリミット（5 回/15 分）・権限マトリクス UI を実装。

### 020-blog-news-grapesjs-migration.md (2026-01-13) ✅

BlogPostStatus / NewsStatus enum と Version モデルを Prisma に追加し、Blog / News エディターを GrapesJS に統合して publish / unpublish 分離とバージョン自動作成を実装。

### 019-admin-ui-ux-integration.md (2026-01-13) ✅

AdminLayoutContext でサイドバー状態（expanded / collapsed / hidden）を管理し、レスポンシブサイドバー・TopBar・Recharts 予約/売上グラフをダッシュボードに追加。

### 018-grapesjs-database-integration.md (2026-01-13) ✅

GrapesPage / GrapesPageVersion モデルを Prisma に追加し、CRUD / バージョン履歴 / バックアップ / SEO / 公開ページ（`/g/[slug]`）を実装。

### 017-grapesjs-custom-blocks.md (2026-01-13) ✅

GrapesJS にレンタルスペース専用カスタムブロック 5 種（HeroSection / ReservationForm / FeatureGrid / TestimonialSlider / ContactSection）を追加し、CSS 変数テーマ対応のレンダラーを実装。

### 016-grapesjs-visual-editor.md (2026-01-13) ✅

@grapesjs/react v2.0.0 を導入し、TypeScript 型定義・SSR 回避・カスタムブロック登録・動的インポート（コード分割）でビジュアルエディター環境を構築。

### 015-code-quality-refactoring.md (2026-01-12) ✅

Server Action ヘルパー統一・React 19 フォームフック作成・Admin UI コンポーネントの CVA → TV 移行・`class-variance-authority` パッケージ削除を実施。

### 014-reservation-calendar.md (2026-01-11) ✅

管理画面の予約管理に月/週/日 3 ビュー切り替えカレンダー（URL 状態管理・スペースフィルター・ステータス変更ダイアログ）を Clean Architecture で実装。

### 013-google-calendar-integration.md (2026-01-11) ✅

Google Calendar サービスアカウント連携・iCal 生成（RFC 5545）・iCal フィード配信・Cron ポーリング + Webhook 双方向同期（Phase 1–4 全完了）を実装。

### 012-nextjs-best-practices.md (2026-01-11) ✅

管理ルートを Route Group `(admin)/admin/` に変更し、`cache()` API で verifySession をメモ化する DAL パターン・withAuth HOF 改善を実施。

### 011-server-client-separation.md (2026-01-11) ✅

blog/categories（506 行）と settings/navigation（1068 行）の巨大ページを Next.js 公式の Server / Client Component 分離パターンに準拠してリファクタリング。

### 010-withauth-badge-improvements.md (2026-01-11) ✅

全 Server Actions mutation 関数（69 関数）を withAuth HOF に移行し、Inquiry / Customer / Publish ステータスの Badge variant 色を意味的整合に修正。

### 009-delayed-improvements.md (2026-01-11) ✅

5 つの重複 StatusBadge を `status-badges.tsx` に統一、withAuth HOF を追加、5 ファイルを PascalCase にリネーム、Turnstile の重複関数を削除。

### 008-api-keys-management.md (2026-01-11) ✅

Resend / Turnstile / Google Maps の API キーを AES-256-GCM 暗号化で保存・マスク表示し、接続テスト機能と管理画面「APIキー」タブを追加。

### 007-announcement-bar-design-styles.md (2026-01-11) ✅

お知らせバーに solid / gradient / outlined / glass / minimal の 5 デザインスタイルプリセットとリアルタイムプレビューを追加。

### 006-announcement-bar-and-news-editor.md (2026-01-11) ✅

お知らせ管理に TipTap リッチテキストエディター（画像・YouTube）を統合し、AnnouncementBar（3 タイプ・カスタム色・表示期間）を新規実装。

### 005-actionresult-complete-migration.md (2026-01-10) ✅

全管理画面 Server Actions（11 ファイル）を ActionResult<T> 型に統一し、BusinessHoursSection の unsafe cast を `??` に置換。

### 004-type-safety-improvement.md (2026-01-10) ✅

JSON フィールドの Zod バリデーション・Prisma WhereInput 型エイリアス・共通 ActionResult<T> 型を新規作成して型安全性の基盤を整備。

### 003-reservation-terms-agreement.md (2026-01-10) ✅

予約フォームに規約同意チェックボックスを追加し、同意日時（termsAgreedAt）を DB に記録、管理画面から有効/無効・文言を設定可能に。

### 002-stripe-payment-settings.md (2026-01-10) ✅

EditorToolbar に ImageUploadDialog を統合し、Stripe API キー AES-256-GCM 暗号化保存・接続テスト機能・決済タブを管理画面に追加。

### 001-architecture-improvements.md (2026-01-10) ✅

tsconfig の ES2017 → ES2022 更新・フォント変数修正・PostgreSQL Pool 接続設定強化・layout.tsx コメント明確化でアーキテクチャ基盤を整備。

### settings-tab-refactoring.md (2026-01-09) ✅

設定画面の page.tsx を 773 行 → 110 行に削減し、nuqs URL 状態管理による 6 タブ構成（一般・事業者・SEO・メール・予約・システム）に再構築。

### tiptap-integration.md (2026-01-09) ✅

TipTap エディタを導入し、RichTextEditor / EditorToolbar / EditorContent を作成して BlogForm に統合。

---

## 未着手の計画

なし
