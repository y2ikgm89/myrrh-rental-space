import "server-only";

import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
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

function toCouponData(data: CouponFormOutput) {
  return {
    code: data.code,
    name: data.name,
    description: data.description || null,
    type: data.type,
    discountValue: data.discountValue,
    minReservationAmount: data.minReservationAmount ?? null,
    maxDiscountAmount: data.maxDiscountAmount ?? null,
    validFrom: data.validFrom,
    validUntil: data.validUntil ?? null,
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

export async function deleteCoupon(id: string): Promise<void> {
  await ensureCouponExists(id);

  const usedReservations = await prisma.reservation.count({
    where: { couponId: id },
  });

  if (usedReservations > 0) {
    throw new DomainError(
      `このクーポンは${usedReservations}件の予約で使用されているため削除できません`,
      "CONFLICT",
    );
  }

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
