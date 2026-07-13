import "server-only";
import {
  calculateDurationHours,
  parseDateTimeLocalAsJst,
} from "@/shared/lib/date-format";

import { PaymentStatus } from "@generated/prisma/enums";
import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { isWithinDeadline } from "./deadline";
import { reservationDeadlineNow } from "./server-deadline-instant";
import { applyCancellation, CANCELLABLE_STATUSES } from "./cancel-core";
import { CANCELLED_BY } from "@/shared/lib/validations/enums/helpers";
import { checkReservationDuration } from "@/shared/lib/reservation/time-slots-utils";
import {
  ensureDateNotBlocked,
  getReservationRuleSettings,
} from "@/shared/domain/reservations/availability";
import { calculateReservationPrice } from "@/shared/lib/pricing/reservation";
import { parseDurationDiscountRules } from "@/shared/lib/pricing/discount";
import { getValidDiscountCombinationMode } from "@/shared/lib/validations/enums/helpers";
import { lockSpaceForTransaction } from "./space-locks";
import { ensureNoOverlap } from "./payloads";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CommandResult<T> =
  { success: true; payload: T } | { success: false; error: string };

type CancelPayload = { reservationId: string };
type UpdatePayload = { reservationId: string };

// ---------------------------------------------------------------------------
// Cancel
// ---------------------------------------------------------------------------

export async function cancelCustomerReservation(
  reservationId: string,
  customerId: string,
  deadlineHours: number,
  cancellationReason: string | null = null,
): Promise<CommandResult<CancelPayload>> {
  return prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findFirst({
      where: { id: reservationId, customerId, deletedAt: null },
      select: { id: true, status: true, startTime: true, couponId: true },
    });

    if (!reservation) {
      return { success: false, error: "予約が見つかりません" };
    }

    const result = await applyCancellation(tx, reservation, {
      deadlineHours,
      now: reservationDeadlineNow(),
      cancellationReason,
      cancelledByType: CANCELLED_BY.CUSTOMER_MYPAGE,
    });
    if (!result.success) {
      return { success: false, error: result.error };
    }

    return { success: true, payload: { reservationId } };
  });
}

/**
 * トークン経由の予約キャンセル（ゲスト用）
 *
 * 確認メールのキャンセルリンクから呼ばれる。本人性は検証済みトークンが担保するため、
 * customerId による所有権フィルタは行わず reservationId だけで予約を特定する。
 * 状態・期限の判定とクーポン戻しは会員経路と同じ {@link applyCancellation} を共有する。
 */
