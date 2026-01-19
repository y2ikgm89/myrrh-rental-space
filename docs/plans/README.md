# 実装計画履歴

## 進行中の計画

なし

---

## 完了した計画

### Test Infrastructure & Coverage Improvement (2026-01-19) ✅

テスト基盤改善とカバレッジ向上

**概要**:
テスト実行環境の問題を修正し、Public Actions の統合テストを追加。

**完了内容**:
- [x] Zod 4 + @hookform/resolvers 互換性修正（standardSchemaResolver 使用）
- [x] VALID_ROLES 初期化順序エラー修正（getSessionUser モック追加）
- [x] E2E テスト除外設定（bunfig.toml: root = "./__tests__"）
- [x] 環境変数バリデーションスキップ設定（SKIP_ENV_VALIDATION）
- [x] Public Actions 統合テスト追加（4ファイル、+54テスト）

**新規テストファイル**:
- `__tests__/integration/actions/blog.test.ts` - ブログアクション
- `__tests__/integration/actions/homepage.test.ts` - ホームページセクション
- `__tests__/integration/actions/news.test.ts` - お知らせアクション
- `__tests__/integration/actions/sidebar.test.ts` - サイドバーデータ

**結果**: 924 tests pass

---

### 054-filter-form-unification.md (2026-01-19) ✅

フィルター・フォームパターン統一

**概要**:
Plan 053 で作成した BaseFilters を全フィルターに展開し、useFormAction フックを作成してフォームパターンを統一。

**完了フェーズ**:
- [x] Phase A1: シンプルフィルター移行（5個）- CustomerFilters, SpaceFilters, ReservationFilters, InquiryFilters, LocationFilters
- [x] Phase A2: 拡張フィルター移行（2個）- BlogFilters, CategoryFilters
- [x] Phase B1: useFormAction フック作成
- [x] Phase B2: シンプルフォーム移行（2個）- FaqCategoryForm, FaqItemForm
- [x] Phase B3: 中規模フォーム移行（1個）- UserForm

**新規ファイル**:
- `_shared/hooks/useFormAction.ts` - フォーム送信統一フック
- `_shared/hooks/index.ts` - hooks バレルエクスポート

**改善効果**:
- コード削減: ~550行
- バグ修正: InquiryFilters, SpaceFilters のデバウンス問題解消
- パターン統一: フォーム実装の高速化
- BaseFilters 拡張: statusParamName, preserveParams, statusOptions=[]

---

### 053-admin-code-cleanup.md (2026-01-19) ✅

管理画面コード整理（A+B レベル）

**概要**:
管理画面の分析に基づき、重複コードの統一とバグ修正を実施。

**完了フェーズ**:
- [x] Phase 1: PublishSwitch 統一（spaces/locations → _shared/components/ui/）
- [x] Phase 2: NewsFilters デバウンスバグ修正（useRef + useEffect パターン）
- [x] Phase 3: BaseFilters 基底コンポーネント作成
- [x] Phase 4: SidePanelShell コンポーネント作成（BlogSidePanel/NewsSidePanel シェル統合）
- [x] Phase 5: 検証（type-check/lint 成功）

**新規ファイル**:
- `_shared/components/ui/PublishSwitch.tsx` - 汎用公開切り替えスイッチ
- `_shared/components/table/BaseFilters.tsx` - フィルター基底コンポーネント
- `_shared/components/table/index.ts` - バレルエクスポート
- `_shared/components/editor/inline/SidePanelShell.tsx` - サイドパネルシェル

**変更ファイル**:
- `spaces/_components/SpaceTable.tsx` - PublishSwitch 使用変更
- `locations/_components/LocationTable.tsx` - PublishSwitch 使用変更
- `news/_components/NewsFilters.tsx` - BaseFilters 使用に移行
- `_shared/components/editor/inline/BlogSidePanel.tsx` - SidePanelShell 使用
- `_shared/components/editor/inline/NewsSidePanel.tsx` - SidePanelShell 使用
- `_shared/components/editor/inline/index.ts` - SidePanelShell エクスポート

**削除ファイル**:
- `spaces/_components/PublishSwitch.tsx`
- `locations/_components/PublishSwitch.tsx`

**改善効果**:
- コード削減: 重複 PublishSwitch 2ファイル → 1ファイル
- バグ修正: NewsFilters デバウンス問題解消
- パターン統一: フィルター基底で今後の実装が容易に
- 保守性向上: サイドパネル Shell で重複削減

---

### 052-hardcode-config-centralization.md (2026-01-19) ✅

ハードコード改善 - 設定一元管理

**概要**:
ハードコードされた値を環境変数バリデーション層と定数ファイルに集約し、型安全で保守しやすい構成に改善。

**完了フェーズ**:
- [x] Phase 1: 環境変数バリデーション基盤（`@t3-oss/env-nextjs`）
- [x] Phase 2: 定数ファイル作成（SITE_DEFAULTS, SESSION_CONFIG, PAGINATION_DEFAULTS, URL helpers）
- [x] Phase 3: URL フォールバック移行（18箇所 → 統一ヘルパー）
- [x] Phase 4: サービス名移行（`'Myrrh Rental Space'` → `SITE_DEFAULTS.name`）
- [x] Phase 5: 数値定数移行（SESSION_CONFIG 適用）
- [x] Phase 6: 検証（type-check/lint/build 成功）

**新規ファイル**:
- `src/shared/lib/env/server.ts` - サーバー専用環境変数バリデーション
- `src/shared/lib/env/client.ts` - クライアント環境変数バリデーション
- `src/shared/lib/env/index.ts` - 統合エクスポート
- `src/shared/lib/constants/defaults.ts` - サイトデフォルト値
- `src/shared/lib/constants/session.ts` - セッション設定
- `src/shared/lib/constants/pagination.ts` - ページネーション設定
- `src/shared/lib/constants/urls.ts` - URL ヘルパー関数
- `src/shared/lib/constants/index.ts` - バレルエクスポート

