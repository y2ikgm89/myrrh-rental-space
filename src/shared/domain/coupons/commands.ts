import "server-only";

import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { parseDateTimeLocalAsJst } from "@/shared/lib/date-format";
import type { CouponFormOutput } from "@/shared/lib/validations/coupon";

async function ensureCouponExists(id: string): Promise<{ code: string }> {
  const coupon = await prisma.coupon.findUnique({
    where: { id },
    select: { id: true, code: true },
  });

  if (!coupon) {
    throw new DomainError("クーポンが見つかりません", "NOT_FOUND");
  }

  return { code: coupon.code };
}

async function ensureCouponCodeAvailable(
  code: string,
  currentId?: string,
): Promise<void> {
  const existing = currentId
    ? await prisma.coupon.findFirst({
        where: {
          code,
          NOT: { id: currentId },
        },
        select: { id: true },
      })
    : await prisma.coupon.findUnique({
        where: { code },
        select: { id: true },
      });

  if (existing) {
    throw new DomainError(
      "このクーポンコードは既に使用されています",
      "CONFLICT",
    );
  }
}

/**
 * Form 入力（datetime-local 文字列）を Prisma の Date 引数に変換。
 *
 * `validFrom` / `validUntil` は `"YYYY-MM-DDTHH:mm"` 形式の文字列で受け取る。
 * `parseDateTimeLocalAsJst` で **JST として明示的に parse** し、UTC Date に変換する。
 * サーバ tz (Cloud Run = UTC) / ブラウザ tz に依存しない。
 */
function toCouponData(data: CouponFormOutput) {
  return {
    code: data.code,
    name: data.name,
    description: data.description || null,
    type: data.type,
    discountValue: data.discountValue,
    minReservationAmount: data.minReservationAmount ?? null,
    maxDiscountAmount: data.maxDiscountAmount ?? null,
    validFrom: parseDateTimeLocalAsJst(data.validFrom),
    validUntil:
      data.validUntil && data.validUntil !== ""
        ? parseDateTimeLocalAsJst(data.validUntil)
        : null,
    usageLimit: data.usageLimit ?? null,
    isActive: data.isActive,
    canCombineWithDurationDiscount: data.canCombineWithDurationDiscount,
  };
}

export async function createCoupon(
  data: CouponFormOutput,
): Promise<{ id: string }> {
  await ensureCouponCodeAvailable(data.code);

  const coupon = await prisma.coupon.create({
    data: toCouponData(data),
  });

  return { id: coupon.id };
}

export async function updateCoupon(
  id: string,
  data: CouponFormOutput,
): Promise<void> {
  const coupon = await ensureCouponExists(id);

  if (coupon.code !== data.code) {
    await ensureCouponCodeAvailable(data.code, id);
  }

  await prisma.coupon.update({
    where: { id },
    data: toCouponData(data),
  });
}

/**
 * クーポンを削除する。
 *
 * `Reservation.couponId` は `onDelete: SetNull` のため、使用済みクーポンを削除しても
 * 過去予約の参照はクリアされるだけで FK 衝突は発生しない（`Coupon.usageCount > 0`
 * でも安全）。`bulkDeleteCouponsCommand` と挙動を統一し、UI から「単体は拒否されるが
 * bulk なら削除できる」silent な業務挙動の差を排除する設計判断。
 *
 * 過去予約の使用履歴（金額・割引額等）はスナップショットとして `Reservation`
 * 自身が保持しているため、クーポン削除後も会計データは保全される。
 */
export async function deleteCoupon(id: string): Promise<void> {
  await ensureCouponExists(id);

  await prisma.coupon.delete({
    where: { id },
  });
}

export async function toggleCouponActive(
  id: string,
): Promise<{ isActive: boolean }> {
  const coupon = await prisma.coupon.findUnique({
    where: { id },
    select: { id: true, isActive: true },
  });

  if (!coupon) {
    throw new DomainError("クーポンが見つかりません", "NOT_FOUND");
  }

  const updated = await prisma.coupon.update({
    where: { id },
    data: { isActive: !coupon.isActive },
    select: { isActive: true },
  });

  return { isActive: updated.isActive };
}

export async function incrementCouponUsage(id: string): Promise<void> {
  await prisma.coupon.update({
    where: { id },
    data: { usageCount: { increment: 1 } },
  });
}

export async function decrementCouponUsage(id: string): Promise<void> {
  await prisma.coupon.updateMany({
    where: { id, usageCount: { gt: 0 } },
    data: { usageCount: { decrement: 1 } },
  });
}
