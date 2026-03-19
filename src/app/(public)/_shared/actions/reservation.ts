"use server";

import { updateTag } from "next/cache";
import {
  publicReservationSchema,
  type PublicReservationInput,
} from "@/shared/lib/validations/public-reservation";
import {
  createValidationMutationError,
  validateTurnstile,
} from "@/shared/lib/action-helpers";
import {
  createMutationError,
  type MutationResult,
} from "@/shared/lib/mutation-result";
import { createPublicReservationCommand } from "@/shared/domain/reservations/commands";
import { sendReservationAdminNotification } from "@/shared/lib/email-service";
import { fireAndForget } from "@/shared/lib/async-utils";
import { omitUndefined } from "@/shared/lib/serialize";
import { ErrorCategory } from "@/shared/lib/errors/server";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { DomainError } from "@/shared/domain/domain-error";

export async function submitReservation(
  input: PublicReservationInput,
): Promise<MutationResult<{ id: string }>> {
  // 1. Validate input
  const parsed = publicReservationSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  // 2. Turnstile verification
  const turnstile = await validateTurnstile(parsed.data.turnstileToken);
  if (!turnstile.success) {
    return createMutationError(turnstile.error);
  }

  // 3. Create reservation
  try {
    const result = await createPublicReservationCommand(parsed.data);

    // 4. Invalidate cache: reservations (list + calendar) + customers
    updateTag(CACHE_TAGS.RESERVATIONS);
    updateTag(getCacheTag.reservations.list());
    updateTag(getCacheTag.reservations.calendar());
    updateTag(CACHE_TAGS.CUSTOMERS);
    updateTag(getCacheTag.customers.list());

    // 5. Send admin notification email (fire-and-forget)
    fireAndForget(
      sendReservationAdminNotification(
        omitUndefined(result.notification),
        "new",
      ),
      {
        operation: "sendReservationAdminNotification",
        category: ErrorCategory.EXTERNAL_API,
      },
    );

    return { id: result.id };
  } catch (error) {
    if (error instanceof DomainError) {
      return createMutationError(error.message);
    }
    throw error;
  }
}