**変更ファイル**:
- `next.config.ts` - ビルド時環境変数検証のためのインポート追加
- `src/app/sitemap.ts`, `src/app/robots.ts` - getBaseUrl() 使用
- `src/app/(public)/_shared/lib/seo/` - getBaseUrl(), SITE_DEFAULTS 使用
- `src/shared/lib/auth.ts` - SESSION_CONFIG, getAppUrl() 使用
- `src/shared/lib/email-service.ts` - getAdminUrl(), SITE_DEFAULTS 使用
- 各公開ページ（blog, news, spaces, p, about） - getBaseUrl(), SITE_DEFAULTS 使用
- `src/app/layout.tsx` - SITE_DEFAULTS 使用

---

### 051-header-logo-branding.md (2026-01-19) ✅

ヘッダー/フッター ブランディング統合

**概要**:
サイト設定のサイト名・ロゴが公開ページと管理画面のヘッダー・フッターに反映されるよう統合。
シンプルな2択トグル（ロゴ使用 ON/OFF）で制御。デフォルトはロゴ優先。

**完了フェーズ**:
- [x] Phase 1: DB スキーマ拡張（useHeaderLogo, useFooterLogo, footerLogoUrl）
- [x] Phase 2: 設定 UI 拡張（トグルスイッチ）
- [x] Phase 3: 公開ページヘッダー改修（HeaderBranding コンポーネント）
- [x] Phase 4: 公開ページフッター改修（FooterBranding コンポーネント）
- [x] Phase 5: 管理画面ヘッダー改修（TopBar ブランディング）
- [x] Phase 6: 検証（type-check/lint/build 成功）

**新規ファイル**:
- `prisma/migrations/20260119005448_add_logo_display_settings/` - マイグレーション
- `src/app/(public)/_shared/components/layouts/HeaderBranding.tsx` - ヘッダーブランディング
- `src/app/(public)/_shared/components/layouts/FooterBranding.tsx` - フッターブランディング

**変更ファイル**:
- `prisma/schema.prisma` - useHeaderLogo, useFooterLogo, footerLogoUrl 追加
- `src/app/(admin)/admin/(dashboard)/_shared/actions/settings.ts` - 新フィールド対応
- `src/app/(admin)/admin/(dashboard)/settings/_components/sections/BasicInfoSection.tsx` - トグル UI
- `src/app/(public)/_shared/components/layouts/Header.tsx` - HeaderBranding 統合
- `src/app/(public)/_shared/components/layouts/Footer.tsx` - FooterBranding 統合
- `src/app/(admin)/admin/(dashboard)/_components/TopBar.tsx` - ブランディング追加
- `src/app/(admin)/admin/(dashboard)/layout.tsx` - 設定取得・Props 渡し

---

### 050-colocation-refactor.md (2026-01-19) ✅

Next.js コロケーションパターン統合

**概要**:
`src/admin/` と `src/public/` を App Router 配下の `_shared/` ディレクトリに移動し、Next.js 公式のコロケーションパターンに準拠した構造に統合。

**完了フェーズ**:
- ✅ Phase 1: 管理画面の `_shared/` 作成・ファイル移動・パスエイリアス更新・ビルド検証
- ✅ Phase 2: 公開ページの `_shared/` 作成・ファイル移動・パスエイリアス更新・ビルド検証
- ✅ Phase 3: 旧ディレクトリ削除・最終ビルド検証
- ✅ Phase 4: ドキュメント更新

**変更ファイル**:
- `tsconfig.json` - パスエイリアス更新
- `CLAUDE.md` - 構造セクション更新

**新しい構造**:
- `src/app/(admin)/admin/(dashboard)/_shared/` - 管理画面専用コード
- `src/app/(public)/_shared/` - 公開ページ専用コード

---

### 049-type-safety-improvements.md (2026-01-19) ✅

型安全性改善 - 公式ベストプラクティス準拠

**概要**:
プロジェクト全体の型定義と型安全性を調査し、公式ベストプラクティスに準拠した最新推奨でクリーンな実装に改善。

**完了フェーズ**:
- ✅ Phase 1: JSONフィールド型定義（BusinessHours型、型ガード、Prisma変換ヘルパー）
- ✅ Phase 2: FormDataヘルパー（型安全なgetFormString/Number/Boolean/File関数群）
- ⏭️ Phase 3: エラーハンドリング統一（既存ActionResult<T>で十分、スキップ）
- ✅ Phase 4: 型ガード改善（15個の型ガードからasアサーション削除、Set-based O(1) lookup）
- ✅ Phase 5: 検証（type-check/lint/build成功）

**新規ファイル**:
- `src/shared/types/json-fields.ts` - BusinessHours型、TimeSlot、DayOfWeek、型ガード
- `src/shared/lib/form-data.ts` - 型安全なFormDataヘルパー関数群
- `src/shared/lib/index.ts` - バレルエクスポート

**変更ファイル**:
- `src/shared/types/index.ts` - JSON fields型のエクスポート追加
- `src/shared/lib/validations/enums.ts` - 15個の型ガードをSet-based検証に改善
- `src/admin/lib/validations/location.ts` - BusinessHours型使用
- `src/admin/actions/location.ts` - parseBusinessHours()、businessHoursToJson()使用

**改善効果**:
- `Record<string, unknown>` → 具体的なBusinessHours型
- `as Enum` アサーション → Set-based O(1) 型ガード
- FormData直接アクセス → 型安全なヘルパー関数

---

### 048-staff-invitation-flow.md (2026-01-19) ✅

スタッフ招待フロー（セキュアなパスワード設定）

**概要**:
管理者が直接パスワードを設定する方式から、招待メールによるスタッフ自身でのパスワード設定フローに移行。
セキュリティを強化し、パスワード共有の必要性を排除。

