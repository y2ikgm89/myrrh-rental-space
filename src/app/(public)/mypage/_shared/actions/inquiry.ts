"use server";

import { updateTag } from "next/cache";
import { getCustomerSession } from "@/shared/lib/customer-auth";
import { validateTurnstile } from "@/shared/domain/settings/turnstile";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { assertCustomerActive } from "@/shared/domain/customers/guard";
import { assertLoginSignupReagreed } from "@/shared/domain/terms/consent-gate";
import { isFeatureEnabled } from "@/shared/domain/features/check";
import { replyToInquiryAsCustomerCommand } from "@/shared/domain/inquiries/commands";
import { createNotificationCommand } from "@/shared/domain/notifications/commands";
import { sendInquiryCustomerReplyAdminEmail } from "@/shared/domain/email/lib-dispatch";
import { resolveInquiryCustomerReplyAdminDelivery } from "@/shared/domain/settings/queries/email-render-context";
import { customerInquiryReplySchema } from "@/shared/lib/validations/inquiry";
import { checkActionRateLimit } from "@/shared/lib/action-helpers";
import { formSubmitRateLimiter } from "@/shared/lib/rate-limit";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";
import type { SubmissionResult } from "@conform-to/react";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { fireAndForget } from "@/shared/lib/async-utils";
import { DomainError } from "@/shared/domain/domain-error";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import { AuditAction } from "@/shared/lib/validations/enums/prisma-types";
import {
  NOTIFICATION_TYPE,
  NOTIFICATION_TYPE_LABELS,
} from "@/shared/lib/validations/enums/helpers";
import { ErrorCategory } from "@/shared/lib/errors/server";
import { checkPublicSiteWritable } from "@/shared/domain/settings/maintenance-guard";

export async function replyToInquiryAction(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    customerInquiryReplySchema,
    async (data) => {
      // メンテナンス中は書込を止める（監査 F-38）。conform 経路なので
      // formError として返す。rate limit より前。
      const writable = await checkPublicSiteWritable();
      if (!writable.ok) return { ok: false, error: writable.error };

      const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
      if (!rateLimit.success) return { ok: false, error: rateLimit.error };

      const turnstile = await validateTurnstile({
        token: data.turnstileToken,
        expectedAction: TURNSTILE_ACTIONS.mypage_inquiry_reply,
      });
      if (!turnstile.success) return { ok: false, error: turnstile.error };

      const session = await getCustomerSession();
      if (!session) return { ok: false, error: "認証が必要です" };

      const customer = await getCustomerByUserId(session.user.id);
      if (!customer) return { ok: false, error: "顧客情報が見つかりません" };

      try {
        await assertCustomerActive(customer.id);
        await assertLoginSignupReagreed(customer.id);

        // FEAT-3PLANE-04: 詳細ページは contact gate 済みだが、Server Action は
        // 直接呼び出せるため fail-closed する (cancelReservationAction と同型)。
        if (!(await isFeatureEnabled("contact"))) {
          return {
            ok: false,
            error:
              "この機能は現在利用できません。管理者にお問い合わせください。",
          };
        }

        const result = await replyToInquiryAsCustomerCommand(
          data.inquiryId,
          customer.id,
          data.body,
        );

        updateTag(CACHE_TAGS.INQUIRIES);
        updateTag(getCacheTag.inquiries.detail(data.inquiryId));

        const { emailContext } = result;
        fireAndForget(
          createNotificationCommand({
            type: NOTIFICATION_TYPE.INQUIRY_CUSTOMER_REPLY,
            title:
              NOTIFICATION_TYPE_LABELS[
                NOTIFICATION_TYPE.INQUIRY_CUSTOMER_REPLY
              ],
            message: `${emailContext.name}様からお問い合わせの続報がありました`,
            resourceType: "inquiry",
            resourceId: result.inquiryId,
          }),
          {
            operation: "createInquiryCustomerReplyNotification",
            category: ErrorCategory.DATABASE,
          },
        );

        fireAndForget(
          (async () => {
            const delivery = await resolveInquiryCustomerReplyAdminDelivery();
            if (!delivery.enabled) return;
            return sendInquiryCustomerReplyAdminEmail(
              {
                inquiryId: result.inquiryId,
                receiptNumber: emailContext.receiptNumber,
                customerName: emailContext.name,
                subject: emailContext.subject,
                replyMessage: emailContext.replyBody,
              },
              delivery,
            );
          })(),
          {
            operation: "sendInquiryCustomerReplyAdminEmail",
            category: ErrorCategory.EXTERNAL_API,
          },
        );

        // D7: マイページ顧客返信の最小監査。Customer は User FK ではないため
        // userId は付けず、customerId / channel を metadata に残す。本文は残さない。
        fireAndForget(
          createAuditLogRecord({
            action: AuditAction.UPDATE,
            resource: "inquiry",
            resourceId: result.inquiryId,
            newValue: { replyId: result.replyId },
            metadata: {
              channel: "customer-mypage",
              customerId: customer.id,
              operation: "customer_reply",
            },
          }),
          {
            operation: "auditMypageInquiryReply",
            category: ErrorCategory.DATABASE,
          },
        );

        return { ok: true };
      } catch (error) {
        if (error instanceof DomainError) {
          return { ok: false, error: error.message };
        }
        throw error;
      }
    },
  );
}
