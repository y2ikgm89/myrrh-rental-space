"use server";

import { z } from "zod";
import type { SubmissionResult } from "@conform-to/react";
import { redirect } from "next/navigation";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { checkAdminAuth } from "@/admin/lib/action-auth";
import { hasPermission } from "@/shared/lib/admin-permissions";
import {
  apiRateLimiter,
  getClientIpFromHeaders,
} from "@/shared/lib/rate-limit";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { isMutationError } from "@/shared/lib/mutation-result";
import { fireAndForget } from "@/shared/lib/async-utils";
import { invalidateReservationCaches } from "@/shared/lib/cache/reservation-cache";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors";
import { omitUndefined } from "@/shared/lib/serialize";
import { toAppRoute } from "@/shared/lib/routes/to-app-route";
import {
  createAdminReservationCommand,
  updateAdminReservationCommand,
} from "@/shared/domain/reservations/admin-commands";
import { previewReservationPricing } from "@/shared/domain/reservations/pricing-preview";
import type { ReservationPricingResult } from "@/shared/lib/pricing/calculate-reservation-pricing";
import {
  syncReservationToCalendar,
  updateCalendarSync,
} from "@/shared/lib/calendar-sync/outbound";
import type { ReservationSyncData } from "@/shared/lib/calendar-sync/types";
import {
  sendReservationAdminNotification,
  sendReservationConfirmationEmail,
  sendReservationUpdatedEmail,
} from "@/shared/lib/email/reservation-emails";
import { createNotificationCommand } from "@/shared/domain/notifications/commands";
import {
  NOTIFICATION_TYPE,
  NOTIFICATION_TYPE_LABELS,
} from "@/shared/lib/validations/enums/helpers";
import {
  createReservationFormSchema,
  updateReservationFormSchema,
} from "../../../reservations/_components/reservation-form-schema";

/**
 * 管理画面 新規予約作成 — conform `useActionState` canonical
 *
 * `(prev, formData) => SubmissionResult` signature。
 * 成功時は `redirect()` で詳細ページに遷移、失敗時は `submission.reply()` を返す。
 */
export async function createReservationAction(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  let createdId: string | null = null;

  const submissionResult = await executeConformMutation(
    formData,
    createReservationFormSchema,
    async (data) => {
      // customerData の空文字列を undefined に変換
      const customerData =
        data.mode === "new" && data.customerData
          ? omitUndefined({
              lastName: data.customerData.lastName,
              firstName: data.customerData.firstName,
              email: data.customerData.email,
              companyName:
                data.customerData.companyName !== "" &&
                data.customerData.companyName !== undefined
                  ? data.customerData.companyName
                  : undefined,
              phoneNumber:
                data.customerData.phoneNumber !== "" &&
                data.customerData.phoneNumber !== undefined
                  ? data.customerData.phoneNumber
                  : undefined,
            })
          : undefined;

      const customerId =
        data.mode === "existing" && data.customerId && data.customerId !== ""
          ? data.customerId
          : undefined;

      let mutationPayload:
        Awaited<ReturnType<typeof createAdminReservationCommand>> | undefined;

      const result = await executeAdminMutationResult({
        resource: "reservation",
        action: "create",
        execute: async (user) => {
          mutationPayload = await createAdminReservationCommand(
            omitUndefined({
              spaceId: data.spaceId,
              date: data.date,
              startTime: data.startTime,
              endTime: data.endTime,
              customerId,
              customerData,
              totalPrice: data.totalPrice,
              couponCode:
                data.couponCode && data.couponCode !== ""
                  ? data.couponCode
                  : undefined,
              status: data.status,
              notes: data.notes && data.notes !== "" ? data.notes : undefined,
              adminUserId: user.id,
            }),
          );
          return { id: mutationPayload.id };
        },
        afterSuccess: () => {
          if (!mutationPayload) return;

          const payloadData = omitUndefined(mutationPayload.payload);
          const calendarData: ReservationSyncData = payloadData;
          if (data.sendEmail) {
            fireAndForget(
              Promise.all([
                sendReservationConfirmationEmail(payloadData),
                sendReservationAdminNotification(payloadData, "new"),
                syncReservationToCalendar(calendarData),
              ]),
              {
                operation: "createReservationActionPostTasks",
                category: ErrorCategory.EXTERNAL_API,
                severity: ErrorSeverity.MEDIUM,
                context: { reservationId: mutationPayload.id },
              },
            );
          } else {
            fireAndForget(syncReservationToCalendar(calendarData), {
              operation: "syncReservationToCalendar",
              category: ErrorCategory.EXTERNAL_API,
              severity: ErrorSeverity.LOW,
              context: {
                reservationId: mutationPayload.id,
                trigger: "createReservationAction",
              },
            });
          }

          fireAndForget(
            createNotificationCommand({
              type: NOTIFICATION_TYPE.RESERVATION_NEW,
              title:
                NOTIFICATION_TYPE_LABELS[NOTIFICATION_TYPE.RESERVATION_NEW],
              message: "管理者が新規予約を作成しました",
              resourceType: "reservation",
              resourceId: mutationPayload.id,
            }),
            {
              operation: "createReservationActionNotification",
              category: ErrorCategory.DATABASE,
            },
          );

          invalidateReservationCaches(
            mutationPayload.id,
            mutationPayload.customerId,
            {
              coupons: true,
            },
          );
        },
        resolveAuditResourceId: (payloadData) => payloadData.id,
      });

      if (isMutationError(result)) {
        return { ok: false, error: result.error };
      }
      createdId = result.id;
      return { ok: true };
    },
  );

  if (createdId !== null) {
    redirect(toAppRoute(`/admin/reservations/${createdId}`));
  }

  return submissionResult;
}