export async function cancelReservationByToken(
  reservationId: string,
  deadlineHours: number,
  cancellationReason: string | null = null,
): Promise<CommandResult<CancelPayload>> {
  return prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findFirst({
      where: { id: reservationId, deletedAt: null },
      select: { id: true, status: true, startTime: true, couponId: true },
    });

    if (!reservation) {
      return { success: false, error: "予約が見つかりません" };
    }

    const result = await applyCancellation(tx, reservation, {
      deadlineHours,
      now: reservationDeadlineNow(),
      cancellationReason,
      cancelledByType: CANCELLED_BY.CUSTOMER_TOKEN,
    });
    if (!result.success) {
      return { success: false, error: result.error };
    }

    return { success: true, payload: { reservationId } };
  });
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateCustomerReservation(
  reservationId: string,
  customerId: string,
  input: {
    spaceId: string;
    date: string;
    startTime: string;
    endTime: string;
  },
  modificationDeadlineHours: number,
): Promise<CommandResult<UpdatePayload>> {
  const startDateTime = parseDateTimeLocalAsJst(
    `${input.date}T${input.startTime}`,
  );
  const endDateTime = parseDateTimeLocalAsJst(`${input.date}T${input.endTime}`);

  // 最小/最大予約時間（設定値）をサーバー側で強制する（新規予約と同一ルール）
  const rules = await getReservationRuleSettings();
  const durationError = checkReservationDuration(
    (endDateTime.getTime() - startDateTime.getTime()) / 60000,
    rules,
  );
  if (durationError) {
    return { success: false, error: durationError };
  }

  // BlockedDate (臨時休業) の tx 外 pre-check。
  // 変更経路は create 経路 (createPublicReservationCommand) と同じく公開顧客セルフ操作のため、
  // admin override は許容せず休業日への移動を防ぐ (business-domain rule)。
  // spaceId 存在確認と locationId 取得を先行 (public-commands.ts 同型パターン)。
  const spaceForBlockedCheck = await prisma.space.findUnique({
    where: { id: input.spaceId, isActive: true, isPublished: true },
    select: { locationId: true },
  });
  if (!spaceForBlockedCheck) {
    return { success: false, error: "指定されたスペースが見つかりません" };
  }
  await ensureDateNotBlocked(
    input.spaceId,
    spaceForBlockedCheck.locationId,
    input.date,
  );

  // Reservation ↔ Event cross-table overlap の tx 外 pre-check (Codex P1 #1019, comment 3566931085)。
  // 本判定は tx 内 (lockSpaceForTransaction 後) の再チェックが担うが、ここで先に
  // 早期 return し、無駄な advisory lock 取得を避ける (public-commands.ts /
  // admin-commands.ts と同一パターン)。
  try {
    await ensureNoOverlap({
      spaceId: input.spaceId,
      startTime: startDateTime,
      endTime: endDateTime,
      excludeReservationId: reservationId,
    });
  } catch (error) {
    if (error instanceof DomainError && error.code === "CONFLICT") {
      return { success: false, error: error.message };
    }
    throw error;
  }

  return prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findFirst({
      where: { id: reservationId, customerId, deletedAt: null },
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        startTime: true,
        taxRateType: true,
        taxRate: true,
        couponId: true,
        coupon: {
          select: {
            id: true,
            code: true,
            name: true,
            type: true,
            discountValue: true,
            maxDiscountAmount: true,
            canCombineWithDurationDiscount: true,
            validFrom: true,
            validUntil: true,
            usageLimit: true,
            usageCount: true,
          },
        },
      },
    });

    if (!reservation) {
      return { success: false, error: "予約が見つかりません" };
    }

    if (!CANCELLABLE_STATUSES.includes(reservation.status)) {
      return { success: false, error: "この予約は変更できません" };
    }

    // PAID edit gate: 決済確定/決済中の予約はセルフ変更を禁止 (業界標準の Peerspace/Airbnb
    // パターン)。差額精算/返金の運用複雑さと silent regression を避けるため、
    // 顧客には「キャンセル + 再予約」に誘導する。admin は SUPER_ADMIN 限定で override 可能
    // (別 command)。REFUNDED は変更不能 (元の決済 IntentId が消失している)。
    if (reservation.paymentStatus !== PaymentStatus.UNPAID) {
      return {
        success: false,
        error:
          "決済処理が開始された予約は変更できません。キャンセル後に新規予約をお願いいたします。",
      };
    }

    if (
      !isWithinDeadline(
        reservation.startTime,
        modificationDeadlineHours,
        reservationDeadlineNow(),
      )
    ) {
      return {
        success: false,
        error: `変更期限（${String(modificationDeadlineHours)}時間前）を過ぎています`,
      };
    }

    // スペースの存在確認（割引設定も取得）
    const space = await tx.space.findUnique({
      where: { id: input.spaceId, isActive: true, isPublished: true },
      select: {
        id: true,
        locationId: true,
        hourlyPrice: true,
        discountType: true,
        discountValue: true,
        durationDiscountOverride: true,
      },
    });

    if (!space) {
      throw new DomainError("指定されたスペースが見つかりません", "NOT_FOUND");
    }

    await lockSpaceForTransaction(tx, input.spaceId);

    // BlockedDate の tx 内二重ガード (tx 外 pre-check と race する GLOBAL 休業日追加を封鎖)
    await ensureDateNotBlocked(input.spaceId, space.locationId, input.date, tx);

    // Reservation ↔ Event cross-table overlap SSoT (Codex P1 #1019, comment 3566931085)。
    // ensureNoOverlap は EventTimeSlot 側の生きたスロットも union で検査し、
    // event 由来の conflict は「選択された時間帯は既にイベントで予約されています。」
    // 文言 (payloads.ts) に切り替わるため、ここは error.message を素通しする。
    try {
      await ensureNoOverlap(
        {
          spaceId: input.spaceId,
          startTime: startDateTime,
          endTime: endDateTime,
          excludeReservationId: reservationId,
        },
        tx,
      );
    } catch (error) {
      if (error instanceof DomainError && error.code === "CONFLICT") {
        return { success: false, error: error.message };
      }
      throw error;
    }

    // 割引設定を取得
    const settings = await tx.settings.findFirst({
      select: {
        durationDiscountEnabled: true,
        durationDiscountRules: true,
        discountCombinationMode: true,
      },
    });

    // 料金の再計算（クーポン・長時間割引含む）
    const hours = calculateDurationHours(startDateTime, endDateTime);

    const spaceDiscount:
      import("@/shared/lib/pricing/types").SpaceDiscountSettings | null =
      space.discountType !== "none" &&
      space.discountValue != null &&
      space.discountValue > 0
        ? {
            discountType: space.discountType,
            discountValue: space.discountValue,
            durationDiscountOverride: space.durationDiscountOverride,
          }
        : null;

    const coupon = reservation.coupon;
    const couponForCalc =
      coupon &&
      coupon.validFrom &&
      coupon.validUntil &&
      new Date(coupon.validFrom) <= startDateTime &&
      new Date(coupon.validUntil) >= endDateTime
        ? {
            id: coupon.id,
            code: coupon.code,
            name: coupon.name,
            type: coupon.type,
            discountValue: coupon.discountValue,
            maxDiscountAmount: coupon.maxDiscountAmount,
            canCombineWithDurationDiscount:
              coupon.canCombineWithDurationDiscount,
          }
        : null;

    const priceResult = calculateReservationPrice({
      hourlyPrice: space.hourlyPrice,
      hours,
      spaceDiscount,
      durationDiscountEnabled: settings?.durationDiscountEnabled ?? false,
      durationRules: parseDurationDiscountRules(
        settings?.durationDiscountRules,
      ),
      coupon: couponForCalc,
      combinationMode: getValidDiscountCombinationMode(
        settings?.discountCombinationMode ?? undefined,
      ),
    });

    const taxRate = reservation.taxRate ? Number(reservation.taxRate) : 0;
    const taxAmount = Math.floor(priceResult.totalPrice * taxRate);

    // PAID gate の atomic compare-and-swap (Codex P1 対応)。
    //
    // 上部の early return は tx 内 findFirst の観測時点でしか paymentStatus を検証
    // していないため、その read と最終 update の間で `createCheckoutSessionCommand`
    // (別 tx・別 request) が `UNPAID → PENDING` に遷移させる TOCTOU race を封じられない。
    // Space 単位の advisory lock (`lockSpaceForTransaction`) は他予約との overlap
    // 直列化用で、同一予約に対する `payment-commands.ts` の書込までは serialize しない。
    //
    // 対策: 最終 update を `paymentStatus: UNPAID` 述語付きの updateMany に置き換え、
    // count === 0 なら「決済が同時に開始された」と判断して tx 全体を rollback する
    // (business-domain rule 「updateMany の WHERE で claim」パターン)。
    const updated = await tx.reservation.updateMany({
      where: {
        id: reservationId,
        deletedAt: null,
        paymentStatus: PaymentStatus.UNPAID,
      },
      data: {
        spaceId: input.spaceId,
        startTime: startDateTime,
        endTime: endDateTime,
        basePrice: priceResult.basePrice,
        totalPrice: priceResult.totalPrice,
        spaceDiscountAmount: priceResult.spaceDiscount,
        durationDiscountAmount: priceResult.durationDiscount,
        couponDiscountAmount: priceResult.couponDiscount,
        taxAmount,
        totalPriceWithTax: priceResult.totalPrice + taxAmount,
        couponId: couponForCalc ? reservation.couponId : null,
        icsSequence: { increment: 1 },
      },
    });

    if (updated.count === 0) {
      // read から update の間に決済が開始された。tx rollback でロールバック。
      return {
        success: false,
        error:
          "決済処理が開始された予約は変更できません。キャンセル後に新規予約をお願いいたします。",
      };
    }

    return { success: true, payload: { reservationId } };
  });
}
