/**
 * 繰返し予約 (ReservationSeries) の作成・キャンセル (Phase B.2 task 13)
 *
 * `docs/superpowers/specs/2026-07-17-recurring-reservations-phase-b2-design.md` §4.1 の
 * flow をそのまま実装する。既存の単発 Reservation 経路（`admin-commands.ts` 等）とは
 * 独立したコマンドとして新設し、既存経路には一切手を入れない（add-only）。
 *
 * - `createReservationSeriesCommand`: RRULE を展開し、series 単位 advisory lock
 *   （728357）→ Space 単位 advisory lock（728351、既存契約）の順で取得した上で、
 *   各 instance の重複事前チェック → TermsAgreement 記録 → coupon usage 加算 →
 *   `ReservationSeries` 行 + N 件の `Reservation` instance を単一 tx で作成する。
 * - `cancelReservationSeriesCommand`: this-only / this-and-following / series-all の
 *   3 scope（Google Calendar 業界標準）で対象 instance を決定し、
 *   `applyBulkCancellation`（cancel-core.ts、Task 11）で atomic claim した上で、
 *   series-all のみ series 行を soft-delete + coupon usage を戻す。
 *
 * 両コマンドとも admin-only（Phase B.2 MVP scope、spec 非ゴール参照）。
 */

import "server-only";

import { randomUUID } from "node:crypto";
import type { Prisma } from "@generated/prisma/client";
import type { CustomerType } from "@/shared/lib/validations/enums/prisma-types";
import { ReservationStatus } from "@/shared/lib/validations/enums/prisma-types";
import { prisma } from "@/shared/db/prisma";
import { RESERVATION_WRITE_TX_OPTIONS } from "@/shared/db/transaction-options";
import { asPrismaInputJsonValue } from "@/shared/db/json";
import { DomainError } from "@/shared/domain/domain-error";
import { assertAllRequiredTermsAgreed } from "@/shared/domain/terms/queries";
import { recordTermsAgreements } from "@/shared/domain/terms/commands";
import { formatJstDateString } from "@/shared/lib/date-format";
import { getSpaceRatePlans } from "@/shared/domain/spaces/rate-plan-queries";
import { calculateReservationPricing } from "@/shared/lib/pricing/calculate-reservation-pricing";
import { resolveRateBreakdown } from "@/shared/lib/pricing/rate-plan-resolver";
import { isJapaneseHoliday } from "@/shared/lib/date/holiday";
import { TERMS_SCOPE } from "@/shared/lib/validations/enums/prisma-types";
import type { CancelledByType } from "@/shared/lib/validations/enums/helpers";
import {
  buildPricingSettings,
  claimCouponUsage,
  releaseCouponUsage,
  ensureNoOverlap,
  getReservationSettings,
  validateCoupon,
} from "./payloads";
import { ensureDateNotBlocked } from "./availability";
import { applyBulkCancellation, CANCELLABLE_STATUSES } from "./cancel-core";
import {
  applyBulkCancellationSideEffects,
  applyCancellationSideEffects,
  type CancelChannel,
  type CancelRequestContext,
} from "./cancellation-side-effects";
import { lockReservationSeriesForTransaction } from "./series-advisory-lock";
import { validateRruleForSeries } from "./series-rrule";
import {
  lockSpaceForTransaction,
  lockSpacesForTransactionInOrder,
} from "./space-locks";

// =============================================================================
// createReservationSeriesCommand
// =============================================================================

/**
 * series 作成時に各 instance へ複製されるテンプレート値。
 *
 * **価格はここに含めない。** duration は series 全体で固定（spec 非ゴール:
 * per-instance duration variation は Phase B.2.1 以降）だが、単価は固定ではない —
 * `SpaceRatePlan` は曜日・時間帯・祝日・有効期間で変わるため、同じ duration でも
 * instance ごとに金額が変わりうる。旧実装は呼出側が 1 回分の pricing を解決して
 * それを全 instance へリテラルコピーしており、2 回目以降が誤った金額になっていた
 * （`rateBreakdownJson` に至っては 1 回目の日付が全行に焼き込まれていた）。
 * 現在は `createReservationSeriesCommand` が instance ごとに
 * `calculateReservationPricing` を呼ぶ。
 */
