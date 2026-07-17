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
import type { CustomerType, TaxRateType } from "@generated/prisma/enums";
import { ReservationStatus } from "@generated/prisma/enums";
import { prisma } from "@/shared/db/prisma";
import { asPrismaInputJsonValue } from "@/shared/db/json";
import { DomainError } from "@/shared/domain/domain-error";
import { assertAllRequiredTermsAgreed } from "@/shared/domain/terms/queries";
import { recordTermsAgreements } from "@/shared/domain/terms/commands";
import { formatJstDateString } from "@/shared/lib/date-format";
import type { RateBreakdown } from "@/shared/lib/pricing/rate-breakdown";
import { TERMS_SCOPE } from "@/shared/lib/validations/enums/prisma-types";
import { checkReservationOverlapQuery } from "./availability";
import { applyBulkCancellation, CANCELLABLE_STATUSES } from "./cancel-core";
import {
  applyBulkCancellationSideEffects,
  applyCancellationSideEffects,
  type CancelChannel,
  type CancelRequestContext,
} from "./cancellation-side-effects";
import { lockReservationSeriesForTransaction } from "./series-advisory-lock";
import { validateRruleForSeries } from "./series-rrule";
import { lockSpaceForTransaction } from "./space-locks";

// =============================================================================
// createReservationSeriesCommand
// =============================================================================

/**
 * series 作成時に各 instance へ複製されるテンプレート値。
 *
 * 各 instance は series 全体で duration が固定（spec 非ゴール: per-instance
 * duration variation は Phase B.2.1 以降）であるため、価格（rate plan 解決結果）も
 * 全 instance で同一という前提を置く。呼出側（Task 18 以降の admin action）が
 * 事前に 1 回分の pricing を解決し、そのまま渡す。
 *
 * `couponDiscountAmount` を含めない: Codex fix（coupon は series row のみ保持）に
 * 合わせ、instance 側は常に `couponId: null` のため、クーポン由来の割引内訳を
 * instance 単位で持たせると「couponId が無いのに couponDiscountAmount がある」
 * という不整合を生む。coupon 割引は `totalPrice`（割引後価格）に織込み済みで、
 * 内訳の可視性は series 行の `templateData` スナップショットで担保する。
 */
export interface ReservationSeriesTemplateData {
  totalPrice: number;
  basePrice: number;
  rateBreakdownJson: RateBreakdown;
  taxRateType: TaxRateType;
  taxRate: number;
  taxAmount: number;
  totalPriceWithTax: number;
  durationDiscountAmount?: number | null;
  spaceDiscountAmount?: number | null;
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
  couponId?: string | null;
  rrule: string;
  dtstart: Date;
  /** 1 instance あたりの予約時間（分）。series 全体で固定。 */
  duration: number;
  templateData: ReservationSeriesTemplateData;
  /** 各 required TermsDocument への同意（RESERVATION_SERIES scope）。 */
  agreements: { termsId: string }[];
  now: Date;
}