**完了フェーズ**:
- ✅ Phase 1: 招待トークン・メール送信基盤（StaffInvitationモデル、Server Actions、メールテンプレート）
- ✅ Phase 2: パスワード設定画面（/admin/setup/[token]）
- ✅ Phase 3: 登録フォーム変更（招待フローへ移行）
- ✅ Phase 4: 検証（type-check/lint/build成功）

**新規ファイル**:
- `prisma/migrations/20260118153836_add_staff_invitation/` - DBマイグレーション
- `src/admin/actions/staff-invitation.ts` - 招待Server Actions
- `src/admin/lib/validations/staff-invitation.ts` - Zodバリデーションスキーマ
- `src/public/emails/staff-invitation.tsx` - 招待メールテンプレート
- `src/app/(admin)/admin/(auth)/setup/[token]/` - パスワード設定ページ
- `src/app/(admin)/admin/(dashboard)/staff/` - スタッフ管理ページ一式

**変更ファイル**:
- `prisma/schema.prisma` - StaffInvitationモデル追加
- `src/shared/lib/email-service.ts` - sendStaffInvitationEmail関数追加

**フロー**:
1. 管理者: メールアドレス入力 → 「招待を送信」
2. システム: 招待トークン生成 → 招待メール送信
3. スタッフ: メール受信 → URLクリック → パスワード設定
4. 完了: 設定したパスワードでログイン可能

---

### 046-customer-creation.md (2026-01-18) ✅

顧客管理 - 新規顧客作成機能

**概要**:
管理画面の顧客管理に新規顧客作成機能を追加。
電話予約や来店予約時に顧客を事前登録できるようにする。

**完了フェーズ**:
- ✅ Phase 1: createCustomer Server Action
- ✅ Phase 2: CustomerForm コンポーネント
- ✅ Phase 3: 新規顧客ページ (/admin/customers/new)
- ✅ Phase 4: 顧客一覧に「新規顧客」ボタン追加
- ✅ Phase 5: 検証（type-check/lint/build 成功）

**新規ファイル**:
- `src/app/(admin)/admin/(dashboard)/customers/new/page.tsx` - 新規顧客ページ
- `src/app/(admin)/admin/(dashboard)/customers/_components/CustomerForm.tsx` - 顧客作成フォーム

**変更ファイル**:
- `src/admin/actions/customer.ts` - createCustomer Server Action 追加
- `src/app/(admin)/admin/(dashboard)/customers/page.tsx` - 新規顧客ボタン追加

---

### 045-admin-reservation-creation.md (2026-01-18) ✅

管理者用予約作成機能（電話予約対応）

**概要**:
電話予約など、管理者が手動で予約を入力する必要がある場合に対応する機能。
予約一覧ページに「新規予約」ボタンを追加し、顧客検索・スペース選択・日時指定で予約を作成。

**完了フェーズ**:
- ✅ Phase 1: 基盤（バリデーション、Server Action、ボタン追加）
- ✅ Phase 2: フォームUI（予約作成ページ・フォーム）
- ✅ Phase 3: 顧客選択（CustomerSelector、searchCustomers API）
- ✅ Phase 4: 空き時間選択（TimeSlotSelector）
- ✅ Phase 5: 検証（type-check/lint/build 成功）

**新規ファイル**:
- `src/admin/lib/validations/admin-reservation.ts` - 管理者用予約バリデーションスキーマ
- `src/app/(admin)/admin/(dashboard)/reservations/new/page.tsx` - 予約作成ページ
- `src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationForm.tsx` - 予約作成フォーム（2カラムレイアウト）
- `src/app/(admin)/admin/(dashboard)/reservations/_components/CustomerSelector.tsx` - 顧客検索・新規入力コンポーネント
- `src/app/(admin)/admin/(dashboard)/reservations/_components/TimeSlotSelector.tsx` - 空き時間選択コンポーネント

**変更ファイル**:
- `src/admin/actions/reservation.ts` - createAdminReservation, getSpacesForReservation 追加
- `src/admin/actions/customer.ts` - searchCustomers 追加
- `src/app/(admin)/admin/(dashboard)/reservations/page.tsx` - 新規予約ボタン追加

**機能詳細**:
- 顧客検索・選択（デバウンス付きリアルタイム検索）
- 新規顧客作成（予約と同時に顧客レコード作成）
- 料金自動計算 + 手動調整
- ステータス選択（PENDING / CONFIRMED）
- メモ入力・メール送信設定
- Google Calendar / iCal 同期

---

### 044-space-management-tab-integration.md (2026-01-18) ✅

スペース管理タブ統合 - UI/UX改善

**概要**:
スペース管理・場所管理・カテゴリー管理の3つの独立ページを、1つのスペース管理ページ内に3タブとして統合。
サイドバーの簡素化と関連機能の集約により、操作性・視認性を向上。

**完了フェーズ**:
- ✅ Phase 1: タブ統合コンポーネント作成（SpaceManagementTabs, 各TabContent）
- ✅ Phase 2: ページ統合（spaces/page.tsx をタブ統合ページに更新）
- ✅ Phase 3: サイドバー・リダイレクト（場所/カテゴリー項目削除、リダイレクト設定）
- ✅ Phase 4: 検証（type-check/lint/build成功）

**新規ファイル**:
- `src/app/(admin)/admin/(dashboard)/spaces/_components/SpaceManagementTabs.tsx`
- `src/app/(admin)/admin/(dashboard)/spaces/_components/SpaceTabContent.tsx`
- `src/app/(admin)/admin/(dashboard)/spaces/_components/LocationTabContent.tsx`
- `src/app/(admin)/admin/(dashboard)/spaces/_components/CategoryTabContent.tsx`

