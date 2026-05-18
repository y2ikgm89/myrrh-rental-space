"use client";

import { Badge } from "@/admin/components/ui";
import type { CouponType } from "@/shared/lib/validations/enums/prisma-types";
import { type CouponStatusType } from "../_lib/coupon-status";

type CouponBadgeVariant =
  | "default"
  | "secondary"
  | "outline"
  | "success"
  | "warning"
  | "destructive";

const couponTypeConfig = {
  PERCENTAGE: { label: "%割引", variant: "default" },
  FIXED_AMOUNT: { label: "定額割引", variant: "secondary" },
} satisfies Record<CouponType, { label: string; variant: CouponBadgeVariant }>;

const couponStatusConfig = {
  active: { label: "有効", variant: "success" },
  inactive: { label: "無効", variant: "outline" },
  expired: { label: "期限切れ", variant: "destructive" },
  limitReached: { label: "上限到達", variant: "warning" },
  notStarted: { label: "期間前", variant: "secondary" },
} satisfies Record<
  CouponStatusType,
  { label: string; variant: CouponBadgeVariant }
>;

/**
 * クーポン派生ステータス 5 値の表示ラベル SSoT。
 *
 * `CouponTable` で `PublishSwitch.label` を override する際にも参照される
 * （Switch 下に派生 operational state を表示し、StatusBadge との 2 列重複を解消）。
 */
export const COUPON_STATUS_LABELS: Record<CouponStatusType, string> = {
  active: couponStatusConfig.active.label,
  inactive: couponStatusConfig.inactive.label,
  expired: couponStatusConfig.expired.label,
  limitReached: couponStatusConfig.limitReached.label,
  notStarted: couponStatusConfig.notStarted.label,
};

export function CouponTypeBadge({ type }: { type: CouponType }) {
  const config = couponTypeConfig[type];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

/**
 * クーポンの表示ステータス Badge。
 *
 * ステータス計算は Server Component 側（`getCouponStatus(coupon, now)`）で
 * 事前に行い、本コンポーネントは結果を受け取って描画するだけの責務に分離。
 * これにより render 中の `new Date()` 副作用を排除し、React Compiler の
 * `purity` ルールに準拠する。
 */
export function CouponStatusBadge({ status }: { status: CouponStatusType }) {
  const config = couponStatusConfig[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