export interface ReservationSeriesTemplateData {
  notes?: string | null;
  guestLastName?: string | null;
  guestFirstName?: string | null;
  guestEmail?: string | null;
  guestPhone?: string | null;
  guestCompanyName?: string | null;
  guestCustomerType?: CustomerType | null;
}

export interface CreateReservationSeriesInput {
  spaceId: string;
  customerId: string;
  /**
   * 未検証のクーポンコード。**割引は初回 instance にだけ適用する。**
   *
   * usage 消費は series 全体で 1 回（`claimCouponUsage` を 1 度だけ呼ぶ）で、
   * 最低利用額の判定も初回 instance の `basePrice` で行う。したがって割引も
   * 1 回分でなければ「1 usage で N 回割引」になる。旧実装は割引後価格を全
   * instance へコピーしていたため、実質 N 回効いていた。
   *
   * 無効なコードは `validateCoupon` が `DomainError` を投げる（単発の
   * `createAdminReservationCommand` と同じ挙動。黙って割引なしで作成しない）。
   */
  couponCode?: string | null;
  rrule: string;
  dtstart: Date;
  /** 1 instance あたりの予約時間（分）。series 全体で固定。 */
  duration: number;
  templateData: ReservationSeriesTemplateData;
  /** 各 required TermsDocument への同意（RESERVATION_SERIES scope）。 */
  agreements: { termsId: string }[];
  /**
   * Admin 代行作成時は顧客向け必須規約ゲートをスキップする。
   * 公開/顧客セルフ申込経路では必ず false（または未指定）。
   */
  skipCustomerTerms?: boolean;
  now: Date;
}

export interface CreateReservationSeriesResult {
  series: { id: string; instanceCount: number };
  instanceIds: string[];
}

/**
 * `locationId` は blocked-date 判定用、残りは pricing 用。
 * pricing 側の 5 列は `previewReservationPricing` / `admin-commands.ts` と同一。
 */
const SERIES_SPACE_SELECT = {
  locationId: true,
  hourlyPrice: true,
  discountType: true,
  discountValue: true,
  durationDiscountOverride: true,
  taxRateType: true,
} as const satisfies Prisma.SpaceSelect;

/** series 作成時に `ReservationSeries.agreementSnapshot` へ保存する fingerprint 形式。 */
interface AgreementSnapshotEntry {
  termsId: string;
  contentHash: string;
  agreedAt: string;
}

