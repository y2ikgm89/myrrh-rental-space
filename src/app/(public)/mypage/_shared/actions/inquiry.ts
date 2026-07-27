"use server";

import { updateTag } from "next/cache";
import { getCustomerSession } from "@/shared/lib/customer-auth";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { assertCustomerActive } from "@/shared/domain/customers/guard";
import { assertLoginSignupReagreed } from "@/shared/lib/terms-consent-gate";
import { isFeatureEnabled } from "@/shared/lib/features/check";
import { replyToInquiryAsCustomerCommand } from "@/shared/domain/inquiries/commands";
import { createNotificationCommand } from "@/shared/domain/notifications/commands";
import { sendInquiryCustomerReplyAdminEmail } from "@/shared/lib/email/inquiry-emails";
import { resolveInquiryCustomerReplyAdminDelivery } from "@/shared/domain/settings/queries/email-render-context";
import { customerInquiryReplySchema } from "@/shared/lib/validations/inquiry";
import {
  checkActionRateLimit,
  validateTurnstile,
} from "@/shared/lib/action-helpers";
import { formSubmitRateLimiter } from "@/shared/lib/rate-limit";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";
import {
  createMutationError,
  type MutationResult,
} from "@/shared/lib/mutation-result";
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

export async function replyToInquiryAction(
  inquiryId: string,
  body: string,
  turnstileToken?: string,
): Promise<MutationResult<null>> {
  const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
  if (!rateLimit.success) return createMutationError("リクエストが多すぎます");

  const turnstile = await validateTurnstile({
    token: turnstileToken,
    expectedAction: TURNSTILE_ACTIONS.mypage_inquiry_reply,
  });
  if (!turnstile.success) return createMutationError(turnstile.error);

  const parsed = customerInquiryReplySchema.safeParse({
    inquiryId,
    body,
    turnstileToken,
  });
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message ?? "入力内容が不正です";
    return createMutationError(firstError);
  }

  const session = await getCustomerSession();
  if (!session) return createMutationError("認証が必要です");

  const customer = await getCustomerByUserId(session.user.id);
  if (!customer) return createMutationError("顧客情報が見つかりません");

  try {
    await assertCustomerActive(customer.id);
    await assertLoginSignupReagreed(customer.id);

    // FEAT-3PLANE-04: 詳細ページは contact gate 済みだが、Server Action は
    // 直接呼び出せるため fail-closed する (cancelReservationAction と同型)。
    if (!(await isFeatureEnabled("contact"))) {
      return createMutationError(
        "この機能は現在利用できません。管理者にお問い合わせください。",
      );
    }

    const result = await replyToInquiryAsCustomerCommand(
      parsed.data.inquiryId,
      customer.id,
      parsed.data.body,
    );

    updateTag(CACHE_TAGS.INQUIRIES);
    updateTag(getCacheTag.inquiries.detail(parsed.data.inquiryId));

    const { emailContext } = result;
    fireAndForget(
      createNotificationCommand({
        type: NOTIFICATION_TYPE.INQUIRY_CUSTOMER_REPLY,
        title:
          NOTIFICATION_TYPE_LABELS[NOTIFICATION_TYPE.INQUIRY_CUSTOMER_REPLY],
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

    return null;
  } catch (error) {
    if (error instanceof DomainError) {
      return createMutationError(error.message);
    }
    throw error;
  }
}
