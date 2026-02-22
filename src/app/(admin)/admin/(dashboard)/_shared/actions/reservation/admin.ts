"use server";

import { prisma } from "@/shared/lib/prisma";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  ReservationOverlapError,
  isReservationOverlapError,
} from "@/shared/lib/errors/server";
import { fireAndForget } from "@/shared/lib/async-utils";
import { updateTag } from "next/cache";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import {
  sendReservationConfirmationEmail,
  sendReservationAdminNotification,
} from "@/shared/lib/email-service";
import {
  createSuccess,
  createFailure,
  type ActionResult,
} from "@/admin/types/server-actions";
import { withPermission } from "@/admin/lib/server-action-helpers";
import {
  syncReservationToCalendar,
  updateCalendarSync,
  type ReservationSyncData,
} from "@/shared/lib/calendar-sync";
import { checkReservationOverlap } from "@/shared/lib/reservation";
import {
  adminReservationSchema,
  type AdminReservationInput,
  updateReservationSchema,
  type UpdateReservationInput,
} from "@/admin/lib/validations/admin-reservation";
import { extractFieldErrors } from "@/shared/lib/action-helpers";
import {
  calculateReservationPrice,
  parseDurationDiscountRules,
} from "@/shared/lib/pricing";
import { getValidDiscountCombinationMode } from "@/shared/lib/validations/enums";
import {
  incrementCouponUsage,
  validateCouponCode,
  decrementCouponUsage,
} from "@/shared/actions/coupon";

// =============================================================================
// Admin Reservation Creation
// =============================================================================

/**
 * 管理者用予約作成
 *
 * 電話予約など、管理者が手動で予約を入力する場合に使用。
 * 公開サイトとの違い:
 * - Turnstile不要
 * - 規約同意不要
 * - ステータス選択可能
 * - 料金手動調整可能
 * - 顧客は既存選択 or 新規作成
 */