export async function createReservationSeriesCommand(
  input: CreateReservationSeriesInput,
): Promise<CreateReservationSeriesResult> {
  // Step 1: RRULE 展開（Settings.maxRecurrenceInstances と照合）。tx に入る前に
  // 検証する — advisory lock を無駄に取得しないため。
  const settings = await prisma.settingsReservation.findUniqueOrThrow({
    where: { id: "singleton" },
    select: { maxRecurrenceInstances: true },
  });

  const validation = validateRruleForSeries({
    rrule: input.rrule,
    dtstart: input.dtstart,
    duration: input.duration,
    maxInstances: settings.maxRecurrenceInstances,
  });
  if (!validation.ok) {
    throw new DomainError(validation.error, "VALIDATION");
  }

  const instanceWindows = validation.instances.map((startTime, index) => ({
    index,
    startTime,
    endTime: new Date(startTime.getTime() + input.duration * 60_000),
  }));

  // `validateRruleForSeries` は instance 0 個を reject 済みなので必ず存在するが、
  // 型の上では optional なので明示的に取り出す。
  const firstWindow = instanceWindows[0];
  if (!firstWindow) {
    throw new DomainError(
      "instance が 0 個。RRULE を再確認してください",
      "VALIDATION",
    );
  }

  // series.id を tx 外で事前生成する。理由:
  // (1) advisory lock 728357 の key を series 単位に統一するため (cancel/update
  //     経路と一致させる)。旧実装は `${spaceId}:${customerId}` を使っており、
  //     cancelReservationSeriesCommand (input.seriesId をそのまま key に使用) と
  //     別 hash になるため、同一 series を触る書込が 728357 の namespace 上で
  //     serialize されない cross-flow gap があった (Space lock 728351 が別途
  //     直列化するので実運用の破綻は無いが、728357 が本来担うべき
  //     "series-scope の書込を tx 単位で serialize する" 契約が破れていた)。
  // (2) TermsAgreement.resourceId に series.id を紐付けたいが、agreementSnapshot
  //     は記録した TermsAgreement 行から構築するため、「series 行を先に作る」だと
  //     resourceId が無く、「TermsAgreement を先に作る」だと series.id が未確定
  //     というチキンエッグになる (Task 10 踏襲)。
  const seriesId = randomUUID();

  // rate plan / スペース / 商取引設定はいずれも read-only なので tx の外で取る
  // （advisory lock の保持時間を伸ばさない。単発経路 `admin-commands.ts` と同型）。
  const [space, ratePlans, commerceSettings] = await Promise.all([
    prisma.space.findUnique({
      where: { id: input.spaceId },
      select: SERIES_SPACE_SELECT,
    }),
    getSpaceRatePlans(input.spaceId),
    getReservationSettings(),
  ]);

  if (!space) {
    throw new DomainError("指定されたスペースが見つかりません", "NOT_FOUND");
  }

  const pricingSpace = {
    hourlyPrice: space.hourlyPrice,
    discountType: space.discountType,
    discountValue: space.discountValue,
    durationDiscountOverride: space.durationDiscountOverride,
    taxRateType: space.taxRateType,
  };
  const pricingSettings = buildPricingSettings(commerceSettings);

  // クーポンの最低利用額判定は rate plan 適用後の実 basePrice で行う（各予約
  // コマンドと同型）。series では **初回 instance の basePrice** を基準にする —
  // usage 消費も割引適用も初回 1 回だけなので、判定基準もそこに揃える。
  const firstRateBreakdown = resolveRateBreakdown({
    ratePlans,
    spaceHourlyPrice: space.hourlyPrice,
    startDateTime: firstWindow.startTime,
    endDateTime: firstWindow.endTime,
    holidayJudge: isJapaneseHoliday,
  });
  const validatedCoupon = await validateCoupon(
    input.couponCode,
    firstRateBreakdown.totalBasePrice,
  );

  // **instance ごとに解決する。** `SpaceRatePlan` は曜日・時間帯・祝日・有効期間で
  // 単価を変えるため、同じ duration でも日付が違えば金額が違う。
  const instancePricings = instanceWindows.map((window) => ({
    window,
    pricing: calculateReservationPricing({
      startDateTime: window.startTime,
      endDateTime: window.endTime,
      space: pricingSpace,
      ratePlans,
      reservationSettings: pricingSettings,
      coupon: window.index === 0 ? validatedCoupon : null,
      holidayJudge: isJapaneseHoliday,
    }),
  }));

  return await prisma.$transaction(async (tx) => {
    // series 単位 lock (728357) → Space 単位 lock (728351、既存契約) の順で取得する。
    // 全経路がこの順序を守ることで deadlock を予防する（series-advisory-lock.ts 参照）。
    await lockReservationSeriesForTransaction(tx, seriesId);
    await lockSpaceForTransaction(tx, input.spaceId);

    // 各 instance の overlap 事前 check（spec risk-1 対策）。createMany を実行する前に
    // 逐次 await で検査し、重複があれば「N 回目 (日付)」の specific error で reject する
    // （EXCLUDE 制約だけに頼ると「一括 insert が丸ごと reject」で原因の instance が
    // 特定できず admin UX が悪化するため、アプリ層で先制的に特定する）。
    for (const window of instanceWindows) {
      await ensureDateNotBlocked(
        input.spaceId,
        space.locationId,
        formatJstDateString(window.startTime),
        tx,
      );
      // ensureNoOverlap → checkSpaceOverlap（Reservation + EventTimeSlot）。
      // 旧 checkReservationOverlapQuery は Event を見ず DB trigger に依存していた。
      try {
        await ensureNoOverlap(
          {
            spaceId: input.spaceId,
            startTime: window.startTime,
            endTime: window.endTime,
          },
          tx,
        );
      } catch (error) {
        if (error instanceof DomainError && error.code === "CONFLICT") {
          throw new DomainError(
            `${window.index + 1} 回目 (${formatJstDateString(window.startTime)}) の時間帯は既に予約されています`,
            "CONFLICT",
          );
        }
        throw error;
      }
    }

    // TermsAgreement（RESERVATION_SERIES scope、各 required doc につき 1 行）。
    // Admin 代行作成は顧客同意 UI を持たないため skipCustomerTerms でゲートを外す。
    let agreementSnapshot: AgreementSnapshotEntry[] = [];
    if (!input.skipCustomerTerms) {
      await assertAllRequiredTermsAgreed({
        scope: TERMS_SCOPE.RESERVATION_SERIES,
        agreements: input.agreements,
        tx,
      });

      const recordedAgreements = await recordTermsAgreements({
        scope: TERMS_SCOPE.RESERVATION_SERIES,
        customerId: input.customerId,
        resourceId: seriesId,
        agreements: input.agreements,
        tx,
      });
      agreementSnapshot = recordedAgreements.map((agreement) => ({
        termsId: agreement.termsId,
        contentHash: agreement.contentHash,
        agreedAt: agreement.agreedAt.toISOString(),
      }));
    }

    // coupon usage increment（series 全体で 1 usage）。validity / min amount /
    // usageLimit を同一 UPDATE WHERE で強制する。割引が効くのも初回 instance の
    // 1 回だけなので、1 usage と 1 割引が対応する。
    if (validatedCoupon) {
      await claimCouponUsage(tx, {
        couponId: validatedCoupon.id,
        basePrice: firstRateBreakdown.totalBasePrice,
        now: input.now,
      });
    }

    const series = await tx.reservationSeries.create({
      data: {
        id: seriesId,
        spaceId: input.spaceId,
        customerId: input.customerId,
        couponId: validatedCoupon?.id ?? null,
        rrule: input.rrule,
        dtstart: input.dtstart,
        duration: input.duration,
        instanceCount: instanceWindows.length,
        templateData: asPrismaInputJsonValue(
          input.templateData,
          "テンプレートデータの生成に失敗しました",
        ),
        agreementSnapshot: asPrismaInputJsonValue(
          agreementSnapshot,
          "同意記録スナップショットの生成に失敗しました",
        ),
      },
      select: { id: true, instanceCount: true },
    });

    // 各 instance を Reservation として createMany で一括 insert する。
    // EXCLUDE 制約 (reservations_no_active_time_overlap_excl) と CROSS-TABLE TRIGGER
    // (Event slot 重複防止) が各行に対して自動的に効く（defense-in-depth、上の
    // アプリ層 pre-check が主防衛線）。
    const reservationData: Prisma.ReservationCreateManyInput[] =
      instancePricings.map(({ window, pricing }) => ({
        spaceId: input.spaceId,
        customerId: input.customerId,
        // Codex fix: instance は couponId を持たない（coupon は series row のみ）。
        // this-only キャンセル時に既存 applyBulkCancellation の coupon decrement 経路
        // （instance couponId 判定）が自動 skip され、残り instance の割引を守る。
        couponId: null,
        // 割引額は **必ず itemize する**。`reservations_total_price_breakdown_check`
        // が `total_price = GREATEST(0, base_price - coupon - duration - space)
        // + manual_adjustment` を強制するため、割引後の total_price を書きながら
        // 内訳列を空にすると 23514 で reject される。
        //
        // 旧実装はまさにこれをやっていた（割引後 totalPrice を全 instance へコピー
        // しつつ couponDiscountAmount を持たせない設計）。結果、**割引が実際に効く
        // クーポンを指定した繰返し予約は作成そのものが失敗していた**。
        // 割引が 0 円のクーポン（あるいはクーポン無し）でだけ通っていた。
        //
        // `couponId` が null で `couponDiscountAmount` が正、という組合せを禁じる
        // 制約は無い（`reservations_money_non_negative_check` は非負のみ）。
        couponDiscountAmount: pricing.couponDiscountAmount,
        seriesId: series.id,
        recurrenceInstanceIndex: window.index,
        startTime: window.startTime,
        endTime: window.endTime,
        // spec risk-5: admin 作成の series は CONFIRMED + 後払い運用（paymentStatus は
        // Prisma default の UNPAID のまま、明示指定しない）。
        status: ReservationStatus.CONFIRMED,
        // その instance 自身の日時で解決した金額。rate plan（曜日 / 時間帯 / 祝日 /
        // 有効期間）が効くので instance ごとに異なりうる。
        totalPrice: pricing.totalPrice,
        basePrice: pricing.basePrice,
        rateBreakdownJson: asPrismaInputJsonValue(
          pricing.rateBreakdown,
          "料金内訳の生成に失敗しました",
        ),
        taxRateType: pricing.taxRateType,
        taxRate: pricing.taxRate,
        taxAmount: pricing.taxAmount,
        totalPriceWithTax: pricing.totalPriceWithTax,
        durationDiscountAmount: pricing.durationDiscountAmount ?? null,
        spaceDiscountAmount: pricing.spaceDiscountAmount ?? null,
        notes: input.templateData.notes ?? null,
        guestLastName: input.templateData.guestLastName ?? null,
        guestFirstName: input.templateData.guestFirstName ?? null,
        guestEmail: input.templateData.guestEmail ?? null,
        guestPhone: input.templateData.guestPhone ?? null,
        guestCompanyName: input.templateData.guestCompanyName ?? null,
        guestCustomerType: input.templateData.guestCustomerType ?? null,
      }));

    await tx.reservation.createMany({ data: reservationData });

    // createMany は作成行を返さないため、seriesId で読み直して instance id を確定する。
    const created = await tx.reservation.findMany({
      where: { seriesId: series.id },
      select: { id: true },
      orderBy: { recurrenceInstanceIndex: "asc" },
    });

    return {
      series: { id: series.id, instanceCount: series.instanceCount },
      instanceIds: created.map((r) => r.id),
    };
  }, RESERVATION_WRITE_TX_OPTIONS);
}

