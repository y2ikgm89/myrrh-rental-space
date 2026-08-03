import "server-only";

import { prisma } from "@/shared/db/prisma";
import { RESERVATION_WRITE_TX_OPTIONS } from "@/shared/db/transaction-options";
import {
  CustomerType,
  ReservationStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import { DomainError } from "@/shared/domain/domain-error";
import { ensureCustomerNotBlacklisted } from "@/shared/domain/customers/guard";
import { isFeatureEnabled } from "@/shared/domain/features/check";
import { resolveOrCreateCustomer } from "@/shared/domain/reservations/resolve-customer";
import {
  ensureDateNotBlocked,
  getBusinessHoursSettingsQuery,
  getReservationRuleSettings,
} from "@/shared/domain/reservations/availability";
import {
  checkReservationDuration,
  isWithinBusinessHours,
} from "@/shared/lib/reservation/time-slots-utils";
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
  claimCouponUsage,
  guestCountCapacityError,
  validateCoupon,
} from "./payloads";
import { lockSpaceForTransaction } from "./space-locks";
import { recordTermsAgreements } from "@/shared/domain/terms/commands";
import { TERMS_SCOPE } from "@/shared/lib/validations/enums/prisma-types";

const SPACE_SELECT = {
  id: true,
  name: true,
  addressDetail: true,
  capacity: true,
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
  /**
   * 利用人数。現状は永続化せず、スペース定員 (`Space.capacity`) との照合のみ行う
   * clean-break gate。フォーム schema 経由で渡る。
   */
  numberOfGuests?: number | undefined;
  /** クーポンコード。空文字/undefined は「未入力」。サーバー側で validateCoupon が形式・有効性を検証。 */
  couponCode?: string | null | undefined;
  /**
   * 同意済み規約 ID。予約作成と同一 tx 内で TermsAgreement を記録する
   * （series 経路の `recordTermsAgreements` と同型。post-commit 別 tx は禁止）。
   */
  agreedTermsIds?: readonly string[] | undefined;
  ipAddress?: string | null | undefined;
  userAgent?: string | null | undefined;
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

  // 過去時刻への予約を封殺する（顧客セルフ変更の MYPAGE-EDIT-01 と同契約）。
  // Zod の JST 日付 refine は「今日」まで通すため、同日の過去時刻はここで拒否する。
  if (startDateTime.getTime() <= Date.now()) {
    throw new DomainError("過去の日時には予約できません", "VALIDATION");
  }

  const space = await prisma.space.findUnique({
    where: { id: input.spaceId, isActive: true, isPublished: true },
    select: SPACE_SELECT,
  });

  if (!space) {
    throw new DomainError("指定されたスペースが見つかりません", "NOT_FOUND");
  }

  const capacityError = guestCountCapacityError(
    input.numberOfGuests,
    space.capacity,
  );
  if (capacityError) {
    throw new DomainError(capacityError, "VALIDATION");
  }

  // 営業時間（公開スロット生成と同じ Settings.businessHours SSoT）
  const businessHours = await getBusinessHoursSettingsQuery();
  if (
    !isWithinBusinessHours(
      businessHours,
      input.date,
      input.startTime,
      input.endTime,
    )
  ) {
    throw new DomainError("選択した時間帯は営業時間外です", "VALIDATION");
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

  const couponId = pricing.appliedCoupon?.id ?? null;

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
        // 定員 gate（guestCountCapacityError）が検査した値をそのまま残す。
        // 保存しないと編集画面が読む値を失い、gate が編集経路で無効になる。
        numberOfGuests: input.numberOfGuests ?? null,
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

    // Coupon usage の atomic claim（validity window / min amount / usageLimit を
    // 同一 UPDATE WHERE で強制。claim 失敗は CONFLICT で tx rollback）。
    if (couponId) {
      await claimCouponUsage(tx, {
        couponId,
        basePrice: rateBreakdownForCoupon.totalBasePrice,
      });
    }

    await incrementCustomerReservationStats(tx, customerId);

    // TermsAgreement は予約行と同じ tx で記録する（失敗時は予約ごと rollback）。
    // series-commands.ts の recordTermsAgreements と同契約。
    if (input.agreedTermsIds && input.agreedTermsIds.length > 0) {
      await recordTermsAgreements({
        scope: TERMS_SCOPE.RESERVATION,
        customerId,
        resourceId: created.id,
        guestEmail: input.userId ? null : input.email,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        agreements: input.agreedTermsIds.map((termsId) => ({ termsId })),
        tx,
      });
    }

    return created;
  }, RESERVATION_WRITE_TX_OPTIONS);

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
