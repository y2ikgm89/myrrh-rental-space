"use server";

/**
 * 管理画面 繰返し予約 (ReservationSeries) Server Actions (Phase B.2 task 21).
 *
 * - `createRecurringReservationAction`: Zod parse → `createReservationSeriesCommand`
 *   invoke → cache 無効化 + GCal 同期 fire-and-forget。conform `useActionState` canonical
 *   `(prev, formData) => SubmissionResult` signature。
 * - `cancelReservationSeriesAction`: Zod parse ({seriesId, scope, fromInstanceId?})
 *   → `cancelReservationSeriesCommand` invoke → cache 無効化。
 *
 * 共通契約: `executeAdminMutationResult` 経由の auth + RBAC + audit ログ配線
 * (Phase B.2 は admin-only、spec §non-goals: 顧客セルフ series 操作は将来 phase)。
 * `createReservationSeriesCommand` の中で server-side terms consent gate
 * (`assertAllRequiredTermsAgreed` scope=RESERVATION_SERIES) が発火するため、
 * 未対応の必須規約が Settings で有効なら DomainError で reject される。
 */

import type { SubmissionResult } from "@conform-to/react";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { isMutationError } from "@/shared/lib/mutation-result";
import { fireAndForget } from "@/shared/lib/async-utils";
import { invalidateReservationCaches } from "@/shared/lib/cache/reservation-cache";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors";
import { parseDateTimeLocalAsJst } from "@/shared/lib/date-format";
import {
  cancelReservationSeriesCommand,
  createReservationSeriesCommand,
} from "@/shared/domain/reservations/series-commands";
import { previewReservationPricing } from "@/shared/domain/reservations/pricing-preview";
import { syncReservationSeriesToCalendar } from "@/shared/lib/calendar-sync/outbound";
import { getMaxRecurrenceInstances } from "@/shared/domain/reservations/payloads";
import { getClientIpFromHeaders } from "@/shared/lib/rate-limit";
import { z } from "zod";
import { createRecurringReservationFormSchema } from "../../../reservations/_components/reservation-form-schema";
import { buildRruleString } from "../../../reservations/_components/rrule-utils";

// ---------------------------------------------------------------------------
// createRecurringReservationAction
// ---------------------------------------------------------------------------

export async function createRecurringReservationAction(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  // Task 1 の Settings.maxRecurrenceInstances を form schema の上限に注入
  const maxRecurrenceInstances = await getMaxRecurrenceInstances();
  const schema = createRecurringReservationFormSchema({
    maxRecurrenceInstances,
  });

  let createdSeriesId: string | null = null;

  return await executeConformMutation(formData, schema, async (data) => {
    // dtstart = date + startTime を JST として解釈
    const dtstart = parseDateTimeLocalAsJst(`${data.date}T${data.startTime}`);
    const endTime = parseDateTimeLocalAsJst(`${data.date}T${data.endTime}`);
    const duration = Math.round(
      (endTime.getTime() - dtstart.getTime()) / 60_000,
    );

    // 単発予約と同じ pricing preview で 1 instance 分の price を確定 → templateData に流用
    // (全 instance で duration + rate plan 同一の前提、spec §7)。
    const preview = await previewReservationPricing(
      {
        spaceId: data.spaceId,
        startDateTime: dtstart,
        endDateTime: endTime,
      },
      { requirePublished: false },
    );
    if (!preview) {
      return {
        ok: false,
        error: "スペース情報の取得に失敗しました。空き状況をご確認ください。",
      };
    }

    // RRULE 組み立て (COUNT / UNTIL は endMode で分岐)
    const rrule = buildRruleString({
      freq: data.freq,
      interval: data.interval,
      byday: data.freq === "WEEKLY" ? data.byday : [],
      ...(data.endMode === "count"
        ? { count: data.count }
        : { until: data.until }),
    });

    type SeriesPayload = {
      readonly id: string;
      readonly instanceCount: number;
    };

    const result = await executeAdminMutationResult<SeriesPayload>({
      resource: "reservation",
      action: "create",
      execute: async (_user): Promise<SeriesPayload> => {
        const series = await createReservationSeriesCommand({
          spaceId: data.spaceId,
          customerId: data.customerId,
          rrule,
          dtstart,
          duration,
          templateData: {
            totalPrice: preview.totalPrice,
            basePrice: preview.basePrice,
            rateBreakdownJson: preview.rateBreakdown,
            taxRateType: preview.taxRateType,
            taxRate: preview.taxRate,
            taxAmount: preview.taxAmount,
            totalPriceWithTax: preview.totalPriceWithTax,
            durationDiscountAmount: preview.durationDiscountAmount,
            spaceDiscountAmount: preview.spaceDiscountAmount,
          },
          agreements: [],
          now: new Date(),
        });
        return {
          id: series.series.id,
          instanceCount: series.series.instanceCount,
        };
      },
      afterSuccess: (payload) => {
        // series 全体で 1 回だけ GCal master event 生成 + child ID write-back
        fireAndForget(syncReservationSeriesToCalendar(payload.id), {
          operation: "syncReservationSeriesToCalendar",
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.MEDIUM,
          context: { seriesId: payload.id },
        });
        // instance のリスト再取得は client 側の revalidation に任せる
        invalidateReservationCaches(payload.id, data.customerId, {
          coupons: false,
        });
      },
      resolveAuditResourceId: (payload) => payload.id,
    });

    if (isMutationError(result)) {
      return { ok: false, error: result.error };
    }
    createdSeriesId = result.id;
    void createdSeriesId; // consumer は SubmissionResult 経由で redirect 判定する
    return {
      ok: true,
      successMessage: `${result.instanceCount} 件の予約を作成しました`,
    };
  });

  // Note: request 変数の warning を避けるため上で await 化
}