**変更ファイル**:
- `src/app/(admin)/admin/(dashboard)/spaces/page.tsx` - タブ統合ページに更新
- `src/app/(admin)/admin/(dashboard)/_components/sidebar-items.tsx` - 場所/カテゴリー削除
- `src/app/(admin)/admin/(dashboard)/locations/page.tsx` - リダイレクト化
- `src/app/(admin)/admin/(dashboard)/space-categories/page.tsx` - リダイレクト化

**UI/UX改善効果**:
- サイドバー項目数: 16項目 → 14項目（-2）
- 関連機能: 3つの別ページ → 1ページ3タブ
- 操作性: ページ遷移不要、タブ切り替えのみ

---

### 043-space-location-category.md (2026-01-18) ✅

スペースの場所・用途カテゴリー機能

**概要**:
スペース管理に「場所（Location）」と「用途カテゴリー（SpaceCategory）」の2つの分類軸を追加。
複数建物・店舗への対応と、用途別分類を実現。

**完了フェーズ**:
- ✅ Phase 1: DBスキーマ・マイグレーション・バリデーション・Server Actions
- ✅ Phase 2: 管理画面UI - Location（CRUD、並び替え、公開/非公開切り替え）
- ✅ Phase 3: 管理画面UI - SpaceCategory（CRUD、並び替え、アイコン・色選択）
- ✅ Phase 4: Space管理への統合（SpaceFormに場所・カテゴリー選択追加）
- ✅ Phase 5: 公開サイト対応（SpaceInfo に場所・カテゴリー表示）
- ✅ Phase 6: 検証・ドキュメント（type-check/lint/build成功、テスト通過）

**新規ファイル**:
- `src/admin/lib/validations/location.ts` - Locationバリデーションスキーマ
- `src/admin/lib/validations/space-category.ts` - SpaceCategoryバリデーションスキーマ
- `src/admin/actions/location.ts` - Location Server Actions（CRUD + 並び替え）
- `src/admin/actions/space-category.ts` - SpaceCategory Server Actions（CRUD + 並び替え）
- `src/app/(admin)/admin/(dashboard)/locations/` - Location管理ページ一式
- `src/app/(admin)/admin/(dashboard)/space-categories/` - SpaceCategory管理ページ一式

**変更ファイル**:
- `prisma/schema.prisma` - Location, SpaceCategoryモデル追加、Space拡張
- `src/admin/lib/permissions.ts` - locations, spaceCategoriesリソース追加
- `src/admin/lib/validations/space.ts` - locationId, categoryIdフィールド追加
- `src/app/(admin)/admin/(dashboard)/spaces/_components/SpaceForm.tsx` - 場所・カテゴリー選択UI追加
- `src/app/(admin)/admin/(dashboard)/spaces/new/page.tsx` - 場所・カテゴリーオプション取得
- `src/app/(admin)/admin/(dashboard)/spaces/[id]/edit/page.tsx` - 同上
- `src/app/(admin)/admin/(dashboard)/_components/sidebar-items.tsx` - サイドバーにメニュー追加
- `src/app/(public)/spaces/[id]/page.tsx` - location/category include追加
- `src/app/(public)/spaces/[id]/_components/SpaceInfo.tsx` - 場所・カテゴリー表示

**マイグレーション**: `20260118_add_location_and_space_category`

---

### 042-complete-separation-architecture.md (2026-01-18) ✅

管理/公開 完全分離アーキテクチャ

**概要**:
管理ページと公開ページのコンポーネント・ライブラリを完全に分離し、
顧客ごとのカスタマイズとAIによる変更影響把握を容易にする。

**完了フェーズ**:
- ✅ Phase 1: ディレクトリ構造作成 + tsconfig パスエイリアス設定
- ✅ Phase 2: shared/ への移動（13 lib ファイル + Prisma generated）
- ✅ Phase 3: admin/ への移動（17 項目: components, actions, hooks, contexts, lib）
- ✅ Phase 4: public/ への移動（68 ファイル: components, actions, emails, lib）
- ✅ Phase 5: types/ 分離（shared/types, admin/types）
- ✅ Phase 6: 旧ディレクトリ削除 + 最終検証（type-check/lint/build 成功）
- ✅ Phase 7: ドキュメント更新
- ✅ Phase 8: admin/public 相互参照の完全解消
- ✅ Phase 9: ユーティリティ関数分離（重複コード統一）

**Phase 8 詳細**:
- shared/への追加移動: server-actions型、layout型、calendar-sync、google-calendar、nuqs、errors、styles、validations、aria-live-context
- public/actions/作成: homepage、blog、news、settings、reservation
- クロスリファレンス検証: admin→public 0件、public→admin 0件
- 検証: type-check/lint/build すべて成功

**Phase 9 詳細**:
- ユーティリティ関数分離: formatCurrency/formatPrice/formatDate → shared、formatChange/getChangeColor/formatBytes → admin専用
- 公開ページの重複formatPrice関数を削除（3ファイル）
- audit.tsからマイグレーションコメント削除（クリーン実装）
- 検証: type-check/lint/build すべて成功

**最終アーキテクチャ**:
```
src/
├── admin/          # 管理画面すべて（publicを参照しない）
│   ├── actions/
│   ├── components/
│   ├── contexts/
│   ├── hooks/
│   ├── lib/
│   └── types/
├── public/         # 公開ページすべて（adminを参照しない）
│   ├── actions/
│   ├── components/
│   ├── emails/
│   ├── lib/
│   └── types/
├── shared/         # 共有コード（admin/public両方から参照可）
│   ├── contexts/
│   ├── generated/prisma/
│   ├── lib/
│   └── types/
└── app/            # ルート（変更なし）
```

---

### 041-admin-cleanup-refactoring.md (2026-01-17) ✅ Phase 1-5

管理画面クリーンアップ＆フルリファクタリング

**概要**:
プロジェクト全体を分析し、まとまりがない部分・不足している部分を洗い出し、
2025-2026年のベストプラクティスに準拠したクリーンな実装へリファクタリング。

