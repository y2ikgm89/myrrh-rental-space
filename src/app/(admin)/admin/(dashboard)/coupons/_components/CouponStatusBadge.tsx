"use client";

import { Badge } from "@/admin/components/ui";
import type { CouponType } from "@generated/prisma/enums";

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

const couponActiveConfig = {
  active: { label: "有効", variant: "success" },
  inactive: { label: "無効", variant: "outline" },
} satisfies Record<string, { label: string; variant: CouponBadgeVariant }>;

const couponStatusConfig = {
  active: { label: "有効", variant: "success" },
  inactive: { label: "無効", variant: "outline" },
  expired: { label: "期限切れ", variant: "destructive" },
  limitReached: { label: "上限到達", variant: "warning" },
  notStarted: { label: "期間前", variant: "secondary" },
} satisfies Record<string, { label: string; variant: CouponBadgeVariant }>;

export type CouponStatusType =
  | "active"
  | "inactive"
  | "expired"
  | "limitReached"
  | "notStarted";

type CouponLike = {
  isActive: boolean;
  validFrom: string;
  validUntil: string | null;
  usageLimit: number | null;
  usageCount: number;
};

export function CouponTypeBadge({ type }: { type: CouponType }) {
  const config = couponTypeConfig[type];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export function CouponActiveBadge({ isActive }: { isActive: boolean }) {
  const config = isActive
    ? couponActiveConfig.active
    : couponActiveConfig.inactive;
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export function getCouponStatus(coupon: CouponLike): CouponStatusType {
  if (!coupon.isActive) {
    return "inactive";
  }

  const now = new Date();

  if (new Date(coupon.validFrom) > now) {
    return "notStarted";
  }

  if (coupon.validUntil && new Date(coupon.validUntil) < now) {
    return "expired";
  }

  if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
    return "limitReached";
  }

  return "active";
}

export function CouponStatusBadge({ coupon }: { coupon: CouponLike }) {
  const status = getCouponStatus(coupon);
  const config = couponStatusConfig[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
