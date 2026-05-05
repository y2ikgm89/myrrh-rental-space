"use server";

import { headers } from "next/headers";
import { updateTag } from "next/cache";
import {
  publicInquirySchema,
  type PublicInquiryInput,
} from "@/shared/lib/validations/inquiry";
import {
  checkActionRateLimit,
  createValidationMutationError,
  validateTurnstile,
} from "@/shared/lib/action-helpers";
import {
  formSubmitRateLimiter,
  getClientIpFromHeaders,
} from "@/shared/lib/rate-limit";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";
import {
  createMutationError,
  type MutationResult,
} from "@/shared/lib/mutation-result";
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
  input: PublicInquiryInput,
): Promise<MutationResult<{ id: string }>> {
  // 1. Rate limit check
  const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
  if (!rateLimit.success) return createMutationError(rateLimit.error);

  // 2. Validate input
  const parsed = publicInquirySchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  // 3. Turnstile verification
  const turnstile = await validateTurnstile({
    token: parsed.data.turnstileToken,
    expectedAction: TURNSTILE_ACTIONS.inquiry,
  });
  if (!turnstile.success) {
    return createMutationError(turnstile.error);
  }

  // 4. Resolve customer if logged in
  let customerId: string | null = null;
  const session = await getCustomerSession();
  if (session) {
    const customer = await getCustomerByUserId(session.user.id);
    if (customer) {
      customerId = customer.id;
    }
  }

  // 4.5. Extract client IP / userAgent for terms audit trail
  const clientIp = await getClientIpFromHeaders();
  const headersList = await headers();
  const userAgent = headersList.get("user-agent");

  // 5. Create inquiry
  try {
    const result = await createInquiryCommand({
      name: `${parsed.data.lastName} ${parsed.data.firstName}`,
      companyName: parsed.data.companyName || null,
      email: parsed.data.email,
      subject: parsed.data.subject,
      message: parsed.data.message,
      customerType: parsed.data.customerType,
      customerId,
    });

    // 5.5. Record terms agreements snapshot (証跡)
    if (parsed.data.agreedTermsIds.length > 0) {
      fireAndForget(
        recordTermsAgreementsCommand({
          termsIds: parsed.data.agreedTermsIds,
          context: TERMS_AGREEMENT_CONTEXT.INQUIRY,
          resourceId: result.id,
          customerId,
          guestEmail: customerId ? null : parsed.data.email,
          ipAddress: clientIp,
          userAgent: userAgent ?? null,
        }),
        {
          operation: "recordTermsAgreements",
          category: ErrorCategory.DATABASE,
        },
      );
    }

    // 6. Invalidate admin cache
    updateTag(CACHE_TAGS.INQUIRIES);
    updateTag(CACHE_TAGS.CUSTOMERS);
    if (customerId) {
      updateTag(getCacheTag.customers.detail(customerId));
    }

    // 7. Send emails (fire-and-forget)
    fireAndForget(sendContactConfirmationEmail(result.payload), {
      operation: "sendContactConfirmationEmail",
      category: ErrorCategory.EXTERNAL_API,
    });
    fireAndForget(sendContactAdminNotification(result.payload), {
      operation: "sendContactAdminNotification",
      category: ErrorCategory.EXTERNAL_API,
    });

    // 8. Create admin notification (fire-and-forget)
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

    return { id: result.id };
  } catch (error) {
    if (error instanceof DomainError) {
      return createMutationError(error.message);
    }
    throw error;
  }
}
