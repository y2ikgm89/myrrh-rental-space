"use server";

import { updateTag } from "next/cache";
import {
  publicInquirySchema,
  type PublicInquiryInput,
} from "@/shared/lib/validations/inquiry";
import {
  createValidationMutationError,
  validateTurnstile,
} from "@/shared/lib/action-helpers";
import {
  createMutationError,
  type MutationResult,
} from "@/shared/lib/mutation-result";
import { createInquiryCommand } from "@/shared/domain/inquiries/commands";
import {
  sendContactConfirmationEmail,
  sendContactAdminNotification,
} from "@/shared/lib/email-service";
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory } from "@/shared/lib/errors/server";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { DomainError } from "@/shared/domain/domain-error";

export async function submitInquiry(
  input: PublicInquiryInput,
): Promise<MutationResult<{ id: string }>> {
  // 1. Validate input
  const parsed = publicInquirySchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  // 2. Turnstile verification
  const turnstile = await validateTurnstile(parsed.data.turnstileToken);
  if (!turnstile.success) {
    return createMutationError(turnstile.error);
  }

  // 3. Create inquiry
  try {
    const result = await createInquiryCommand({
      name: parsed.data.name,
      email: parsed.data.email,
      subject: parsed.data.subject,
      message: parsed.data.message,
    });

    // 4. Invalidate admin cache
    updateTag(CACHE_TAGS.INQUIRIES);
    updateTag(getCacheTag.inquiries.list());

    // 5. Send emails (fire-and-forget)
    fireAndForget(sendContactConfirmationEmail(result.emailData), {
      operation: "sendContactConfirmationEmail",
      category: ErrorCategory.EXTERNAL_API,
    });
    fireAndForget(sendContactAdminNotification(result.emailData), {
      operation: "sendContactAdminNotification",
      category: ErrorCategory.EXTERNAL_API,
    });

    return { id: result.id };
  } catch (error) {
    if (error instanceof DomainError) {
      return createMutationError(error.message);
    }
    throw error;
  }
}
