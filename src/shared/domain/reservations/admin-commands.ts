import "server-only";

import { prisma } from "@/shared/db/prisma";
import type { ReservationStatus } from "@generated/prisma/enums";
import { DomainError } from "@/shared/domain/domain-error";
import { CREATABLE_RESERVATION_STATUSES } from "@/shared/lib/validations/enums/helpers";
import { parseDateTimeLocalAsJst } from "@/shared/lib/date-format";
import { validateStatusTransition } from "./status";
import {
  resolveOrCreateCustomer,
  type CustomerData,
} from "@/shared/domain/reservations/resolve-customer";
import {
  CUSTOMER_SELECT,
  buildPricingSettings,
  getReservationSettings,
  validateCoupon,
  ensureNoOverlap,
  incrementCustomerReservationStats,
  recomputeCustomerReservationStats,
  buildPayload,
} from "./payloads";
import { lockSpaceForTransaction } from "./space-locks";
import { getSpaceRatePlans } from "@/shared/domain/spaces/rate-plan-queries";
import { resolveRateBreakdown } from "@/shared/lib/pricing/rate-plan-resolver";
import { calculateReservationPricing } from "@/shared/lib/pricing/calculate-reservation-pricing";
import { isJapaneseHoliday } from "@/shared/lib/date/holiday";
import { asPrismaInputJsonValue } from "@/shared/db/json";

const SPACE_SELECT = {
  id: true,
  name: true,
  addressDetail: true,
  hourlyPrice: true,
  discountType: true,
  discountValue: true,
  durationDiscountOverride: true,
  taxRateType: true,
  location: { select: { address: true } },
} as const;

// ---------------------------------------------------------------------------
// Admin: Create
// ---------------------------------------------------------------------------