**完了フェーズ**:
- ✅ Phase 1: サイドバーにユーザー管理・監査ログ追加、廃止コンポーネント削除
- ✅ Phase 2: 未使用ディレクトリ削除（.gitkeepのみのディレクトリ）
- ✅ Phase 3: 命名規則統一（blog-filters.tsx → BlogFilters.tsx等）
- ✅ Phase 4: テーブルをServer Component化（React Compiler完全互換）
  - TanStack Table依存を削除
  - 6テーブルをServer Componentに移行
  - インタラクティブ要素のみClient Component化（PublishSwitch, ActionCell等）
  - クライアントJSバンドル削減
- ✅ Phase 5: 設定セクション整理（orphaned sections統合）
  - TermsAgreementSectionをbusiness/予約タブに統合
  - GoogleCalendarSection, ICalFeedSection, TwoWaySyncSectionをapi/カレンダータブに統合
- ✅ Phase 6: 公開ページPagination/Filters分析 → **現状維持**
  - 顧客カスタマイズを考慮し、ローカルコンポーネント構成を維持
  - 共通化はテンプレート配布時のカスタマイズ性を損なうため見送り

**コミット**:
- b68b15d (Phase 1-3)
- 297ff46 (P2修正: サイドバー条件付きレイアウト)
- 84cd14b (Phase 4: Server Component Table移行)
- c3f8820 (Phase 5: orphaned sections統合)

---

### 040-system-features-tab-integration.md (2026-01-17) ✅

システム管理の関連機能をサイト設定にタブ統合

**概要**:
039で追加したシステム管理ページの「関連機能」リンクカードを廃止し、
ナビゲーション・お知らせバーはサイト設定にタブ統合、監査ログはリンクカードとして配置。

**実装内容**:
- サイト設定: 3タブ → 5タブ（一般/SEO/レイアウト/ナビゲーション/お知らせバー）+ 監査ログリンクカード
- システム管理: リンクカードセクション削除（3タブのみ）
- 旧ページのリダイレクト: `/settings/navigation` → `/settings/site?tab=navigation`、`/settings/announcement-bar` → `/settings/site?tab=announcement-bar`

**変更ファイル**:
- `src/app/(admin)/admin/(dashboard)/settings/site/page.tsx` - タブ追加、データ取得追加
- `src/app/(admin)/admin/(dashboard)/settings/system/page.tsx` - リンクカード削除
- `src/app/(admin)/admin/(dashboard)/settings/navigation/page.tsx` - リダイレクト化
- `src/app/(admin)/admin/(dashboard)/settings/announcement-bar/page.tsx` - リダイレクト化

**マイグレーション**: 不要

---

### 039-settings-category-tabs.md (2026-01-17) ✅

設定カテゴリページへのタブUI追加

**概要**:
038で作成したカテゴリカード方式の詳細ページに、タブUIを追加する。

**タブ構成**:
- site: 一般 / SEO / レイアウト（3タブ）
- business: 事業者情報 / 営業時間 / 予約（3タブ）
- notify: メール / 通知 / 決済（3タブ）
- api: Resend / Turnstile / Google Maps / カスタム（4タブ）
- system: メンテナンス / Cookie / 権限（3タブ + リンクカード）

**実装内容**:
- 汎用タブコンポーネント `SettingsTabs.tsx`（nuqs + Radix UI Tabs）
- 全5カテゴリページにタブUI適用
- URL状態同期（`?tab=xxx`）

**新規ファイル**:
- `settings/_components/SettingsTabs.tsx`

**変更ファイル**:
- `settings/site/page.tsx`
- `settings/business/page.tsx`
- `settings/notify/page.tsx`
- `settings/api/page.tsx`
- `settings/system/page.tsx`

**マイグレーション**: 不要

---

### 038-settings-page-restructure.md (2026-01-17) ✅

設定ページのカテゴリカード方式へのリストラクチャ

**概要**:
現在のタブベース設定ページ（10タブ + 3ボタン）を、カテゴリカード方式（iOS設定/WordPress風）に再構築。

**カテゴリ構成**:
- サイト設定: 一般、SEO、レイアウト
- ビジネス設定: 事業者情報、営業時間、予約
- 通知・決済: メール、決済（Stripe）
- 外部連携: APIキー（Resend、Turnstile、Google等）
- システム管理: メンテナンス、Cookie同意、権限マトリクス（リンク: ナビ/お知らせバー/監査ログ）

**実装内容**:
- カード一覧トップページ（5カテゴリ）
- 各カテゴリの独立ページ（site/business/notify/api/system）
- SettingsCard/SettingsLayoutコンポーネント
- 旧タブベースUI削除

**新規ファイル**:
- `settings/page.tsx` - カード一覧トップ
- `settings/site/page.tsx` - サイト設定
- `settings/business/page.tsx` - ビジネス設定
- `settings/notify/page.tsx` - 通知・決済
- `settings/api/page.tsx` - 外部連携
- `settings/system/page.tsx` - システム管理
- `_components/SettingsCard.tsx`
- `_components/SettingsLayout.tsx`

**マイグレーション**: 不要

---

### 037-blog-sidebar.md (2026-01-17) ✅

ブログサイドバー機能

**概要**:
ブログページにサイドバーを追加し、検索・新着記事・人気記事・カテゴリー・タグのウィジェットを表示する。サイト設定でグローバル制御、ページ単位で個別制御が可能。

**実装内容**:
- DBスキーマ: Settings/Pageモデルにサイドバー設定フィールド追加
- Server Actions: `getSidebarSettings()`, `updateSidebarSettings()`, `getSidebarData()`
- サイドバーコンポーネント: 5ウィジェット（検索、新着、人気、カテゴリー、タグ）
- ブログページ統合: 一覧・詳細ページに2カラムレイアウト
- 管理画面UI: レイアウトタブにサイドバー設定セクション追加
- ページ単位設定: カスタムページでのサイドバー表示ON/OFF設定
- レスポンシブ: lg以上で2カラム、md以下で1カラム（サイドバー下部）

