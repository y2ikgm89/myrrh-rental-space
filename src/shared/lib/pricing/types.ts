/**
 * 料金計算の型定義
 */

import type { CouponType } from "@/shared/db/enums";
import type {
  DiscountType,
  DurationDiscountOverride,
  TaxDisplayMode,
  TaxInputMode,
} from "@/shared/db/enums";

// Coupon型の簡易定義（Prismaのモデルに依存しない）
// Prisma拡張でDecimal→number自動変換済みのため、number型で統一
export type CouponLike = {
  id: string;
  code: string;
  name: string;
  type: CouponType;
  discountValue: number;
  maxDiscountAmount?: number | null;
  canCombineWithDurationDiscount?: boolean;
};

/**
 * 長時間割引ルール
 * 設定された時間以上の予約に対して割引を適用
 */
export type DurationDiscountRule = {
  hours: number; // 閾値（時間）
  discountRate: number; // 割引率（%）
};

/**
 * スペース割引設定
 */
export type SpaceDiscountSettings = {
  discountType: DiscountType;
  discountValue: number | null;
  durationDiscountOverride: DurationDiscountOverride;
};

/**
 * 料金計算結果
 */
export type PriceCalculation = {
  basePrice: number; // 割引前価格
  spaceDiscount: number; // スペース固有割引額
  durationDiscount: number; // 長時間割引額
  couponDiscount: number; // クーポン割引額
  totalPrice: number; // 最終価格
  totalDiscountRate: number; // 総割引率（%）
  appliedSpaceDiscount: { type: DiscountType; value: number } | null; // 適用されたスペース割引
  appliedDurationRule: DurationDiscountRule | null; // 適用された長時間割引ルール
  appliedCoupon: {
    id: string;
    code: string;
    name: string;
    type: CouponType;
    discountValue: number;
  } | null; // 適用されたクーポン
  warnings: string[]; // 警告メッセージ
};

/**
 * 料金計算パラメータ
 */
export type PriceCalculationParams = {
  hourlyPrice: number;
  hours: number;
  durationRules: DurationDiscountRule[];
  durationDiscountEnabled: boolean;
  spaceDiscount?: SpaceDiscountSettings | null;
  coupon?: CouponLike | null;
  combinationMode: import("@/shared/db/enums").DiscountCombinationMode;
  showWarning?: boolean;
};

/**
 * 税設定
 */
export type TaxSettings = {
  standardRate: number; // 標準税率（%）
  reducedRate: number; // 軽減税率（%）
  displayModeAdmin: TaxDisplayMode; // 管理画面の表示モード
  displayModePublic: TaxDisplayMode; // 公開ページの表示モード
  inputMode: TaxInputMode; // 入力モード（税抜き/税込み）
};

/**
 * 価格フォーマットオプション
 */
export type PriceFormatOptions = {
  showCurrency?: boolean; // 通貨記号を表示（デフォルト: true）
  showTaxLabel?: boolean; // 税ラベルを表示（デフォルト: false）
  taxLabel?: string; // 税ラベル（デフォルト: '税込'/'税抜'）
};

/**
 * 税込/税抜価格の表示オプション
 */
export type TaxPriceDisplayOptions = {
  taxExcludedPrice: number; // 税抜価格
  taxRate: number; // 税率（%）
  displayMode: TaxDisplayMode; // 表示モード
};
