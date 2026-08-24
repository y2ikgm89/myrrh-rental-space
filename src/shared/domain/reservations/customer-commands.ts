import "server-only";
import { parseDateTimeLocalAsJst } from "@/shared/lib/date-format";

import { PaymentStatus } from "@/shared/lib/validations/enums/prisma-types";
import { prisma } from "@/shared/db/prisma";
import { RESERVATION_WRITE_TX_OPTIONS } from "@/shared/db/transaction-options";
import { DomainError } from "@/shared/domain/domain-error";
import { applyCancellation } from "./cancel-core";
import { cancelReservationSeriesCommand } from "./series-commands";
import type { CancelRequestContext } from "./cancellation-side-effects";
import { CANCELLED_BY } from "@/shared/lib/validations/enums/helpers";
import { reservationDeadlineNow } from "./server-deadline-instant";
import {
  lockSpaceForTransaction,
  lockSpacesForTransactionInOrder,
} from "./space-locks";
import {
  checkReservationDuration,
  isWithinBusinessHours,
} from "@/shared/lib/reservation/time-slots-utils";
import {
  ensureDateNotBlocked,
  getBusinessHoursSettingsQuery,
  getReservationRuleSettings,
} from "@/shared/domain/reservations/availability";
import { getSpaceRatePlans } from "@/shared/domain/spaces/rate-plan-queries";
import { calculateReservationPricing } from "@/shared/lib/pricing/calculate-reservation-pricing";
import { isJapaneseHoliday } from "@/shared/lib/date/holiday";
import { asPrismaInputJsonValue } from "@/shared/db/json";
import {
  buildPricingSettings,
  ensureNoOverlap,
  guestCountCapacityError,
} from "./payloads";
import {
  CUSTOMER_EDITABLE_PAYMENT_STATUSES,
  isReservationEditableForCustomerSelfServe,
  type EditEligibilityReason,
} from "./edit-eligibility";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CommandResult<T> =
  { success: true; payload: T } | { success: false; error: string };

type CancelPayload = { reservationId: string };
type UpdatePayload = {
  reservationId: string;
  googleCalendarEventId: string | null;
};

type ReservationUpdateInput = {
  spaceId: string;
  date: string;
  startTime: string;
  endTime: string;
  /** 利用人数。Reservation 列は未永続化だが create と同型 gate の入力として必須。 */
  numberOfGuests: number;
  version: number;
};

function editEligibilityErrorMessage(reason: EditEligibilityReason): string {
  switch (reason) {
    case "status":
      return "この予約は変更できません";
    case "payment":
      return "決済処理が開始された予約は変更できません。キャンセル後に新規予約をお願いいたします。";
    case "discount":
      return "割引が適用された予約は変更できません。お問い合わせください。";
    case "deadline":
      return "変更期限を過ぎています";
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}

function validateReservationEditableForUpdate(
  reservation: {
    status: import("@/shared/lib/validations/enums/prisma-types").ReservationStatus;
    paymentStatus: PaymentStatus;
    couponDiscountAmount: unknown;
    durationDiscountAmount: unknown;
    spaceDiscountAmount: unknown;
    startTime: Date;
  },
  modificationDeadlineHours: number,
): { ok: true } | { ok: false; error: string } {
  const eligibility = isReservationEditableForCustomerSelfServe({
    status: reservation.status,
    paymentStatus: reservation.paymentStatus,
    discountAmounts: {
      couponDiscountAmount: Number(reservation.couponDiscountAmount ?? 0),
      durationDiscountAmount: Number(reservation.durationDiscountAmount ?? 0),
      spaceDiscountAmount: Number(reservation.spaceDiscountAmount ?? 0),
    },
    startTime: reservation.startTime,
    modificationDeadlineHours,
    now: reservationDeadlineNow(),
  });
  if (!eligibility.ok) {
    const error = editEligibilityErrorMessage(eligibility.reason);
    if (eligibility.reason === "deadline") {
      return {
        ok: false,
        error: `変更期限（${String(modificationDeadlineHours)}時間前）を過ぎています`,
      };
    }
    return { ok: false, error };
  }
  return { ok: true };
}

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
      select: {
        id: true,
        spaceId: true,
        status: true,
        paymentStatus: true,
        startTime: true,
        couponId: true,
      },
    });

    if (!reservation) {
      return { success: false, error: "予約が見つかりません" };
    }

    await lockSpaceForTransaction(tx, reservation.spaceId);

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
  }, RESERVATION_WRITE_TX_OPTIONS);
}