**新規ファイル**:
- `src/lib/validations/sidebar.ts`
- `src/actions/public/sidebar.ts`
- `src/components/site/sidebar/` - 6コンポーネント
- `src/app/(admin)/admin/(dashboard)/settings/_components/sections/SidebarSection.tsx`
- `src/app/(public)/p/[slug]/page.tsx` - カスタムページ公開表示（サイドバー対応）

**変更ファイル**:
- `prisma/schema.prisma` - Settings/Pageモデル拡張
- `src/actions/admin/settings.ts` - サイドバー設定追加
- `src/actions/admin/page.ts` - showSidebar保存処理追加
- `src/lib/validations/page.ts` - showSidebarスキーマ追加
- `src/app/(public)/blog/page.tsx` - サイドバー統合
- `src/app/(public)/blog/[slug]/page.tsx` - サイドバー統合
- `src/app/(admin)/admin/(dashboard)/settings/_components/tabs/LayoutTab.tsx`
- `src/components/admin/editor/inline/types.ts` - PageEditorFormData拡張
- `src/components/admin/editor/inline/side-panel/LayoutFields.tsx` - サイドバー設定UI追加
- `src/app/(admin)/admin/(dashboard)/pages/_components/PageInlineEditor.tsx` - showSidebar対応

**マイグレーション**: `20260117000900_add_sidebar_settings`

---

### 036-test-coverage-full.md (2026-01-17) ✅

テストカバレッジ向上（フルカバレッジ + E2E）

**概要**:
既存のBun Testフレームワーク基盤を活用し、プロジェクト全体のテストカバレッジを大幅に向上。

**フェーズ構成（全完了）**:
- Phase 1: Unit Tests - Zodバリデーション（8ファイル完了）
- Phase 2: Unit Tests - 権限・認証ロジック
- Phase 3: Integration Tests - Server Actions（12ファイル完了）
- Phase 4: E2E Tests - Playwright導入（195テスト）
- Phase 5: CI/CD統合（GitHub Actions）

**成果**:
- Unit/Integration テスト: 約50ファイル追加
- E2Eテスト: 195テスト（auth:31, reservation:11, spaces:25, blog:43, reservations:40, users:45）
- CI/CD: GitHub Actions ワークフロー完備

---

### 035-performance-optimization.md (2026-01-16)

パフォーマンス最適化 Priority 1 実装完了

**概要**:
プロジェクト全体の分析に基づき、パフォーマンス改善を実施。

**実装内容（Priority 1）**:
- DBインデックス: 既に存在（変更不要）
- コネクションプール: 本番環境 max: 20 に調整
- ダッシュボード集計: $queryRaw でDB側集計に最適化
- 画像priority: blog/spaces の最初の2画像に追加

**変更ファイル**:
- `src/lib/prisma.ts` - コネクションプール調整
- `src/actions/admin/dashboard.ts` - 集計最適化
- `src/app/(public)/blog/page.tsx` - 画像priority追加
- `src/app/(public)/spaces/page.tsx` - 画像priority追加

**マイグレーション**: 不要

---

### 034-react-compiler-memoization-cleanup.md (2026-01-16)

React Compiler対応 - useMemo/useCallback削除

**概要**:
React Compiler（Next.js 16で有効）環境に対応し、不要な手動メモ化（useMemo/useCallback）を削除。React公式ベストプラクティスに準拠したクリーンな実装に移行。

**実装内容**:
- useMemo: 4ファイル → 2ファイル（2削除）
- useCallback: 50ファイル → 12ファイル（38削除）
- 保持基準: useEffect依存配列で使用、外部ライブラリAPI統合（Lexical registerCommand）、参照安定化必須

**削除対象**:
- 単純なイベントハンドラ（onClick, onChange等）
- Context Provider関数
- カスタムフック戻り値
- ダイアログ開閉関数
- コンポーネント返却のuseCallback（アンチパターン）

**保持ファイル**:
- `use-calendar-state.ts` - useMemo（new Date()参照安定化）
- `LexicalEditor.tsx` - useMemo（Lexical initialConfig）
- `ToolbarPlugin.tsx` - useCallback（$updateToolbar、useEffect依存）
- `MediaLibraryPlugin.tsx` - useCallback（fetchMedia、useEffect依存）
- `InlineTitleEditor.tsx` - useCallback（adjustHeight、useEffect依存）
- 9 Lexicalノードコンポーネント - useCallback（onDelete、editor.registerCommand依存）

**マイグレーション**: 不要

---

### 033-media-picker-integration.md (2026-01-16)

メディアピッカー統合（画像設定UI改善）

**概要**:
画像設定UIをURL直接入力からメディアライブラリダイアログへ移行。クリーンアーキテクチャで汎用メディアピッカーを新規構築。

**実装内容**:
- 3タブ構成: ライブラリ選択 + URL入力 + アップロード
- 単一/複数選択モード対応
- React Hook Form統合（useSingleMediaPicker, useMultipleMediaPicker）
- Lexical非依存の汎用コンポーネント
- 5箇所のフォームに統合（SpaceForm, ImageFields, PageSeoForm, SectionEditor, CardPlugin）

**新規ファイル**:
- `src/types/media-picker.ts` - 型定義
- `src/hooks/use-media-picker.tsx` - 公開APIフック
- `src/hooks/use-media-selection.ts` - 選択状態管理
- `src/hooks/use-media-library.ts` - ライブラリ取得
- `src/hooks/use-media-upload.ts` - アップロード処理
- `src/components/admin/media-picker/` - ダイアログ・タブ・UIコンポーネント