/**
 * 管理画面 予約更新 — conform `useActionState` canonical
 *
 * id は `bind(null, reservation.id)` で部分適用。
 * 成功時は詳細ページにリダイレクト、失敗時は `submission.reply()` を返す。
 */
export async function updateReservationAction(
  id: string,
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  let success = false;

  const submissionResult = await executeConformMutation(
    formData,
    updateReservationFormSchema,
    async (data) => {
      let mutationPayload:
        Awaited<ReturnType<typeof updateAdminReservationCommand>> | undefined;

      const result = await executeAdminMutationResult({
        resource: "reservation",
        action: "update",
        resourceId: id,
        execute: async (user) => {
          mutationPayload = await updateAdminReservationCommand(
            id,
            omitUndefined({
              spaceId: data.spaceId,
              date: data.date,
              startTime: data.startTime,
              endTime: data.endTime,
              customerId: data.customerId,
              totalPrice: data.totalPrice,
              couponCode:
                data.couponCode && data.couponCode !== ""
                  ? data.couponCode
                  : undefined,
              status: data.status,
              notes: data.notes && data.notes !== "" ? data.notes : undefined,
              adminUserId: user.id,
            }),
          );
          return null;
        },
        afterSuccess: () => {
          if (!mutationPayload) return;

          const payloadData = omitUndefined(mutationPayload.payload);
          const calendarData: ReservationSyncData = payloadData;
          if (mutationPayload.googleCalendarEventId) {
            fireAndForget(
              updateCalendarSync(
                calendarData,
                mutationPayload.googleCalendarEventId,
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
              context: {
                reservationId: id,
                trigger: "updateReservationAction",
              },
            });
          }

          // スペース・日時・料金など顧客に影響する変更があった場合のみ、
          // 顧客+管理者へ変更通知メールを自動送信する（重要取引通知として非gate）。
          if (mutationPayload.customerVisibleChanged) {
            fireAndForget(
              Promise.all([
                sendReservationUpdatedEmail(payloadData),
                sendReservationAdminNotification(payloadData, "update"),
              ]),
              {
                operation: "sendReservationUpdateNotification",
                category: ErrorCategory.EXTERNAL_API,
                severity: ErrorSeverity.LOW,
                context: { reservationId: id },
              },
            );
          }

          fireAndForget(
            createNotificationCommand({
              type: NOTIFICATION_TYPE.RESERVATION_UPDATE,
              title:
                NOTIFICATION_TYPE_LABELS[NOTIFICATION_TYPE.RESERVATION_UPDATE],
              message: "管理者が予約を更新しました",
              resourceType: "reservation",
              resourceId: id,
            }),
            {
              operation: "updateReservationActionNotification",
              category: ErrorCategory.DATABASE,
            },
          );

          invalidateReservationCaches(id, mutationPayload.customerId, {
            coupons: true,
          });
        },
      });

      if (isMutationError(result)) {
        return { ok: false, error: result.error };
      }
      success = true;
      return { ok: true };
    },
  );

  if (success) {
    redirect(toAppRoute(`/admin/reservations/${id}`));
  }

  return submissionResult;
}

const previewPricingSchema = z.object({
  spaceId: z.uuid(),
  startDateTime: z.iso.datetime(),
  endDateTime: z.iso.datetime(),
});

/**
 * 管理画面 予約作成・編集フォームの料金プレビュー（read-only / 非 mutation）。
 *
 * `executeAdminMutationResult` を経由しない理由は template-preview.ts と同型:
 * 副作用ゼロの read 操作を mutation 用ラッパー（監査ログ強制）に通すと、日時を
 * 変更するたびに `reservation:read` の偽 audit が積まれてしまう。代わりに同等の
 * セキュリティガード（認証 → RBAC `reservation:read` → rate-limit）を手書きで通す。
 *
 * 計算そのものは `previewReservationPricing`（Task 13 SSoT）に委譲する。認証/権限
 * 不足・レート制限超過・不正入力・対象スペースなしはすべて `null` を返す
 * （フォーム側は「まだ計算できない」として扱えばよい）。
 */
export async function previewReservationPricingAction(
  spaceId: string,
  startDateTime: string,
  endDateTime: string,
): Promise<ReservationPricingResult | null> {
  const parsed = previewPricingSchema.safeParse({
    spaceId,
    startDateTime,
    endDateTime,
  });
  if (!parsed.success) return null;

  const auth = await checkAdminAuth();
  if (!auth.success) return null;
  if (!hasPermission(auth.user.role, "reservation", "read")) return null;

  const ip = await getClientIpFromHeaders();
  const limit = await apiRateLimiter.check(ip);
  if (!limit.success) return null;

  return previewReservationPricing(
    {
      spaceId: parsed.data.spaceId,
      startDateTime: new Date(parsed.data.startDateTime),
      endDateTime: new Date(parsed.data.endDateTime),
    },
    { requirePublished: false },
  );
}
