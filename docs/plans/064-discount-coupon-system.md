# 064: 割引・クーポンシステム（Phase 1）

## 概要

レンタルスペース予約における割引機能を実装。手動割引、長時間割引（自動計算）、汎用クーポンコードの3種類をサポート。

## 実装内容

### 1. Prismaスキーマ更新

**Couponモデル**（新規）:

- クーポンコード（ユニーク）
- 割引タイプ（PERCENTAGE / FIXED_AMOUNT）
- 割引値
- 有効期限（開始日、終了日）
- 利用回数制限
- 最低利用金額
- 長時間割引との併用可否

**SiteSettingsモデル**（拡張）:

- `durationDiscountEnabled` - 長時間割引の有効/無効
- `durationDiscountRules` - JSON形式の割引ルール
- `discountCombinationMode` - 割引の組み合わせモード（best/both）
- `showOriginalPrice` - 元価格の表示設定
- `discountWarningEnabled` - 警告表示設定

**Reservationモデル**（拡張）:

- `couponId` - 適用クーポンID
- `couponDiscountAmount` - クーポン割引額
- `durationDiscountAmount` - 長時間割引額
- `basePrice` - 割引前価格

### 2. 料金計算ロジック

`src/shared/lib/pricing.ts`:

- `calculateReservationPrice()` - 予約料金の総合計算
- `calculateDurationDiscount()` - 長時間割引の計算
- `calculateCouponDiscount()` - クーポン割引の計算
- 割引組み合わせモード対応（best: 最も有利な方のみ、both: 両方適用）

### 3. Server Actions

**クーポン管理** (`src/app/(admin)/admin/(dashboard)/_shared/actions/coupon.ts`):

- `getCoupons()` - 一覧取得（フィルタ・ページネーション対応）
- `getCouponById()` - 詳細取得
- `createCoupon()` - 新規作成
- `updateCoupon()` - 更新
- `deleteCoupon()` - 削除（使用中の予約がある場合は不可）
- `toggleCouponActive()` - 有効/無効切り替え
- `validateCouponCode()` - 公開ページ用検証

**割引設定** (`src/app/(admin)/admin/(dashboard)/_shared/actions/settings/discount.ts`):

- `getDiscountSettings()` - 設定取得
- `getPublicDiscountSettings()` - 公開用設定取得
- `updateDiscountSettings()` - 設定更新

### 4. 管理画面UI

**クーポン管理**:

- `/admin/coupons` - クーポン一覧
- `/admin/coupons/new` - 新規作成
- `/admin/coupons/[id]` - 編集

**割引設定**:

- `/admin/settings/business` - 長時間割引設定セクション追加

### 5. 公開ページ統合

**予約フォーム**:

- クーポンコード入力コンポーネント
- 割引計算の統合
- 価格表示（~~元価格~~ → **割引価格**）
- 割引内訳の表示

### 6. セキュリティ対策

**レースコンディション対策**:

- クーポン使用回数のインクリメントをトランザクション内で実行
- 予約確定時にクーポンを再検証

**タイミング攻撃対策**:

- クーポン存在/無効を同一エラーメッセージで返却

**入力検証**:

- クーポンコードの英数字バリデーション
- 最大長制限

## ファイル一覧

### 新規作成

- `prisma/migrations/20260122xxx_add_coupon_model/`
- `src/shared/lib/pricing.ts`
- `src/shared/lib/validations/coupon.ts`
- `src/app/(admin)/admin/(dashboard)/_shared/actions/coupon.ts`
- `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/discount.ts`
- `src/app/(admin)/admin/(dashboard)/coupons/` (全ページ)
- `src/app/(admin)/admin/(dashboard)/coupons/_components/CouponForm.tsx`
- `src/app/(admin)/admin/(dashboard)/coupons/_components/CouponTable.tsx`
- `src/app/(public)/_shared/components/CouponCodeInput.tsx`
- `src/app/(admin)/admin/(dashboard)/settings/_components/sections/DiscountSection.tsx`

### 変更

- `prisma/schema.prisma` - Couponモデル追加、Reservation拡張
- `src/app/(public)/_shared/actions/reservation.ts` - 割引計算統合
- `src/app/(public)/_shared/lib/validations/reservation.ts` - couponCodeフィールド追加
- `src/app/(public)/reservation/_components/ReservationForm.tsx` - クーポン入力・割引表示
- `src/app/(public)/reservation/page.tsx` - 割引設定の取得
- `src/app/(admin)/admin/(dashboard)/settings/business/page.tsx` - 割引設定セクション
- `src/app/(admin)/admin/(dashboard)/_shared/components/status-badges.tsx` - CouponStatusBadge追加
- `src/app/(admin)/admin/(dashboard)/coupons/_components/CouponFilters.tsx` - ステータスフィルター

## 技術的決定

| 決定事項       | 選択           | 理由                             |
| -------------- | -------------- | -------------------------------- |
| 割引計算の配置 | 共有ライブラリ | 管理画面・公開ページ両方で再利用 |
| 価格の型       | Prisma Decimal | 金額計算の精度確保               |
| クーポン検証   | Server Action  | TOCTOU攻撃防止                   |
| 割引組み合わせ | 設定可能       | ビジネス要件の柔軟性             |

### 7. 管理画面UX改善

**ステータスバッジ**:

- 有効（緑）: 使用可能なクーポン
- 無効（グレー）: 手動で無効化
- 期限切れ（赤）: validUntil < 現在
- 上限到達（黄）: usageCount >= usageLimit
- 期間前（グレー）: validFrom > 現在

**ステータスフィルター**:

- すべて / 有効 / 無効 / 期限切れ / 上限到達 / 期間前

## 残タスク（Phase 2以降）

- [ ] 会員限定クーポン
- [ ] 初回利用クーポン
- [ ] 自動生成クーポン
- [ ] レートリミット追加
- [ ] 割引履歴のレポート機能

## 完了日

2026-01-22