**変更ファイル**:
- `src/app/(admin)/admin/(dashboard)/spaces/_components/SpaceForm.tsx`
- `src/components/admin/editor/inline/side-panel/ImageFields.tsx`
- `src/components/admin/editor/inline/BlogSidePanel.tsx`
- `src/app/(admin)/admin/(dashboard)/pages/[slug]/seo/_components/PageSeoForm.tsx`
- `src/app/(admin)/admin/(dashboard)/settings/_components/tabs/SectionEditor.tsx`
- `src/components/admin/editor/lexical/plugins/CardPlugin.tsx`

**マイグレーション**: 不要

---

### 031-terms-agreement-management.md (2026-01-16)

利用規約同意機能の実装

**概要**:
予約システムに利用規約同意機能を実装。スペースごとに異なる利用規約を設定でき、予約時に顧客が規約に同意することで法的コンプライアンスを担保。

**実装内容**:
- Terms/TermsVersion/TermsAgreementモデル（バージョン管理・同意記録）
- 管理画面CRUD UI（規約一覧・作成・編集・バージョン管理）
- 公開UI（TermsAgreementDialog - スクロール検出付きモーダル）
- Server Actions（管理用・公開用）
- RBAC権限設定（termsリソース追加）
- SpaceForm統合（規約選択ドロップダウン）

**変更ファイル**:
- `prisma/schema.prisma` - Terms, TermsVersion, TermsAgreementモデル追加
- `src/lib/validations/terms.ts` - 新規: Zodスキーマ
- `src/actions/admin/terms.ts` - 新規: 管理用Server Actions
- `src/actions/public/terms.ts` - 新規: 公開用Server Actions
- `src/lib/permissions.ts` - termsリソース権限追加
- `src/lib/validations/space.ts` - termsId追加
- `src/actions/admin/space.ts` - termsId保存対応
- `src/components/site/TermsAgreementDialog.tsx` - 新規: 公開UI
- `src/app/(admin)/admin/(dashboard)/terms/**` - 新規: 管理画面
- `src/app/(admin)/admin/(dashboard)/spaces/_components/SpaceForm.tsx` - 規約選択追加

**マイグレーション**: `20260116010114_add_terms_management`

---

### 032-enum-type-guards.md (2026-01-16)

Prisma Enum型アサーション全削除 + 型ガード集約

**問題**:
- コードベース全体で`as ReservationStatus`等の型アサーションが散在
- 実行時検証なしの危険な型変換
- Prisma生成enum型とZod推論型の混在

**解決策**:
- 中央集権型ガードモジュール（`src/lib/validations/enums.ts`）作成
- Prismaのenum型をre-export、型ガード関数を提供
- URLパラメータ用フィルターパーサー追加
- CalendarView型ガード追加
- PrismaのJson型フィールドに実行時バリデーション追加

**変更ファイル**:
- `src/lib/validations/enums.ts` - 新規: 中央集権型ガードモジュール
- `src/lib/calendar/calendar-types.ts` - isValidCalendarView, getValidCalendarView追加
- `src/lib/validations/media.ts` - parseMediaTypeFilter, parseMediaUsageFilter追加
- `src/actions/admin/customer.ts` - CustomerWithReservations型修正
- `src/actions/admin/homepage-settings.ts` - parseSectionConfig追加
- `src/components/site/sections/SectionRenderer.tsx` - getSafeConfig使用
- 各種ページ・コンポーネント - 型ガード使用に移行

**マイグレーション**: 不要

---

### 031-media-type-assertion-removal.md (2026-01-16)

MediaType/MediaUsage型アサーション排除

**問題**:
- `as MediaType`/`as MediaUsage`型アサーションが4箇所で使用されていた
- Zod推論型とPrisma生成型が別の型として認識されていた

**解決策**:
- ZodスキーマでPrisma生成のenumを直接使用（re-export）
- 型ガード関数（`isValidMediaType`, `isValidMediaUsage`）を追加
- constants.tsを型安全に修正（MediaType/MediaUsageを直接使用）
- UIコンポーネントで型ガードを使用

**変更ファイル**:
- `src/lib/validations/media.ts` - Prisma型をre-export、型ガード追加
- `src/actions/admin/media.ts` - 型アサーション削除
- `src/app/(admin)/admin/(dashboard)/media/_components/constants.ts` - 型安全な定数
- `src/app/(admin)/admin/(dashboard)/media/_components/MediaDetailDialog.tsx` - 型ガード使用
- `src/app/(admin)/admin/(dashboard)/media/_components/MediaUploadDialog.tsx` - 型ガード使用
- `src/app/(admin)/admin/(dashboard)/media/_components/MediaGrid.tsx` - 型ガード使用
- `src/app/(admin)/admin/(dashboard)/media/_components/MediaTable.tsx` - 型ガード使用

**マイグレーション**: 不要

---

### 030-media-management.md (2026-01-16)

メディア管理機能

**実装内容**:
- Mediaモデル: ファイルメタデータ永続化（filename, url, size, dimensions等）
- MediaType/MediaUsage enum: ファイル種別・用途分類
- Supabase Storage連携: `media`バケットへのファイルアップロード
- Server Actions: CRUD、論理削除、一括削除
- 管理画面UI: グリッド/リストビュー、フィルター、検索、D&Dアップロード
- Lexicalエディター連携: MediaLibraryPlugin（画像選択・挿入）

**新規ファイル**:
- `src/lib/validations/media.ts` - Zodスキーマ
- `src/actions/admin/media.ts` - Server Actions
- `src/app/(admin)/admin/(dashboard)/media/` - 管理画面ページ・コンポーネント
- `src/components/admin/editor/lexical/plugins/MediaLibraryPlugin.tsx` - エディタープラグイン

**変更ファイル**:
- `prisma/schema.prisma` - Mediaモデル、enum追加
- `src/lib/supabase.ts` - MEDIAバケット追加
- `src/lib/permissions.ts` - mediaリソース権限追加
- `src/lib/utils.ts` - formatBytes, formatDate関数追加
- `src/components/admin/editor/lexical/` - MediaLibraryPlugin統合

