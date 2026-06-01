import type { PaymentStatus } from "@/shared/lib/validations/enums/prisma-types";

/**
 * 公開マイページの予約 / 支払いステータス Badge variant SSoT。
 *
 * 公開 Badge は `default | success | warning | info`（admin shadcn の
 * `*_BADGE_VARIANTS` とは別の variant 型）のため、`public-page-gotchas.md`
 * §公開 Badge と管理 Badge の variant 型は異なる に従い公開側で独自定義する。
 * 予約詳細（reservation-detail）と予約カード（reservation-card）の両方が本
 * SSoT を参照し、ReservationStatus / PaymentStatus 拡張時の配色 drift を防ぐ。
 */
type ReservationBadgeVariant = "default" | "success" | "warning" | "info";

export const RESERVATION_BADGE_VARIANTS: Record<
  string,
  ReservationBadgeVariant
> = {
  PENDING: "warning",
  CONFIRMED: "success",
  COMPLETED: "info",
  CANCELLED: "default",
  NO_SHOW: "default",
};

export const PAYMENT_BADGE_VARIANTS: Record<
  PaymentStatus,
  ReservationBadgeVariant
> = {
  UNPAID: "warning",
  PENDING: "warning",
  PAID: "success",
  REFUNDED: "info",
  FAILED: "default",
};