export interface CreateReservationSeriesResult {
  series: { id: string; instanceCount: number };
  instanceIds: string[];
}

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
  const settings = await prisma.settings.findUniqueOrThrow({
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

  // rateBreakdownJson の JSON narrow は全 instance で同一値のため 1 回だけ実行する。
  const rateBreakdownJsonValue = asPrismaInputJsonValue(
    input.templateData.rateBreakdownJson,
    "料金内訳の生成に失敗しました",
  );

  return await prisma.$transaction(async (tx) => {
    // series 単位 lock (728357) → Space 単位 lock (728351、既存契約) の順で取得する。
    // 全経路がこの順序を守ることで deadlock を予防する（series-advisory-lock.ts 参照）。
    await lockReservationSeriesForTransaction(
      tx,
      `${input.spaceId}:${input.customerId}`,
    );
    await lockSpaceForTransaction(tx, input.spaceId);

    // 各 instance の overlap 事前 check（spec risk-1 対策）。createMany を実行する前に
    // 逐次 await で検査し、重複があれば「N 回目 (日付)」の specific error で reject する
    // （EXCLUDE 制約だけに頼ると「一括 insert が丸ごと reject」で原因の instance が
    // 特定できず admin UX が悪化するため、アプリ層で先制的に特定する）。
    for (const window of instanceWindows) {
      const overlap = await checkReservationOverlapQuery(
        {
          spaceId: input.spaceId,
          startTime: window.startTime,
          endTime: window.endTime,
        },
        tx,
      );
      if (overlap.hasOverlap) {
        throw new DomainError(
          `${window.index + 1} 回目 (${formatJstDateString(window.startTime)}) の時間帯は既に予約されています`,
          "CONFLICT",
        );
      }
    }

    // TermsAgreement（RESERVATION_SERIES scope、各 required doc につき 1 行）。
    // server-side gate → 記録の順（terms-consent-gate と同じ二段構え）。
    await assertAllRequiredTermsAgreed({
      scope: TERMS_SCOPE.RESERVATION_SERIES,
      agreements: input.agreements,
      tx,
    });

    // series.id を事前生成する: TermsAgreement.resourceId に series.id を紐付けたいが、
    // agreementSnapshot（series 行自身の列）は記録した TermsAgreement 行から構築するため、
    // 「series 行を先に作る」と resourceId が無く、「TermsAgreement を先に作る」と
    // series.id が未確定というチキンエッグになる。id を先に払い出すことで両立させる
    // （`recordTermsAgreements` 自身も同じ理由で id を呼出前に生成する設計、Task 10 踏襲）。
    const seriesId = randomUUID();

    const recordedAgreements = await recordTermsAgreements({
      scope: TERMS_SCOPE.RESERVATION_SERIES,
      customerId: input.customerId,
      resourceId: seriesId,
      agreements: input.agreements,
      tx,
    });
    const agreementSnapshot: AgreementSnapshotEntry[] = recordedAgreements.map(
      (agreement) => ({
        termsId: agreement.termsId,
        contentHash: agreement.contentHash,
        agreedAt: agreement.agreedAt.toISOString(),
      }),
    );

    // coupon usage increment（series 全体で 1 usage、既存単発予約と同じ pattern）。
    if (input.couponId) {
      await tx.coupon.updateMany({
        where: { id: input.couponId },
        data: { usageCount: { increment: 1 } },
      });
    }

    const series = await tx.reservationSeries.create({
      data: {
        id: seriesId,
        spaceId: input.spaceId,
        customerId: input.customerId,
        couponId: input.couponId ?? null,
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
      instanceWindows.map((window) => ({
        spaceId: input.spaceId,
        customerId: input.customerId,
        // Codex fix: instance は couponId を持たない（coupon は series row のみ）。
        // this-only キャンセル時に既存 applyBulkCancellation の coupon decrement 経路
        // （instance couponId 判定）が自動 skip され、残り instance の割引を守る。
        couponId: null,
        seriesId: series.id,
        recurrenceInstanceIndex: window.index,
        startTime: window.startTime,
        endTime: window.endTime,
        // spec risk-5: admin 作成の series は CONFIRMED + 後払い運用（paymentStatus は
        // Prisma default の UNPAID のまま、明示指定しない）。
        status: ReservationStatus.CONFIRMED,
        totalPrice: input.templateData.totalPrice,
        basePrice: input.templateData.basePrice,
        rateBreakdownJson: rateBreakdownJsonValue,
        taxRateType: input.templateData.taxRateType,
        taxRate: input.templateData.taxRate,
        taxAmount: input.templateData.taxAmount,
        totalPriceWithTax: input.templateData.totalPriceWithTax,
        durationDiscountAmount:
          input.templateData.durationDiscountAmount ?? null,
        spaceDiscountAmount: input.templateData.spaceDiscountAmount ?? null,
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
  });
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
  cancelledByType: string;
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
  const cancelledIds = await prisma.$transaction(async (tx) => {
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

    const result = await applyBulkCancellation(tx, idsToCancel, {
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
        await tx.coupon.updateMany({
          where: { id: series.couponId, usageCount: { gt: 0 } },
          data: { usageCount: { decrement: 1 } },
        });
      }
    }

    return result.cancelledIds;
  });

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
      await applyBulkCancellationSideEffects({
        reservationIds: cancelledIds,
        scope: input.scope,
        seriesId: input.seriesId,
        channel: input.channel,
        request: input.request,
        now: input.now,
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
      where: { id: string };
      select: { seriesId: true; startTime: true };
    }) => Promise<{ seriesId: string | null; startTime: Date } | null>;
    findMany: (args: {
      where: Prisma.ReservationWhereInput;
      select: { id: true };
    }) => Promise<{ id: string }[]>;
  };
};

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
): Promise<string[]> {
  if (input.scope === "series-all") {
    const targets = await tx.reservation.findMany({
      where: {
        seriesId: input.seriesId,
        status: { in: [...CANCELLABLE_STATUSES] },
        deletedAt: null,
      },
      select: { id: true },
    });
    return targets.map((r) => r.id);
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
    return [fromInstanceId];
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
  return targets.map((r) => r.id);
}