export async function createAdminReservationCommand(input: {
  spaceId: string;
  date: string;
  startTime: string;
  endTime: string;
  customerId?: string | undefined;
  customerData?: CustomerData;
  totalPrice?: number | undefined;
  couponCode?: string | null | undefined;
  manualDiscountAmount?: number | undefined;
  manualDiscountReason?: string | null | undefined;
  status: ReservationStatus;
  notes?: string | null | undefined;
  /** 手動 totalPrice override の実行者 (admin User.id)。監査目的で priceOverriddenBy に記録する。 */
  adminUserId: string;
}) {
  if (!CREATABLE_RESERVATION_STATUSES.includes(input.status)) {
    throw new DomainError(
      "作成時のステータスは「保留中」または「確認済み」のみ指定できます",
      "VALIDATION",
    );
  }

  const startDateTime = parseDateTimeLocalAsJst(
    `${input.date}T${input.startTime}`,
  );
  const endDateTime = parseDateTimeLocalAsJst(`${input.date}T${input.endTime}`);

  const [space, , settings] = await Promise.all([
    prisma.space.findUnique({
      where: { id: input.spaceId, isActive: true },
      select: SPACE_SELECT,
    }),
    ensureNoOverlap({
      spaceId: input.spaceId,
      startTime: startDateTime,
      endTime: endDateTime,
    }),
    getReservationSettings(),
  ]);

  if (!space) {
    throw new DomainError("指定されたスペースが見つかりません", "NOT_FOUND");
  }

  // rate plan は read-only なので advisory lock の取得前（tx の外）で取得する。
  const ratePlans = await getSpaceRatePlans(input.spaceId);

  // クーポンの最低利用額判定は rate plan 適用後の実 basePrice で行う必要があるため、
  // 先に resolveRateBreakdown だけ呼んで basePrice を確定する（詳細は
  // public-commands.ts の同型コメントを参照）。
  const rateBreakdownForCoupon = resolveRateBreakdown({
    ratePlans,
    spaceHourlyPrice: space.hourlyPrice,
    startDateTime,
    endDateTime,
    holidayJudge: isJapaneseHoliday,
  });

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

  // Admin override policy: 管理者が totalPrice を明示指定した場合のみ、計算値を
  // 上書きし taxAmount/totalPriceWithTax を上書き後の totalPrice から派生再計算する
  // (taxRate 自体は calculateReservationPricing が解決した値をそのまま使う — create
  // 時点なのでスナップショットとなる過去の taxRate は存在しない)。priceOverriddenBy は
  // 現在の totalPrice が手動値かどうかを表す (override 指定がなければ null)。
  const finalTotalPrice = input.totalPrice ?? pricing.totalPrice;
  const finalTaxAmount =
    input.totalPrice != null
      ? Math.round((input.totalPrice * pricing.taxRate) / 100)
      : pricing.taxAmount;
  const finalTotalPriceWithTax =
    input.totalPrice != null
      ? input.totalPrice + finalTaxAmount
      : pricing.totalPriceWithTax;
  const priceOverriddenBy = input.totalPrice != null ? input.adminUserId : null;

  const reservation = await prisma.$transaction(async (tx) => {
    await lockSpaceForTransaction(tx, input.spaceId);

    await ensureNoOverlap(
      {
        spaceId: input.spaceId,
        startTime: startDateTime,
        endTime: endDateTime,
      },
      tx,
    );

    let resolvedCustomerId = input.customerId;

    if (!resolvedCustomerId && input.customerData) {
      resolvedCustomerId = await resolveOrCreateCustomer(
        input.customerData,
        tx,
      );
    }

    if (!resolvedCustomerId) {
      throw new DomainError("顧客IDが解決できませんでした", "VALIDATION");
    }

    const createdReservation = await tx.reservation.create({
      data: {
        spaceId: input.spaceId,
        customerId: resolvedCustomerId,
        startTime: startDateTime,
        endTime: endDateTime,
        totalPrice: finalTotalPrice,
        basePrice: pricing.basePrice,
        rateBreakdownJson: asPrismaInputJsonValue(
          pricing.rateBreakdown,
          "料金内訳の生成に失敗しました",
        ),
        taxRateType: pricing.taxRateType,
        taxRate: pricing.taxRate,
        taxAmount: finalTaxAmount,
        totalPriceWithTax: finalTotalPriceWithTax,
        priceOverriddenBy,
        couponId: validatedCoupon?.id ?? null,
        couponDiscountAmount: pricing.couponDiscountAmount,
        durationDiscountAmount: pricing.durationDiscountAmount,
        spaceDiscountAmount: pricing.spaceDiscountAmount,
        notes:
          input.manualDiscountAmount && input.manualDiscountReason
            ? `${input.notes || ""}\n【手動割引】¥${input.manualDiscountAmount.toLocaleString()} - ${input.manualDiscountReason}`.trim()
            : input.notes || null,
        status: input.status,
        // Guest contact info (管理者入力の場合は customerData から記録)
        ...(input.customerData && {
          guestLastName: input.customerData.lastName,
          guestFirstName: input.customerData.firstName,
          guestEmail: input.customerData.email,
          guestPhone: input.customerData.phoneNumber || null,
          guestCompanyName: input.customerData.companyName || null,
          guestCustomerType: input.customerData.customerType ?? null,
        }),
      },
      include: { customer: { select: CUSTOMER_SELECT } },
    });

    if (validatedCoupon) {
      await tx.coupon.update({
        where: { id: validatedCoupon.id },
        data: { usageCount: { increment: 1 } },
      });
    }

    await incrementCustomerReservationStats(tx, resolvedCustomerId);

    return createdReservation;
  });

  return {
    id: reservation.id,
    customerId: reservation.customerId,
    payload: buildPayload({
      reservationId: reservation.id,
      customer: reservation.customer,
      space,
      startTime: startDateTime,
      endTime: endDateTime,
      totalPrice: finalTotalPrice,
      notes: input.notes,
      icsSequence: reservation.icsSequence,
    }),
  };
}

// ---------------------------------------------------------------------------
// Admin: Update
// ---------------------------------------------------------------------------

