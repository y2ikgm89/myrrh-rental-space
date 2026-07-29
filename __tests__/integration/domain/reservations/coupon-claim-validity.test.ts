/**
 * claimCouponUsage — 実 DB での validity / min amount / usageLimit 再検証。
 *
 * pre-tx validateCoupon 通過後にクーポンが期限切れ・最低利用額未満になっても、
 * atomic claim が count=0 で fail-closed し usageCount を増やさないことを証明する。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { CouponType } from "@generated/prisma/enums";
import { DomainError } from "@/shared/domain/domain-error";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type PayloadsModule = typeof import("@/shared/domain/reservations/payloads");

let prisma: PrismaModule["prisma"];
let claimCouponUsage: PayloadsModule["claimCouponUsage"];

const SCOPE = `zzclaim-${crypto.randomUUID().slice(0, 8)}`;
const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000);
const FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000);

async function expectClaimConflict(
  args: Parameters<typeof claimCouponUsage>[1],
): Promise<void> {
  try {
    await claimCouponUsage(prisma, args);
    expect.unreachable("claimCouponUsage should have thrown CONFLICT");
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    expect(error).toMatchObject({ code: "CONFLICT" });
  }
}

describeMaybe("claimCouponUsage — validity inside atomic claim", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ claimCouponUsage } =
      await import("@/shared/domain/reservations/payloads"));
  });

  afterAll(async () => {
    try {
      await prisma.coupon.deleteMany({
        where: { code: { startsWith: SCOPE.toUpperCase() } },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  test("有効クーポンは usageCount を +1 する", async () => {
    const coupon = await prisma.coupon.create({
      data: {
        code: `${SCOPE}-OK`.toUpperCase(),
        name: `${SCOPE} ok`,
        type: CouponType.FIXED_AMOUNT,
        discountValue: 100,
        validFrom: PAST,
        validUntil: null,
        usageLimit: 10,
        usageCount: 0,
        isActive: true,
        minReservationAmount: 1000,
      },
      select: { id: true },
    });

    await claimCouponUsage(prisma, {
      couponId: coupon.id,
      basePrice: 2000,
    });

    const after = await prisma.coupon.findUniqueOrThrow({
      where: { id: coupon.id },
      select: { usageCount: true },
    });
    expect(after.usageCount).toBe(1);
  });

  test("validUntil 経過後は claim 失敗し usageCount 不変", async () => {
    const coupon = await prisma.coupon.create({
      data: {
        code: `${SCOPE}-EXP`.toUpperCase(),
        name: `${SCOPE} expired`,
        type: CouponType.PERCENTAGE,
        discountValue: 10,
        validFrom: PAST,
        validUntil: PAST,
        usageLimit: null,
        usageCount: 0,
        isActive: true,
      },
      select: { id: true },
    });

    await expectClaimConflict({
      couponId: coupon.id,
      basePrice: 5000,
    });

    const after = await prisma.coupon.findUniqueOrThrow({
      where: { id: coupon.id },
      select: { usageCount: true },
    });
    expect(after.usageCount).toBe(0);
  });

  test("validFrom 未到来は claim 失敗し usageCount 不変", async () => {
    const coupon = await prisma.coupon.create({
      data: {
        code: `${SCOPE}-FUT`.toUpperCase(),
        name: `${SCOPE} future`,
        type: CouponType.PERCENTAGE,
        discountValue: 10,
        validFrom: FUTURE,
        validUntil: null,
        usageLimit: null,
        usageCount: 0,
        isActive: true,
      },
      select: { id: true },
    });

    await expectClaimConflict({
      couponId: coupon.id,
      basePrice: 5000,
    });

    const after = await prisma.coupon.findUniqueOrThrow({
      where: { id: coupon.id },
      select: { usageCount: true },
    });
    expect(after.usageCount).toBe(0);
  });

  test("minReservationAmount 未満は claim 失敗し usageCount 不変", async () => {
    const coupon = await prisma.coupon.create({
      data: {
        code: `${SCOPE}-MIN`.toUpperCase(),
        name: `${SCOPE} min`,
        type: CouponType.FIXED_AMOUNT,
        discountValue: 500,
        validFrom: PAST,
        validUntil: null,
        usageLimit: null,
        usageCount: 0,
        isActive: true,
        minReservationAmount: 10_000,
      },
      select: { id: true },
    });

    await expectClaimConflict({
      couponId: coupon.id,
      basePrice: 3000,
    });

    const after = await prisma.coupon.findUniqueOrThrow({
      where: { id: coupon.id },
      select: { usageCount: true },
    });
    expect(after.usageCount).toBe(0);
  });

  test("usageLimit 到達は claim 失敗し usageCount 不変", async () => {
    const coupon = await prisma.coupon.create({
      data: {
        code: `${SCOPE}-LIM`.toUpperCase(),
        name: `${SCOPE} limit`,
        type: CouponType.FIXED_AMOUNT,
        discountValue: 100,
        validFrom: PAST,
        validUntil: null,
        usageLimit: 2,
        usageCount: 2,
        isActive: true,
      },
      select: { id: true },
    });

    await expectClaimConflict({
      couponId: coupon.id,
      basePrice: 5000,
    });

    const after = await prisma.coupon.findUniqueOrThrow({
      where: { id: coupon.id },
      select: { usageCount: true },
    });
    expect(after.usageCount).toBe(2);
  });
});