// =============================================================================
// cancelReservationSeriesCommand
// =============================================================================

export type ReservationSeriesCancelScope =
  "this-only" | "this-and-following" | "series-all";

export interface CancelReservationSeriesInput {
  seriesId: string;
  scope: ReservationSeriesCancelScope;
  /** this-only / this-and-following で必須。基準となる instance の Reservation.id。 */
  fromInstanceId?: string;
  cancellationReason?: string;
  cancelledByType: CancelledByType;
  /**
   * どこから / 誰がキャンセルしたか (per-instance 副作用の AuditLog channel + 通知
   * タイトル分岐に伝播)。admin / customer-mypage / customer-token を受け付ける
   * (Phase B.2.1 Task 4 で customer 経路対応)。
   */
  channel: CancelChannel;
  actorUserId?: string;
  request: CancelRequestContext;
  now: Date;
}

export interface CancelReservationSeriesResult {
  cancelledCount: number;
  cancelledReservationIds: string[];
}

export async function cancelReservationSeriesCommand(
  input: CancelReservationSeriesInput,
): Promise<CancelReservationSeriesResult> {
  const resolved = await prisma.$transaction(async (tx) => {
    await lockReservationSeriesForTransaction(tx, input.seriesId);

    const series = await tx.reservationSeries.findUnique({
      where: { id: input.seriesId },
      select: { id: true, deletedAt: true, couponId: true },
    });
    if (!series) {
      throw new DomainError("series が見つかりません", "NOT_FOUND");
    }
    if (series.deletedAt !== null) {
      throw new DomainError("series は既にキャンセル済です", "CONFLICT");
    }

    const idsToCancel = await resolveIdsToCancel(tx, input);

    if (idsToCancel.ids.length > 0) {
      const spaceRows = await tx.reservation.findMany({
        where: { id: { in: idsToCancel.ids } },
        select: { spaceId: true },
      });
      await lockSpacesForTransactionInOrder(
        tx,
        spaceRows.map((row) => row.spaceId),
      );
    }

    const result = await applyBulkCancellation(tx, idsToCancel.ids, {
      cancelledByType: input.cancelledByType,
      now: input.now,
      ...(input.cancellationReason !== undefined && {
        cancellationReason: input.cancellationReason,
      }),
    });

    // series-all のみ series row を soft-delete + coupon usage を戻す。claim できた
    // instance 数（result.cancelledIds.length）に関わらず、series 単位の「解約」意思
    // 表示として常に実行する（既に全 instance が個別キャンセル済みでも series 行は
    // 未解約のままだと矛盾するため）。
    if (input.scope === "series-all") {
      await tx.reservationSeries.update({
        where: { id: input.seriesId },
        data: {
          cancelledAt: input.now,
          cancelledByType: input.cancelledByType,
          cancellationReason: input.cancellationReason ?? null,
          deletedAt: input.now,
          deletedById: input.actorUserId ?? null,
        },
      });
      if (series.couponId) {
        await releaseCouponUsage(tx, { couponId: series.couponId });
      }
    }

    return {
      cancelledIds: result.cancelledIds,
      fromInstanceStartTime: idsToCancel.fromInstanceStartTime,
    };
  }, RESERVATION_WRITE_TX_OPTIONS);

  const cancelledIds = resolved.cancelledIds;

  // tx 外で副作用を発火する（claim 成功分が 0 件なら何も送らない）。
  if (cancelledIds.length > 0) {
    if (input.scope === "this-only") {
      // this-only は既存の単発予約経路と完全に同じ副作用（1 通メール / 1 GCal delete）
      // で完結させる。bulk 集約経路は通らない（spec §4.5）。
      const [firstId] = cancelledIds;
      if (firstId) {
        await applyCancellationSideEffects({
          reservationId: firstId,
          cancellationReason: input.cancellationReason ?? null,
          channel: input.channel,
          actorUserId: input.actorUserId ?? null,
          request: input.request,
        });
      }
    } else {
      // this-and-following: patchGcalMasterUntil に渡す UNTIL を fromInstance
      // 直前 (startTime - 1s) に設定して、DB でキャンセルされていない過去 instance
      // (fromInstance より前) が GCal 上に残るようにする。cancel 実行時刻 `now` を
      // そのまま渡すと now < fromInstance.startTime のケースで GCal master が
      // 過度に truncate される silent regression (RECENT-01)。
      // series-all では master 自体を削除するため gcalUntil は不要 (undefined)。
      const gcalUntil =
        input.scope === "this-and-following" &&
        resolved.fromInstanceStartTime !== null
          ? new Date(resolved.fromInstanceStartTime.getTime() - 1000)
          : undefined;
      await applyBulkCancellationSideEffects({
        reservationIds: cancelledIds,
        scope: input.scope,
        seriesId: input.seriesId,
        channel: input.channel,
        request: input.request,
        now: input.now,
        ...(gcalUntil !== undefined && { gcalUntil }),
        ...(input.cancellationReason !== undefined && {
          cancellationReason: input.cancellationReason,
        }),
        ...(input.actorUserId !== undefined && {
          actorUserId: input.actorUserId,
        }),
      });
    }
  }

  return {
    cancelledCount: cancelledIds.length,
    cancelledReservationIds: cancelledIds,
  };
}