/**
 * 顧客セルフの定期予約 (ReservationSeries) 一括キャンセル (Phase B.2.1 Task 4)。
 *
 * ownership check (findFirst で customerId 一致 + deletedAt=null) を最初に行い、
 * 満たさなければ non-existent 相当のエラーを返す (existence probe を封鎖)。
 * 通過したら `cancelReservationSeriesCommand` を `scope: "series-all"` + `channel:
 * "customer-mypage"` で invoke する。副作用チェーン (集約メール / GCal master 削除 /
 * 集約 AuditLog) は admin 経路と同一。
 *
 * Settings gate (`customerCanCancelSeriesInFull=true`) は呼出側 (action) の責務。
 * 本関数は「顧客本人が対象 series を series-all キャンセルする」というインテントを
 * atomic に実行する。
 */
export async function cancelCustomerReservationSeries(
  seriesId: string,
  customerId: string,
  cancellationReason: string | null,
  request: CancelRequestContext,
): Promise<CommandResult<{ cancelledCount: number }>> {
  const series = await prisma.reservationSeries.findFirst({
    where: { id: seriesId, customerId, deletedAt: null },
    select: { id: true },
  });
  if (!series) {
    return { success: false, error: "定期予約が見つかりません" };
  }
  try {
    const result = await cancelReservationSeriesCommand({
      seriesId,
      scope: "series-all",
      cancelledByType: CANCELLED_BY.CUSTOMER_MYPAGE,
      channel: "customer-mypage",
      ...(cancellationReason ? { cancellationReason } : {}),
      request,
      now: new Date(),
    });
    return {
      success: true,
      payload: { cancelledCount: result.cancelledCount },
    };
  } catch (error) {
    if (error instanceof DomainError) {
      return { success: false, error: error.message };
    }
    throw error;
  }
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
      select: {
        id: true,
        spaceId: true,
        status: true,
        paymentStatus: true,
        startTime: true,
        couponId: true,
      },
    });

    if (!reservation) {
      return { success: false, error: "予約が見つかりません" };
    }

    await lockSpaceForTransaction(tx, reservation.spaceId);

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
  }, RESERVATION_WRITE_TX_OPTIONS);
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateCustomerReservation(
  reservationId: string,
  customerId: string,
  input: ReservationUpdateInput,
  modificationDeadlineHours: number,
): Promise<CommandResult<UpdatePayload>> {
  return updateReservationCommand({
    reservationId,
    input,
    modificationDeadlineHours,
    ownership: { kind: "customer", customerId },
  });
}

/**
 * トークン経由の予約変更（ゲスト用）
 *
 * status token 検証済みの前提で reservationId のみで予約を特定する。
 * ゲート本体は {@link updateCustomerReservation} と同一。
 */
export async function updateGuestReservationByToken(
  reservationId: string,
  input: ReservationUpdateInput,
  modificationDeadlineHours: number,
): Promise<CommandResult<UpdatePayload>> {
  return updateReservationCommand({
    reservationId,
    input,
    modificationDeadlineHours,
    ownership: { kind: "token" },
  });
}

