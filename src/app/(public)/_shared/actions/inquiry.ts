"use server";

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
import { formSubmitRateLimiter } from "@/shared/lib/rate-limit";
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
import { NOTIFICATION_TYPE } from "@/shared/lib/validations/enums/helpers";
import { DomainError } from "@/shared/domain/domain-error";
import { getSession } from "@/shared/lib/auth";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";

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
  const turnstile = await validateTurnstile(parsed.data.turnstileToken);
  if (!turnstile.success) {
    return createMutationError(turnstile.error);
  }

  // 4. Resolve customer if logged in
  let customerId: string | null = null;
  const session = await getSession();
  if (session) {
    const customer = await getCustomerByUserId(session.user.id);
    if (customer) {
      customerId = customer.id;
    }
  }

  // 5. Create inquiry
  try {
    const result = await createInquiryCommand({
      name: `${parsed.data.lastName} ${parsed.data.firstName}`,
      companyName: parsed.data.companyName || null,
      email: parsed.data.email,
      subject: parsed.data.subject,
      message: parsed.data.message,
      customerId,
    });

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
        title: "新規お問い合わせ",
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