/** `cancelReservationSeriesCommand` 用の最小構造型 tx（理由は series-advisory-lock.ts 参照）。 */
type CancelSeriesTx = {
  reservation: {
    findUnique: (args: {
      // Prisma の Input 型と交差させる。呼び出し側を id 指定に絞ったまま、
      // 列名が変わったらコンパイルで落とすため（`object` や素の手書き形では
      // 列の drift が実行時の PrismaClientValidationError まで出ない）。
      where: Prisma.ReservationWhereUniqueInput & { id: string };
      select: { seriesId: true; startTime: true };
    }) => Promise<{ seriesId: string | null; startTime: Date } | null>;
    findMany: (args: {
      where: Prisma.ReservationWhereInput;
      select: { id: true };
    }) => Promise<{ id: string }[]>;
  };
};

/**
 * `resolveIdsToCancel` の結果。
 *
 * - `ids`: キャンセル対象の Reservation.id 集合
 * - `fromInstanceStartTime`: this-and-following で必要な GCal master RRULE UNTIL の
 *   計算基準になる fromInstance.startTime。他 scope では null。呼出側 (bulk
 *   side-effects) は `fromInstanceStartTime - 1s` を patchGcalMasterUntil の
 *   `until` に渡して GCal master を「fromInstance 直前まで」で切り詰める
 *   (RECENT-01 fix: 以前は cancel 実行時刻 `now` を渡していたため、`now <
 *   fromInstance.startTime` の一般的な pre-scheduled cancel で GCal master
 *   RRULE が cancel 時刻で truncate され、DB では CONFIRMED のまま残る instance
 *   (fromInstance より前・now より後) が silent に消失していた)。
 */
