import "server-only";

import { prisma } from "@/shared/db/prisma";
import { CustomerType, ReservationStatus } from "@generated/prisma/enums";
import { DomainError } from "@/shared/domain/domain-error";
import { ensureCustomerNotBlacklisted } from "@/shared/domain/customers/guard";
import { isFeatureEnabled } from "@/shared/lib/features/check";
import { resolveOrCreateCustomer } from "@/shared/domain/reservations/resolve-customer";
import {
  ensureDateNotBlocked,
  getReservationRuleSettings,
} from "@/shared/domain/reservations/availability";
import { checkReservationDuration } from "@/shared/lib/reservation/time-slots-utils";
import { parseDateTimeLocalAsJst } from "@/shared/lib/date-format";
import { getSpaceRatePlans } from "@/shared/domain/spaces/rate-plan-queries";
import { resolveRateBreakdown } from "@/shared/lib/pricing/rate-plan-resolver";
import { calculateReservationPricing } from "@/shared/lib/pricing/calculate-reservation-pricing";
import { isJapaneseHoliday } from "@/shared/lib/date/holiday";
import { asPrismaInputJsonValue } from "@/shared/db/json";
import {
  CUSTOMER_SELECT,
  buildPricingSettings,
  ensureNoOverlap,
  getReservationSettings,
  incrementCustomerReservationStats,
  buildPayload,
  validateCoupon,
} from "./payloads";
import { lockSpaceForTransaction } from "./space-locks";

const SPACE_SELECT = {
  id: true,
  name: true,
  addressDetail: true,
  hourlyPrice: true,
  locationId: true,
  discountType: true,
  discountValue: true,
  durationDiscountOverride: true,
  taxRateType: true,
  location: { select: { address: true } },
} as const;

// ---------------------------------------------------------------------------
// Public: Create
// ---------------------------------------------------------------------------

type PublicReservationInput = {
  spaceId: string;
  date: string;
  startTime: string;
  endTime: string;
  lastName: string;
  firstName: string;
  email: string;
  phoneNumber?: string | null | undefined;
  companyName?: string | null | undefined;
  customerType?: CustomerType | undefined;
  notes?: string | null | undefined;
  userId?: string | null | undefined;
  /** クーポンコード。空文字/undefined は「未入力」。サーバー側で validateCoupon が形式・有効性を検証。 */
  couponCode?: string | null | undefined;
};