export const createAdminReservation = withPermission<[AdminReservationInput]>(
  "reservation",
  "create",
)(async (_user, input): Promise<ActionResult<{ id: string }>> => {
  // バリデーション
  const validation = adminReservationSchema.safeParse(input);
  if (!validation.success) {
    return createFailure(
      "入力内容に誤りがあります",
      extractFieldErrors(validation.error),
    );
  }

  const {
    spaceId,
    date,
    startTime,
    endTime,
    customerId,
    customerData,
    totalPrice,
    couponCode,
    manualDiscountAmount,
    manualDiscountReason,
    status,
    notes,
    sendEmail,
  } = validation.data;

  // 日時を Date オブジェクトに変換
  const startDateTime = new Date(`${date}T${startTime}:00`);
  const endDateTime = new Date(`${date}T${endTime}:00`);

  // スペース確認・重複チェック・割引設定を並列取得
  const [space, overlapCheck, settings] = await Promise.all([
    prisma.space.findUnique({
      where: { id: spaceId, isActive: true },
      select: { id: true, name: true, address: true, hourlyPrice: true },
    }),
    checkReservationOverlap({
      spaceId,
      startTime: startDateTime,
      endTime: endDateTime,
    }),
    prisma.settings.findUnique({
      where: { id: "singleton" },
      select: {
        durationDiscountEnabled: true,
        durationDiscountRules: true,
        discountCombinationMode: true,
      },
    }),
  ]);

  if (!space) {
    return createFailure("指定されたスペースが見つかりません");
  }

  if (overlapCheck.hasOverlap) {
    return createFailure(
      "選択された時間帯は既に予約されています。別の時間帯をお選びください。",
    );
  }

  // 時間計算
  const hours =
    (endDateTime.getTime() - startDateTime.getTime()) / (1000 * 60 * 60);
  const hourlyPrice = space.hourlyPrice;
  const basePrice = Math.floor(hourlyPrice * hours);

  // クーポン検証
  let validatedCoupon: {
    id: string;
    code: string;
    name: string;
    type: "PERCENTAGE" | "FIXED_AMOUNT";
    discountValue: number;
    maxDiscountAmount: number | null;
    canCombineWithDurationDiscount: boolean;
  } | null = null;

  if (couponCode && couponCode.trim()) {
    const couponResult = await validateCouponCode(couponCode, basePrice);
    if (!couponResult.success) {
      return createFailure(couponResult.error);
    }
    validatedCoupon = couponResult.data?.coupon ?? null;
  }

  // 料金計算
  const priceCalculation = calculateReservationPrice({
    hourlyPrice,
    hours,
    durationRules: parseDurationDiscountRules(settings?.durationDiscountRules),
    durationDiscountEnabled: settings?.durationDiscountEnabled ?? false,
    coupon: validatedCoupon,
    combinationMode: getValidDiscountCombinationMode(
      settings?.discountCombinationMode,
    ),
    showWarning: false,
  });

  // 最終料金（手動設定があればそれを優先、なければ自動計算）
  const calculatedPrice = totalPrice ?? priceCalculation.totalPrice;

  // 割引情報
  const couponId = priceCalculation.appliedCoupon?.id ?? null;
  const couponDiscountAmount =
    priceCalculation.couponDiscount > 0
      ? priceCalculation.couponDiscount
      : null;
  const durationDiscountAmount =
    priceCalculation.durationDiscount > 0
      ? priceCalculation.durationDiscount
      : null;

  // トランザクションで顧客と予約を作成
  // 型定義: 予約 + 顧客情報（includeで取得）
  type ReservationWithCustomer = Awaited<
    ReturnType<typeof prisma.reservation.create>
  > & {
    customer: {
      firstName: string;
      lastName: string;
      email: string;
    };
  };
  let result: ReservationWithCustomer;
  try {
    result = await prisma.$transaction(async (tx) => {
      // 重複チェック（トランザクション内で再検証 - Race Condition防止）
      const overlapCheckTx = await checkReservationOverlap(
        { spaceId, startTime: startDateTime, endTime: endDateTime },
        tx,
      );
      if (overlapCheckTx.hasOverlap) {
        throw new ReservationOverlapError();
      }

      let resolvedCustomerId = customerId;

      // 新規顧客の場合は作成
      if (!resolvedCustomerId && customerData) {
        // メールで既存顧客を検索
        let customer = await tx.customer.findUnique({
          where: { email: customerData.email },
        });

        if (!customer) {
          // 新規顧客作成
          customer = await tx.customer.create({
            data: {
              lastName: customerData.lastName,
              firstName: customerData.firstName,
              email: customerData.email,
              phoneNumber: customerData.phoneNumber || null,
            },
          });
        } else {
          // 既存顧客の情報を更新
          customer = await tx.customer.update({
            where: { email: customerData.email },
            data: {
              lastName: customerData.lastName,
              firstName: customerData.firstName,
              phoneNumber: customerData.phoneNumber || customer.phoneNumber,
            },
          });
        }
        resolvedCustomerId = customer.id;
      }

      if (!resolvedCustomerId) {
        throw new Error("顧客IDが解決できませんでした");
      }

      // 予約を作成（割引情報を含む）
      const reservation = await tx.reservation.create({
        data: {
          spaceId,
          customerId: resolvedCustomerId,
          startTime: startDateTime,
          endTime: endDateTime,
          totalPrice: calculatedPrice,
          basePrice: basePrice,
          couponId: couponId,
          couponDiscountAmount: couponDiscountAmount,
          durationDiscountAmount: durationDiscountAmount,
          notes:
            manualDiscountAmount && manualDiscountReason
              ? `${notes || ""}\n【手動割引】¥${manualDiscountAmount.toLocaleString()} - ${manualDiscountReason}`.trim()
              : notes || null,
          status,
        },
        include: {
          customer: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });

      // クーポン使用回数をインクリメント
      if (couponId) {
        await incrementCouponUsage(couponId);
      }

      // 顧客の予約統計を更新
      const customer = await tx.customer.findUnique({
        where: { id: resolvedCustomerId },
        select: { id: true, firstReservationAt: true },
      });

      await tx.customer.update({
        where: { id: resolvedCustomerId },
        data: {
          totalReservations: { increment: 1 },
          lastReservationAt: new Date(),
          firstReservationAt: customer?.firstReservationAt ?? new Date(),
        },
      });

      return reservation;
    });
  } catch (error) {
    // 重複エラー（Race Condition検出時）
    if (isReservationOverlapError(error)) {
      return createFailure(
        "選択された時間帯は既に予約されています。別の時間帯をお選びください。",
      );
    }
    throw error; // その他のエラーは再スロー
  }

  // メール送信（オプション）
  if (sendEmail) {
    const emailData = {
      reservationId: result.id,
      customerEmail: result.customer.email,
      customerName: `${result.customer.lastName} ${result.customer.firstName}`,
      spaceName: space.name,
      startTime: startDateTime,
      endTime: endDateTime,
      totalPrice: calculatedPrice,
      notes: notes || undefined,
      location: space.address ?? undefined,
    };

    // カレンダー同期用データ
    const calendarData: ReservationSyncData = {
      reservationId: result.id,
      spaceName: space.name,
      customerName: `${result.customer.lastName} ${result.customer.firstName}`,
      customerEmail: result.customer.email,
      startTime: startDateTime,
      endTime: endDateTime,
      location: space.address ?? undefined,
      notes: notes ?? undefined,
      totalPrice: calculatedPrice,
    };

    // メール送信 + カレンダー同期（バックグラウンド）
    fireAndForget(
      Promise.all([
        sendReservationConfirmationEmail(emailData),
        sendReservationAdminNotification(emailData, "new"),
        syncReservationToCalendar(calendarData),
      ]),
      {
        operation: "createAdminReservationPostTasks",
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: { reservationId: result.id },
      },
    );
  } else {
    // メール送信しない場合でもカレンダー同期は行う
    const calendarData: ReservationSyncData = {
      reservationId: result.id,
      spaceName: space.name,
      customerName: `${result.customer.lastName} ${result.customer.firstName}`,
      customerEmail: result.customer.email,
      startTime: startDateTime,
      endTime: endDateTime,
      location: space.address ?? undefined,
      notes: notes ?? undefined,
      totalPrice: calculatedPrice,
    };
    fireAndForget(syncReservationToCalendar(calendarData), {
      operation: "syncReservationToCalendar",
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.LOW,
      context: { reservationId: result.id, trigger: "createAdminReservation" },
    });
  }

  updateTag(CACHE_TAGS.RESERVATIONS);
  updateTag(getCacheTag.reservations.calendar());

  return createSuccess("予約を作成しました", { id: result.id });
});

// =============================================================================
// Admin Reservation Update
// =============================================================================

/**
 * 管理者用予約更新
 *
 * 全項目（スペース・日時・顧客・クーポン・料金・ステータス・メモ）を更新する。
 * 重複チェックは自分自身を除外して実施。
 * クーポン変更時は使用回数をアトミックに調整する。
 */
export const updateAdminReservation = withPermission<
  [id: string, input: UpdateReservationInput],
  void
>(
  "reservation",
  "update",
)(async (_user, id, input): Promise<ActionResult<void>> => {
  // バリデーション
  const validation = updateReservationSchema.safeParse(input);
  if (!validation.success) {
    return createFailure(
      "入力内容に誤りがあります",
      extractFieldErrors(validation.error),
    );
  }

  const {
    spaceId,
    date,
    startTime,
    endTime,
    customerId,
    totalPrice,
    couponCode,
    status,
    notes,
    sendNotificationEmail,
  } = validation.data;

  const startDateTime = new Date(`${date}T${startTime}:00`);
  const endDateTime = new Date(`${date}T${endTime}:00`);

  // 現在の予約・スペース・設定を並列取得
  const [currentReservation, space, settings] = await Promise.all([
    prisma.reservation.findUnique({
      where: { id },
      select: {
        id: true,
        couponId: true,
        googleCalendarEventId: true,
        customer: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    }),
    prisma.space.findUnique({
      where: { id: spaceId, isActive: true },
      select: { id: true, name: true, address: true, hourlyPrice: true },
    }),
    prisma.settings.findUnique({
      where: { id: "singleton" },
      select: {
        durationDiscountEnabled: true,
        durationDiscountRules: true,
        discountCombinationMode: true,
      },
    }),
  ]);

  if (!currentReservation) {
    return createFailure("予約が見つかりません");
  }
  if (!space) {
    return createFailure("指定されたスペースが見つかりません");
  }

  // 重複チェック（自分を除く）
  const overlapCheck = await checkReservationOverlap({
    spaceId,
    startTime: startDateTime,
    endTime: endDateTime,
    excludeReservationId: id,
  });
  if (overlapCheck.hasOverlap) {
    return createFailure(
      "選択された時間帯は既に予約されています。別の時間帯をお選びください。",
    );
  }

  // 料金計算
  const hours =
    (endDateTime.getTime() - startDateTime.getTime()) / (1000 * 60 * 60);
  const hourlyPrice = space.hourlyPrice;
  const basePrice = Math.floor(hourlyPrice * hours);

  // クーポン検証
  let validatedCoupon: Parameters<
    typeof calculateReservationPrice
  >[0]["coupon"] = null;
  let newCouponId: string | null = null;

  if (couponCode && couponCode.trim()) {
    const couponResult = await validateCouponCode(couponCode, basePrice);
    if (!couponResult.success) {
      return createFailure(couponResult.error);
    }
    validatedCoupon = couponResult.data?.coupon ?? null;
    newCouponId = validatedCoupon?.id ?? null;
  }

  const priceCalculation = calculateReservationPrice({
    hourlyPrice,
    hours,
    durationRules: parseDurationDiscountRules(settings?.durationDiscountRules),
    durationDiscountEnabled: settings?.durationDiscountEnabled ?? false,
    coupon: validatedCoupon,
    combinationMode: getValidDiscountCombinationMode(
      settings?.discountCombinationMode,
    ),
    showWarning: false,
  });

  const calculatedPrice = totalPrice ?? priceCalculation.totalPrice;
  const couponDiscountAmount =
    priceCalculation.couponDiscount > 0
      ? priceCalculation.couponDiscount
      : null;
  const durationDiscountAmount =
    priceCalculation.durationDiscount > 0
      ? priceCalculation.durationDiscount
      : null;

  const oldCouponId = currentReservation.couponId;
  const couponChanged = oldCouponId !== newCouponId;

  // トランザクション更新
  try {
    await prisma.$transaction(async (tx) => {
      // Race Condition防止: トランザクション内で再チェック
      const overlapCheckTx = await checkReservationOverlap(
        {
          spaceId,
          startTime: startDateTime,
          endTime: endDateTime,
          excludeReservationId: id,
        },
        tx,
      );
      if (overlapCheckTx.hasOverlap) {
        throw new ReservationOverlapError();
      }

      await tx.reservation.update({
        where: { id },
        data: {
          spaceId,
          customerId,
          startTime: startDateTime,
          endTime: endDateTime,
          status,
          totalPrice: calculatedPrice,
          basePrice,
          couponId: newCouponId,
          couponDiscountAmount,
          durationDiscountAmount,
          notes: notes || null,
        },
      });

      // クーポン使用回数をアトミックに調整
      if (couponChanged) {
        if (oldCouponId) {
          await decrementCouponUsage(oldCouponId);
        }
        if (newCouponId) {
          await incrementCouponUsage(newCouponId);
        }
      }
    });
  } catch (error) {
    if (isReservationOverlapError(error)) {
      return createFailure(
        "選択された時間帯は既に予約されています。別の時間帯をお選びください。",
      );
    }
    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: { operation: "updateAdminReservation", reservationId: id },
    });
    return createFailure("予約の更新に失敗しました");
  }

  updateTag(CACHE_TAGS.RESERVATIONS);

  // Googleカレンダー更新（バックグラウンド）
  const calendarData: ReservationSyncData = {
    reservationId: id,
    spaceName: space.name,
    customerName: `${currentReservation.customer.lastName} ${currentReservation.customer.firstName}`,
    customerEmail: currentReservation.customer.email,
    startTime: startDateTime,
    endTime: endDateTime,
    location: space.address ?? undefined,
    notes: notes ?? undefined,
    totalPrice: calculatedPrice,
  };

  if (currentReservation.googleCalendarEventId) {
    fireAndForget(
      updateCalendarSync(
        calendarData,
        currentReservation.googleCalendarEventId,
      ),
      {
        operation: "updateCalendarSync",
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.LOW,
        context: { reservationId: id },
      },
    );
  } else {
    fireAndForget(syncReservationToCalendar(calendarData), {
      operation: "syncReservationToCalendar",
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.LOW,
      context: { reservationId: id, trigger: "updateAdminReservation" },
    });
  }

  // 変更通知メール（オプション）
  if (sendNotificationEmail) {
    fireAndForget(
      sendReservationConfirmationEmail({
        reservationId: id,
        customerEmail: currentReservation.customer.email,
        customerName: `${currentReservation.customer.lastName} ${currentReservation.customer.firstName}`,
        spaceName: space.name,
        startTime: startDateTime,
        endTime: endDateTime,
        totalPrice: calculatedPrice,
        notes: notes ?? undefined,
        location: space.address ?? undefined,
      }),
      {
        operation: "sendNotificationEmail",
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.LOW,
        context: { reservationId: id },
      },
    );
  }

  return createSuccess("予約を更新しました");
});