interface ResolveIdsToCancelResult {
  ids: string[];
  fromInstanceStartTime: Date | null;
}

/**
 * scope ごとに対象 instance id を決定する。
 *
 * - `series-all`: series 内の CANCELLABLE_STATUSES 全 instance
 * - `this-only` / `this-and-following`: `fromInstanceId` が必須。その instance が
 *   本当にこの series に属するか（`seriesId` 一致）を確認してから対象を絞り込む
 *   （fromInstanceId と seriesId が食い違う呼出しで無関係の予約を巻き込まないための
 *   防御的チェック。brief 原案には無いが、`applyBulkCancellation` 自体は
 *   seriesId で絞り込まないため、ここで確認しないと this-only は任意の reservation id
 *   をキャンセルできてしまう）
 */
async function resolveIdsToCancel(
  tx: CancelSeriesTx,
  input: CancelReservationSeriesInput,
): Promise<ResolveIdsToCancelResult> {
  if (input.scope === "series-all") {
    const targets = await tx.reservation.findMany({
      where: {
        seriesId: input.seriesId,
        status: { in: [...CANCELLABLE_STATUSES] },
        deletedAt: null,
      },
      select: { id: true },
    });
    return { ids: targets.map((r) => r.id), fromInstanceStartTime: null };
  }

  if (!input.fromInstanceId) {
    throw new DomainError("fromInstanceId が必要です", "VALIDATION");
  }
  const fromInstanceId = input.fromInstanceId;

  const fromInstance = await tx.reservation.findUnique({
    where: { id: fromInstanceId },
    select: { seriesId: true, startTime: true },
  });
  if (!fromInstance || fromInstance.seriesId !== input.seriesId) {
    throw new DomainError(
      "指定された予約がこの series に属していません",
      "VALIDATION",
    );
  }

  if (input.scope === "this-only") {
    return { ids: [fromInstanceId], fromInstanceStartTime: null };
  }

  // this-and-following: fromInstance.startTime 以降の CANCELLABLE instance を対象にする。
  // series.rrule の UNTIL 更新（今後の materialize 抑止）は本 phase では未実装
  // （materialize は series 作成時の一括 insert のみで、スケジュール実行される
  // 将来 instance の遅延生成が無いため UNTIL 更新の実効性が無い。将来 phase の
  // update 経路で使う想定、spec §4.1 コメント参照）。
  const targets = await tx.reservation.findMany({
    where: {
      seriesId: input.seriesId,
      startTime: { gte: fromInstance.startTime },
      status: { in: [...CANCELLABLE_STATUSES] },
      deletedAt: null,
    },
    select: { id: true },
  });
  return {
    ids: targets.map((r) => r.id),
    fromInstanceStartTime: fromInstance.startTime,
  };
}