// ---------------------------------------------------------------------------
// cancelReservationSeriesAction
// ---------------------------------------------------------------------------

const cancelInputSchema = z
  .object({
    seriesId: z.uuid({ error: "series id が不正です" }),
    scope: z.enum(["this-only", "this-and-following", "series-all"]),
    fromInstanceId: z.uuid().optional().or(z.literal("")),
    cancellationReason: z.string().max(500).optional().or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    if (
      (data.scope === "this-only" || data.scope === "this-and-following") &&
      (!data.fromInstanceId || data.fromInstanceId === "")
    ) {
      ctx.addIssue({
        code: "custom",
        message: "対象 instance が指定されていません",
        path: ["fromInstanceId"],
      });
    }
  });

export async function cancelReservationSeriesAction(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return await executeConformMutation(
    formData,
    cancelInputSchema,
    async (data) => {
      const request = await buildRequestContext();

      type CancelPayload = {
        readonly cancelledCount: number;
        readonly cancelledReservationIds: readonly string[];
      };

      const result = await executeAdminMutationResult<CancelPayload>({
        resource: "reservation",
        action: "update",
        resourceId: data.seriesId,
        execute: async (user): Promise<CancelPayload> => {
          const cancelled = await cancelReservationSeriesCommand({
            seriesId: data.seriesId,
            scope: data.scope,
            ...(data.fromInstanceId && data.fromInstanceId !== ""
              ? { fromInstanceId: data.fromInstanceId }
              : {}),
            ...(data.cancellationReason && data.cancellationReason !== ""
              ? { cancellationReason: data.cancellationReason }
              : {}),
            cancelledByType: "ADMIN",
            actorUserId: user.id,
            request,
            now: new Date(),
          });
          return {
            cancelledCount: cancelled.cancelledCount,
            cancelledReservationIds: cancelled.cancelledReservationIds,
          };
        },
        afterSuccess: () => {
          // series 全体のキャンセルは複数 instance を対象にするため customer id は
          // ここでは特定できない (Task 13 の command が seriesId から解決)。
          // cache は全域で invalidate する保守的方針で、他予約検索の stale を防ぐ。
          invalidateReservationCaches(data.seriesId, null, {
            coupons: false,
          });
        },
        resolveAuditResourceId: () => data.seriesId,
      });

      if (isMutationError(result)) {
        return { ok: false, error: result.error };
      }
      return {
        ok: true,
        successMessage: `${result.cancelledCount} 件の予約をキャンセルしました`,
      };
    },
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function buildRequestContext(): Promise<{
  ip: string | null;
  userAgent: string | null;
}> {
  const ip = await getClientIpFromHeaders();
  // userAgent は cancellation-side-effects.ts 側で headers() から取り直すため
  // ここでは null で構わない。監査ログの補完のためだけに ip のみを渡す。
  return { ip, userAgent: null };
}