export async function createPublicReservationCommand(
  input: PublicReservationInput,
) {
  // Global gate: featureModules.reservation（依存元 spaces 含む）で OFF なら拒否。
  // page.tsx の requireFeatureEnabled は Server Action の直接呼び出しを防げないため、
  // 書込の実効性は domain 層のこのチェックが担保する（reviews/commands.ts と同型）。
  if (!(await isFeatureEnabled("reservation"))) {
    throw new DomainError(
      "予約機能は現在サイト全体で無効化されています",
      "VALIDATION",
    );
  }

  const startDateTime = parseDateTimeLocalAsJst(
    `${input.date}T${input.startTime}`,
  );
  const endDateTime = parseDateTimeLocalAsJst(`${input.date}T${input.endTime}`);

  const space = await prisma.space.findUnique({
    where: { id: input.spaceId, isActive: true, isPublished: true },
    select: SPACE_SELECT,
  });

  if (!space) {
    throw new DomainError("指定されたスペースが見つかりません", "NOT_FOUND");
  }

  // 最小/最大予約時間（設定値）をサーバー側で強制する
  const rules = await getReservationRuleSettings();
  const durationError = checkReservationDuration(
    (endDateTime.getTime() - startDateTime.getTime()) / 60000,
    rules,
  );
  if (durationError) {
    throw new DomainError(durationError, "VALIDATION");
  }

  await ensureDateNotBlocked(input.spaceId, space.locationId, input.date);

  await ensureNoOverlap({
    spaceId: input.spaceId,
    startTime: startDateTime,
    endTime: endDateTime,
  });

  // rate plan（曜日別/祝日別/期間限定料金）は read-only なので advisory lock の
  // 取得前（tx の外）で取得する。
  const ratePlans = await getSpaceRatePlans(input.spaceId);

  // クーポンの最低利用額判定は rate plan 適用後の実 basePrice で行う必要があるため、
  // 先に resolveRateBreakdown だけ呼んで basePrice を確定する。calculateReservationPricing
  // 内部でも同じ純粋関数が再度呼ばれるが、DB I/O のない軽量な再計算のため許容する。
  const rateBreakdownForCoupon = resolveRateBreakdown({
    ratePlans,
    spaceHourlyPrice: space.hourlyPrice,
    startDateTime,
    endDateTime,
    holidayJudge: isJapaneseHoliday,
  });

  // 公開予約フォームの料金確定はサーバー側 SSoT。rate plan・スペース固有割引（Space
  // モデル）・長時間割引（Settings）・税額までを calculateReservationPricing 経由で
  // 一気通貫に適用する。クーポンは Step 3 の CouponCode 入力欄から。空文字/undefined は
  // 「未入力」で null 扱い。
  const settings = await getReservationSettings();
  const validatedCoupon = await validateCoupon(
    input.couponCode,
    rateBreakdownForCoupon.totalBasePrice,
  );
  const couponId = validatedCoupon?.id ?? null;

  const pricing = calculateReservationPricing({
    startDateTime,
    endDateTime,
    space: {
      hourlyPrice: space.hourlyPrice,
      discountType: space.discountType,
      discountValue: space.discountValue,
      durationDiscountOverride: space.durationDiscountOverride,
      taxRateType: space.taxRateType,
    },
    ratePlans,
    reservationSettings: buildPricingSettings(settings),
    coupon: validatedCoupon,
    holidayJudge: isJapaneseHoliday,
  });

  const reservation = await prisma.$transaction(async (tx) => {
    await lockSpaceForTransaction(tx, input.spaceId);

    await ensureDateNotBlocked(input.spaceId, space.locationId, input.date, tx);

    await ensureNoOverlap(
      {
        spaceId: input.spaceId,
        startTime: startDateTime,
        endTime: endDateTime,
      },
      tx,
    );

    const customerId = await resolveOrCreateCustomer(
      {
        lastName: input.lastName,
        firstName: input.firstName,
        email: input.email,
        phoneNumber: input.phoneNumber,
        companyName: input.companyName,
        customerType: input.customerType,
        userId: input.userId,
      },
      tx,
    );

    await ensureCustomerNotBlacklisted({ customerId }, tx);

    const created = await tx.reservation.create({
      data: {
        spaceId: input.spaceId,
        customerId,
        startTime: startDateTime,
        endTime: endDateTime,
        basePrice: pricing.basePrice,
        totalPrice: pricing.totalPrice,
        rateBreakdownJson: asPrismaInputJsonValue(
          pricing.rateBreakdown,
          "料金内訳の生成に失敗しました",
        ),
        taxRateType: pricing.taxRateType,
        taxRate: pricing.taxRate,
        taxAmount: pricing.taxAmount,
        totalPriceWithTax: pricing.totalPriceWithTax,
        couponId,
        couponDiscountAmount: pricing.couponDiscountAmount,
        spaceDiscountAmount: pricing.spaceDiscountAmount,
        durationDiscountAmount: pricing.durationDiscountAmount,
        status: ReservationStatus.CONFIRMED,
        notes: input.notes || null,
        userId: input.userId || null,
        // Guest contact info (予約時の入力を記録)
        guestLastName: input.lastName,
        guestFirstName: input.firstName,
        guestEmail: input.email,
        guestPhone: input.phoneNumber || null,
        guestCompanyName: input.companyName || null,
        guestCustomerType: input.customerType ?? null,
      },
      include: { customer: { select: CUSTOMER_SELECT } },
    });

    // Coupon usage の atomic claim (usageLimit null OR usageCount < usageLimit 条件で
    // increment、race で claim 失敗なら CONFLICT を throw して tx rollback)。
    // pre-tx validateCoupon で validity は確認済みだが、usageLimit の race を封じるために
    // ここで conditional UPDATE を実行する (business-domain rule: 「updateMany の WHERE
    // で claim」パターン; Prisma updateMany では column-to-column 比較不可のため
    // $executeRaw を使う)。
    if (couponId) {
      const claimed = await tx.$executeRaw`
        UPDATE "coupons"
        SET "usageCount" = "usageCount" + 1
        WHERE "id" = ${couponId}::uuid
          AND "isActive" = true
          AND ("usageLimit" IS NULL OR "usageCount" < "usageLimit")
      `;
      if (claimed === 0) {
        throw new DomainError(
          "クーポンが利用できません（利用上限に達した可能性があります）",
          "CONFLICT",
        );
      }
    }

    await incrementCustomerReservationStats(tx, customerId);

    return created;
  });

  // Compute guest name diff for admin notification
  const guestFullName = `${input.lastName} ${input.firstName}`.trim();
  const customerFullName =
    `${reservation.customer.lastName} ${reservation.customer.firstName}`.trim();
  const guestNameDiff =
    guestFullName !== customerFullName ? guestFullName : null;

  return {
    id: reservation.id,
    customerId: reservation.customerId,
    payload: buildPayload({
      reservationId: reservation.id,
      customer: reservation.customer,
      space,
      startTime: startDateTime,
      endTime: endDateTime,
      totalPrice: pricing.totalPrice,
      notes: input.notes,
      guestName: guestNameDiff,
      icsSequence: reservation.icsSequence,
      userId: input.userId ?? null,
    }),
  };
}
