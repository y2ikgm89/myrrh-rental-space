"use client";

import { Badge } from "@/admin/components/ui";
import type { CouponType } from "@/shared/lib/validations/enums/prisma-types";
import { type CouponStatusType } from "../_lib/coupon-status";

type CouponBadgeVariant =
  "default" | "secondary" | "outline" | "success" | "warning" | "destructive";

const couponTypeConfig = {
  PERCENTAGE: { label: "%割引", variant: "default" },
  FIXED_AMOUNT: { label: "定額割引", variant: "secondary" },
} satisfies Record<CouponType, { label: string; variant: CouponBadgeVariant }>;

/**
 * クーポン派生 5 状態 SSoT: label + Badge variant + 補助テキスト色クラス。
 *
 * 消費者:
 * - `<CouponStatusBadge>` — 詳細ページの Badge 描画
 * - `<CouponStateToggle>` — 一覧ページの Switch + 派生状態テキスト
 *
 * `textColor` は WCAG 1.4.1 (Use of Color) 補強用。warning / destructive 状態を
 * 一覧で即時識別可能にするセマンティックカラートークン参照（admin.css の
 * `--color-success` / `--color-warning` / `--color-destructive`）。
 */
export const COUPON_STATUS_CONFIG = {
  active: {
    label: "有効",
    variant: "success",
    textColor: "text-success",
  },
  inactive: {
    label: "無効",
    variant: "outline",
    textColor: "text-muted-foreground",
  },
  expired: {
    label: "期限切れ",
    variant: "destructive",
    textColor: "text-destructive",
  },
  limitReached: {
    label: "上限到達",
    variant: "warning",
    textColor: "text-warning",
  },
  notStarted: {
    label: "期間前",
    variant: "secondary",
    textColor: "text-muted-foreground",
  },
} satisfies Record<
  CouponStatusType,
  { label: string; variant: CouponBadgeVariant; textColor: string }
>;

export function CouponTypeBadge({ type }: { type: CouponType }) {
  const config = couponTypeConfig[type];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

/**
 * クーポンの表示ステータス Badge（詳細ページ用）。
 *
 * ステータス計算は Server Component 側（`getCouponStatus(coupon, now)`）で
 * 事前に行い、本コンポーネントは結果を受け取って描画するだけの責務に分離。
 * これにより render 中の `new Date()` 副作用を排除し、React Compiler の
 * `purity` ルールに準拠する。
 *
 * 一覧ページでは `<CouponStateToggle>`（Switch 統合版）を使用する。
 */
export function CouponStatusBadge({ status }: { status: CouponStatusType }) {
  const config = COUPON_STATUS_CONFIG[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