export async function updateAdminReservationCommand(
  id: string,
  input: {
    spaceId: string;
    date: string;
    startTime: string;
    endTime: string;
    customerId: string;
    totalPrice?: number | undefined;
    couponCode?: string | null | undefined;
    status: ReservationStatus;
    notes?: string | null | undefined;
    /** 手動 totalPrice override の実行者 (admin User.id)。監査目的で priceOverriddenBy に記録する。 */
    adminUserId: string;
  },
) {
  const startDateTime = parseDateTimeLocalAsJst(
    `${input.date}T${input.startTime}`,
  );
  const endDateTime = parseDateTimeLocalAsJst(`${input.date}T${input.endTime}`);

  const [currentReservation, space, settings] = await Promise.all([
    prisma.reservation.findUnique({
      where: { id, deletedAt: null },
      select: {
        id: true,
        status: true,
        spaceId: true,
        startTime: true,
        endTime: true,
        totalPrice: true,
        couponId: true,
        // 予約再割当時の旧 customer stat 再計算に必要 (Codex data-retention レビュー
        // 経由で発覚した stale stat bug の修正 — 詳細は tx 内 comment 参照)
        customerId: true,
        googleCalendarEventId: true,
        // 税額 recalc に必要な予約時点のスナップショット (Codex P2 #1038 対応)。
        // taxRate/taxRateType の変更経路は本 command のスコープ外 (別 UI で管理)。
        taxRate: true,
        customer: { select: CUSTOMER_SELECT },
      },
    }),
    prisma.space.findUnique({
      where: { id: input.spaceId, isActive: true },
      select: SPACE_SELECT,
    }),
    getReservationSettings(),
  ]);

  if (!currentReservation) {
    throw new DomainError("予約が見つかりません", "NOT_FOUND");
  }
  if (!space) {
    throw new DomainError("指定されたスペースが見つかりません", "NOT_FOUND");
  }

  // CANCELLED/COMPLETED/NO_SHOW への遷移は返金・キャンセルメール等の副作用チェーン
  // （applyCancellationSideEffects 等）を経由しないため、この編集フォームからは許可しない。
  // 終端ステータスへの変更は予約詳細画面の専用ステータス変更経路から行う。
  if (
    input.status !== currentReservation.status &&
    !CREATABLE_RESERVATION_STATUSES.includes(input.status)
  ) {
    throw new DomainError(
      "このステータスへの変更は予約詳細画面のステータス変更から行ってください",
      "VALIDATION",
    );
  }

  validateStatusTransition(currentReservation.status, input.status);

  await ensureNoOverlap({
    spaceId: input.spaceId,
    startTime: startDateTime,
    endTime: endDateTime,
    excludeReservationId: id,
  });

  // rate plan は read-only なので advisory lock の取得前（tx の外）で取得する。
  const ratePlans = await getSpaceRatePlans(input.spaceId);

  // クーポンの最低利用額判定は rate plan 適用後の実 basePrice で行う必要があるため、
  // 先に resolveRateBreakdown だけ呼んで basePrice を確定する（詳細は
  // public-commands.ts の同型コメントを参照）。
  const rateBreakdownForCoupon = resolveRateBreakdown({
    ratePlans,
    spaceHourlyPrice: space.hourlyPrice,
    startDateTime,
    endDateTime,
    holidayJudge: isJapaneseHoliday,
  });

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

  const newCouponId = validatedCoupon?.id ?? null;
  const oldCouponId = currentReservation.couponId;
  const couponChanged = oldCouponId !== newCouponId;

  // Admin override policy（create と同一契約 — 詳細は createAdminReservationCommand
  // のコメント参照）。totalPrice を明示指定した場合のみ計算値を上書きする。
  //
  // priceOverriddenBy は override 時 (input.totalPrice != null) のみ update payload に
  // 含める。totalPrice 省略時はフィールド自体を書かず既存 DB 値を保持する
  // (Codex P1 #1105: 以前は totalPrice 省略時に毎回 null を書き込んでいたため、
  // 価格に触れない通常の日時/スペース編集保存のたびに既存の手動上書きフラグが
  // silently 消えてしまっていた)。実際の書込みは下記 tx 内の data で条件分岐する。
  const finalTotalPrice = input.totalPrice ?? pricing.totalPrice;

  // 税額を予約時点の taxRate スナップショットで再計算する (Codex P2 #1038 対応)。
  //
  // 修正前は admin 編集で totalPrice/base/discount を書き換えても taxAmount と
  // totalPriceWithTax が古い値のままで、予約詳細画面の税明細ブロックが新 subtotal と
  // 古い税額を並べて表示する不整合が発生していた。
  //
  // taxRate は "予約時点で確定した税率のスナップショット" (Reservation.taxRate) を
  // そのまま使う（totalPrice override 時も同一） — 編集時に税率を切り替える経路は
  // 別 UI に切り出し、本 command は金額変更に伴う税額の追従だけ担う。
  // customer-commands.ts の updateCustomerReservation と同一の丸め
  // (Math.round(totalPrice * taxRate / 100)、tax.ts の calculateTaxAmount と揃える —
  // 旧実装は `Math.floor(calculatedPrice * taxRate)` で `/ 100` が抜けており、
  // taxRate が % 単位 (例: 10) の場合に税額が 100 倍になるバグだった) を採用し、
  // 両経路の税表示を揃える。taxRate が null (税なし予約) の場合は
  // taxAmount=0 / totalPriceWithTax=finalTotalPrice。
  const snapshotTaxRate = currentReservation.taxRate
    ? Number(currentReservation.taxRate)
    : 0;
  const taxAmount = Math.round((finalTotalPrice * snapshotTaxRate) / 100);
  const totalPriceWithTax = finalTotalPrice + taxAmount;

  // 顧客に影響する変更があった場合のみ、呼び出し側が変更通知メールを送る判断材料にする。
  const customerVisibleChanged =
    currentReservation.spaceId !== input.spaceId ||
    currentReservation.startTime.getTime() !== startDateTime.getTime() ||
    currentReservation.endTime.getTime() !== endDateTime.getTime() ||
    currentReservation.totalPrice !== finalTotalPrice;

  let updatedIcsSequence = 0;

  await prisma.$transaction(async (tx) => {
    await lockSpaceForTransaction(tx, input.spaceId);

    await ensureNoOverlap(
      {
        spaceId: input.spaceId,
        startTime: startDateTime,
        endTime: endDateTime,
        excludeReservationId: id,
      },
      tx,
    );

    const updatedReservation = await tx.reservation.update({
      where: { id, deletedAt: null },
      data: {
        spaceId: input.spaceId,
        customerId: input.customerId,
        startTime: startDateTime,
        endTime: endDateTime,
        status: input.status,
        totalPrice: finalTotalPrice,
        basePrice: pricing.basePrice,
        rateBreakdownJson: asPrismaInputJsonValue(
          pricing.rateBreakdown,
          "料金内訳の生成に失敗しました",
        ),
        ...(input.totalPrice != null && {
          priceOverriddenBy: input.adminUserId,
        }),
        couponId: newCouponId,
        couponDiscountAmount: pricing.couponDiscountAmount,
        durationDiscountAmount: pricing.durationDiscountAmount,
        spaceDiscountAmount: pricing.spaceDiscountAmount,
        taxAmount,
        totalPriceWithTax,
        notes: input.notes || null,
        icsSequence: { increment: 1 },
      },
      select: { icsSequence: true },
    });
    updatedIcsSequence = updatedReservation.icsSequence;

    if (couponChanged) {
      if (oldCouponId) {
        await tx.coupon.updateMany({
          where: { id: oldCouponId, usageCount: { gt: 0 } },
          data: { usageCount: { decrement: 1 } },
        });
      }
      if (newCouponId) {
        await tx.coupon.update({
          where: { id: newCouponId },
          data: { usageCount: { increment: 1 } },
        });
      }
    }

    // 予約再割当時: 旧 customer と新 customer の両方の予約統計を
    // Reservation 実履歴から再計算する。
    //
    // 修正前は customerId だけ書き換わり `Customer.totalReservations` /
    // `totalSpent` / `firstReservationAt` / `lastReservationAt` が旧値のままで、
    // 管理 UI の顧客カード、customer-risk-scan cron、data-retention cron の
    // dormancy 判定 (最新実装は Reservation 実履歴で行うため直接影響しないが、
    // 他消費面は cached stat を参照する) に stale 値が silently 伝播していた。
    // Codex #3564883654 / #3564905126 の data-retention レビュー中に副次発覚。
    //
    // totalPrice のみ変更 (同一 customer) のケースは既存パターンに合わせて
    // recompute しない — increment path 側でも totalSpent は維持していない
    // 既知の pre-existing hole であり、本 PR のスコープ外。
    if (currentReservation.customerId !== input.customerId) {
      await recomputeCustomerReservationStats(
        tx,
        currentReservation.customerId,
      );
      await recomputeCustomerReservationStats(tx, input.customerId);
    }
  });

  return {
    googleCalendarEventId: currentReservation.googleCalendarEventId,
    customerId: input.customerId,
    customerVisibleChanged,
    payload: buildPayload({
      reservationId: id,
      customer: currentReservation.customer,
      space,
      startTime: startDateTime,
      endTime: endDateTime,
      totalPrice: finalTotalPrice,
      notes: input.notes,
      icsSequence: updatedIcsSequence,
    }),
  };
}
