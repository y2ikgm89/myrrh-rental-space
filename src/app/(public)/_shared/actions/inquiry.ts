"use server";

import type { SubmissionResult } from "@conform-to/react";
import { headers } from "next/headers";
import { updateTag } from "next/cache";
import { publicInquirySchema } from "@/shared/lib/validations/inquiry";
import {
  checkActionRateLimit,
  validateTurnstile,
} from "@/shared/lib/action-helpers";
import {
  formSubmitRateLimiter,
  getClientIpFromHeaders,
} from "@/shared/lib/rate-limit";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { createInquiryCommand } from "@/shared/domain/inquiries/commands";
import {
  sendContactConfirmationEmail,
  sendContactAdminNotification,
} from "@/shared/lib/email/contact-emails";
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory } from "@/shared/lib/errors/server";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { createNotificationCommand } from "@/shared/domain/notifications/commands";
import {
  NOTIFICATION_TYPE,
  NOTIFICATION_TYPE_LABELS,
} from "@/shared/lib/validations/enums/helpers";
import { DomainError } from "@/shared/domain/domain-error";
import { getCustomerSession } from "@/shared/lib/customer-auth";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { recordTermsAgreementsCommand } from "@/shared/domain/terms/commands";
import { TERMS_AGREEMENT_CONTEXT } from "@/shared/lib/validations/terms";

export async function submitInquiry(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(formData, publicInquirySchema, async (data) => {
    const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
    if (!rateLimit.success) {
      return { ok: false, error: rateLimit.error };
    }

    const turnstile = await validateTurnstile({
      token: data.turnstileToken,
      expectedAction: TURNSTILE_ACTIONS.inquiry,
    });
    if (!turnstile.success) {
      return { ok: false, error: turnstile.error };
    }

    let customerId: string | null = null;
    const session = await getCustomerSession();
    if (session) {
      const customer = await getCustomerByUserId(session.user.id);
      if (customer) {
        customerId = customer.id;
      }
    }

    const clientIp = await getClientIpFromHeaders();
    const headersList = await headers();
    const userAgent = headersList.get("user-agent");

    try {
      const result = await createInquiryCommand({
        name: `${data.lastName} ${data.firstName}`,
        companyName: data.companyName || null,
        email: data.email,
        subject: data.subject,
        message: data.message,
        customerType: data.customerType,
        customerId,
      });

      if (data.agreedTermsIds.length > 0) {
        fireAndForget(
          recordTermsAgreementsCommand({
            termsIds: data.agreedTermsIds,
            context: TERMS_AGREEMENT_CONTEXT.INQUIRY,
            resourceId: result.id,
            customerId,
            guestEmail: customerId ? null : data.email,
            ipAddress: clientIp,
            userAgent: userAgent ?? null,
          }),
          {
            operation: "recordTermsAgreements",
            category: ErrorCategory.DATABASE,
          },
        );
      }

      updateTag(CACHE_TAGS.INQUIRIES);
      updateTag(CACHE_TAGS.CUSTOMERS);
      if (customerId) {
        updateTag(getCacheTag.customers.detail(customerId));
      }

      fireAndForget(sendContactConfirmationEmail(result.payload), {
        operation: "sendContactConfirmationEmail",
        category: ErrorCategory.EXTERNAL_API,
      });
      fireAndForget(sendContactAdminNotification(result.payload), {
        operation: "sendContactAdminNotification",
        category: ErrorCategory.EXTERNAL_API,
      });

      fireAndForget(
        createNotificationCommand({
          type: NOTIFICATION_TYPE.INQUIRY_NEW,
          title: NOTIFICATION_TYPE_LABELS[NOTIFICATION_TYPE.INQUIRY_NEW],
          message: `${result.payload.name}様からお問い合わせがありました`,
          resourceType: "inquiry",
          resourceId: result.id,
        }),
        {
          operation: "createInquiryNotification",
          category: ErrorCategory.DATABASE,
        },
      );
      updateTag(CACHE_TAGS.NOTIFICATIONS);

      return { ok: true };
    } catch (error) {
      if (error instanceof DomainError) {
        return { ok: false, error: error.message };
      }
      throw error;
    }
  });
}
