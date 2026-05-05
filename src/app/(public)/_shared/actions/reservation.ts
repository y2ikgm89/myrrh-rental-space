"use server";

import { headers } from "next/headers";
import {
  publicReservationSchema,
  type PublicReservationInput,
} from "@/shared/lib/validations/public-reservation";
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
import { createPublicReservationCommand } from "@/shared/domain/reservations/public-commands";
import { sendReservationAdminNotification } from "@/shared/lib/email/reservation-emails";
import { fireAndForget } from "@/shared/lib/async-utils";
import { omitUndefined } from "@/shared/lib/serialize";
import { ErrorCategory } from "@/shared/lib/errors/server";
import { invalidateReservationCaches } from "@/shared/lib/cache/reservation-cache";
import { createNotificationCommand } from "@/shared/domain/notifications/commands";
import { recordTermsAgreementsCommand } from "@/shared/domain/terms/commands";
import { TERMS_AGREEMENT_CONTEXT } from "@/shared/lib/validations/terms";
import {
  NOTIFICATION_TYPE,
  NOTIFICATION_TYPE_LABELS,
} from "@/shared/lib/validations/enums/helpers";
import { DomainError } from "@/shared/domain/domain-error";
import { verifySpaceBelongsToLocation } from "@/shared/domain/spaces/public-queries";
import { getCurrentCustomerUser } from "@/shared/lib/customer-auth";

export async function submitReservation(
  input: PublicReservationInput,
): Promise<MutationResult<{ id: string }>> {
  // 1. Rate limit check
  const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
  if (!rateLimit.success) return createMutationError(rateLimit.error);

  // 2. Validate input
  const parsed = publicReservationSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  // 3. Turnstile verification
  const turnstile = await validateTurnstile({
    token: parsed.data.turnstileToken,
    expectedAction: TURNSTILE_ACTIONS.reservation,
  });
  if (!turnstile.success) {
    return createMutationError(turnstile.error);
  }

  // 3.5. Verify space belongs to location
  const belongsToLocation = await verifySpaceBelongsToLocation(
    parsed.data.spaceId,
    parsed.data.locationId,
  );
  if (!belongsToLocation) {
    return createMutationError(
      "選択されたスペースは指定された場所に属していません",
    );
  }

  // 4. Get current user (non-blocking — undefined if not logged in)
  const user = await getCurrentCustomerUser();

  // 4.5. Extract client IP / userAgent for terms audit trail
  const clientIp = await getClientIpFromHeaders();
  const headersList = await headers();
  const userAgent = headersList.get("user-agent");

  // 5. Create reservation
  try {
    const result = await createPublicReservationCommand({
      ...parsed.data,
      userId: user?.id,
    });

    // 5.5. Record terms agreements snapshot (証跡)
    if (parsed.data.agreedTermsIds.length > 0) {
      fireAndForget(
        recordTermsAgreementsCommand({
          termsIds: parsed.data.agreedTermsIds,
          context: TERMS_AGREEMENT_CONTEXT.RESERVATION,
          resourceId: result.id,
          customerId: result.customerId ?? null,
          guestEmail: user ? null : parsed.data.email,
          ipAddress: clientIp,
          userAgent: userAgent ?? null,
        }),
        {
          operation: "recordTermsAgreements",
          category: ErrorCategory.DATABASE,
        },
      );
    }

    // 6. Invalidate cache: reservations + customers + coupons + notifications
    invalidateReservationCaches(result.id, result.customerId ?? null, {
      coupons: true,
      notifications: true,
    });

    // 7. Send admin notification email (fire-and-forget)
    fireAndForget(
      sendReservationAdminNotification(omitUndefined(result.payload), "new"),
      {
        operation: "sendReservationAdminNotification",
        category: ErrorCategory.EXTERNAL_API,
      },
    );

    // 8. Create admin notification (fire-and-forget)
    fireAndForget(
      createNotificationCommand({
        type: NOTIFICATION_TYPE.RESERVATION_NEW,
        title: NOTIFICATION_TYPE_LABELS[NOTIFICATION_TYPE.RESERVATION_NEW],
        message: `${result.payload.customerName}様が${result.payload.spaceName}を予約しました`,
        resourceType: "reservation",
        resourceId: result.id,
      }),
      {
        operation: "createReservationNotification",
        category: ErrorCategory.DATABASE,
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
