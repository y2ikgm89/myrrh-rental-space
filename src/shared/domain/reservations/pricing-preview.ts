import "server-only";

import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { getSpaceRatePlans } from "@/shared/domain/spaces/rate-plan-queries";
import { resolveRateBreakdown } from "@/shared/lib/pricing/rate-plan-resolver";
import {
  calculateReservationPricing,
  type ReservationPricingResult,
} from "@/shared/lib/pricing/calculate-reservation-pricing";
import { isJapaneseHoliday } from "@/shared/lib/date/holiday";
import {
  buildPricingSettings,
  getReservationSettings,
  validateCoupon,
} from "./payloads";

const PRICING_PREVIEW_SPACE_SELECT = {
  hourlyPrice: true,
  discountType: true,
  discountValue: true,
  durationDiscountOverride: true,
  taxRateType: true,
} as const;

export type ReservationPricingPreviewInput = {
  spaceId: string;
  startDateTime: Date;
  endDateTime: Date;
  /**
   * 未検証のクーポンコード。無効な場合は無視して coupon なしのプレビューを返す
   * （実際の適用可否は送信時に各予約コマンドがサーバー側で確定検証する）。
   */
  couponCode?: string | null | undefined;
};

export type ReservationPricingPreviewOptions = {
  /**
   * true: 公開予約フォーム相当（`isActive && isPublished` を要求、
   * createPublicReservationCommand と同条件）。
   * false: 管理画面相当（`isActive` のみ。非公開スペースへの電話予約入力を許容する
   * createAdminReservationCommand / updateAdminReservationCommand と同条件）。
   */
  requirePublished: boolean;
};

/**
 * 予約フォーム（管理画面の新規作成・編集 + 公開予約フォーム）の料金プレビュー用 SSoT。
 *
 * 3 つの予約コマンド（admin/public/customer-commands.ts）と同じ
 * `getSpaceRatePlans` → `calculateReservationPricing` の経路を read-only で
 * 再実行する（rate plan・スペース固有割引・長時間割引・税額まで一気通貫）。
 * client component は Prisma に触れられないため、Server Action はこの関数を
 * 呼び出すだけの薄いラッパーにする（Task 13）。
 *
 * 無効な日時・存在しないスペースは例外を投げず `null` を返す — プレビューは
 * 「まだ計算できない」を表現できればよく、入力バリデーションのエラー表示は
 * 各フォームの conform スキーマが別途担う。
 */
export async function previewReservationPricing(
  input: ReservationPricingPreviewInput,
  options: ReservationPricingPreviewOptions,
): Promise<ReservationPricingResult | null> {
  if (input.endDateTime.getTime() <= input.startDateTime.getTime()) {
    return null;
  }

  const [space, ratePlans, settings] = await Promise.all([
    prisma.space.findUnique({
      where: {
        id: input.spaceId,
        isActive: true,
        ...(options.requirePublished ? { isPublished: true } : {}),
      },
      select: PRICING_PREVIEW_SPACE_SELECT,
    }),
    getSpaceRatePlans(input.spaceId),
    getReservationSettings(),
  ]);

  if (!space) {
    return null;
  }

  // クーポンの最低利用額判定は rate plan 適用後の実 basePrice で行う必要があるため、
  // 先に resolveRateBreakdown だけ呼んで basePrice を確定する（各予約コマンドと同型）。
  const rateBreakdownForCoupon = resolveRateBreakdown({
    ratePlans,
    spaceHourlyPrice: space.hourlyPrice,
    startDateTime: input.startDateTime,
    endDateTime: input.endDateTime,
    holidayJudge: isJapaneseHoliday,
  });

  let validatedCoupon: Awaited<ReturnType<typeof validateCoupon>> = null;
  if (input.couponCode) {
    try {
      validatedCoupon = await validateCoupon(
        input.couponCode,
        rateBreakdownForCoupon.totalBasePrice,
      );
    } catch (error) {
      // プレビューは無効なクーポンコードで壊れてはならない（入力途中のタイプミス等）。
      // 適用可否の確定は送信時に各予約コマンドが再検証する。
      if (!(error instanceof DomainError)) throw error;
      validatedCoupon = null;
    }
  }

  return calculateReservationPricing({
    startDateTime: input.startDateTime,
    endDateTime: input.endDateTime,
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
}
