"use server";

import { z } from "zod";
import type { SubmissionResult } from "@conform-to/react";
import { redirect } from "next/navigation";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { checkAdminAuth } from "@/admin/lib/action-auth";
import { assertAdminFeatureCreateAllowed } from "@/shared/lib/features/check";
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
  deleteCalendarSync,
  syncReservationToCalendar,
  updateCalendarSync,
} from "@/shared/lib/calendar-sync/outbound";
import type { ReservationSyncData } from "@/shared/lib/calendar-sync/types";
import {
  sendReservationAdminNotification,
  sendReservationConfirmationEmail,
  sendReservationStatusChangedEmail,
  sendReservationUpdatedEmail,
} from "@/shared/lib/email/reservation-emails";
import { issueSmartLockAndSendConfirmationEmail } from "./mutations";
import { issueSmartLockPasscodes } from "@/shared/domain/smart-lock/issue-passcode";
import { createNotificationCommand } from "@/shared/domain/notifications/commands";
import {
  NOTIFICATION_TYPE,
  NOTIFICATION_TYPE_LABELS,
} from "@/shared/lib/validations/enums/helpers";
import { ReservationStatus } from "@/shared/lib/validations/enums/prisma-types";
import { revokeSmartLockPasscodesForReservation } from "@/shared/domain/smart-lock/revoke-passcode";
import { applyReservationEditSideEffects } from "@/shared/domain/reservations/edit-side-effects";
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
          await assertAdminFeatureCreateAllowed("reservation");
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
          const isConfirmedCreate = data.status === ReservationStatus.CONFIRMED;

          if (isConfirmedCreate) {
            if (data.sendEmail) {
              fireAndForget(
                issueSmartLockAndSendConfirmationEmail(
                  payloadData,
                  data.spaceId,
                ),
                {
                  operation:
                    "createReservationActionIssuePasscodesAndSendConfirmation",
                  category: ErrorCategory.EXTERNAL_API,
                  severity: ErrorSeverity.MEDIUM,
                  context: { reservationId: mutationPayload.id },
                },
              );
              fireAndForget(
                sendReservationAdminNotification(payloadData, "new"),
                {
                  operation: "createReservationActionAdminNotificationConfirm",
                  category: ErrorCategory.EXTERNAL_API,
                  severity: ErrorSeverity.MEDIUM,
                  context: { reservationId: mutationPayload.id },
                },
              );
            } else {
              fireAndForget(
                issueSmartLockPasscodes({
                  reservationId: payloadData.reservationId,
                  spaceId: data.spaceId,
                  startTime: payloadData.startTime,
                  endTime: payloadData.endTime,
                }),
                {
                  operation: "createReservationActionIssuePasscodes",
                  category: ErrorCategory.EXTERNAL_API,
                  severity: ErrorSeverity.MEDIUM,
                  context: { reservationId: mutationPayload.id },
                },
              );
            }
          } else if (data.sendEmail) {
            fireAndForget(
              Promise.all([
                sendReservationConfirmationEmail(payloadData),
                sendReservationAdminNotification(payloadData, "new"),
              ]),
              {
                operation: "createReservationActionSendConfirmationEmails",
                category: ErrorCategory.EXTERNAL_API,
                severity: ErrorSeverity.MEDIUM,
                context: { reservationId: mutationPayload.id },
              },
            );
          }

          fireAndForget(syncReservationToCalendar(calendarData), {
            operation: "syncReservationToCalendar",
            category: ErrorCategory.EXTERNAL_API,
            severity: ErrorSeverity.LOW,
            context: {
              reservationId: mutationPayload.id,
              trigger: "createReservationAction",
            },
          });

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
      const parsedId = z.uuid({ error: "IDが不正です" }).safeParse(id);
      if (!parsedId.success) {
        return { ok: false, error: "IDが不正です" };
      }

      let mutationPayload:
        Awaited<ReturnType<typeof updateAdminReservationCommand>> | undefined;

      const result = await executeAdminMutationResult({
        resource: "reservation",
        action: "update",
        resourceId: parsedId.data,
        execute: async (user) => {
          mutationPayload = await updateAdminReservationCommand(
            parsedId.data,
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
              version: data.version,
              guestLastName:
                data.guestLastName && data.guestLastName !== ""
                  ? data.guestLastName
                  : undefined,
              guestFirstName:
                data.guestFirstName && data.guestFirstName !== ""
                  ? data.guestFirstName
                  : undefined,
              guestEmail:
                data.guestEmail && data.guestEmail !== ""
                  ? data.guestEmail
                  : undefined,
              guestPhone:
                data.guestPhone && data.guestPhone !== ""
                  ? data.guestPhone
                  : undefined,
              guestCompanyName:
                data.guestCompanyName && data.guestCompanyName !== ""
                  ? data.guestCompanyName
                  : undefined,
              guestCustomerType: data.guestCustomerType,
            }),
          );
          return null;
        },
        afterSuccess: () => {
          if (!mutationPayload) return;

          const payloadData = omitUndefined(mutationPayload.payload);
          const calendarData: ReservationSyncData = payloadData;

          // Cluster H #9: status 遷移に応じて適切な顧客通知メールに分岐する。
          //   - PENDING → CONFIRMED: 確認メール (ハブ CTA。平文 passcode は載せない)
          //     + 管理者通知 "new" (updateReservationStatus と同型)
          //   - CONFIRMED → PENDING: ステータス変更メール (顧客の decision に影響する
          //     格下げなので silent 化しない)
          //   - status 不変で日時/スペース/料金のみ変更: 汎用 update メール
          //     (既存挙動)
          // いずれも重要取引通知として非 gate。
          const previousStatus = mutationPayload.previousStatus;
          const newStatus = mutationPayload.newStatus;
          const statusFlipToConfirmed =
            newStatus === ReservationStatus.CONFIRMED &&
            previousStatus !== ReservationStatus.CONFIRMED;
          const statusFlipToPending =
            newStatus === ReservationStatus.PENDING &&
            previousStatus !== ReservationStatus.PENDING;

          // GCAL-OUTBOUND-04: CONFIRMED → PENDING 格下げは「確認済み予約」として
          // 共有カレンダーに残す理由が無くなるため、update ではなく delete を選ぶ
          // (updateReservationStatus / mutations.ts と同型)。それ以外は既存どおり
          // eventId の有無で create / update を振り分ける。
          if (statusFlipToPending && mutationPayload.googleCalendarEventId) {
            fireAndForget(
              deleteCalendarSync(
                parsedId.data,
                mutationPayload.googleCalendarEventId,
              ),
              {
                operation: "deleteCalendarSync",
                category: ErrorCategory.EXTERNAL_API,
                severity: ErrorSeverity.LOW,
                context: {
                  reservationId: parsedId.data,
                  trigger: "statusFlipToPending",
                },
              },
            );
          } else if (mutationPayload.googleCalendarEventId) {
            fireAndForget(
              updateCalendarSync(
                calendarData,
                mutationPayload.googleCalendarEventId,
              ),
              {
                operation: "updateCalendarSync",
                category: ErrorCategory.EXTERNAL_API,
                severity: ErrorSeverity.LOW,
                context: { reservationId: parsedId.data },
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

          if (statusFlipToConfirmed) {
            fireAndForget(
              issueSmartLockAndSendConfirmationEmail(
                payloadData,
                mutationPayload.spaceId,
              ),
              {
                operation:
                  "updateReservationActionIssuePasscodesAndSendConfirmation",
                category: ErrorCategory.EXTERNAL_API,
                severity: ErrorSeverity.MEDIUM,
                context: { reservationId: parsedId.data },
              },
            );
            fireAndForget(
              sendReservationAdminNotification(
                payloadData,
                previousStatus === ReservationStatus.PENDING ? "new" : "update",
              ),
              {
                operation: "updateReservationActionAdminNotificationConfirm",
                category: ErrorCategory.EXTERNAL_API,
                severity: ErrorSeverity.MEDIUM,
                context: { reservationId: parsedId.data },
              },
            );
          } else if (statusFlipToPending) {
            fireAndForget(
              Promise.all([
                sendReservationStatusChangedEmail({
                  reservationId: payloadData.reservationId,
                  customerEmail: payloadData.customerEmail,
                  customerName: payloadData.customerName,
                  spaceName: payloadData.spaceName,
                  startTime: payloadData.startTime,
                  endTime: payloadData.endTime,
                  totalPrice: payloadData.totalPrice,
                  oldStatus: previousStatus,
                  newStatus,
                  icsSequence: payloadData.icsSequence,
                  ...(payloadData.location != null
                    ? { location: payloadData.location }
                    : {}),
                }),
                sendReservationAdminNotification(payloadData, "update"),
              ]),
              {
                operation: "updateReservationActionStatusFlipToPending",
                category: ErrorCategory.EXTERNAL_API,
                severity: ErrorSeverity.MEDIUM,
                context: { reservationId: parsedId.data },
              },
            );
            // Round-5 audit Finding #8: 編集フォーム経由でも CONFIRMED → PENDING
            // 格下げが起きうる (statusFlipToPending は previousStatus が CONFIRMED
            // 限定ではないが、CREATABLE/遷移許可上ここに到達するのは実質 CONFIRMED
            // 起点のみ)。発行済みスマートロック passcode は「確認済み」前提のため
            // 失効させる (updateReservationStatus の afterSuccess と同じ helper)。
            if (previousStatus === ReservationStatus.CONFIRMED) {
              fireAndForget(
                revokeSmartLockPasscodesForReservation(parsedId.data),
                {
                  operation: "revokeSmartLockPasscodesForReservation",
                  category: ErrorCategory.EXTERNAL_API,
                  severity: ErrorSeverity.MEDIUM,
                  context: { reservationId: parsedId.data },
                },
              );
            }
          } else if (mutationPayload.customerVisibleChanged) {
            // status 不変で日時/スペース/料金のみ変更 (既存の汎用 update 通知)。
            // CONFIRMED + 日時/スペース変更時は public/mypage と同型で
            // SwitchBot passcode revoke → reissue を走らせる (edit-side-effects SSoT)。
            fireAndForget(
              (async () => {
                const sideEffectResult = await applyReservationEditSideEffects({
                  reservationId: parsedId.data,
                  oldSpaceId: mutationPayload.previousSpaceId,
                  oldStartTime: mutationPayload.previousStartTime,
                  oldEndTime: mutationPayload.previousEndTime,
                  newSpaceId: mutationPayload.spaceId,
                  newStartTime: payloadData.startTime,
                  newEndTime: payloadData.endTime,
                });
                const emailPayload = sideEffectResult.issuanceFailed
                  ? { ...payloadData, smartLockIssuanceFailed: true }
                  : payloadData;
                await Promise.all([
                  sendReservationUpdatedEmail(emailPayload),
                  sendReservationAdminNotification(emailPayload, "update"),
                ]);
              })(),
              {
                operation: "sendReservationUpdateNotification",
                category: ErrorCategory.EXTERNAL_API,
                severity: ErrorSeverity.LOW,
                context: { reservationId: parsedId.data },
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
              resourceId: parsedId.data,
            }),
            {
              operation: "updateReservationActionNotification",
              category: ErrorCategory.DATABASE,
            },
          );

          invalidateReservationCaches(
            parsedId.data,
            mutationPayload.customerId,
            {
              coupons: true,
            },
          );
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
    const parsedId = z.uuid({ error: "IDが不正です" }).safeParse(id);
    if (parsedId.success) {
      redirect(toAppRoute(`/admin/reservations/${parsedId.data}`));
    }
  }

  return submissionResult;
}

const previewPricingSchema = z.object({
  spaceId: z.uuid(),
  startDateTime: z.iso.datetime(),
  endDateTime: z.iso.datetime(),
  couponCode: z.string().max(20).optional(),
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
  couponCode?: string | null,
): Promise<ReservationPricingResult | null> {
  const parsed = previewPricingSchema.safeParse({
    spaceId,
    startDateTime,
    endDateTime,
    ...(couponCode ? { couponCode } : {}),
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
      ...(parsed.data.couponCode ? { couponCode: parsed.data.couponCode } : {}),
    },
    { requirePublished: false },
  );
}