**マイグレーション**: `bunx prisma migrate dev --name add_media_model`

---

### 029-type-errors-fix.md (2026-01-16)

型エラー・ビルドエラー修正

**問題**:
- `isSystemPage` 型エラー: Prisma マイグレーション未適用
- Server Actions 同期関数エラー: `canDeletePage` が sync 関数
- Next.js 16 PPR エラー: `generateMetadata` 内の Prisma クエリ

**解決策**:
- `bunx prisma migrate dev --name add_is_system_page_to_pages` 実行
- `canDeletePage` を `src/lib/validations/page.ts` へ移動
- `getPageSeo` に `'use cache'` ディレクティブ追加

**変更ファイル**:
- `prisma/migrations/20260115154941_add_is_system_page_to_pages/`
- `src/actions/admin/page.ts`
- `src/lib/validations/page.ts`
- `src/lib/page-metadata.ts`

**マイグレーション**: あり（isSystemPage カラム追加）

---

### 028-prisma-decimal-serialization-fix.md (2026-01-16)

Prisma Decimal シリアライゼーション修正

**問題**: `SpaceListSection.tsx` で「Only plain objects can be passed to Client Components」エラー

**原因**: Prisma Decimal 型（`area`, `hourlyPrice`, `dailyPrice`）は JSON シリアライズ不可

**実装内容**:
- `SerializedSpace` 型定義: Decimal → number 変換後の型
- `getSpaces()` 関数: `.toNumber()` で Decimal → number 変換
- 既存パターン（`src/actions/admin/space.ts`）と整合性のある実装

**変更ファイル**:
- `src/components/site/sections/SpaceListSection.tsx`

**マイグレーション**: 不要

---

### 027-nuqs-best-practices.md (2026-01-16)

nuqs ベストプラクティス準拠

**実装内容**:
- history: 'push' - Paginationにブラウザ履歴サポート追加（UX改善）
- throttleMs: 500 - 検索入力にスロットリング追加（パフォーマンス改善）
- 管理画面パーサー集約: `src/lib/nuqs/search-params.ts`に`adminUserSearchParams`/`adminAuditLogSearchParams`追加
- createLoaderパターン統一: 管理画面で`createSearchParamsCache.parse()`を`createLoader`に置き換え

**変更ファイル**:
- `src/lib/nuqs/search-params.ts` - 管理画面用SearchParams追加
- `src/lib/nuqs/index.ts` - エクスポート追加
- `src/app/(public)/blog/_components/blog-pagination.tsx` - history: 'push'追加
- `src/app/(public)/blog/_components/blog-filters.tsx` - throttleMs追加
- `src/app/(public)/spaces/_components/Pagination.tsx` - history: 'push'追加
- `src/app/(public)/spaces/_components/SpaceFilters.tsx` - throttleMs追加
- `src/app/(public)/news/_components/NewsPagination.tsx` - history: 'push'追加
- `src/app/(admin)/admin/(dashboard)/users/page.tsx` - loadAdminUserSearchParams使用
- `src/app/(admin)/admin/(dashboard)/audit-logs/page.tsx` - loadAdminAuditLogSearchParams使用
- `src/components/admin/ui/Pagination.tsx` - nuqs移行（router.push → useQueryState）
- `src/components/admin/ui/index.ts` - インポートパス修正

**マイグレーション**: 不要

---

### 026-remove-as-const-assertions.md (2026-01-16)

as const型アサーション削除 + 型アサーション改善（Phase 1-3）

**Phase 1: as const削除**
- プロジェクト全体から`as const`型アサーションを削除
- オブジェクト定数: interfaceまたはRecord型による明示的な型注釈に移行
- 配列定数: union型定義 + readonly配列に移行
- Enum風定数: union型 + Recordパターンに移行
- インラインCSS: React.CSSPropertiesによる型注釈に移行
- Prismaクエリ: satisfies演算子による型安全性確保

**Phase 2: 型アサーション（as Type）改善**
- セッションユーザー型: `getSessionUser`型ガード関数で`as User`/`as Role`を削除
- User型再定義: Better Auth の string 型 role を Role enum に変換
- 実行時検証追加: `isValidRole`でrole値を検証
- HOF改善: withAuth/withPermission/withReadPermission/withRole から型アサーション削除
- createSuccess改善: 関数オーバーロードで戻り値型を明確化

**Phase 3: さらなる型アサーション削減**
- Server Actions: 13ファイルで`as Role`を`getRoleFromSession`ヘルパーに置き換え
- URLSearchParams: 4ファイルでバリデーション関数（validateStatus等）に置き換え
- JSON config: 7つの型ガード関数追加（isHeroConfig, isSpaceListConfig等）
- FormData: `getFormString`, `getFormStringOrNull`等のヘルパー追加
- localStorage: 限定値の型ガード追加（isValidConsentStatus）

**変更ファイル**: 50+ファイル
- `src/lib/auth.ts` - User型再定義、getSessionUser型ガード、isValidRole、getRoleFromSession追加
- `src/lib/permissions.ts` - `as Role`削除
- `src/lib/utils.ts` - FormDataヘルパー追加
- `src/lib/validations/homepage-section.ts` - 型ガード関数追加
- `src/types/server-actions.ts` - HOF改善、createSuccess改善
- `src/actions/admin/*.ts` - 13ファイルをgetRoleFromSessionに移行
- `src/app/(admin)/.../users/page.tsx` 他4ファイル - URLSearchParamsバリデーション追加
- `src/app/(admin)/.../settings/_components/tabs/SectionEditor.tsx` - 型ガード使用
- `src/components/site/CookieConsentBanner.tsx` - localStorage型ガード追加

**マイグレーション**: 不要

---

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

## 未着手の計画

なし