async function updateReservationCommand(input: {
  reservationId: string;
  input: ReservationUpdateInput;
  modificationDeadlineHours: number;
  ownership: { kind: "customer"; customerId: string } | { kind: "token" };
}): Promise<CommandResult<UpdatePayload>> {
  const { reservationId, modificationDeadlineHours, ownership } = input;
  const updateInput = input.input;
  const startDateTime = parseDateTimeLocalAsJst(
    `${updateInput.date}T${updateInput.startTime}`,
  );
  const endDateTime = parseDateTimeLocalAsJst(
    `${updateInput.date}T${updateInput.endTime}`,
  );

  // 過去時刻への変更を封殺する (MYPAGE-EDIT-01)。
  // 既存の modificationDeadline チェック (tx 内) は「予約開始 N 時間前を過ぎたら
  // 変更禁止」のみを判定するため、deadline が現在時刻より過去に設定されている場合や
  // 顧客が変更フォームで「昨日 10:00」等の過去 datetime を submit した場合を
  // 素通りさせる欠陥があった。advisory lock (`lockSpaceForTransaction`) 取得前に
  // 早期 return し、過去日時での書込 (recap / status transition 等の cron 破壊要因)
  // を物理的に発生させない 2 段構えのガードとして独立に置く。
  if (startDateTime.getTime() <= Date.now()) {
    return { success: false, error: "過去の日時には変更できません" };
  }

  // 営業時間（公開スロット生成 / createPublicReservationCommand と同じ SSoT）
  const businessHours = await getBusinessHoursSettingsQuery();
  if (
    !isWithinBusinessHours(
      businessHours,
      updateInput.date,
      updateInput.startTime,
      updateInput.endTime,
    )
  ) {
    return { success: false, error: "選択した時間帯は営業時間外です" };
  }

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
    where: { id: updateInput.spaceId, isActive: true, isPublished: true },
    select: { locationId: true, capacity: true },
  });
  if (!spaceForBlockedCheck) {
    return { success: false, error: "指定されたスペースが見つかりません" };
  }
  const preCheckCapacityError = guestCountCapacityError(
    updateInput.numberOfGuests,
    spaceForBlockedCheck.capacity,
  );
  if (preCheckCapacityError) {
    return { success: false, error: preCheckCapacityError };
  }
  await ensureDateNotBlocked(
    updateInput.spaceId,
    spaceForBlockedCheck.locationId,
    updateInput.date,
  );

  // Reservation ↔ Event cross-table overlap の tx 外 pre-check (Codex P1 #1019, comment 3566931085)。
  // 本判定は tx 内 (lockSpaceForTransaction 後) の再チェックが担うが、ここで先に
  // 早期 return し、無駄な advisory lock 取得を避ける (public-commands.ts /
  // admin-commands.ts と同一パターン)。
  try {
    await ensureNoOverlap({
      spaceId: updateInput.spaceId,
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

  // rate plan は read-only なので advisory lock の取得前（tx の外）で取得する
  // (public-commands.ts / admin-commands.ts と同一パターン)。
  const ratePlans = await getSpaceRatePlans(updateInput.spaceId);

  return prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findFirst({
      where: {
        id: reservationId,
        deletedAt: null,
        ...(ownership.kind === "customer"
          ? { customerId: ownership.customerId }
          : {}),
      },
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        spaceId: true,
        startTime: true,
        taxRateType: true,
        taxRate: true,
        couponId: true,
        couponDiscountAmount: true,
        durationDiscountAmount: true,
        spaceDiscountAmount: true,
        googleCalendarEventId: true,
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

    const eligibility = validateReservationEditableForUpdate(
      reservation,
      modificationDeadlineHours,
    );
    if (!eligibility.ok) {
      return { success: false, error: eligibility.error };
    }

    // スペースの存在確認（割引設定も取得）
    const space = await tx.space.findUnique({
      where: { id: updateInput.spaceId, isActive: true, isPublished: true },
      select: {
        id: true,
        locationId: true,
        capacity: true,
        hourlyPrice: true,
        discountType: true,
        discountValue: true,
        durationDiscountOverride: true,
        taxRateType: true,
      },
    });

    if (!space) {
      throw new DomainError("指定されたスペースが見つかりません", "NOT_FOUND");
    }

    const txCapacityError = guestCountCapacityError(
      updateInput.numberOfGuests,
      space.capacity,
    );
    if (txCapacityError) {
      return { success: false, error: txCapacityError };
    }

    // spaceId 変更時は旧 Space の占有解放も規約8の対象。新 Space だけ lock すると
    // 旧 Space への並行 write が本 tx の解放と競合しうる（id 昇順で deadlock 回避）。
    await lockSpacesForTransactionInOrder(tx, [
      reservation.spaceId,
      updateInput.spaceId,
    ]);

    // BlockedDate の tx 内二重ガード (tx 外 pre-check と race する GLOBAL 休業日追加を封鎖)
    await ensureDateNotBlocked(
      updateInput.spaceId,
      space.locationId,
      updateInput.date,
      tx,
    );

    // Reservation ↔ Event cross-table overlap SSoT (Codex P1 #1019, comment 3566931085)。
    // ensureNoOverlap は EventTimeSlot 側の生きたスロットも union で検査し、
    // event 由来の conflict は「選択された時間帯は既にイベントで予約されています。」
    // 文言 (payloads.ts) に切り替わるため、ここは error.message を素通しする。
    try {
      await ensureNoOverlap(
        {
          spaceId: updateInput.spaceId,
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

    // 割引・税設定を取得
    const settings = await tx.settingsCommerce.findFirst({
      select: {
        durationDiscountEnabled: true,
        durationDiscountRules: true,
        discountCombinationMode: true,
        taxStandardRate: true,
        taxReducedRate: true,
        taxDisplayModePublic: true,
        showOriginalPrice: true,
      },
    });

    // 料金の再計算（クーポン・長時間割引・rate plan 含む）。
    // `Coupon.validUntil` は schema で optional（`DateTime?`）= 永続クーポンあり。
    // 有効期間の判定意味論は `payloads.ts:validateCoupon` と揃える
    // （「未設定なら期限なし」= truthy chain で short-circuit させない）。
    const coupon = reservation.coupon;
    const couponForCalc =
      coupon &&
      new Date(coupon.validFrom) <= startDateTime &&
      (!coupon.validUntil || new Date(coupon.validUntil) >= endDateTime)
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
      coupon: couponForCalc,
      holidayJudge: isJapaneseHoliday,
    });

    // 税額は予約作成時点の taxRate スナップショット (reservation.taxRate) を維持し、
    // 変更後の totalPrice に対して再計算する。taxRateType/taxRate 自体は customer
    // セルフ変更経路では切り替えない（admin-commands.ts の
    // updateAdminReservationCommand と同一方針）。
    // 旧実装は `Math.floor(priceResult.totalPrice * taxRate)` で `/ 100` が抜けており、
    // taxRate が % 単位 (例: 10) の場合に税額が 100 倍になるバグだった
    // (tax.ts の calculateTaxAmount と揃える)。
    const taxRate = reservation.taxRate ? Number(reservation.taxRate) : 0;
    const taxAmount = Math.round((pricing.totalPrice * taxRate) / 100);

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
        // eligibility と同じ集合を使う（監査 F-62）。写経すると、開けるのに
        // 保存だけ失敗する状態に戻る。
        paymentStatus: { in: [...CUSTOMER_EDITABLE_PAYMENT_STATUSES] },
        version: updateInput.version,
      },
      data: {
        spaceId: updateInput.spaceId,
        startTime: startDateTime,
        endTime: endDateTime,
        // 変更後の人数を記録する。ここを書かないと、次回の編集で再び
        // 「記録が無い」状態から始まり定員 gate が空回りする。
        numberOfGuests: updateInput.numberOfGuests,
        basePrice: pricing.basePrice,
        totalPrice: pricing.totalPrice,
        rateBreakdownJson: asPrismaInputJsonValue(
          pricing.rateBreakdown,
          "料金内訳の生成に失敗しました",
        ),
        spaceDiscountAmount: pricing.spaceDiscountAmount,
        durationDiscountAmount: pricing.durationDiscountAmount,
        couponDiscountAmount: pricing.couponDiscountAmount,
        taxAmount,
        totalPriceWithTax: pricing.totalPrice + taxAmount,
        // customer セルフ変更経路は totalPrice の手動 override 機能を持たないため、
        // 過去に admin が override した予約が編集された場合も含め、常に「手動上書き
        // なし」に戻す（admin override の履歴が新しい自動計算額に紐付いたまま残る
        // stale 表示を防ぐ）。
        //
        // 金額そのものである `manual_adjustment_amount` を落とすと表示が stale に
        // なるどころか書込自体が通らない。CHECK
        // `reservations_total_price_breakdown_check` が
        // `total_price = GREATEST(0, base - 各割引) + COALESCE(manual_adjustment_amount, 0)`
        // を要求するので、自動計算値を `total_price` に書きながら旧調整額を残すと
        // 23514 で tx が abort する。2 つを揃えて消すのが「手動上書きなし」の実体。
        manualAdjustmentAmount: null,
        priceOverriddenById: null,
        // best 併用でクーポンが落ちた場合は appliedCoupon=null。参照と割引額は
        // pricing SSoT に揃える。
        //
        // **ここで `releaseCouponUsage` を呼ばないのは正しい。** 他の経路
        // （admin 変更 / キャンセル / 期限切れ / GCal inbound）は全て呼ぶので
        // 「この経路だけ抜けている」と読めるが、**割引が付いた予約はここへ
        // 到達しない**。`isReservationEditableForCustomerSelfServe` が
        // `couponDiscountAmount > 0` を `reason: "discount"` で弾き、
        // 呼出は上の `validateReservationEditableForUpdate` で済んでいる。
        // つまり到達時点で外せるクーポン割引が存在しない。
        //
        // 固定しているのは
        // `__tests__/integration/reservations/customer-commands.test.ts` の
        // 「割引適用済み予約の顧客セルフ変更は拒否されクーポンは維持される」。
        //
        // 監査でここを「usage が永久に失われる」と 2 度指摘されている。
        // 到達可能性まで見ないと同じ結論に戻るので、根拠をここに置く。
        couponId: pricing.appliedCoupon?.id ?? null,
        icsSequence: { increment: 1 },
        version: { increment: 1 },
        // 日時が変わったリマインダは無効。startTime が同じ保存では触らない
        // （送信失敗リトライ用の null 戻しと混線させない）。
        ...(reservation.startTime.getTime() !== startDateTime.getTime()
          ? { reminderSentAt: null }
          : {}),
      },
    });

    if (updated.count === 0) {
      // paymentStatus gate は tx 開始時点でしか検知しないため、findFirst→updateMany 間の
      // TOCTOU race (createCheckoutSessionCommand との別 tx 衝突) は version mismatch と
      // 同一 count=0 分岐に落ちる。稀ケースとして UX は後者優先文言に統一し、error code
      // 分岐は将来課題 (spec §3.2)。
      return {
        success: false,
        error:
          "予約情報が別のデバイスまたはタブで変更されました。ページを再読み込みしてから、もう一度お試しください。",
      };
    }

    return {
      success: true,
      payload: {
        reservationId,
        googleCalendarEventId: reservation.googleCalendarEventId,
      },
    };
  }, RESERVATION_WRITE_TX_OPTIONS);
}
